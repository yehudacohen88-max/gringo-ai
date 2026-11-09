const privacyService = require('./privacy.service');
const notice = require('./privacy-notice');
const { env } = require('../../config/env');
const { crmAgentService } = require('../crm-agent');
const { languageDetectionService } = require('../language');
const { appendLanguageConflictNotice } = require('../language/language-preference');

const COMMANDS = {
  privacy: ['privacy', '/privacy', 'פרטיות', 'ความเป็นส่วนตัว'],
  decline: ['decline', '/decline', 'i decline', 'לא מסכים', 'לא מסכימה', 'ไม่ยอมรับ'],
  accept: ['accept', '/accept', 'agree', 'i agree', 'מסכים', 'מסכימה', 'ยอมรับ', 'ตกลง'],
  withdraw: ['withdraw consent', '/withdraw', 'ביטול הסכמה', 'ถอนความยินยอม'],
  export: ['my data', '/mydata', 'המידע שלי', 'ข้อมูลของฉัน'],
};
const DELETE_PREFIXES = ['delete my data', '/delete', 'מחק את המידע שלי', 'ลบข้อมูล'];
const EXPORT_PROFILE_FIELDS = ['fullName', 'country', 'city', 'profession', 'workSector', 'preferredLanguage', 'activeGoals'];

function normalize(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function parsePrivacyCommand(text) {
  const value = normalize(text);
  if (!value) return null;
  for (const prefix of DELETE_PREFIXES) {
    if (value === prefix) return { command: 'delete' };
    if (value.startsWith(`${prefix} `)) {
      const code = value.slice(prefix.length).trim();
      return /^\d{6}$/.test(code) ? { command: 'deleteConfirm', code } : { command: 'delete' };
    }
  }
  // Decline is checked before accept: the Thai decline word contains the accept word.
  for (const command of ['privacy', 'decline', 'accept', 'withdraw', 'export']) {
    if (COMMANDS[command].includes(value)) return { command };
  }
  return null;
}

// Messaging channels get a short data summary, not a full export: a chat
// message is the wrong place for every stored row. The reply says so and
// points to the full export.
function dataSummary(language, data) {
  const lines = [notice.reply(language, 'exportTitle')];
  const profile = (data.sheets[env.googleSheets.sheets.userProfiles] || [])[0] || data.local.profiles[0];
  if (profile) {
    for (const field of EXPORT_PROFILE_FIELDS) {
      if (String(profile[field] || '').trim()) lines.push(`${field}: ${profile[field]}`);
    }
  }
  for (const [sheet, rows] of Object.entries(data.sheets)) lines.push(`${sheet}: ${rows.length}`);
  if (data.local.conversations.length) lines.push(`ConversationHistory: ${data.local.conversations.length}`);
  if (data.local.quotes.length) lines.push(`UserSubmittedTransferQuotes: ${data.local.quotes.length}`);
  if (lines.length === 1) return notice.reply(language, 'exportEmpty');
  lines.push('', notice.reply(language, 'exportFullHint'));
  return lines.join('\n');
}

// Full success is shown only when every store was erased.
function deletionReply(language, outcome) {
  const limits = notice.getNotice(language).limits;
  if (outcome.code === 'DELETION_NOT_STARTED') return result(notice.reply(language, 'deleteNotStarted'), 'PRIVACY_DELETE_NOT_STARTED');
  if (!outcome.ok) return result(notice.reply(language, 'noPendingDeletion'), 'PRIVACY_DELETE_REJECTED');
  if (outcome.status === 'partial') return result(`${notice.reply(language, 'deletePartial')}\n\n${limits}`, 'PRIVACY_DELETE_PARTIAL');
  const text = outcome.status === 'complete' ? notice.reply(language, 'deleteDone') : notice.reply(language, 'deleteNothing');
  return result(`${text}\n\n${limits}`, 'PRIVACY_DELETED');
}

function result(reply, status) {
  return { reply, status, privacy: true, user: null };
}

// Same order as chat replies: explicit saved choice, else a clear message
// script, else the channel app language, else English. Profile lookup failure
// must not change the privacy decision, so it falls through to the message.
async function resolvePrivacyLanguage(channel, message = {}) {
  const channelLanguage = message.languageCode || message.language || '';
  const text = message.messageText || '';
  let profile = {};
  try {
    const found = await crmAgentService.findUserByChannel(channel, message.channelUserId);
    if (found) {
      const saved = await crmAgentService.getUserLanguage(found);
      profile = {
        preferredLanguage: saved.preferredLanguage || '',
        languageSource: saved.languageSource || '',
      };
    }
  } catch (error) {
    profile = {};
  }
  return languageDetectionService.resolveReplyLanguage({ profile, channelLanguage, text });
}

function present(text, resolution) {
  return appendLanguageConflictNotice(text, resolution);
}

// Runs before any channel handler. Returns null when the message may go on to
// normal processing. The identity comes from a signature-verified webhook or
// the Telegram bot API, never from message text.
// Fails closed: if consent or pending-deletion state cannot be read (for
// example a Sheets outage), the message is not processed.
async function handleChannelPrivacy(channel, message = {}) {
  let resolution;
  try {
    resolution = await resolvePrivacyLanguage(channel, message);
    return await handleChannelPrivacyUnsafe(channel, message, resolution);
  } catch (error) {
    if (!resolution) {
      resolution = languageDetectionService.resolveReplyLanguage({
        channelLanguage: message.languageCode || message.language,
        text: message.messageText,
      });
    }
    return result(present(notice.reply(resolution.language, 'privacyUnavailable'), resolution), 'PRIVACY_UNAVAILABLE');
  }
}

async function handleChannelPrivacyUnsafe(channel, message = {}, resolution) {
  const identity = { channel, channelUserId: String(message.channelUserId || '').trim() };
  if (!identity.channelUserId) return null;
  const language = resolution.language;
  const say = (text) => present(text, resolution);
  const noticed = (privacyResult) => ({ ...privacyResult, reply: say(privacyResult.reply) });
  const parsed = parsePrivacyCommand(message.messageText);

  // An unfinished deletion blocks everything else. Any message, including
  // "delete my data", retries it for this verified identity; no new consent
  // or code is needed. Reading the notice stays possible.
  const current = await privacyService.getStatus(identity);
  if (current.deletionPending && !(parsed && parsed.command === 'privacy')) {
    const outcome = await privacyService.retryDeletion(identity);
    return noticed(deletionReply(language, outcome));
  }

  if (parsed) {
    switch (parsed.command) {
      case 'privacy':
        return result(say(notice.channelNoticeText(language)), 'PRIVACY_NOTICE');
      case 'accept':
        await privacyService.acceptConsent(identity, language);
        return result(say(notice.reply(language, 'accepted')), 'PRIVACY_CONSENT_ACCEPTED');
      case 'decline':
        await privacyService.declineConsent(identity, language);
        return result(say(notice.reply(language, 'declined')), 'PRIVACY_CONSENT_DECLINED');
      case 'withdraw':
        await privacyService.withdrawConsent(identity, language);
        return result(say(notice.reply(language, 'withdrawn')), 'PRIVACY_CONSENT_WITHDRAWN');
      case 'export':
        return result(say(dataSummary(language, await privacyService.exportData(identity))), 'PRIVACY_DATA_SUMMARY');
      case 'delete': {
        const { confirmationCode } = privacyService.requestDeletion(identity);
        return result(say(`${notice.getNotice(language).limits}\n\n${notice.reply(language, 'deleteConfirm', confirmationCode)}`), 'PRIVACY_DELETE_CONFIRMATION_REQUIRED');
      }
      case 'deleteConfirm': {
        const outcome = await privacyService.confirmDeletion(identity, parsed.code);
        if (outcome.code === 'DELETION_NOT_STARTED') return noticed(deletionReply(language, outcome));
        if (!outcome.ok) return result(say(notice.reply(language, 'deleteBadCode')), 'PRIVACY_DELETE_REJECTED');
        return noticed(deletionReply(language, outcome));
      }
      default:
        break;
    }
  }

  if (await privacyService.allowsPersonalProcessing(identity)) return null;
  return result(say(`${notice.reply(language, 'consentRequired')}\n\n${notice.channelNoticeText(language)}`), 'PRIVACY_CONSENT_REQUIRED');
}

module.exports = {
  handleChannelPrivacy,
  parsePrivacyCommand,
  resolvePrivacyLanguage,
};
