const { crmAgentService } = require('../crm-agent');

const WORK_SECTORS = ['Construction', 'Agriculture', 'Caregiving', 'Other'];
const onboardingStateByUser = new Map();

const ONBOARDING_FIELDS = [
  {
    key: 'fullName',
    label: 'Name',
    question: 'What is your full name?',
  },
  {
    key: 'country',
    label: 'Country',
    question: 'Which country are you from?',
  },
  {
    key: 'preferredLanguage',
    label: 'Language',
    question: 'What language do you prefer for Gringo replies?',
  },
  {
    key: 'workSector',
    label: 'Work sector',
    question: 'What work sector are you in? You can answer: Construction, Agriculture, Caregiving, or Other.',
  },
  {
    key: 'profession',
    label: 'Profession',
    optional: true,
    question: 'What is your profession? You can type skip if you prefer.',
  },
  {
    key: 'city',
    label: 'City',
    optional: true,
    question: 'What city are you living in now? You can type skip if you prefer.',
  },
  {
    key: 'wantsJobAlerts',
    label: 'Job alerts',
    optional: true,
    question: 'Would you like job alerts? Please answer Yes or No. You can type skip if you prefer.',
  },
  {
    key: 'preferredCurrency',
    label: 'Preferred currency',
    optional: true,
    question: 'What currency do you prefer for money and exchange-rate help? For example: THB, USD, ILS. You can type skip if you prefer.',
  },
  {
    key: 'wantsExchangeRateAlerts',
    label: 'Exchange-rate alerts',
    optional: true,
    question: 'Would you like exchange-rate alerts? Please answer Yes or No. You can type skip if you prefer.',
  },
];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function getStateKey(userContext = {}) {
  return `${userContext.channel || 'web'}:${userContext.channelUserId || 'local-web-user'}`;
}

function normalizeBooleanAnswer(value) {
  const answer = cleanText(value).toLowerCase();
  if (['yes', 'y', 'true', 'כן'].includes(answer)) return 'Yes';
  if (['no', 'n', 'false', 'לא'].includes(answer)) return 'No';
  return '';
}

function normalizeWorkSector(value) {
  const answer = cleanText(value).toLowerCase();
  return WORK_SECTORS.find((sector) => sector.toLowerCase() === answer) || '';
}

function getProfileValue(profile, field) {
  return cleanText(profile?.[field.key]);
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

function buildProgress(profile = {}, nextField) {
  const completed = getCompletedCount(profile);
  const progress = `Profile setup: ${completed} of ${ONBOARDING_FIELDS.length}`;
  return nextField ? `${progress}\n${nextField.question}` : progress;
}

function buildProfileSummary(profile = {}) {
  return [
    'Your profile:',
    `Name: ${profile.fullName || '-'}`,
    `Country: ${profile.country || '-'}`,
    `Language: ${profile.preferredLanguage || profile.language || '-'}`,
    `Work sector: ${profile.workSector || '-'}`,
    `Profession: ${profile.profession || '-'}`,
    `City: ${profile.city || '-'}`,
    `Job alerts: ${profile.wantsJobAlerts || '-'}`,
    `Preferred currency: ${profile.preferredCurrency || '-'}`,
    `Exchange-rate alerts: ${profile.wantsExchangeRateAlerts || '-'}`,
  ].join('\n');
}

function isSkip(message) {
  return ['skip', 'דלג'].includes(cleanText(message).toLowerCase());
}

function isRestart(message) {
  return ['restart onboarding', 'restart profile', 'start over', 'reset profile'].includes(cleanText(message).toLowerCase());
}

function isCorrectPrevious(message) {
  return ['correct', 'correct previous', 'change previous', 'fix previous'].includes(cleanText(message).toLowerCase());
}

function normalizeAnswer(field, message) {
  if (field.key === 'workSector') return normalizeWorkSector(message);
  if (field.key === 'wantsJobAlerts' || field.key === 'wantsExchangeRateAlerts') return normalizeBooleanAnswer(message);
  if (field.key === 'preferredCurrency') return cleanText(message).toUpperCase();
  return cleanText(message);
}

function buildFieldUpdate(field, value) {
  if (field.key === 'preferredLanguage') {
    return {
      preferredLanguage: value,
      language: value,
    };
  }

  return {
    [field.key]: value,
  };
}

async function getUserProfile(userContext = {}) {
  const user = await crmAgentService.findOrCreateUser(userContext);
  const profile = await crmAgentService.getUserMemory(user.userId);
  return profile || user;
}

async function updateUserProfile(userContext = {}, updates = {}) {
  const user = await crmAgentService.findOrCreateUser(userContext);
  return crmAgentService.updateUserProfile(user.userId, updates);
}

async function restartOnboarding(userContext = {}) {
  const updates = ONBOARDING_FIELDS.reduce((record, field) => {
    record[field.key] = '';
    return record;
  }, {});
  updates.language = '';
  const profile = await updateUserProfile(userContext, updates);
  onboardingStateByUser.set(getStateKey(userContext), {});
  return profile;
}

async function getStatus(userContext = {}) {
  const profile = await getUserProfile(userContext);
  const nextField = getNextField(profile);

  return {
    complete: !nextField,
    profile,
    prompt: nextField ? buildProgress(profile, nextField) : '',
    progress: {
      completed: getCompletedCount(profile),
      total: ONBOARDING_FIELDS.length,
    },
    summary: buildProfileSummary(profile),
  };
}

async function handleMessage(message, userContext = {}) {
  const stateKey = getStateKey(userContext);
  let state = onboardingStateByUser.get(stateKey) || {};
  let profile = await getUserProfile(userContext);

  if (isRestart(message)) {
    profile = await restartOnboarding(userContext);
    state = {};
  }

  if (isCorrectPrevious(message) && state.lastFieldKey) {
    const lastField = ONBOARDING_FIELDS.find((field) => field.key === state.lastFieldKey);
    profile = await updateUserProfile(userContext, buildFieldUpdate(lastField, ''));
    onboardingStateByUser.set(stateKey, {
      currentFieldKey: lastField.key,
      lastFieldKey: '',
    });

    return {
      handled: true,
      complete: false,
      reply: `No problem, let's correct that.\n${buildProgress(profile, lastField)}`,
      profile,
    };
  }

  const currentField = ONBOARDING_FIELDS.find((field) => field.key === state.currentFieldKey) || getNextField(profile);

  if (!currentField) {
    return {
      handled: false,
      complete: true,
      profile,
    };
  }

  if (isSkip(message)) {
    if (!currentField.optional) {
      return {
        handled: true,
        complete: false,
        reply: `${buildProgress(profile, currentField)}\nThis one is needed so Gringo can personalize your help.`,
        profile,
      };
    }

    profile = await updateUserProfile(userContext, buildFieldUpdate(currentField, 'Skipped'));
  } else {
    const normalizedAnswer = normalizeAnswer(currentField, message);

    if (!normalizedAnswer) {
      const help =
        currentField.key === 'workSector'
          ? `Please choose one: ${WORK_SECTORS.join(', ')}.`
          : 'Please answer Yes or No.';

      return {
        handled: true,
        complete: false,
        reply: `${buildProgress(profile, currentField)}\n${help}`,
        profile,
      };
    }

    profile = await updateUserProfile(userContext, buildFieldUpdate(currentField, normalizedAnswer));
  }

  const nextField = getNextField(profile);
  onboardingStateByUser.set(stateKey, {
    currentFieldKey: nextField?.key || '',
    lastFieldKey: currentField.key,
  });

  if (!nextField) {
    return {
      handled: true,
      complete: true,
      reply: `Thank you. I now know you better and can give you more relevant help.\n\n${buildProfileSummary(profile)}`,
      profile,
    };
  }

  return {
    handled: true,
    complete: false,
    reply: buildProgress(profile, nextField),
    profile,
  };
}

module.exports = {
  ONBOARDING_FIELDS,
  WORK_SECTORS,
  buildProfileSummary,
  getStatus,
  handleMessage,
  isComplete,
  restartOnboarding,
  updateUserProfile,
};
