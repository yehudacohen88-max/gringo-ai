const { crmAgentService } = require('../crm-agent');
const {
  SKIPPED,
  cleanText,
  isSkipAnswer,
  looksLikeQuestion,
  normalizeFieldValue,
} = require('./onboarding.validation');
const { languageDetectionService } = require('../language');
const { copyFor, normalizeOnboardingLanguage } = require('./onboarding.i18n');

const WORK_SECTORS = ['Construction', 'Agriculture', 'Caregiving', 'Other'];
const onboardingStateByUser = new Map();

// The language is asked first, so every later question is shown in the
// language the user chose. All copy is static (onboarding.i18n.js).
const ONBOARDING_FIELDS = [
  { key: 'preferredLanguage', label: 'Language' },
  { key: 'fullName', label: 'Name' },
  { key: 'country', label: 'Country' },
  { key: 'workSector', label: 'Work sector' },
  { key: 'profession', label: 'Profession', optional: true },
  { key: 'city', label: 'City', optional: true },
  { key: 'wantsJobAlerts', label: 'Job alerts', optional: true },
  { key: 'preferredCurrency', label: 'Preferred currency', optional: true },
  { key: 'wantsExchangeRateAlerts', label: 'Exchange-rate alerts', optional: true },
].map((field) => Object.freeze({ ...field, question: copyFor('en').questions[field.key] }));


function getStateKey(userContext = {}) {
  const channelUserId = userContext.channelUserId === undefined || userContext.channelUserId === null
    ? ''
    : String(userContext.channelUserId).trim();
  if (!channelUserId) {
    const error = new Error('A channel user id is required.');
    error.statusCode = 400;
    throw error;
  }
  return `${userContext.channel || 'web'}:${channelUserId}`;
}

function fieldByKey(key) {
  return ONBOARDING_FIELDS.find((field) => field.key === key) || null;
}

// A stored value only counts when it is still valid, so a bad value saved
// before validation existed (e.g. a question saved as the country) is asked again.
function getProfileValue(profile, field) {
  const raw = cleanText(profile?.[field.key]);
  if (!raw) return '';
  if (field.key === 'preferredLanguage') return languageDetectionService.normalizeLanguageCode(raw);
  return normalizeFieldValue(field.key, raw, { optional: field.optional, strict: false });
}

function getCompletedCount(profile = {}) {
  return ONBOARDING_FIELDS.filter((field) => getProfileValue(profile, field)).length;
}

function getNextField(profile = {}) {
  return ONBOARDING_FIELDS.find((field) => !getProfileValue(profile, field)) || null;
}

function isComplete(profile = {}) {
  return !getNextField(profile);
}

// The language used for onboarding copy: the saved choice first, otherwise
// the language resolved for this message (Telegram language_code or text).
function displayLanguage(profile = {}, userContext = {}) {
  return normalizeOnboardingLanguage(profile.preferredLanguage)
    || normalizeOnboardingLanguage(userContext.language)
    || 'en';
}

function buildProgress(profile = {}, nextField, language = 'en') {
  const copy = copyFor(language);
  const progress = copy.progress(getCompletedCount(profile), ONBOARDING_FIELDS.length);
  return nextField ? `${progress}\n${copy.questions[nextField.key]}` : progress;
}

function displayValue(value, copy) {
  const text = cleanText(value);
  if (!text) return '-';
  return copy.values[text] || text;
}

function buildProfileSummary(profile = {}, language = 'en') {
  const copy = copyFor(language);
  const keys = ['fullName', 'country', 'preferredLanguage', 'workSector', 'profession', 'city', 'wantsJobAlerts', 'preferredCurrency', 'wantsExchangeRateAlerts'];
  return [
    copy.summaryTitle,
    ...keys.map((key) => {
      const value = key === 'preferredLanguage' ? (profile.preferredLanguage || profile.language) : profile[key];
      return `${copy.labels[key]}: ${displayValue(value, copy)}`;
    }),
  ].join('\n');
}

function isRestart(message) {
  return ['restart onboarding', 'restart profile', 'start over', 'reset profile'].includes(cleanText(message).toLowerCase());
}

function isCorrectPrevious(message) {
  return ['correct', 'correct previous', 'change previous', 'fix previous'].includes(cleanText(message).toLowerCase());
}

function normalizeAnswer(field, message) {
  if (field.key === 'preferredLanguage') return normalizeOnboardingLanguage(message);
  return normalizeFieldValue(field.key, message, { optional: field.optional });
}

function buildFieldUpdate(field, value) {
  if (field.key === 'preferredLanguage') {
    return {
      preferredLanguage: value,
      language: value,
      // The language question is an explicit choice. Later detection must not
      // replace it; only a language-switch command or the profile setting can.
      languageSource: value ? 'explicit' : '',
    };
  }

  return {
    [field.key]: value,
  };
}

function invalidValueError(key) {
  const error = new Error(`Invalid value for ${key}.`);
  error.statusCode = 400;
  error.code = 'INVALID_PROFILE_VALUE';
  error.field = key;
  return error;
}

// Last guard before anything reaches the profile store (Google Sheets):
// onboarding fields are normalized, and an invalid non-empty value is refused.
function sanitizeProfileUpdates(updates = {}) {
  const sanitized = { ...updates };
  for (const field of ONBOARDING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(sanitized, field.key)) continue;
    const raw = cleanText(sanitized[field.key]);
    if (!raw) {
      sanitized[field.key] = '';
      continue;
    }
    if (field.key === 'preferredLanguage') continue; // checked by the language service
    const normalized = normalizeFieldValue(field.key, raw, { optional: field.optional, strict: false });
    if (!normalized) throw invalidValueError(field.key);
    sanitized[field.key] = normalized;
  }
  return sanitized;
}

async function getUserProfile(userContext = {}) {
  const user = await crmAgentService.findOrCreateUser(userContext);
  const profile = await crmAgentService.getUserMemory(user.userId);
  return profile || user;
}

async function updateUserProfile(userContext = {}, updates = {}) {
  const safeUpdates = sanitizeProfileUpdates(updates);
  const user = await crmAgentService.findOrCreateUser(userContext);
  return crmAgentService.updateUserProfile(user.userId, safeUpdates);
}

async function restartOnboarding(userContext = {}) {
  const updates = ONBOARDING_FIELDS.reduce((record, field) => {
    record[field.key] = '';
    return record;
  }, {});
  updates.language = '';
  updates.languageSource = '';
  const profile = await updateUserProfile(userContext, updates);
  onboardingStateByUser.set(getStateKey(userContext), {});
  return profile;
}

async function getStatus(userContext = {}) {
  const profile = await getUserProfile(userContext);
  const nextField = getNextField(profile);
  const language = displayLanguage(profile, userContext);

  return {
    complete: !nextField,
    profile,
    language,
    prompt: nextField ? buildProgress(profile, nextField, language) : '',
    progress: {
      completed: getCompletedCount(profile),
      total: ONBOARDING_FIELDS.length,
    },
    summary: buildProfileSummary(profile, language),
  };
}

function reply(fields) {
  return { handled: true, ...fields };
}

async function handleMessage(message, userContext = {}) {
  const stateKey = getStateKey(userContext);
  let state = onboardingStateByUser.get(stateKey) || {};
  let profile = await getUserProfile(userContext);

  if (isRestart(message)) {
    profile = await restartOnboarding(userContext);
    state = {};
  }

  let language = displayLanguage(profile, userContext);
  let copy = copyFor(language);

  if (isCorrectPrevious(message) && state.lastFieldKey) {
    const lastField = fieldByKey(state.lastFieldKey);
    profile = await updateUserProfile(userContext, buildFieldUpdate(lastField, ''));
    onboardingStateByUser.set(stateKey, {
      currentFieldKey: lastField.key,
      lastFieldKey: '',
    });
    language = displayLanguage(profile, userContext);
    copy = copyFor(language);

    return reply({
      complete: false,
      language,
      reply: `${copy.correct}\n${buildProgress(profile, lastField, language)}`,
      profile,
    });
  }

  const stateField = fieldByKey(state.currentFieldKey);
  const currentField = stateField && !getProfileValue(profile, stateField) ? stateField : getNextField(profile);

  if (!currentField) {
    return {
      handled: false,
      complete: true,
      language,
      profile,
    };
  }

  if (isSkipAnswer(message)) {
    if (!currentField.optional) {
      return reply({
        complete: false,
        language,
        reply: `${buildProgress(profile, currentField, language)}\n${copy.required}`,
        profile,
      });
    }

    profile = await updateUserProfile(userContext, buildFieldUpdate(currentField, SKIPPED));
  } else {
    const normalizedAnswer = normalizeAnswer(currentField, message);

    if (!normalizedAnswer) {
      // Nothing is saved: re-ask in the user's language.
      const notes = [copy.invalid[currentField.key]];
      if (looksLikeQuestion(message)) notes.push(copy.questionDuringOnboarding);
      return reply({
        complete: false,
        invalid: true,
        language,
        reply: `${buildProgress(profile, currentField, language)}\n${notes.join('\n')}`,
        profile,
      });
    }

    profile = await updateUserProfile(userContext, buildFieldUpdate(currentField, normalizedAnswer));
  }

  language = displayLanguage(profile, userContext);
  copy = copyFor(language);
  const nextField = getNextField(profile);
  onboardingStateByUser.set(stateKey, {
    currentFieldKey: nextField?.key || '',
    lastFieldKey: currentField.key,
  });

  if (!nextField) {
    return reply({
      complete: true,
      language,
      reply: `${copy.done}\n\n${buildProfileSummary(profile, language)}`,
      profile,
    });
  }

  return reply({
    complete: false,
    language,
    reply: buildProgress(profile, nextField, language),
    profile,
  });
}

function forgetUser(userContext = {}) {
  try {
    return onboardingStateByUser.delete(getStateKey(userContext));
  } catch (error) {
    return false;
  }
}

module.exports = {
  forgetUser,
  ONBOARDING_FIELDS,
  WORK_SECTORS,
  buildProfileSummary,
  getStatus,
  handleMessage,
  isComplete,
  restartOnboarding,
  sanitizeProfileUpdates,
  updateUserProfile,
};
