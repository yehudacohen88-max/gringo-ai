const crypto = require('crypto');
const { env } = require('../../config/env');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const { crmAgentService } = require('../crm-agent');
const linkRepository = require('./line-link.repository');
const { CHANNEL_LINK_HISTORY_EVENT_TYPES } = require('./line-link.model');
const { safeLineWarning } = require('./line-errors');

const memoryCodes = [];
const memoryHistory = [];
const linkAttempts = new Map();
const pendingUnlinks = new Map();

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
  return crypto.createHash('sha256').update(cleanText(code).toUpperCase()).digest('hex');
}

function generatePlainCode() {
  let code = '';
  while (code.length < 8) {
    code += crypto.randomBytes(6).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }
  return code.slice(0, 8);
}

function expiresAt() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + Number(env.telegram?.linkCodeTtlMinutes || 10));
  return date.toISOString();
}

async function readCodeRecords() {
  try {
    const rows = await linkRepository.findAllLinkCodeRecords();
    const byId = new Map(rows.map((record) => [record.code.linkCodeId, record]));
    memoryCodes.forEach((code, index) => byId.set(code.linkCodeId, { code, rowNumber: `memory-${index}` }));
    return Array.from(byId.values()).filter((record) => record.code.channel === 'line');
  } catch (error) {
    return memoryCodes.map((code, index) => ({ code, rowNumber: `memory-${index}` }));
  }
}

async function saveHistory(userId, lineUserId, eventType, safeMetadata = {}) {
  if (!CHANNEL_LINK_HISTORY_EVENT_TYPES.includes(eventType)) return null;
  const event = {
    historyId: generateId('lnhist'),
    userId: cleanText(userId),
    channel: 'line',
    channelUserId: cleanText(lineUserId),
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
  const expired = [];
  for (const record of records) {
    if (record.code.status === 'Active' && new Date(record.code.expiresAt) <= new Date()) {
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

async function setProfileLineStatus(userId, lineLinkStatus) {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);
  if (!record) return null;
  const updated = {
    ...record.profile,
    lineLinkStatus,
    updatedAt: nowIso(),
  };
  return crmAgentRepository.updateUserProfile(record.rowNumber, updated);
}

async function createLinkCode(userId) {
  await expireOldCodes();
  await cancelActiveCodesForUser(userId);
  const plainCode = generatePlainCode();
  const code = {
    linkCodeId: generateId('lncode'),
    userId,
    channel: 'line',
    codeHash: hashCode(plainCode),
    status: 'Active',
    expiresAt: expiresAt(),
    createdAt: nowIso(),
    usedAt: '',
    cancelledAt: '',
    channelUserId: '',
  };

  try {
    await linkRepository.createLinkCode(code);
  } catch (error) {
    memoryCodes.push(code);
  }
  await setProfileLineStatus(userId, 'Pending');
  await saveHistory(userId, '', 'Code Created', { linkCodeId: code.linkCodeId, expiresAt: code.expiresAt });
  return {
    linkCodeId: code.linkCodeId,
    code: plainCode,
    expiresAt: code.expiresAt,
  };
}

function isRateLimited(lineUserId) {
  const key = cleanText(lineUserId);
  const now = Date.now();
  const attempts = (linkAttempts.get(key) || []).filter((time) => now - time < 10 * 60 * 1000);
  attempts.push(now);
  linkAttempts.set(key, attempts);
  return attempts.length > 5;
}

async function linkLineToProfile(code, lineIdentity = {}) {
  await expireOldCodes();
  const lineUserId = cleanText(lineIdentity.lineUserId || lineIdentity.channelUserId);
  if (!lineUserId) return { error: 'This link request is not valid.' };
  if (isRateLimited(lineUserId)) {
    await saveHistory('', lineUserId, 'Link Failed', { reason: 'rate_limited' });
    return { error: 'Too many link attempts. Please wait and try again.' };
  }

  const records = await readCodeRecords();
  const record = records.find((item) => item.code.codeHash === hashCode(code));
  if (!record) {
    await saveHistory('', lineUserId, 'Link Failed', { reason: 'not_found' });
    return { error: 'This link code is not valid.' };
  }
  if (record.code.status === 'Expired') return { error: 'This link code expired. Please create a new one in My Profile.' };
  if (record.code.status !== 'Active') return { error: 'This link code is no longer active.' };
  if (new Date(record.code.expiresAt) <= new Date()) {
    await updateCodeRecord(record, { status: 'Expired' });
    return { error: 'This link code expired. Please create a new one in My Profile.' };
  }
  if (record.code.channel !== 'line') return { error: 'This link code is not valid.' };
  if (record.code.channelUserId && record.code.channelUserId !== lineUserId) {
    return { error: 'This link request cannot be completed.' };
  }

  const webRecord = await crmAgentRepository.findUserProfileRecordByUserId(record.code.userId);
  if (!webRecord) return { error: 'This link request cannot be completed.' };

  const existingLineRecord = crmAgentRepository.findUserProfileRecordByLineUserId
    ? await crmAgentRepository.findUserProfileRecordByLineUserId(lineUserId)
    : null;
  if (
    existingLineRecord &&
    existingLineRecord.profile.userId !== webRecord.profile.userId &&
    existingLineRecord.profile.lineLinkStatus === 'Connected'
  ) {
    await saveHistory(record.code.userId, lineUserId, 'Link Failed', { reason: 'already_linked' });
    return { error: 'This LINE account cannot be linked with this code.' };
  }
  if (webRecord.profile.lineUserId && webRecord.profile.lineUserId !== lineUserId && webRecord.profile.lineLinkStatus === 'Connected') {
    return { error: 'This Gringo profile already has a LINE account connected.' };
  }
  if (webRecord.profile.lineUserId === lineUserId && webRecord.profile.lineLinkStatus === 'Connected') {
    return { error: 'LINE is already connected to this Gringo profile.' };
  }

  const now = nowIso();
  const updatedWebProfile = {
    ...webRecord.profile,
    lineUserId,
    lineDisplayName: cleanText(lineIdentity.displayName) || webRecord.profile.lineDisplayName || '',
    lineConnectedAt: now,
    lineLastActiveAt: cleanText(lineIdentity.receivedAt) || now,
    lineLinkStatus: 'Connected',
    updatedAt: now,
  };
  await crmAgentRepository.updateUserProfile(webRecord.rowNumber, updatedWebProfile);

  if (existingLineRecord && existingLineRecord.profile.userId !== webRecord.profile.userId && existingLineRecord.profile.channel === 'line') {
    await crmAgentRepository.updateUserProfile(existingLineRecord.rowNumber, {
      ...existingLineRecord.profile,
      lineUserId: '',
      lineConnectedAt: '',
      lineDisplayName: existingLineRecord.profile.lineDisplayName,
      lineLastActiveAt: now,
      lineLinkStatus: 'Disconnected',
      updatedAt: now,
    });
  }

  await updateCodeRecord(record, { status: 'Used', usedAt: now, channelUserId: lineUserId });
  await saveHistory(webRecord.profile.userId, lineUserId, 'Link Requested', { linkCodeId: record.code.linkCodeId });
  await saveHistory(webRecord.profile.userId, lineUserId, 'Link Completed', { linkCodeId: record.code.linkCodeId });
  try {
    await crmAgentService.saveConversation({
      userId: webRecord.profile.userId,
      channel: 'line',
      question: 'Connect LINE',
      answer: 'LINE connected. Conversation history was preserved.',
      category: 'LINE',
      status: 'LINE_CONNECTED',
      needsHumanFollowUp: false,
    });
  } catch (error) {
    safeLineWarning('Could not save LINE link conversation event.');
  }
  return { profile: updatedWebProfile };
}

async function disconnectLine(userId) {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);
  if (!record) return null;
  const lineUserId = record.profile.lineUserId;
  const updated = {
    ...record.profile,
    lineUserId: '',
    lineDisplayName: '',
    lineConnectedAt: '',
    lineLastActiveAt: nowIso(),
    lineLinkStatus: 'Disconnected',
    preferredChannel: record.profile.preferredChannel === 'LINE' ? 'Web' : record.profile.preferredChannel,
    fallbackChannel: record.profile.fallbackChannel === 'LINE' ? 'None' : record.profile.fallbackChannel,
    updatedAt: nowIso(),
  };
  await crmAgentRepository.updateUserProfile(record.rowNumber, updated);
  await cancelActiveCodesForUser(userId);
  await saveHistory(userId, lineUserId, 'Disconnected', {});
  try {
    await crmAgentService.saveConversation({
      userId,
      channel: 'line',
      question: 'Disconnect LINE',
      answer: 'LINE disconnected. Conversation history was preserved.',
      category: 'LINE',
      status: 'LINE_DISCONNECTED',
      needsHumanFollowUp: false,
    });
  } catch (error) {
    safeLineWarning('Could not save LINE disconnect conversation event.');
  }
  return updated;
}

async function requestSelfUnlink(lineUserId) {
  pendingUnlinks.set(cleanText(lineUserId), Date.now());
  return 'To disconnect LINE from your Gringo profile, reply: confirm unlink';
}

async function confirmSelfUnlink(lineUserId) {
  const requestedAt = pendingUnlinks.get(cleanText(lineUserId));
  if (!requestedAt || Date.now() - requestedAt > 10 * 60 * 1000) {
    return { error: 'Please send unlink first, then confirm unlink.' };
  }
  const record = crmAgentRepository.findUserProfileRecordByLineUserId
    ? await crmAgentRepository.findUserProfileRecordByLineUserId(cleanText(lineUserId))
    : null;
  if (!record || record.profile.lineLinkStatus !== 'Connected') return { error: 'LINE is not connected to a Gringo profile.' };
  pendingUnlinks.delete(cleanText(lineUserId));
  const profile = await disconnectLine(record.profile.userId);
  return { profile };
}

async function getLinkHistory(userId) {
  try {
    const rows = await linkRepository.findAllLinkHistoryRecords();
    const fromSheets = rows.map((record) => record.history).filter((event) => event.userId === userId && event.channel === 'line');
    const byId = new Map(fromSheets.map((event) => [event.historyId, event]));
    memoryHistory.filter((event) => event.userId === userId).forEach((event) => byId.set(event.historyId, event));
    return Array.from(byId.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch (error) {
    return memoryHistory.filter((event) => event.userId === userId);
  }
}

module.exports = {
  confirmSelfUnlink,
  createLinkCode,
  disconnectLine,
  expireOldCodes,
  getLinkHistory,
  hashCode,
  linkLineToProfile,
  requestSelfUnlink,
  saveHistory,
};
