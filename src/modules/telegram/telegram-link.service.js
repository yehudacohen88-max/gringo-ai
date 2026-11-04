const crypto = require('crypto');
const privacyGuard = require('../privacy/privacy-guard');
const linkCode = require('../../shared/linkCode');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const { crmAgentService } = require('../crm-agent');
const linkRepository = require('./telegram-link.repository');
const { TELEGRAM_LINK_HISTORY_EVENT_TYPES } = require('./telegram-link.model');
const { safeTelegramWarning } = require('./telegram-errors');

const memoryCodes = [];
const memoryHistory = [];
function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

function hashCode(code) {
  return linkCode.hashCode(code);
}

function expiresAt() {
  return linkCode.codeExpiresAt();
}

async function readCodeRecords() {
  try {
    const rows = await linkRepository.findAllLinkCodeRecords();
    const byId = new Map(rows.map((record) => [record.code.linkCodeId, record]));
    memoryCodes.forEach((code, index) => byId.set(code.linkCodeId, { code, rowNumber: `memory-${index}` }));
    return Array.from(byId.values());
  } catch (error) {
    return memoryCodes.map((code, index) => ({ code, rowNumber: `memory-${index}` }));
  }
}

async function saveHistory(userId, telegramUserId, eventType, safeMetadata = {}) {
  if (!TELEGRAM_LINK_HISTORY_EVENT_TYPES.includes(eventType)) return null;
  const event = {
    historyId: generateId('tglhist'),
    userId: cleanText(userId),
    telegramUserId: cleanText(telegramUserId),
    eventType,
    createdAt: nowIso(),
    safeMetadata: JSON.stringify(safeMetadata),
  };
  try {
    return await linkRepository.createLinkHistory(event);
  } catch (error) {
    memoryHistory.push(event);
    return event;
  }
}

async function updateCodeRecord(record, updates = {}) {
  const updated = { ...record.code, ...updates };
  try {
    if (String(record.rowNumber).startsWith('memory-')) throw new Error('memory');
    return await linkRepository.updateLinkCode(record.rowNumber, updated);
  } catch (error) {
    const index = memoryCodes.findIndex((code) => code.linkCodeId === updated.linkCodeId);
    if (index >= 0) memoryCodes[index] = updated;
    else memoryCodes.push(updated);
    return updated;
  }
}

async function expireOldCodes() {
  const records = await readCodeRecords();
  const now = new Date();
  const expired = [];
  for (const record of records) {
    if (record.code.status === 'Active' && new Date(record.code.expiresAt) <= now) {
      expired.push(await updateCodeRecord(record, { status: 'Expired' }));
    }
  }
  return expired;
}

async function cancelActiveCodesForUser(userId) {
  const records = await readCodeRecords();
  for (const record of records.filter((item) => item.code.userId === userId && item.code.status === 'Active')) {
    await updateCodeRecord(record, { status: 'Cancelled', cancelledAt: nowIso() });
  }
}

async function createLinkCode(userId) {
  linkCode.assertCanCreate(userId);
  await privacyGuard.assertUserAllowed(userId);
  await expireOldCodes();
  await cancelActiveCodesForUser(userId);
  const plainCode = linkCode.generatePlainCode();
  const code = {
    linkCodeId: generateId('tglcode'),
    userId,
    codeHash: hashCode(plainCode),
    status: 'Active',
    expiresAt: expiresAt(),
    createdAt: nowIso(),
    usedAt: '',
    cancelledAt: '',
    telegramUserId: '',
  };

  try {
    await linkRepository.createLinkCode(code);
  } catch (error) {
    memoryCodes.push(code);
  }
  await saveHistory(userId, '', 'Code Created', { linkCodeId: code.linkCodeId, expiresAt: code.expiresAt });
  return {
    linkCodeId: code.linkCodeId,
    code: plainCode,
    expiresAt: code.expiresAt,
  };
}

async function findValidCode(code, telegramUserId) {
  const attempt = linkCode.beginRedeemAttempt('telegram', telegramUserId, code);
  if (!attempt.allowed) {
    await saveHistory('', telegramUserId, 'Link Failed', { reason: attempt.reason, linkCodeId: '' });
    return { error: 'Too many link attempts. Please wait and try again.' };
  }
  if (!linkCode.claimSingleUse('telegram', attempt.codeKey)) {
    return { error: 'This link code is no longer active.' };
  }

  await expireOldCodes();
  const records = await readCodeRecords();
  const record = records.find((item) => linkCode.hashesEqual(item.code.codeHash, attempt.codeKey));
  if (!record) {
    linkCode.releaseSingleUse('telegram', attempt.codeKey);
    linkCode.recordRedeemFailure(attempt.codeKey);
    await saveHistory('', telegramUserId, 'Link Failed', { reason: 'not_found' });
    return { error: 'This link code is not valid.' };
  }
  if (record.code.status === 'Expired') return { error: 'This link code expired. Please create a new one in My Profile.' };
  if (record.code.status !== 'Active') return { error: 'This link code is no longer active.' };
  if (new Date(record.code.expiresAt) <= new Date()) {
    await updateCodeRecord(record, { status: 'Expired' });
    return { error: 'This link code expired. Please create a new one in My Profile.' };
  }
  if (record.code.telegramUserId && record.code.telegramUserId !== cleanText(telegramUserId)) {
    return { error: 'This link request belongs to another Telegram account.' };
  }

  const updated = await updateCodeRecord(record, { telegramUserId: cleanText(telegramUserId) });
  await saveHistory(updated.userId, telegramUserId, 'Link Requested', { linkCodeId: updated.linkCodeId });
  return { code: updated };
}

async function linkTelegramToProfile(linkCodeId, telegramIdentity = {}) {
  const confirmKey = `id:${cleanText(linkCodeId)}`;
  if (!linkCode.claimSingleUse('telegram-confirm', confirmKey)) {
    return { error: 'This link code is no longer active.' };
  }
  const rejectConfirm = (message) => {
    linkCode.releaseSingleUse('telegram-confirm', confirmKey);
    return { error: message };
  };
  await expireOldCodes();
  const records = await readCodeRecords();
  const record = records.find((item) => item.code.linkCodeId === linkCodeId);
  const telegramUserId = cleanText(telegramIdentity.telegramUserId || telegramIdentity.channelUserId);
  if (!record || record.code.status !== 'Active') return rejectConfirm('This link code is no longer active.');
  if (new Date(record.code.expiresAt) <= new Date()) {
    await updateCodeRecord(record, { status: 'Expired' });
    return rejectConfirm('This link code expired.');
  }
  if (record.code.telegramUserId !== telegramUserId) return rejectConfirm('This confirmation must come from the Telegram account that requested the link.');

  const webRecord = await crmAgentRepository.findUserProfileRecordByUserId(record.code.userId);
  if (!webRecord) return rejectConfirm('The Gringo profile was not found.');

  const previousTelegram = crmAgentRepository.findUserProfileRecordByTelegramUserId
    ? await crmAgentRepository.findUserProfileRecordByTelegramUserId(telegramUserId)
    : null;
  const now = nowIso();
  const updatedWebProfile = {
    ...webRecord.profile,
    telegramUserId,
    telegramChatId: cleanText(telegramIdentity.telegramChatId || telegramIdentity.channelChatId),
    telegramUsername: cleanText(telegramIdentity.telegramUsername || telegramIdentity.username),
    telegramConnectedAt: now,
    updatedAt: now,
  };
  await crmAgentRepository.updateUserProfile(webRecord.rowNumber, updatedWebProfile);

  if (previousTelegram && previousTelegram.profile.userId !== webRecord.profile.userId && previousTelegram.profile.channel === 'telegram') {
    await crmAgentRepository.updateUserProfile(previousTelegram.rowNumber, {
      ...previousTelegram.profile,
      telegramUserId: '',
      telegramChatId: '',
      telegramUsername: previousTelegram.profile.telegramUsername,
      telegramConnectedAt: '',
      lastCategory: 'Telegram Link',
      updatedAt: now,
    });
  }

  await updateCodeRecord(record, { status: 'Used', usedAt: now });
  await saveHistory(webRecord.profile.userId, telegramUserId, 'Link Confirmed', { linkCodeId });
  await saveHistory(webRecord.profile.userId, telegramUserId, 'Link Completed', {
    linkCodeId,
    previousTelegramUserRecord: previousTelegram?.profile?.userId && previousTelegram.profile.userId !== webRecord.profile.userId ? 'preserved' : 'none',
  });
  return { profile: updatedWebProfile };
}

async function cancelLinkRequest(linkCodeId, telegramUserId = '') {
  const records = await readCodeRecords();
  const record = records.find((item) => item.code.linkCodeId === linkCodeId);
  if (!record || record.code.status !== 'Active') return { cancelled: false };
  if (record.code.telegramUserId && record.code.telegramUserId !== cleanText(telegramUserId)) return { cancelled: false };
  const updated = await updateCodeRecord(record, { status: 'Cancelled', cancelledAt: nowIso() });
  await saveHistory(updated.userId, telegramUserId, 'Link Cancelled', { linkCodeId });
  return { cancelled: true };
}

async function disconnectTelegram(userId) {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);
  if (!record) return null;
  const telegramUserId = record.profile.telegramUserId;
  const updated = {
    ...record.profile,
    telegramUserId: '',
    telegramChatId: '',
    telegramUsername: '',
    telegramConnectedAt: '',
    updatedAt: nowIso(),
  };
  await crmAgentRepository.updateUserProfile(record.rowNumber, updated);
  await cancelActiveCodesForUser(userId);
  await saveHistory(userId, telegramUserId, 'Disconnected', {});
  try {
    await crmAgentService.saveConversation({
      userId,
      channel: 'telegram',
      question: 'Disconnect Telegram',
      answer: 'Telegram disconnected. Conversation history was preserved.',
      category: 'Telegram',
      status: 'TELEGRAM_DISCONNECTED',
      needsHumanFollowUp: false,
    });
  } catch (error) {
    safeTelegramWarning('Could not save Telegram disconnect conversation event.');
  }
  return updated;
}

async function getLinkHistory(userId) {
  try {
    const rows = await linkRepository.findAllLinkHistoryRecords();
    const fromSheets = rows.map((record) => record.history).filter((event) => event.userId === userId);
    const byId = new Map(fromSheets.map((event) => [event.historyId, event]));
    memoryHistory.filter((event) => event.userId === userId).forEach((event) => byId.set(event.historyId, event));
    return Array.from(byId.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch (error) {
    return memoryHistory.filter((event) => event.userId === userId);
  }
}

module.exports = {
  cancelLinkRequest,
  createLinkCode,
  disconnectTelegram,
  expireOldCodes,
  findValidCode,
  getLinkHistory,
  hashCode,
  linkTelegramToProfile,
  saveHistory,
};
