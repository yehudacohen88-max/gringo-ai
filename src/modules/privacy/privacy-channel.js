const privacyService = require('./privacy.service');
const notice = require('./privacy-notice');
const { env } = require('../../config/env');

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

function exportSummary(language, data) {
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
  return lines.join('\n');
}

function result(reply, status) {
  return { reply, status, privacy: true, user: null };
}

// Runs before any channel handler. Returns null when the message may go on to
// normal processing. The identity comes from a signature-verified webhook or
// the Telegram bot API, never from message text.
async function handleChannelPrivacy(channel, message = {}) {
  const identity = { channel, channelUserId: String(message.channelUserId || '').trim() };
  if (!identity.channelUserId) return null;
  const language = notice.noticeLanguage(message.languageCode || message.language) || notice.guessLanguageFromText(message.messageText);
  const parsed = parsePrivacyCommand(message.messageText);

  if (parsed) {
    switch (parsed.command) {
      case 'privacy':
        return result(notice.channelNoticeText(language), 'PRIVACY_NOTICE');
      case 'accept':
        await privacyService.acceptConsent(identity, language);
        return result(notice.reply(language, 'accepted'), 'PRIVACY_CONSENT_ACCEPTED');
      case 'decline':
        await privacyService.declineConsent(identity, language);
        return result(notice.reply(language, 'declined'), 'PRIVACY_CONSENT_DECLINED');
      case 'withdraw':
        await privacyService.withdrawConsent(identity, language);
        return result(notice.reply(language, 'withdrawn'), 'PRIVACY_CONSENT_WITHDRAWN');
      case 'export':
        return result(exportSummary(language, await privacyService.exportData(identity)), 'PRIVACY_EXPORT');
      case 'delete': {
        const { confirmationCode } = privacyService.requestDeletion(identity);
        return result(`${notice.getNotice(language).limits}\n\n${notice.reply(language, 'deleteConfirm', confirmationCode)}`, 'PRIVACY_DELETE_CONFIRMATION_REQUIRED');
      }
      case 'deleteConfirm': {
        const outcome = await privacyService.confirmDeletion(identity, parsed.code);
        if (!outcome.ok) return result(notice.reply(language, 'deleteBadCode'), 'PRIVACY_DELETE_REJECTED');
        const text = outcome.deleted ? notice.reply(language, 'deleteDone') : notice.reply(language, 'deleteNothing');
        return result(`${text}\n\n${notice.getNotice(language).limits}`, 'PRIVACY_DELETED');
      }
      default:
        break;
    }
  }

  if (await privacyService.allowsPersonalProcessing(identity)) return null;
  return result(`${notice.reply(language, 'consentRequired')}\n\n${notice.channelNoticeText(language)}`, 'PRIVACY_CONSENT_REQUIRED');
}

module.exports = {
  handleChannelPrivacy,
  parsePrivacyCommand,
};
