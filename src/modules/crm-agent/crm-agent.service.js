const crmAgentRepository = require('./crm-agent.repository');
const { USER_PROFILE_DEFAULTS } = require('./user-profile.model');
const { extractMemorySignals, mergeInterests } = require('./memory-extraction.service');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function cleanBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function buildUserProfile(context = {}) {
  const now = new Date().toISOString();

  return {
    ...USER_PROFILE_DEFAULTS,
    userId: context.userId || generateId('usr'),
    channel: cleanText(context.channel) || USER_PROFILE_DEFAULTS.channel,
    channelUserId: cleanText(context.channelUserId),
    fullName: cleanText(context.fullName),
    language: cleanText(context.language),
    country: cleanText(context.country),
    city: cleanText(context.city),
    profession: cleanText(context.profession),
    workSector: cleanText(context.workSector),
    currentEmployer: cleanText(context.currentEmployer),
    interests: cleanText(context.interests),
    preferredCurrency: cleanText(context.preferredCurrency),
    moneyTransferCountry: cleanText(context.moneyTransferCountry),
    lastQuestion: cleanText(context.lastQuestion),
    lastCategory: cleanText(context.lastCategory),
    lastInteractionAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function buildConversationEvent(event = {}) {
  return {
    conversationId: event.conversationId || generateId('conv'),
    userId: cleanText(event.userId),
    channel: cleanText(event.channel) || 'internal',
    question: cleanText(event.question),
    answer: cleanText(event.answer),
    category: cleanText(event.category),
    status: cleanText(event.status) || 'UNKNOWN',
    needsHumanFollowUp: cleanBoolean(event.needsHumanFollowUp),
    createdAt: event.createdAt || new Date().toISOString(),
  };
}

async function findOrCreateUser(context = {}) {
  const channel = cleanText(context.channel) || USER_PROFILE_DEFAULTS.channel;
  const channelUserId = cleanText(context.channelUserId);
  let record = null;

  if (context.userId) {
    record = await crmAgentRepository.findUserProfileRecordByUserId(context.userId);
  }

  if (!record && channelUserId) {
    record = await crmAgentRepository.findUserProfileRecordByChannel(channel, channelUserId);
  }

  if (record) {
    return record.profile;
  }

  const profile = buildUserProfile({
    ...context,
    channel,
    channelUserId,
  });

  return crmAgentRepository.createUserProfile(profile);
}

async function updateUserProfile(userId, updates = {}) {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);

  if (!record) {
    const error = new Error('User profile not found.');
    error.statusCode = 404;
    throw error;
  }

  const updatedProfile = {
    ...record.profile,
    ...updates,
    userId: record.profile.userId,
    createdAt: record.profile.createdAt,
    updatedAt: new Date().toISOString(),
  };

  return crmAgentRepository.updateUserProfile(record.rowNumber, updatedProfile);
}

async function saveConversation(event = {}) {
  const conversationEvent = buildConversationEvent(event);
  return crmAgentRepository.createConversationHistory(conversationEvent);
}

async function extractAndUpdateMemory(userId, message = '') {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);

  if (!record) {
    const error = new Error('User profile not found.');
    error.statusCode = 404;
    throw error;
  }

  const signals = extractMemorySignals(message);
  const updatedProfile = {
    ...record.profile,
    interests: mergeInterests(record.profile.interests, signals.interests),
    lastQuestion: cleanText(message),
    lastInteractionAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await crmAgentRepository.updateUserProfile(record.rowNumber, updatedProfile);

  return {
    profile: updatedProfile,
    signals,
  };
}

async function getUserMemory(userId) {
  const record = await crmAgentRepository.findUserProfileRecordByUserId(userId);

  if (!record) {
    return null;
  }

  return {
    userId: record.profile.userId,
    fullName: record.profile.fullName,
    language: record.profile.language,
    country: record.profile.country,
    city: record.profile.city,
    profession: record.profile.profession,
    workSector: record.profile.workSector,
    currentEmployer: record.profile.currentEmployer,
    interests: record.profile.interests,
    preferredCurrency: record.profile.preferredCurrency,
    moneyTransferCountry: record.profile.moneyTransferCountry,
    lastQuestion: record.profile.lastQuestion,
    lastCategory: record.profile.lastCategory,
    lastInteractionAt: record.profile.lastInteractionAt,
  };
}

module.exports = {
  extractAndUpdateMemory,
  findOrCreateUser,
  getUserMemory,
  saveConversation,
  updateUserProfile,
};
