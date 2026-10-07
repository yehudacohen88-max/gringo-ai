const ACTIVE_GOALS = [
  'Find Job',
  'Find Housing',
  'Send Money',
  'Learn Rights',
  'Find Services',
  'Follow Community Updates',
];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function splitList(value) {
  return cleanText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasCompletedGoal(userProfile = {}, goal) {
  return splitList(userProfile.completedGoals).includes(goal);
}

function joinList(values = []) {
  return [...new Set(values.filter(Boolean))].join(', ');
}

function addGoal(profile, goal) {
  if (!ACTIVE_GOALS.includes(goal)) return {};
  const activeGoals = splitList(profile.activeGoals);
  const completedGoals = splitList(profile.completedGoals).filter((item) => item !== goal);
  if (!activeGoals.includes(goal)) activeGoals.push(goal);
  return {
    activeGoals: joinList(activeGoals),
    completedGoals: joinList(completedGoals),
  };
}

function completeGoal(profile, goal) {
  const activeGoals = splitList(profile.activeGoals).filter((item) => item !== goal);
  const completedGoals = splitList(profile.completedGoals);
  if (!completedGoals.includes(goal)) completedGoals.push(goal);
  return {
    activeGoals: joinList(activeGoals),
    completedGoals: joinList(completedGoals),
  };
}

function extractAmount(message) {
  const match = cleanText(message).replace(/,/g, '').match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? match[1] : '';
}

function extractCity(message) {
  const normalized = normalize(message);
  if (/\btel aviv\b|\u05ea\u05dc \u05d0\u05d1\u05d9\u05d1/.test(normalized)) return 'Tel Aviv';
  if (/\bashdod\b/.test(normalized)) return 'Ashdod';
  if (/\bashkelon\b/.test(normalized)) return 'Ashkelon';
  if (/\bjerusalem\b/.test(normalized)) return 'Jerusalem';
  if (/\bhaifa\b/.test(normalized)) return 'Haifa';
  return '';
}

function extractProfession(message, userProfile = {}) {
  const normalized = normalize(message);
  if (/\bconstruction\b|\u05d1\u05e0\u05d9\u05d9\u05d4/.test(normalized)) return 'Construction worker';
  if (/\bagriculture\b/.test(normalized)) return 'Agriculture worker';
  if (/\bcaregiver|caregiving\b/.test(normalized)) return 'Caregiver';
  return cleanText(userProfile.preferredJobProfession || userProfile.profession);
}

function extractCountry(message) {
  const normalized = normalize(message);
  if (/\bthailand\b|\u05ea\u05d0\u05d9\u05dc\u05e0\u05d3/.test(normalized)) return 'Thailand';
  if (/\bsri lanka\b/.test(normalized)) return 'Sri Lanka';
  if (/\bindia\b/.test(normalized)) return 'India';
  if (/\bphilippines\b/.test(normalized)) return 'Philippines';
  return '';
}

function titleCase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function cleanCapturedValue(value = '') {
  return cleanText(value)
    .replace(/[.?!]+$/g, '')
    .replace(/\s+(now|anymore|please)$/i, '')
    .trim();
}

function extractCurrency(message) {
  const normalized = normalize(message);
  const match = normalized.match(/\b(?:i prefer|my preferred currency is|preferred currency is)\s+([a-z]{3})\b/);
  return match ? match[1].toUpperCase() : '';
}

function extractEmployer(message) {
  const text = cleanText(message);
  const patterns = [
    /\b(?:i am|i'm)\s+(?:now\s+)?working\s+(?:for|at)\s+([^?.!,]+(?:\s+[^?.!,]+)*)/i,
    /\bi\s+work\s+(?:for|at)\s+([^?.!,]+(?:\s+[^?.!,]+)*)/i,
    /\bmy\s+employer\s+is\s+([^?.!,]+(?:\s+[^?.!,]+)*)/i,
    /\bi\s+started\s+working\s+(?:for|at)\s+([^?.!,]+(?:\s+[^?.!,]+)*)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const employer = cleanCapturedValue(match?.[1] || '');
    if (employer) return employer;
  }

  return '';
}

function extractExplicitProfession(message) {
  const text = cleanText(message);
  const normalized = normalize(message);
  const patterns = [
    /\bmy\s+profession\s+is\s+(?:now\s+)?([^?.!,]+)/i,
    /\bmy\s+job\s+is\s+(?:now\s+)?([^?.!,]+)/i,
    /\bi\s+am\s+(?:now\s+)?an?\s+([^?.!,]+)/i,
    /\bi'm\s+(?:now\s+)?an?\s+([^?.!,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const profession = cleanCapturedValue(match?.[1] || '');
    if (profession && !/\b(from|looking|working|moving|living)\b/i.test(profession)) {
      return titleCase(profession);
    }
  }

  if (/\bi\s+work\s+in\s+construction\b/.test(normalized)) return 'Construction worker';
  if (/\bi\s+work\s+in\s+agriculture\b/.test(normalized)) return 'Agriculture worker';
  if (/\bi\s+work\s+in\s+caregiving\b/.test(normalized)) return 'Caregiver';
  return '';
}

function extractWorkSector(message) {
  const normalized = normalize(message);
  if (/\b(?:i work in|my work sector is|work sector is|i am in)\s+construction\b/.test(normalized)) return 'Construction';
  if (/\b(?:i work in|my work sector is|work sector is|i am in)\s+agriculture\b/.test(normalized)) return 'Agriculture';
  if (/\b(?:i work in|my work sector is|work sector is|i am in)\s+(caregiving|caregiver)\b/.test(normalized)) return 'Caregiving';
  return '';
}

function hasQuestionLead(message) {
  return /^(do|does|did|can|could|should|would|what|where|when|why|how|are|is|am)\b/i.test(cleanText(message));
}

function extractExplicitProfileUpdates(message, userProfile = {}) {
  const normalized = normalize(message);
  const updates = {};
  const fieldNames = [];

  if (!normalized || hasQuestionLead(message)) {
    return { updates, fieldNames };
  }

  const nameMatch = cleanText(message).match(/\b(?:my name is|call me)\s+([^?.!,]+)/i);
  const fullName = cleanCapturedValue(nameMatch?.[1] || '');
  if (fullName) {
    updates.fullName = fullName;
    fieldNames.push('fullName');
  }

  const country = /\b(?:i am|i'm)\s+from\b/.test(normalized) ? extractCountry(message) : '';
  if (country) {
    updates.country = country;
    fieldNames.push('country');
  }

  const movedCity = /\b(?:i moved to|i live in|i am living in|i'm living in|my city is|i am now in|i'm now in)\b/.test(normalized)
    ? extractCity(message)
    : '';
  if (movedCity) {
    updates.city = movedCity;
    fieldNames.push('city');
  }

  const workSector = extractWorkSector(message);
  if (workSector) {
    updates.workSector = workSector;
    fieldNames.push('workSector');
  }

  const profession = extractExplicitProfession(message);
  if (profession) {
    updates.profession = profession;
    fieldNames.push('profession');
  }

  const currentEmployer = extractEmployer(message);
  if (currentEmployer) {
    updates.currentEmployer = currentEmployer;
    fieldNames.push('currentEmployer');
  }

  const preferredCurrency = extractCurrency(message);
  if (preferredCurrency) {
    updates.preferredCurrency = preferredCurrency;
    fieldNames.push('preferredCurrency');
  }

  if (/\b(?:i do not|i don't|dont|do not)\s+want\s+job\s+alerts\s+anymore\b|\b(?:stop|turn off|disable)\s+job\s+alerts\b/.test(normalized)) {
    updates.wantsJobAlerts = 'No';
    fieldNames.push('wantsJobAlerts');
  } else if (/\b(?:i want|enable|turn on)\s+job\s+alerts\b/.test(normalized)) {
    updates.wantsJobAlerts = 'Yes';
    fieldNames.push('wantsJobAlerts');
  }

  if (/\b(?:i am|i'm)\s+looking\s+for\s+(?:work|a job|job|jobs)\b/.test(normalized)) {
    const city = extractCity(message);
    const profession = extractProfession(message, userProfile);
    updates.lookingForJob = 'Yes';
    if (city) updates.preferredJobCity = city;
    if (profession) updates.preferredJobProfession = profession;
    fieldNames.push('lookingForJob');
    if (city) fieldNames.push('preferredJobCity');
    if (profession) fieldNames.push('preferredJobProfession');
  }

  if (/\b(?:i am|i'm)\s+looking\s+for\s+housing\b/.test(normalized)) {
    const city = extractCity(message);
    updates.lookingForHousing = 'Yes';
    if (city) updates.preferredHousingCity = city;
    fieldNames.push('lookingForHousing');
    if (city) fieldNames.push('preferredHousingCity');
  }

  return { updates, fieldNames: [...new Set(fieldNames)] };
}

function isYes(value) {
  return ['yes', 'true', '1'].includes(normalize(value));
}

function isNo(value) {
  return ['no', 'false', '0'].includes(normalize(value));
}

function shouldStartJob(message) {
  return /\b(looking for work|looking for construction work|need work|need a job|find me a job|job|jobs|work)\b|\u05de\u05d7\u05e4\u05e9 \u05e2\u05d1\u05d5\u05d3\u05d4|\u05e2\u05d1\u05d5\u05d3\u05d4|\u05d1\u05e0\u05d9\u05d9\u05d4/.test(
    normalize(message)
  );
}

function shouldCompleteJob(message) {
  return /\b(i found a job|found a job|got a job|i got work)\b/.test(normalize(message));
}

function shouldStartHousing(message) {
  return /\b(need a room|need room|need housing|shared room|apartment|place to live|rent)\b|\u05d7\u05d3\u05e8|\u05d3\u05d9\u05e8\u05d4|\u05de\u05d2\u05d5\u05e8\u05d9\u05dd/.test(
    normalize(message)
  );
}

function shouldCompleteHousing(message) {
  return /\b(i found an apartment|found an apartment|found housing|found a room|i found a room|i found housing)\b/.test(normalize(message));
}

function shouldStopAlert(message) {
  return /\b(i no longer need this alert|no longer need this alert|stop this alert|stop alerts|stop alert)\b/.test(normalize(message));
}

function shouldStartMoney(message) {
  return /\b(send money|want to send|money transfer|transfer money|send \d+|shekels to)\b|\u05dc\u05e9\u05dc\u05d5\u05d7 \u05db\u05e1\u05e3/.test(
    normalize(message)
  );
}

function shouldStartCommunity(message) {
  return /\b(community|updates|what is new|news today|discussions?)\b|\u05e7\u05d4\u05d9\u05dc\u05d4|\u05de\u05d4 \u05d7\u05d3\u05e9/.test(
    normalize(message)
  );
}

function shouldStartRights(message) {
  return /\b(rights|employer did not pay|salary|overtime|did not pay)\b|\u05d6\u05db\u05d5\u05d9\u05d5\u05ea|\u05de\u05e2\u05e1\u05d9\u05e7|\u05de\u05e9\u05db\u05d5\u05e8\u05ea/.test(
    normalize(message)
  );
}

function updateGoalsFromMessage(message, userProfile = {}) {
  const updates = {
    lastActivityAt: new Date().toISOString(),
  };
  const city = extractCity(message);
  const amount = extractAmount(message);
  const country = extractCountry(message);
  const profession = extractProfession(message, userProfile);

  if (shouldCompleteJob(message)) {
    Object.assign(updates, completeGoal({ ...userProfile, ...updates }, 'Find Job'), {
      lookingForJob: 'No',
    });
  } else if (shouldStartJob(message)) {
    Object.assign(updates, addGoal({ ...userProfile, ...updates }, 'Find Job'), {
      lookingForJob: 'Yes',
      preferredJobCity: city || userProfile.preferredJobCity || '',
      preferredJobProfession: profession || '',
    });
  }

  if (shouldCompleteHousing(message)) {
    Object.assign(updates, completeGoal({ ...userProfile, ...updates }, 'Find Housing'), {
      lookingForHousing: 'No',
    });
  } else if (shouldStartHousing(message)) {
    Object.assign(updates, addGoal({ ...userProfile, ...updates }, 'Find Housing'), {
      lookingForHousing: 'Yes',
      preferredHousingCity: city || userProfile.preferredHousingCity || userProfile.city || '',
      maximumHousingBudget: amount || userProfile.maximumHousingBudget || userProfile.maximumMonthlyBudget || '',
      maximumMonthlyBudget: amount || userProfile.maximumMonthlyBudget || userProfile.maximumHousingBudget || '',
    });
  }

  if (shouldStopAlert(message)) {
    if (userProfile.lookingForHousing === 'Yes' && hasActiveGoal(userProfile, 'Find Housing')) {
      Object.assign(updates, completeGoal({ ...userProfile, ...updates }, 'Find Housing'), {
        lookingForHousing: 'No',
      });
    } else if (userProfile.lookingForJob === 'Yes' && hasActiveGoal(userProfile, 'Find Job')) {
      Object.assign(updates, completeGoal({ ...userProfile, ...updates }, 'Find Job'), {
        lookingForJob: 'No',
      });
    } else if (userProfile.interestedInMoneyTransfers === 'Yes' && hasActiveGoal(userProfile, 'Send Money')) {
      Object.assign(updates, completeGoal({ ...userProfile, ...updates }, 'Send Money'), {
        interestedInMoneyTransfers: 'No',
      });
    }
  }

  if (shouldStartMoney(message)) {
    Object.assign(updates, addGoal({ ...userProfile, ...updates }, 'Send Money'), {
      interestedInMoneyTransfers: 'Yes',
      lastMoneyTransferAmount: amount || userProfile.lastMoneyTransferAmount || '',
      lastMoneyTransferCountry: country || userProfile.lastMoneyTransferCountry || userProfile.moneyTransferCountry || userProfile.country || '',
      moneyTransferCountry: country || userProfile.moneyTransferCountry || '',
    });
  }

  if (shouldStartCommunity(message)) {
    Object.assign(updates, addGoal({ ...userProfile, ...updates }, 'Follow Community Updates'));
  }

  if (shouldStartRights(message)) {
    Object.assign(updates, addGoal({ ...userProfile, ...updates }, 'Learn Rights'));
  }

  return updates;
}

function getMissingFollowUp(userProfile = {}, message = '') {
  const normalized = normalize(message);
  if (isYes(message) || isNo(message)) return null;

  if (userProfile.lookingForJob === 'Yes') {
    if (!cleanText(userProfile.preferredJobCity)) return 'Which city would you like to work in?';
    if (!cleanText(userProfile.preferredJobProfession)) return 'What kind of work are you looking for?';
  }

  if (userProfile.lookingForHousing === 'Yes') {
    if (!cleanText(userProfile.maximumHousingBudget || userProfile.maximumMonthlyBudget)) return 'What is your monthly budget?';
    if (!cleanText(userProfile.preferredHousingCity)) return 'Which city should I search in?';
  }

  if (userProfile.interestedInMoneyTransfers === 'Yes') {
    if (!cleanText(userProfile.lastMoneyTransferCountry || userProfile.moneyTransferCountry)) return 'Which country are you sending money to?';
    if (!cleanText(userProfile.lastMoneyTransferAmount)) return 'How much do you want to send?';
  }

  if (/^\d+(?:,\d+)*(?:\.\d+)?$/.test(normalized)) return null;
  return null;
}

function answerPendingNeed(message, userProfile = {}) {
  const updates = {};
  const city = extractCity(message);
  const amount = extractAmount(message);
  const country = extractCountry(message);

  if (userProfile.lookingForJob === 'Yes') {
    if (!cleanText(userProfile.preferredJobCity) && city) updates.preferredJobCity = city;
    else if (!cleanText(userProfile.preferredJobProfession)) updates.preferredJobProfession = extractProfession(message, userProfile) || cleanText(message);
  }

  if (userProfile.lookingForHousing === 'Yes') {
    if (!cleanText(userProfile.maximumHousingBudget || userProfile.maximumMonthlyBudget) && amount) {
      updates.maximumHousingBudget = amount;
      updates.maximumMonthlyBudget = amount;
    } else if (!cleanText(userProfile.preferredHousingCity) && city) {
      updates.preferredHousingCity = city;
    }
  }

  if (userProfile.interestedInMoneyTransfers === 'Yes') {
    if (!cleanText(userProfile.lastMoneyTransferCountry || userProfile.moneyTransferCountry) && country) {
      updates.lastMoneyTransferCountry = country;
      updates.moneyTransferCountry = country;
    } else if (!cleanText(userProfile.lastMoneyTransferAmount) && amount) {
      updates.lastMoneyTransferAmount = amount;
    }
  }

  if (Object.keys(updates).length) updates.lastActivityAt = new Date().toISOString();
  return updates;
}

function hasActiveGoal(userProfile = {}, goal) {
  return splitList(userProfile.activeGoals).includes(goal);
}

module.exports = {
  ACTIVE_GOALS,
  addGoal,
  answerPendingNeed,
  completeGoal,
  getMissingFollowUp,
  hasActiveGoal,
  hasCompletedGoal,
  extractExplicitProfileUpdates,
  splitList,
  updateGoalsFromMessage,
};
