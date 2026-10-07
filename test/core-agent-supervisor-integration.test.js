const test = require('node:test');
const assert = require('node:assert/strict');

const { aiProviderService } = require('../src/modules/ai-provider');
const { coreAgentService } = require('../src/modules/core-agent');
const { crmAgentService } = require('../src/modules/crm-agent');
const { knowledgeAgentService } = require('../src/modules/knowledge-agent');
const moneyService = require('../src/modules/money/money.service');
const { supervisorService } = require('../src/modules/agents');
const { translationService } = require('../src/modules/translation');

const ORIGINAL_ENV = {
  MULTI_AGENT_ENABLED: process.env.MULTI_AGENT_ENABLED,
  SUPERVISOR_ENABLED: process.env.SUPERVISOR_ENABLED,
  AGENT_EXECUTION_ENABLED: process.env.AGENT_EXECUTION_ENABLED,
  ACTIVE_SUPERVISOR_DELIVERY_ENABLED: process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED,
  SUPERVISOR_MULTI_INTENT_LIVE_ENABLED: process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED,
};

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_supervisor',
    fullName: 'Somchai',
    country: 'Thailand',
    preferredLanguage: 'en',
    detectedLanguage: '',
    languageSource: '',
    language: '',
    workSector: 'Construction',
    profession: 'Construction worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'Yes',
    ...overrides,
  };
}

function setSupervisorFlags(enabled) {
  process.env.MULTI_AGENT_ENABLED = enabled ? 'true' : 'false';
  process.env.SUPERVISOR_ENABLED = enabled ? 'true' : 'false';
  process.env.AGENT_EXECUTION_ENABLED = 'false';
  process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED = 'false';
  process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED = 'false';
}

function setActiveSupervisorFlags(enabled) {
  process.env.MULTI_AGENT_ENABLED = enabled ? 'true' : 'false';
  process.env.SUPERVISOR_ENABLED = enabled ? 'true' : 'false';
  process.env.AGENT_EXECUTION_ENABLED = enabled ? 'true' : 'false';
  process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED = enabled ? 'true' : 'false';
  process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED = 'false';
}

function restoreSupervisorFlags() {
  if (ORIGINAL_ENV.MULTI_AGENT_ENABLED === undefined) {
    delete process.env.MULTI_AGENT_ENABLED;
  } else {
    process.env.MULTI_AGENT_ENABLED = ORIGINAL_ENV.MULTI_AGENT_ENABLED;
  }

  if (ORIGINAL_ENV.SUPERVISOR_ENABLED === undefined) {
    delete process.env.SUPERVISOR_ENABLED;
  } else {
    process.env.SUPERVISOR_ENABLED = ORIGINAL_ENV.SUPERVISOR_ENABLED;
  }

  if (ORIGINAL_ENV.AGENT_EXECUTION_ENABLED === undefined) {
    delete process.env.AGENT_EXECUTION_ENABLED;
  } else {
    process.env.AGENT_EXECUTION_ENABLED = ORIGINAL_ENV.AGENT_EXECUTION_ENABLED;
  }

  if (ORIGINAL_ENV.ACTIVE_SUPERVISOR_DELIVERY_ENABLED === undefined) {
    delete process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED;
  } else {
    process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED = ORIGINAL_ENV.ACTIVE_SUPERVISOR_DELIVERY_ENABLED;
  }

  if (ORIGINAL_ENV.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED === undefined) {
    delete process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED;
  } else {
    process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED = ORIGINAL_ENV.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED;
  }
}

function mockCoreDependencies(profile = completeProfile()) {
  const savedConversations = [];
  const profileUpdates = [];
  let currentProfile = { ...profile };
  let aiCalls = 0;

  crmAgentService.findOrCreateUser = async (context = {}) => ({
    userId: currentProfile.userId,
    channel: context.channel || 'web',
    channelUserId: context.channelUserId || 'supervisor-user',
  });
  crmAgentService.getUserMemory = async () => currentProfile;
  crmAgentService.getUserLanguage = async () => ({
    preferredLanguage: currentProfile.preferredLanguage || '',
    detectedLanguage: currentProfile.detectedLanguage || '',
    languageSource: currentProfile.languageSource || '',
    languageUpdatedAt: currentProfile.languageUpdatedAt || '',
    language: currentProfile.language || currentProfile.preferredLanguage || currentProfile.detectedLanguage || '',
  });
  crmAgentService.updateDetectedLanguage = async () => currentProfile;
  crmAgentService.updateUserProfile = async (userId, updates) => {
    profileUpdates.push(updates);
    currentProfile = { ...currentProfile, ...updates, userId };
    return currentProfile;
  };
  crmAgentService.saveConversation = async (event) => {
    savedConversations.push(event);
    return event;
  };
  crmAgentService.extractAndUpdateMemory = async () => ({
    signals: {
      interests: [],
    },
  });

  knowledgeAgentService.answerQuestion = async () => ({
    status: 'FOUND',
    category: 'Rights',
    answer: 'Workers should keep written records and ask for help if wages are unpaid.',
    relevantKnowledge: [],
  });

  aiProviderService.generateReply = async () => {
    aiCalls += 1;
    return {
      provider: 'test',
      model: 'test',
      text: 'AI reply should not be used',
    };
  };

  return {
    getAiCalls: () => aiCalls,
    getProfile: () => currentProfile,
    profileUpdates,
    savedConversations,
  };
}

async function withSupervisorMethodSpy(methodName, replacement, callback) {
  const original = supervisorService[methodName];
  supervisorService[methodName] = replacement(original.bind(supervisorService));

  try {
    return await callback();
  } finally {
    supervisorService[methodName] = original;
  }
}

test.afterEach(() => {
  restoreSupervisorFlags();
});

test('integration is disabled by default', async () => {
  setSupervisorFlags(false);
  mockCoreDependencies();
  let createRequestContextCalls = 0;

  await withSupervisorMethodSpy('createRequestContext', (original) => (...args) => {
    createRequestContextCalls += 1;
    return original(...args);
  }, async () => {
    const messageContext = {
      requestId: 'req_disabled_default',
      message: 'What are my rights?',
      channel: 'web',
      channelUserId: 'supervisor-disabled-default',
    };
    const response = await coreAgentService.processWebMessage(messageContext);

    assert.equal(response.reply.includes('Workers should keep written records and ask for help if wages are unpaid.'), true);
    assert.equal(createRequestContextCalls, 0);
    assert.equal(messageContext.supervisorPlan, undefined);
  });
});

test('existing behavior is unchanged when disabled', async () => {
  setSupervisorFlags(false);
  const state = mockCoreDependencies();

  const response = await coreAgentService.processWebMessage({
    requestId: 'req_disabled_behavior',
    message: 'What are my rights?',
    channel: 'web',
    channelUserId: 'supervisor-disabled-behavior',
  });

  assert.equal(response.reply, 'Workers should keep written records and ask for help if wages are unpaid.');
  assert.equal(response.category, 'Rights');
  assert.equal(response.supervisorPlan, undefined);
  assert.equal(state.getAiCalls(), 0);
});

test('Supervisor runs when both flags are enabled and stores an internal plan', async () => {
  setSupervisorFlags(true);
  mockCoreDependencies();
  supervisorService.clearPlan('req_enabled');
  const calls = {
    createRequestContext: 0,
    createPlan: 0,
    validatePlan: 0,
    storePlan: 0,
  };

  await withSupervisorMethodSpy('createRequestContext', (original) => (...args) => {
    calls.createRequestContext += 1;
    return original(...args);
  }, async () => withSupervisorMethodSpy('createPlan', (original) => (...args) => {
    calls.createPlan += 1;
    return original(...args);
  }, async () => withSupervisorMethodSpy('validatePlan', (original) => (...args) => {
    calls.validatePlan += 1;
    return original(...args);
  }, async () => withSupervisorMethodSpy('storePlan', (original) => (...args) => {
    calls.storePlan += 1;
    return original(...args);
  }, async () => {
    const messageContext = {
      requestId: 'req_enabled',
      message: 'What are my rights?',
      channel: 'web',
      channelUserId: 'supervisor-enabled',
    };
    const response = await coreAgentService.processWebMessage(messageContext);
    const storedPlan = supervisorService.getPlan('req_enabled');

    assert.equal(calls.createRequestContext, 1);
    assert.equal(calls.createPlan, 1);
    assert.equal(calls.validatePlan, 2);
    assert.equal(calls.storePlan, 1);
    assert.equal(storedPlan.requestId, 'req_enabled');
    assert.equal(messageContext.supervisorPlan.requestId, 'req_enabled');
    assert.equal(response.supervisorPlan, undefined);
    assert.equal(response.reply.includes('Workers should keep written records and ask for help if wages are unpaid.'), true);
  }))));
});

test('plan is not exposed to the user response', async () => {
  setSupervisorFlags(true);
  mockCoreDependencies();

  const response = await coreAgentService.processWebMessage({
    requestId: 'req_not_exposed',
    message: 'What are my rights?',
    channel: 'web',
    channelUserId: 'supervisor-not-exposed',
  });

  assert.equal(Object.hasOwn(response, 'supervisorPlan'), false);
  assert.equal(JSON.stringify(response).includes('plan_'), false);
});

test('Supervisor failure does not interrupt the request', async () => {
  setSupervisorFlags(true);
  mockCoreDependencies();
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    await withSupervisorMethodSpy('createRequestContext', () => () => {
      throw new Error('test supervisor failure');
    }, async () => {
      const response = await coreAgentService.processWebMessage({
        requestId: 'req_failure',
        message: 'What are my rights?',
        channel: 'web',
        channelUserId: 'supervisor-failure',
      });

      assert.equal(response.reply, 'Workers should keep written records and ask for help if wages are unpaid.');
      assert.match(warnings[0], /Supervisor integration warning/);
    });
  } finally {
    console.warn = originalWarn;
  }
});

test('no Domain Agent is executed and no additional LLM call occurs', async () => {
  setSupervisorFlags(true);
  const state = mockCoreDependencies();
  let executed = false;
  const originalExecute = supervisorService.executeAgent;
  supervisorService.executeAgent = () => {
    executed = true;
  };

  try {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_no_execution',
      message: 'What are my rights?',
      channel: 'web',
      channelUserId: 'supervisor-no-execution',
    });

    assert.equal(response.reply, 'Workers should keep written records and ask for help if wages are unpaid.');
    assert.equal(executed, false);
    assert.equal(state.getAiCalls(), 0);
  } finally {
    if (originalExecute === undefined) {
      delete supervisorService.executeAgent;
    } else {
      supervisorService.executeAgent = originalExecute;
    }
  }
});

test('active delivery follows the execution flag by default', async () => {
  delete process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED;
  process.env.MULTI_AGENT_ENABLED = 'true';
  process.env.SUPERVISOR_ENABLED = 'true';
  process.env.AGENT_EXECUTION_ENABLED = 'true';
  mockCoreDependencies();
  supervisorService.clearPlan('req_active_default');
  let executed = false;
  const originalExecutePlanTasks = supervisorService.executePlanTasks;
  supervisorService.executePlanTasks = async (...args) => {
    executed = true;
    return originalExecutePlanTasks.apply(supervisorService, args);
  };

  try {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_active_default',
      message: 'salary employer rights',
      channel: 'web',
      channelUserId: 'active-disabled-default',
    });

    assert.equal(response.reply.includes('Workers should keep written records and ask for help if wages are unpaid.'), true);
    assert.equal(response.status, 'SUPERVISOR_COMPLETED');
    assert.equal(executed, true);
  } finally {
    supervisorService.executePlanTasks = originalExecutePlanTasks;
  }
});

test('profile recall is handled before active Supervisor routing', async () => {
  setActiveSupervisorFlags(true);
  const state = mockCoreDependencies(completeProfile({
    fullName: 'David Levi',
    country: 'Thailand',
    preferredLanguage: 'th',
    workSector: 'Construction',
    profession: 'Ironworker',
    city: 'Tel Aviv',
    lookingForJob: 'Yes',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'Yes',
  }));
  let createPlanCalls = 0;
  let executePlanCalls = 0;

  await withSupervisorMethodSpy('createPlan', (original) => (...args) => {
    createPlanCalls += 1;
    return original(...args);
  }, async () => withSupervisorMethodSpy('executePlanTasks', (original) => async (...args) => {
    executePlanCalls += 1;
    return original(...args);
  }, async () => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_profile_recall',
      message: 'Hi Gringo, what do you remember about me?',
      channel: 'web',
      channelUserId: 'profile-recall-user',
    });

    assert.equal(response.category, 'Profile');
    assert.equal(response.status, 'PROFILE_RECALL');
    assert.match(response.reply, /David Levi/);
    assert.match(response.reply, /Thailand/);
    assert.match(response.reply, /Construction/);
    assert.match(response.reply, /Ironworker/);
    assert.match(response.reply, /Tel Aviv/);
    assert.match(response.reply, /job alerts enabled/);
    assert.match(response.reply, /THB/);
    assert.match(response.reply, /exchange-rate alerts enabled/);
    assert.equal(createPlanCalls, 0);
    assert.equal(executePlanCalls, 0);
    assert.equal(state.savedConversations.length, 1);
    assert.equal(state.savedConversations[0].category, 'Profile');
    assert.equal(state.savedConversations[0].status, 'PROFILE_RECALL');
    assert.equal(state.savedConversations[0].answer, response.reply);
  }));
});

test('profile recall recognizes natural variants regardless of capitalization and punctuation', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies(completeProfile({ fullName: 'David Levi' }));
  const variants = [
    'What do you know about me?',
    'WHO AM I?',
    'Show me my profile',
    'Tell me about myself!',
    'Do you remember me?',
    'My profile',
  ];

  for (const [index, message] of variants.entries()) {
    const response = await coreAgentService.processWebMessage({
      requestId: `req_profile_recall_variant_${index}`,
      message,
      channel: 'web',
      channelUserId: `profile-recall-variant-${index}`,
    });

    assert.equal(response.category, 'Profile');
    assert.equal(response.status, 'PROFILE_RECALL');
    assert.match(response.reply, /David Levi/);
  }
});

test('natural profile recall answers stored profile fields before active Supervisor routing', async () => {
  setActiveSupervisorFlags(true);
  const state = mockCoreDependencies(completeProfile({
    fullName: 'David Levi',
    currentEmployer: 'ABC Construction Company',
    profession: 'Ironworker',
    city: 'Tel Aviv',
    preferredLanguage: 'th',
    preferredCurrency: 'THB',
    wantsJobAlerts: 'Yes',
  }));
  let createPlanCalls = 0;
  let executePlanCalls = 0;
  const cases = [
    ['Where do I work?', /ABC Construction Company/],
    ['Who is my employer?', /ABC Construction Company/],
    ['What company do I work for?', /ABC Construction Company/],
    ['What is my profession?', /Ironworker/],
    ['Where do I live?', /Tel Aviv/],
    ['What city am I in?', /Tel Aviv/],
    ['What language do I speak?', /th/],
    ['What currency do I prefer?', /THB/],
    ['Do I have job alerts enabled?', /job alerts are enabled/],
    ["Don't you remember me?", /David Levi/],
  ];

  await withSupervisorMethodSpy('createPlan', (original) => (...args) => {
    createPlanCalls += 1;
    return original(...args);
  }, async () => withSupervisorMethodSpy('executePlanTasks', (original) => async (...args) => {
    executePlanCalls += 1;
    return original(...args);
  }, async () => {
    for (const [index, [message, expected]] of cases.entries()) {
      const response = await coreAgentService.processWebMessage({
        requestId: `req_natural_profile_recall_${index}`,
        message,
        channel: 'web',
        channelUserId: 'natural-profile-recall-user',
      });

      assert.equal(response.category, 'Profile');
      assert.equal(response.status, 'PROFILE_RECALL');
      assert.match(response.reply, expected);
    }

    assert.equal(createPlanCalls, 0);
    assert.equal(executePlanCalls, 0);
    assert.equal(state.savedConversations.length, cases.length);
    assert.equal(state.savedConversations.every((event) => event.status === 'PROFILE_RECALL'), true);
  }));
});

test('natural profile recall handles empty stored profile fields conversationally', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies(completeProfile({
    fullName: 'David Levi',
    currentEmployer: '',
  }));

  const response = await coreAgentService.processWebMessage({
    requestId: 'req_natural_profile_recall_empty',
    message: 'Where do I work?',
    channel: 'web',
    channelUserId: 'natural-profile-recall-empty',
  });

  assert.equal(response.category, 'Profile');
  assert.equal(response.status, 'PROFILE_RECALL');
  assert.match(response.reply, /do not have that saved yet/i);
  assert.match(response.reply, /David Levi/);
});

test('natural profile recall does not intercept real domain questions', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies(completeProfile({
    fullName: 'David Levi',
    currentEmployer: 'ABC Construction Company',
    preferredCurrency: 'THB',
  }));
  let createPlanCalls = 0;

  await withSupervisorMethodSpy('createPlan', (original) => (...args) => {
    createPlanCalls += 1;
    return original(...args);
  }, async () => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_natural_profile_recall_domain_question',
      message: 'What is the USD exchange rate?',
      channel: 'web',
      channelUserId: 'natural-profile-recall-domain',
    });

    assert.notEqual(response.status, 'PROFILE_RECALL');
    assert.equal(createPlanCalls > 0, true);
  });
});

test('conversational profile update saves current employer before Supervisor routing', async () => {
  setActiveSupervisorFlags(true);
  const state = mockCoreDependencies(completeProfile({ fullName: 'David Levi', currentEmployer: '' }));
  let createPlanCalls = 0;

  await withSupervisorMethodSpy('createPlan', (original) => (...args) => {
    createPlanCalls += 1;
    return original(...args);
  }, async () => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_profile_update_employer',
      message: 'I am now working for ABC Construction Company.',
      channel: 'web',
      channelUserId: 'profile-update-employer',
    });

    assert.equal(response.category, 'Profile');
    assert.equal(response.status, 'PROFILE_UPDATED');
    assert.match(response.reply, /David Levi/);
    assert.match(response.reply, /ABC Construction Company/);
    assert.equal(state.getProfile().currentEmployer, 'ABC Construction Company');
    assert.equal(state.profileUpdates.some((updates) => updates.currentEmployer === 'ABC Construction Company'), true);
    assert.equal(state.savedConversations[0].status, 'PROFILE_UPDATED');
    assert.equal(createPlanCalls, 0);
  });
});

test('conversational profile update extracts city profession job alerts currency and housing details', async () => {
  setActiveSupervisorFlags(true);
  const cases = [
    {
      message: 'I moved to Haifa.',
      expected: { city: 'Haifa' },
    },
    {
      message: 'My profession is now electrician.',
      expected: { profession: 'Electrician' },
    },
    {
      message: "I don't want job alerts anymore.",
      expected: { wantsJobAlerts: 'No' },
    },
    {
      message: 'I prefer USD.',
      expected: { preferredCurrency: 'USD' },
    },
    {
      message: 'I am looking for housing in Jerusalem.',
      expected: { lookingForHousing: 'Yes', preferredHousingCity: 'Jerusalem' },
    },
    {
      message: 'I am looking for work in Haifa.',
      expected: { lookingForJob: 'Yes', preferredJobCity: 'Haifa' },
    },
  ];

  for (const [index, profileCase] of cases.entries()) {
    const state = mockCoreDependencies(completeProfile({
      userId: `usr_profile_update_${index}`,
      fullName: 'David Levi',
      preferredHousingCity: '',
      preferredJobCity: '',
      lookingForHousing: '',
      lookingForJob: '',
    }));

    const response = await coreAgentService.processWebMessage({
      requestId: `req_profile_update_${index}`,
      message: profileCase.message,
      channel: 'web',
      channelUserId: `profile-update-${index}`,
    });

    assert.equal(response.category, 'Profile');
    assert.equal(response.status, 'PROFILE_UPDATED');
    for (const [field, value] of Object.entries(profileCase.expected)) {
      assert.equal(state.getProfile()[field], value);
      assert.equal(state.profileUpdates.some((updates) => updates[field] === value), true);
    }
  }
});

test('mixed profile update and request persists profile then continues Supervisor routing', async () => {
  setActiveSupervisorFlags(true);
  const state = mockCoreDependencies(completeProfile({ fullName: 'David Levi', city: 'Tel Aviv' }));
  let createPlanCalls = 0;

  await withSupervisorMethodSpy('createPlan', (original) => (...args) => {
    createPlanCalls += 1;
    return original(...args);
  }, async () => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_profile_update_mixed',
      message: 'I moved to Haifa. Can you find construction jobs near me?',
      channel: 'web',
      channelUserId: 'profile-update-mixed',
    });

    assert.equal(state.getProfile().city, 'Haifa');
    assert.equal(state.profileUpdates.some((updates) => updates.city === 'Haifa'), true);
    assert.equal(response.status.startsWith('SUPERVISOR_'), true);
    assert.equal(createPlanCalls > 0, true);
  });
});

test('profile update detection avoids natural questions and knowledge requests', async () => {
  setActiveSupervisorFlags(true);
  const falsePositiveCases = [
    {
      message: 'Do you know ABC Construction Company?',
      unchangedField: 'currentEmployer',
      unchangedValue: '',
    },
    {
      message: 'Are there jobs in Haifa?',
      unchangedField: 'city',
      unchangedValue: 'Tel Aviv',
    },
    {
      message: 'What is the USD exchange rate?',
      unchangedField: 'preferredCurrency',
      unchangedValue: 'THB',
    },
  ];

  for (const [index, profileCase] of falsePositiveCases.entries()) {
    const state = mockCoreDependencies(completeProfile({
      userId: `usr_profile_false_positive_${index}`,
      currentEmployer: '',
      city: 'Tel Aviv',
      preferredCurrency: 'THB',
    }));

    const response = await coreAgentService.processWebMessage({
      requestId: `req_profile_false_positive_${index}`,
      message: profileCase.message,
      channel: 'web',
      channelUserId: `profile-false-positive-${index}`,
    });

    assert.notEqual(response.status, 'PROFILE_UPDATED');
    assert.equal(state.getProfile()[profileCase.unchangedField], profileCase.unchangedValue);
    assert.equal(state.profileUpdates.some((updates) => Object.hasOwn(updates, profileCase.unchangedField)), false);
  }
});

test('profile recall includes conversationally remembered employer', async () => {
  setActiveSupervisorFlags(true);
  const state = mockCoreDependencies(completeProfile({
    fullName: 'David Levi',
    currentEmployer: '',
  }));

  await coreAgentService.processWebMessage({
    requestId: 'req_profile_update_then_recall_update',
    message: 'I am now working for ABC Construction Company.',
    channel: 'web',
    channelUserId: 'profile-update-then-recall',
  });

  const response = await coreAgentService.processWebMessage({
    requestId: 'req_profile_update_then_recall_recall',
    message: 'What do you remember about me?',
    channel: 'web',
    channelUserId: 'profile-update-then-recall',
  });

  assert.equal(response.status, 'PROFILE_RECALL');
  assert.equal(state.getProfile().currentEmployer, 'ABC Construction Company');
  assert.match(response.reply, /ABC Construction Company/);
});

test('enabled active Supervisor flow runs end to end for a single-domain request', async () => {
  setActiveSupervisorFlags(true);
  const state = mockCoreDependencies();
  supervisorService.clearPlan('req_active_single');
  const calls = [];
  const originalExecuteAgent = supervisorService.executeAgent;

  supervisorService.executeAgent = async (task) => {
    calls.push(task.taskId);
    return {
      taskId: task.taskId,
      status: 'success',
      output: { message: 'Supervisor found employment guidance.' },
      factsLearned: ['employment fact'],
      suggestedProfileUpdates: [{ field: 'city', value: 'Internal City' }],
      followUpQuestions: [],
      warnings: [],
      completedAt: '2026-08-02T08:01:00.000Z',
    };
  };

  try {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_active_single',
      message: 'salary employer rights',
      channel: 'web',
      channelUserId: 'active-single',
    });

    assert.equal(response.reply.includes('Supervisor found employment guidance.'), true);
    assert.equal(response.reply.includes('Internal City'), false);
    assert.equal(response.status, 'SUPERVISOR_COMPLETED');
    assert.equal(calls.length, 1);
    assert.equal(state.getAiCalls(), 0);

    const storedPlan = supervisorService.getPlan('req_active_single');
    assert.equal(storedPlan.status, 'completed');
    assert.equal(storedPlan.tasks.length, 1);
    assert.equal(storedPlan.tasks[0].status, 'completed');
    assert.equal(storedPlan.tasks[0].result.output.message, 'Supervisor found employment guidance.');
  } finally {
    supervisorService.executeAgent = originalExecuteAgent;
  }
});

test('active Supervisor routes explicit exchange-rate questions to Finance reference-rate path', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  const originalGetExchangeRate = moneyService.getExchangeRate;
  const originalCompareTransfers = moneyService.compareTransfers;
  const rateCalls = [];
  let compareCalled = false;

  moneyService.getExchangeRate = async (sourceCurrency, targetCurrency) => {
    rateCalls.push({ sourceCurrency, targetCurrency });
    return {
      sourceCurrency,
      targetCurrency,
      exchangeRate: '10.9788',
      sourceName: 'Frankfurter reference exchange rate',
      providerUpdatedAt: '2026-09-20',
      retrievedAt: '2026-09-19T21:47:16.140Z',
      rateType: 'reference',
      status: 'Active',
    };
  };
  moneyService.compareTransfers = async () => {
    compareCalled = true;
    return [];
  };

  try {
    const cases = [
      ['req_exchange_rate_active_1', 'What is the current ILS to THB exchange rate?', 'en'],
      ['req_exchange_rate_active_2', 'How much is one Israeli shekel in Thai baht?', 'en'],
      ['req_exchange_rate_active_he_1', 'מה שער ההמרה הנוכחי משקל לבאט תאילנדי?', 'he'],
      ['req_exchange_rate_active_he_2', 'מה שער ההמרה משקל לבאט?', 'he'],
      ['req_exchange_rate_active_he_3', 'מה שער החליפין בין שקל לבאט תאילנדי?', 'he'],
    ];

    for (const [requestId, message, expectedLanguage] of cases) {
      supervisorService.clearPlan(requestId);
      const response = await coreAgentService.processWebMessage({
        requestId,
        message,
        channel: 'web',
        channelUserId: requestId,
      });

      assert.equal(response.category, 'Supervisor');
      assert.equal(response.status, 'SUPERVISOR_COMPLETED');
      assert.doesNotMatch(response.reply, /Which area do you need help with/i);
      assert.doesNotMatch(response.reply, /Tell me which detail you want to check next/i);
      assert.match(response.reply, /Frankfurter reference exchange rate/i);
      assert.match(response.reply, /10\.9788/);
      assert.match(response.reply, /2026-09-20/);
      assert.match(response.reply, /2026-09-19T21:47:16\.140Z/);

      if (expectedLanguage === 'he') {
        assert.match(response.reply, /שער ההמרה הייחוסי/);
        assert.match(response.reply, /לא שער לקוח של ספק/);
        assert.match(response.reply, /לא הצעת העברה חיה/);
        assert.match(response.reply, /זה אינו ייעוץ פיננסי/);
        assert.doesNotMatch(response.reply, /This is a reference market rate/i);
      } else {
        assert.match(response.reply, /reference exchange rate/i);
        assert.match(response.reply, /not a provider customer rate/i);
        assert.equal((response.reply.match(/not financial advice/g) || []).length, 1);
      }
    }

    assert.deepEqual(rateCalls, [
      { sourceCurrency: 'ILS', targetCurrency: 'THB' },
      { sourceCurrency: 'ILS', targetCurrency: 'THB' },
      { sourceCurrency: 'ILS', targetCurrency: 'THB' },
      { sourceCurrency: 'ILS', targetCurrency: 'THB' },
      { sourceCurrency: 'ILS', targetCurrency: 'THB' },
    ]);
    assert.equal(compareCalled, false);
  } finally {
    moneyService.getExchangeRate = originalGetExchangeRate;
    moneyService.compareTransfers = originalCompareTransfers;
  }
});

test('active Supervisor ignores stale domain clarification when browser sends explicit exchange-rate question', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  supervisorService.clearPlan('req_exchange_rate_stale_start');
  supervisorService.clearPlan('req_exchange_rate_stale_question');
  const originalGetExchangeRate = moneyService.getExchangeRate;
  const originalCompareTransfers = moneyService.compareTransfers;
  const rateCalls = [];
  let compareCalled = false;

  moneyService.getExchangeRate = async (sourceCurrency, targetCurrency) => {
    rateCalls.push({ sourceCurrency, targetCurrency });
    return {
      sourceCurrency,
      targetCurrency,
      exchangeRate: '11.0156',
      sourceName: 'Frankfurter reference exchange rate',
      providerUpdatedAt: '2026-09-22',
      retrievedAt: '2026-09-22T16:42:41.697Z',
      rateType: 'reference',
      status: 'Active',
    };
  };
  moneyService.compareTransfers = async () => {
    compareCalled = true;
    return [];
  };

  try {
    const first = await coreAgentService.processWebMessage({
      requestId: 'req_exchange_rate_stale_start',
      message: 'I need help',
      channel: 'web',
      channelUserId: 'exchange-rate-stale-browser-user',
    });

    assert.equal(first.status, 'SUPERVISOR_NEEDS_CLARIFICATION');
    assert.match(first.reply, /Which area do you need help with/i);

    const second = await coreAgentService.processWebMessage({
      requestId: 'req_exchange_rate_stale_question',
      message: 'מה שער ההמרה הנוכחי משקל לבאט תאילנדי?',
      channel: 'web',
      channelUserId: 'exchange-rate-stale-browser-user',
    });

    assert.equal(second.category, 'Supervisor');
    assert.equal(second.status, 'SUPERVISOR_COMPLETED');
    assert.doesNotMatch(second.reply, /Which area do you need help with/i);
    assert.match(second.reply, /שער ההמרה הייחוסי הוא 1 ILS = 11\.0156 THB/i);
    assert.match(second.reply, /Frankfurter reference exchange rate/i);
    assert.match(second.reply, /לא שער לקוח של ספק/i);
    assert.deepEqual(rateCalls, [{ sourceCurrency: 'ILS', targetCurrency: 'THB' }]);
    assert.equal(compareCalled, false);
    assert.equal(supervisorService.getPlan('req_exchange_rate_stale_start'), null);
  } finally {
    moneyService.getExchangeRate = originalGetExchangeRate;
    moneyService.compareTransfers = originalCompareTransfers;
  }
});

test('active Supervisor still asks domain clarification for ambiguous money help', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  supervisorService.clearPlan('req_ambiguous_money_help');

  const response = await coreAgentService.processWebMessage({
    requestId: 'req_ambiguous_money_help',
    message: 'I need help with money',
    channel: 'web',
    channelUserId: 'ambiguous-money-help',
  });

  assert.equal(response.status, 'SUPERVISOR_NEEDS_CLARIFICATION');
  assert.match(response.reply, /Which area do you need help with/i);
  assert.match(response.reply, /Finance & Consumer/);
});

test('active Supervisor keeps salary questions in Employment after exchange-rate routing change', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  const tasks = [];
  const originalExecuteAgent = supervisorService.executeAgent;

  supervisorService.executeAgent = async (task) => {
    tasks.push(task);
    return {
      taskId: task.taskId,
      status: 'success',
      output: { message: 'Employment salary result.' },
      factsLearned: [],
      suggestedProfileUpdates: [],
      followUpQuestions: [],
      warnings: [],
      completedAt: '2026-08-02T08:01:00.000Z',
    };
  };

  try {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_salary_stays_employment',
      message: 'When should my salary be paid?',
      channel: 'web',
      channelUserId: 'salary-stays-employment',
    });

    assert.equal(response.status, 'SUPERVISOR_COMPLETED');
    assert.deepEqual(tasks.map((task) => task.domain), ['employment_salary']);
    assert.deepEqual(tasks.map((task) => task.capability), ['jobs.salary']);
  } finally {
    supervisorService.executeAgent = originalExecuteAgent;
  }
});

test('multi-domain request executes all pending tasks once in order', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  const calls = [];
  const originalExecuteAgent = supervisorService.executeAgent;

  supervisorService.executeAgent = async (task) => {
    calls.push({ taskId: task.taskId, domain: task.domain });
    return {
      taskId: task.taskId,
      status: 'success',
      output: { message: `Result ${calls.length}` },
      factsLearned: [],
      suggestedProfileUpdates: [],
      followUpQuestions: [],
      warnings: [],
      completedAt: '2026-08-02T08:01:00.000Z',
    };
  };

  try {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_active_multi',
      message: 'salary employer bank doctor',
      channel: 'telegram',
      channelUserId: 'active-multi',
    });

    assert.equal(response.reply.includes('employment_salary'), false);
    assert.deepEqual(calls.map((call) => call.domain), ['employment_salary', 'finance_consumer', 'health_life_community']);
    assert.deepEqual(calls.map((call) => call.taskId), [...new Set(calls.map((call) => call.taskId))]);
  } finally {
    supervisorService.executeAgent = originalExecuteAgent;
  }
});

test('unknown-domain active request returns clarification question without executing agents', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  supervisorService.clearPlan('req_active_unknown');
  let executed = false;
  const originalExecuteAgent = supervisorService.executeAgent;
  supervisorService.executeAgent = async () => {
    executed = true;
  };

  try {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_active_unknown',
      message: 'hello there',
      channel: 'whatsapp',
      channelUserId: 'active-unknown',
    });

    assert.equal(response.status, 'SUPERVISOR_NEEDS_CLARIFICATION');
    assert.equal(response.reply.includes('Employment & Salary'), true);
    assert.equal(response.reply.includes('Finance & Consumer'), true);
    assert.equal(response.reply.includes('Health, Life & Community'), true);
    assert.equal(executed, false);
    assert.equal(supervisorService.getPlan('req_active_unknown').status, 'waiting_for_user');
  } finally {
    supervisorService.executeAgent = originalExecuteAgent;
  }
});

test('active Supervisor clarification answer resumes the waiting plan and executes it', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  supervisorService.clearPlan('req_active_clarify_start');
  const calls = [];
  const originalExecuteAgent = supervisorService.executeAgent;

  supervisorService.executeAgent = async (task) => {
    calls.push(task);
    return {
      taskId: task.taskId,
      status: 'success',
      output: { message: `Continued with ${task.domain}.` },
      factsLearned: [],
      suggestedProfileUpdates: [],
      followUpQuestions: [],
      warnings: [],
      completedAt: '2026-08-04T08:01:00.000Z',
    };
  };

  try {
    const first = await coreAgentService.processWebMessage({
      requestId: 'req_active_clarify_start',
      message: 'I need help',
      channel: 'web',
      channelUserId: 'active-clarify-user',
    });

    assert.equal(first.status, 'SUPERVISOR_NEEDS_CLARIFICATION');
    assert.equal(supervisorService.getPlan('req_active_clarify_start').status, 'waiting_for_user');

    const second = await coreAgentService.processWebMessage({
      requestId: 'req_active_clarify_answer',
      message: 'Employment & Salary',
      channel: 'web',
      channelUserId: 'active-clarify-user',
    });

    assert.equal(second.status, 'SUPERVISOR_COMPLETED');
    assert.equal(second.reply.includes('Continued with'), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].requestId, 'req_active_clarify_start');
    assert.equal(calls[0].domain, 'employment_salary');

    const storedPlan = supervisorService.getPlan('req_active_clarify_start');
    assert.equal(storedPlan.status, 'completed');
    assert.equal(storedPlan.primaryDomain, 'employment_salary');
    assert.equal(storedPlan.requiresUserInput, false);
    assert.equal(storedPlan.tasks[0].result.output.message, 'Continued with employment_salary.');
  } finally {
    supervisorService.executeAgent = originalExecuteAgent;
  }
});

test('active Supervisor blocked salary-payment follow-up resumes original task with payment frequency', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  supervisorService.clearPlan('req_active_salary_frequency_start');

  const first = await coreAgentService.processWebMessage({
    requestId: 'req_active_salary_frequency_start',
    message: 'When should I receive my salary?',
    channel: 'web',
    channelUserId: 'active-salary-frequency-user',
  });

  assert.equal(first.status, 'SUPERVISOR_BLOCKED');
  assert.equal(
    first.reply,
    'If you are paid monthly, I can explain the monthly salary-payment rule. Are you paid monthly, hourly, daily, or another way?'
  );

  const waitingPlan = supervisorService.getPlan('req_active_salary_frequency_start');
  assert.equal(waitingPlan.status, 'waiting_for_user');
  assert.equal(waitingPlan.requiresUserInput, true);
  assert.deepEqual(waitingPlan.missingInformation, ['task_follow_up']);

  const second = await coreAgentService.processWebMessage({
    requestId: 'req_active_salary_frequency_answer',
    message: 'I am paid monthly.',
    channel: 'web',
    channelUserId: 'active-salary-frequency-user',
  });

  assert.equal(second.status, 'SUPERVISOR_COMPLETED');
  assert.match(second.reply, /Salary for a month is due at the end of that month/i);
  assert.match(second.reply, /ninth day after the payment date/i);
  assert.match(second.reply, /Wage Protection Law, 5718-1958/i);
  assert.doesNotMatch(second.reply, /employer has until the 9th to pay/i);

  const completedPlan = supervisorService.getPlan('req_active_salary_frequency_start');
  assert.equal(completedPlan.status, 'completed');
  assert.equal(completedPlan.requiresUserInput, false);
  assert.equal(completedPlan.tasks[0].input.question, 'When should I receive my salary?');
  assert.equal(completedPlan.tasks[0].input.paymentFrequency, 'I am paid monthly.');
});

test('active Supervisor response uses normal delivery path and translates at most once', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies(completeProfile({ preferredLanguage: 'he' }));
  const translationCalls = [];
  const originalTranslateText = translationService.translateText;
  const originalExecuteAgent = supervisorService.executeAgent;

  translationService.translateText = async (text, sourceLanguage, targetLanguage) => {
    translationCalls.push({ text, sourceLanguage, targetLanguage });
    return {
      translatedText: `translated:${text}`,
      sourceLanguage,
      targetLanguage,
      translated: true,
      fallbackUsed: false,
    };
  };
  supervisorService.executeAgent = async (task) => ({
    taskId: task.taskId,
    status: 'success',
    output: { message: 'One supervisor answer.' },
    factsLearned: [],
    suggestedProfileUpdates: [],
    followUpQuestions: [],
    warnings: [],
    completedAt: '2026-08-02T08:01:00.000Z',
  });

  try {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_active_translate',
      message: 'salary employer rights',
      channel: 'line',
      channelUserId: 'active-translate',
    });

    assert.equal(response.reply.startsWith('translated:'), true);
    assert.equal(translationCalls.length, 1);
    assert.equal(translationCalls[0].sourceLanguage, 'en');
    assert.equal(translationCalls[0].targetLanguage, 'he');
  } finally {
    translationService.translateText = originalTranslateText;
    supervisorService.executeAgent = originalExecuteAgent;
  }
});

test('active Supervisor failure falls back to existing Core Agent behavior without exposing metadata', async () => {
  setActiveSupervisorFlags(true);
  mockCoreDependencies();
  const originalBuildTaskSkeleton = supervisorService.buildTaskSkeleton;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  supervisorService.buildTaskSkeleton = () => {
    throw new Error('internal supervisor failure');
  };

  try {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_active_failure',
      message: 'salary employer rights',
      channel: 'web',
      channelUserId: 'active-failure',
    });

    assert.equal(response.reply, 'Workers should keep written records and ask for help if wages are unpaid.');
    assert.equal(JSON.stringify(response).includes('internal supervisor failure'), false);
    assert.match(warnings[0], /Supervisor integration warning/);
  } finally {
    supervisorService.buildTaskSkeleton = originalBuildTaskSkeleton;
    console.warn = originalWarn;
  }
});
