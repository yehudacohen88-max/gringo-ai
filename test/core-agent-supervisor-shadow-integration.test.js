const test = require('node:test');
const assert = require('node:assert/strict');

const chatController = require('../src/modules/chat/chat.controller');
const { coreAgentService } = require('../src/modules/core-agent');
const { crmAgentService } = require('../src/modules/crm-agent');
const { knowledgeAgentService } = require('../src/modules/knowledge-agent');
const { supervisorService } = require('../src/modules/agents');
const notificationService = require('../src/modules/notifications/notification.service');

const ORIGINAL_ENV = {
  MULTI_AGENT_ENABLED: process.env.MULTI_AGENT_ENABLED,
  SUPERVISOR_ENABLED: process.env.SUPERVISOR_ENABLED,
  AGENT_EXECUTION_ENABLED: process.env.AGENT_EXECUTION_ENABLED,
  ACTIVE_SUPERVISOR_DELIVERY_ENABLED: process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED,
  SUPERVISOR_SHADOW_ENABLED: process.env.SUPERVISOR_SHADOW_ENABLED,
};

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_shadow',
    fullName: 'David Levi',
    country: 'Thailand',
    preferredLanguage: 'en',
    detectedLanguage: '',
    languageSource: '',
    language: '',
    workSector: 'Construction',
    profession: 'Ironworker',
    city: 'Tel Aviv',
    currentEmployer: 'ABC Construction Company',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'Yes',
    ...overrides,
  };
}

function setShadowFlags(enabled = true) {
  process.env.MULTI_AGENT_ENABLED = enabled ? 'true' : 'false';
  process.env.SUPERVISOR_ENABLED = enabled ? 'true' : 'false';
  process.env.AGENT_EXECUTION_ENABLED = enabled ? 'true' : 'false';
  process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED = 'false';
  process.env.SUPERVISOR_SHADOW_ENABLED = enabled ? 'true' : 'false';
}

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function mockCoreDependencies(profile = completeProfile()) {
  const savedConversations = [];
  const profileUpdates = [];
  const memoryExtractions = [];
  let currentProfile = { ...profile };

  crmAgentService.findOrCreateUser = async (context = {}) => ({
    userId: currentProfile.userId,
    channel: context.channel || 'web',
    channelUserId: context.channelUserId || 'shadow-user',
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
  crmAgentService.extractAndUpdateMemory = async (userId, message) => {
    memoryExtractions.push({ userId, message });
    return {
      signals: {
        interests: [],
      },
    };
  };

  knowledgeAgentService.answerQuestion = async () => ({
    status: 'FOUND',
    category: 'Rights',
    answer: 'Workers should keep written records and ask for help if wages are unpaid.',
    relevantKnowledge: [],
  });

  return {
    getProfile: () => currentProfile,
    savedConversations,
    profileUpdates,
    memoryExtractions,
  };
}

async function withSupervisorSpy(methodName, replacement, callback) {
  const original = supervisorService[methodName];
  supervisorService[methodName] = replacement(original.bind(supervisorService));

  try {
    return await callback();
  } finally {
    supervisorService[methodName] = original;
  }
}

test.afterEach(() => {
  restoreEnv();
});

test('normal single-intent Web Chat message preserves live response and runs shadow pipeline', async () => {
  setShadowFlags(true);
  mockCoreDependencies();
  const messageContext = {
    requestId: 'req_shadow_single',
    message: 'salary rights',
    channel: 'web',
    channelUserId: 'shadow-single',
  };
  let composeCalls = 0;

  await withSupervisorSpy('composeResponse', (original) => (synthesis) => {
    composeCalls += 1;
    return original(synthesis);
  }, async () => {
    const response = await coreAgentService.processWebMessage(messageContext);

    assert.equal(response.reply, 'Workers should keep written records and ask for help if wages are unpaid.');
    assert.equal(response.category, 'Rights');
    assert.equal(composeCalls, 1);
    assert.equal(messageContext.supervisorShadow.mode, 'shadow');
    assert.equal(messageContext.supervisorShadow.tasks.length, 1);
    assert.equal(messageContext.supervisorShadow.results.length, 1);
    assert.equal(typeof messageContext.supervisorShadow.composedResponse, 'string');
  });
});

test('multi-intent Web Chat message runs ordered shadow task pipeline and composes one shadow response', async () => {
  setShadowFlags(true);
  mockCoreDependencies();
  const messageContext = {
    requestId: 'req_shadow_multi',
    message: 'I have a salary problem and I also want to know how to send money home.',
    channel: 'web',
    channelUserId: 'shadow-multi',
  };
  const calls = [];

  await withSupervisorSpy('executeTasksSequentially', (original) => async (tasks, context) => {
    calls.push({
      taskIds: tasks.map((task) => task.taskId),
      domains: tasks.map((task) => task.domain),
      shadow: context.shadow,
    });
    return original(tasks, context);
  }, async () => {
    const response = await coreAgentService.processWebMessage(messageContext);

    assert.equal(response.reply, 'How much do you want to send?');
    assert.equal(messageContext.supervisorShadow.detectedIntents.isMultiIntent, true);
    assert.equal(messageContext.supervisorShadow.tasks.length, 2);
    assert.deepEqual(messageContext.supervisorShadow.tasks.map((task) => task.domain), [
      'employment_salary',
      'finance_consumer',
    ]);
    assert.deepEqual(messageContext.supervisorShadow.results.map((result) => result.taskId), calls[0].taskIds);
    assert.equal(messageContext.supervisorShadow.synthesis.items.length, 2);
    assert.equal(typeof messageContext.supervisorShadow.composedResponse, 'string');
    assert.equal(calls[0].shadow, true);
  });
});

test('shadow output does not replace live response', async () => {
  setShadowFlags(true);
  mockCoreDependencies();
  const messageContext = {
    requestId: 'req_shadow_not_live',
    message: 'salary rights and send money home',
    channel: 'web',
    channelUserId: 'shadow-not-live',
  };
  const response = await coreAgentService.processWebMessage(messageContext);

  assert.equal(response.reply, 'How much do you want to send?');
  assert.notEqual(response.reply, messageContext.supervisorShadow.composedResponse);
  assert.equal(Object.hasOwn(response, 'supervisorShadow'), false);
});

test('shadow failure preserves live response and hides internal error details', async () => {
  setShadowFlags(true);
  mockCoreDependencies();
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    await withSupervisorSpy('createTasksFromIntents', () => () => {
      throw new Error('internal shadow failure details');
    }, async () => {
      const messageContext = {
        requestId: 'req_shadow_failure',
        message: 'salary rights',
        channel: 'web',
        channelUserId: 'shadow-failure',
      };
      const response = await coreAgentService.processWebMessage(messageContext);

      assert.equal(response.reply, 'Workers should keep written records and ask for help if wages are unpaid.');
      assert.deepEqual(messageContext.supervisorShadow, {
        mode: 'shadow',
        failed: true,
        error: 'shadow_pipeline_failed',
      });
      assert.equal(JSON.stringify(response).includes('internal shadow failure details'), false);
      assert.match(warnings.join('\n'), /Supervisor integration warning/);
    });
  } finally {
    console.warn = originalWarn;
  }
});

test('profile-memory recall remains unchanged', async () => {
  setShadowFlags(true);
  const state = mockCoreDependencies(completeProfile({
    fullName: 'David Levi',
    currentEmployer: 'ABC Construction Company',
  }));
  const messageContext = {
    requestId: 'req_shadow_profile_recall',
    message: 'Where do I work?',
    channel: 'web',
    channelUserId: 'shadow-profile-recall',
  };
  const response = await coreAgentService.processWebMessage(messageContext);

  assert.equal(response.category, 'Profile');
  assert.equal(response.status, 'PROFILE_RECALL');
  assert.match(response.reply, /ABC Construction Company/);
  assert.equal(messageContext.supervisorShadow, undefined);
  assert.equal(state.savedConversations.length, 1);
});

test('profile-memory update remains unchanged without duplicate profile writes', async () => {
  setShadowFlags(true);
  const state = mockCoreDependencies(completeProfile({ currentEmployer: '' }));
  const messageContext = {
    requestId: 'req_shadow_profile_update',
    message: 'I am now working for ABC Construction Company.',
    channel: 'web',
    channelUserId: 'shadow-profile-update',
  };
  const response = await coreAgentService.processWebMessage(messageContext);

  assert.equal(response.category, 'Profile');
  assert.equal(response.status, 'PROFILE_UPDATED');
  assert.equal(state.getProfile().currentEmployer, 'ABC Construction Company');
  assert.equal(state.profileUpdates.filter((updates) => updates.currentEmployer === 'ABC Construction Company').length, 1);
  assert.equal(messageContext.supervisorShadow, undefined);
});

test('shadow pipeline does not duplicate CRM or Google Sheets write calls', async () => {
  setShadowFlags(false);
  const baseline = mockCoreDependencies();
  await coreAgentService.processWebMessage({
    requestId: 'req_shadow_no_duplicate_crm_baseline',
    message: 'salary rights',
    channel: 'web',
    channelUserId: 'shadow-no-duplicate-crm-baseline',
  });

  setShadowFlags(true);
  const state = mockCoreDependencies();
  const messageContext = {
    requestId: 'req_shadow_no_duplicate_crm',
    message: 'salary rights',
    channel: 'web',
    channelUserId: 'shadow-no-duplicate-crm',
  };

  await coreAgentService.processWebMessage(messageContext);

  assert.equal(state.savedConversations.length, baseline.savedConversations.length);
  assert.equal(state.memoryExtractions.length, baseline.memoryExtractions.length);
  assert.equal(state.profileUpdates.length, baseline.profileUpdates.length);
  assert.equal(messageContext.supervisorShadow.results.length, 1);
});

test('shadow pipeline does not create duplicate notifications', async () => {
  setShadowFlags(true);
  mockCoreDependencies();
  const originalCreateNotification = notificationService.createNotification;
  let notificationCreates = 0;
  notificationService.createNotification = async (...args) => {
    notificationCreates += 1;
    return originalCreateNotification(...args);
  };

  try {
    await coreAgentService.processWebMessage({
      requestId: 'req_shadow_no_notification',
      message: 'salary rights and send money home',
      channel: 'web',
      channelUserId: 'shadow-no-notification',
    });

    assert.equal(notificationCreates, 0);
  } finally {
    notificationService.createNotification = originalCreateNotification;
  }
});

test('public API response schema is unchanged', async () => {
  const originalProcessWebMessage = coreAgentService.processWebMessage;
  coreAgentService.processWebMessage = async () => ({
    reply: 'Hello.',
    category: 'Test',
    status: 'OK',
    onboarding: undefined,
    supervisorShadow: {
      composedResponse: 'Shadow should not be public.',
    },
  });
  const req = {
    body: {
      message: 'hello',
      channel: 'web',
      channelUserId: 'schema-user',
    },
  };
  const payloads = [];
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      payloads.push(payload);
      return payload;
    },
  };

  try {
    await chatController.sendMessage(req, res, (error) => {
      throw error;
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(payloads[0]), ['reply', 'category', 'status', 'onboarding']);
    assert.equal(JSON.stringify(payloads[0]).includes('supervisorShadow'), false);
  } finally {
    coreAgentService.processWebMessage = originalProcessWebMessage;
  }
});

test('single-intent backward compatibility and existing flags remain compatible', async () => {
  setShadowFlags(false);
  mockCoreDependencies();
  const messageContext = {
    requestId: 'req_shadow_disabled',
    message: 'salary rights',
    channel: 'web',
    channelUserId: 'shadow-disabled',
  };
  const response = await coreAgentService.processWebMessage(messageContext);

  assert.equal(response.reply, 'Workers should keep written records and ask for help if wages are unpaid.');
  assert.equal(messageContext.supervisorShadow, undefined);
});

test('shadow output can be inspected in tests', async () => {
  setShadowFlags(true);
  mockCoreDependencies();
  const messageContext = {
    requestId: 'req_shadow_inspectable',
    message: 'salary rights and send money home',
    channel: 'web',
    channelUserId: 'shadow-inspectable',
  };

  await coreAgentService.processWebMessage(messageContext);

  assert.equal(messageContext.supervisorShadow.requestId, 'req_shadow_inspectable');
  assert.equal(Array.isArray(messageContext.supervisorShadow.detectedIntents.intents), true);
  assert.equal(Array.isArray(messageContext.supervisorShadow.tasks), true);
  assert.equal(Array.isArray(messageContext.supervisorShadow.results), true);
  assert.equal(messageContext.supervisorShadow.synthesis.items.length, messageContext.supervisorShadow.results.length);
  assert.equal(typeof messageContext.supervisorShadow.composedResponse, 'string');
});
