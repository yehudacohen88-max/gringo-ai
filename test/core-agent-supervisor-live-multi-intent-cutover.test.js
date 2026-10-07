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
  SUPERVISOR_MULTI_INTENT_LIVE_ENABLED: process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED,
  SUPERVISOR_SHADOW_ENABLED: process.env.SUPERVISOR_SHADOW_ENABLED,
};

function completeProfile(overrides = {}) {
  return {
    userId: 'usr_live_multi',
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
    lastMoneyTransferAmount: '100',
    ...overrides,
  };
}

function setLiveMultiIntentFlags(enabled = true) {
  process.env.MULTI_AGENT_ENABLED = 'true';
  process.env.SUPERVISOR_ENABLED = 'true';
  process.env.AGENT_EXECUTION_ENABLED = 'true';
  process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED = 'true';
  process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED = enabled ? 'true' : 'false';
  process.env.SUPERVISOR_SHADOW_ENABLED = 'false';
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
    channelUserId: context.channelUserId || 'live-multi-user',
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

test('missing salary and money transfer multi-intent preserves Employment and Finance results', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const observed = {
    detectedIntents: null,
    tasks: null,
    executors: [],
    results: null,
    synthesis: null,
  };

  await withSupervisorSpy('detectIntents', (original) => (requestContext) => {
    const detected = original(requestContext);
    observed.detectedIntents = detected;
    return detected;
  }, async () => withSupervisorSpy('createTasksFromIntents', (original) => (requestContext, detectedIntents) => {
    const tasks = original(requestContext, detectedIntents);
    observed.tasks = tasks;
    return tasks;
  }, async () => withSupervisorSpy('executeTask', (original) => async (task, executor, context) => {
    observed.executors.push({
      domain: task.domain,
      intent: task.intent,
      question: task.input.question,
      sourceMessage: task.metadata.sourceMessage,
      executorId: executor.executorId,
    });
    return original(task, executor, context);
  }, async () => withSupervisorSpy('synthesizeResults', (original) => (results) => {
    observed.results = results;
    const synthesis = original(results);
    observed.synthesis = synthesis;
    return synthesis;
  }, async () => {
    const message = "I didn't receive my August salary, I am paid monthly, and I want to send 2,000 ILS to Thailand.";
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_live_missing_salary_money',
      message,
      channel: 'web',
      channelUserId: 'live-missing-salary-money-user',
    });

    assert.deepEqual(observed.detectedIntents.intents.map((intent) => intent.domain), [
      'employment_salary',
      'finance_consumer',
    ]);
    assert.equal(observed.tasks.length, 2);
    assert.deepEqual(observed.tasks.map((task) => task.domain), ['employment_salary', 'finance_consumer']);
    assert.match(observed.tasks[0].input.question, /didnt receive my august salary/i);
    assert.doesNotMatch(observed.tasks[0].input.question, /paid monthly/i);
    assert.equal(observed.tasks[0].metadata.sourceMessage, message);
    assert.match(observed.tasks[1].input.question, /2,000 ILS.*Thailand/i);
    assert.deepEqual(observed.executors.map((item) => item.executorId), [
      'employment_salary_agent',
      'finance_consumer_agent',
    ]);
    assert.equal(observed.executors.filter((item) => item.executorId === 'employment_salary_agent').length, 1);
    assert.equal(observed.executors.filter((item) => item.executorId === 'finance_consumer_agent').length, 1);
    assert.equal(observed.results.length, 2);
    assert.equal(observed.results[0].output.employmentIntent, 'missing_salary');
    assert.equal(observed.results[0].output.knownPaymentFrequency, undefined);
    assert.equal(observed.synthesis.items.length, 2);
    assert.match(response.reply, /For monthly pay in Israel/i);
    assert.match(response.reply, /Salary for a month is due at the end of that month/i);
    assert.match(response.reply, /Delayed-salary timing/i);
    assert.doesNotMatch(response.reply, /Are you paid monthly, hourly, daily, or another way\?/i);
    assert.match(response.reply, /not currently have enough real reported observations for ILS → THB/i);
    assert.equal(response.reply.includes('employment_salary_agent'), false);
    assert.equal(response.reply.includes('finance_consumer_agent'), false);
    assert.equal(response.reply.indexOf('For monthly pay in Israel') < response.reply.indexOf('not currently have enough real reported observations'), true);
  }))));
});

test('missing salary hourly multi-intent does not apply monthly rule and preserves Finance result', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();

  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_missing_salary_money_hourly',
    message: "I didn't receive my August salary, I am paid hourly, and I want to send 2,000 ILS to Thailand.",
    channel: 'web',
    channelUserId: 'live-missing-salary-money-hourly-user',
  });

  assert.equal(response.status, 'SUPERVISOR_MULTI_INTENT_PARTIAL');
  assert.match(response.reply, /I only have verified missing-salary knowledge for monthly-paid workers right now/i);
  assert.doesNotMatch(response.reply, /Salary for a month is due at the end of that month/i);
  assert.match(response.reply, /not currently have enough real reported observations for ILS → THB/i);
  assert.equal(response.reply.indexOf('monthly-paid workers') < response.reply.indexOf('not currently have enough real reported observations'), true);
});

test('salary calculation and money transfer multi-intent preserves salary facts and Finance result', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const observed = {
    detectedIntents: null,
    tasks: null,
    executors: [],
    results: null,
  };
  const message = 'I earn 40 ILS per hour, worked 100 regular hours, and want to send 2,000 ILS to Thailand.';

  await withSupervisorSpy('detectIntents', (original) => (requestContext) => {
    const detected = original(requestContext);
    observed.detectedIntents = detected;
    return detected;
  }, async () => withSupervisorSpy('createTasksFromIntents', (original) => (requestContext, detectedIntents) => {
    const tasks = original(requestContext, detectedIntents);
    observed.tasks = tasks;
    return tasks;
  }, async () => withSupervisorSpy('executeTask', (original) => async (task, executor, context) => {
    observed.executors.push({
      domain: task.domain,
      question: task.input.question,
      sourceMessage: task.metadata.sourceMessage,
      executorId: executor.executorId,
    });
    return original(task, executor, context);
  }, async () => withSupervisorSpy('synthesizeResults', (original) => (results) => {
    observed.results = results;
    return original(results);
  }, async () => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_live_salary_calculation_money',
      message,
      channel: 'web',
      channelUserId: 'live-salary-calculation-money-user',
    });

    assert.deepEqual(observed.detectedIntents.intents.map((intent) => intent.domain), [
      'employment_salary',
      'finance_consumer',
    ]);
    assert.equal(observed.tasks.length, 2);
    assert.deepEqual(observed.tasks.map((task) => task.domain), ['employment_salary', 'finance_consumer']);
    assert.equal(observed.tasks[0].metadata.sourceMessage, message);
    assert.doesNotMatch(observed.tasks[0].input.question, /send 2,000 ILS to Thailand/i);
    assert.match(observed.tasks[1].input.question, /send 2,000 ILS to Thailand/i);
    assert.deepEqual(observed.executors.map((item) => item.executorId), [
      'employment_salary_agent',
      'finance_consumer_agent',
    ]);
    assert.equal(observed.executors.filter((item) => item.executorId === 'employment_salary_agent').length, 1);
    assert.equal(observed.executors.filter((item) => item.executorId === 'finance_consumer_agent').length, 1);
    assert.equal(observed.results.length, 2);
    assert.equal(observed.results[0].output.employmentIntent, 'salary_amount_or_calculation');
    assert.equal(observed.results[0].output.knownFacts.salaryRate, 40);
    assert.equal(observed.results[0].output.knownFacts.regularHours, 100);
    assert.equal(observed.results[0].output.calculation.basicGrossPay, 4000);
    assert.match(response.reply, /basic gross pay for those regular hours is 4,000 ILS/i);
    assert.doesNotMatch(response.reply, /7200|7,200|overtime calculation|tax calculation|deduction calculation/i);
    assert.match(response.reply, /not currently have enough real reported observations for ILS → THB/i);
    assert.equal(response.reply.indexOf('basic gross pay') < response.reply.indexOf('not currently have enough real reported observations'), true);
  }))));
});

test('regression: cross-domain salary and money message returns both results once in order', async () => {
  setLiveMultiIntentFlags(true);
  const state = mockCoreDependencies(completeProfile({ lastMoneyTransferAmount: '' }));
  const message = 'When does my employer have to pay my salary in Israel, and how can I send money to Thailand?';
  const observed = {
    detectedIntents: null,
    tasks: null,
    executors: [],
    results: null,
    synthesis: null,
    composedResponse: '',
  };

  await withSupervisorSpy('detectIntents', (original) => (requestContext) => {
    const detected = original(requestContext);
    observed.detectedIntents = detected;
    return detected;
  }, async () => withSupervisorSpy('createTasksFromIntents', (original) => (requestContext, detectedIntents) => {
    const tasks = original(requestContext, detectedIntents);
    observed.tasks = tasks;
    return tasks;
  }, async () => withSupervisorSpy('executeTask', (original) => async (task, executor, context) => {
    observed.executors.push({
      taskId: task.taskId,
      domain: task.domain,
      intent: task.intent,
      question: task.input.question,
      executorType: executor.executorType,
      executorId: executor.executorId,
    });
    return original(task, executor, context);
  }, async () => withSupervisorSpy('synthesizeResults', (original) => (results) => {
    observed.results = results;
    const synthesis = original(results);
    observed.synthesis = synthesis;
    return synthesis;
  }, async () => withSupervisorSpy('composeResponse', (original) => (synthesis) => {
    observed.composedResponse = original(synthesis);
    return observed.composedResponse;
  }, async () => {
    const response = await coreAgentService.processWebMessage({
      requestId: 'req_live_multi_cross_domain_regression',
      message,
      channel: 'web',
      channelUserId: 'live-multi-cross-domain-regression',
    });

    assert.deepEqual(observed.detectedIntents.intents.map((intent) => [intent.domain, intent.intent]), [
      ['employment_salary', 'salary_question'],
      ['finance_consumer', 'money_transfer'],
    ]);
    assert.equal(observed.tasks.length, 2);
    assert.deepEqual(observed.tasks.map((task) => [task.domain, task.intent]), [
      ['employment_salary', 'salary_question'],
      ['finance_consumer', 'money_transfer'],
    ]);
    assert.match(observed.tasks[0].input.question, /employer.*pay.*salary/i);
    assert.doesNotMatch(observed.tasks[0].input.question, /send money/i);
    assert.match(observed.tasks[1].input.question, /send money.*thailand/i);
    assert.deepEqual(observed.executors.map((item) => item.domain), ['employment_salary', 'finance_consumer']);
    assert.equal(observed.executors.filter((item) => item.executorId === 'employment_salary_agent').length, 1);
    assert.equal(observed.executors.filter((item) => item.executorId === 'finance_consumer_agent').length, 1);
    assert.equal(observed.results.length, 2);
    assert.deepEqual(observed.results.map((result) => result.domain), ['employment_salary', 'finance_consumer']);
    assert.deepEqual(observed.results.map((result) => result.status), ['blocked', 'blocked']);
    assert.equal(observed.synthesis.items.length, 2);
    assert.deepEqual(observed.synthesis.items.map((result) => result.taskId), observed.results.map((result) => result.taskId));
    assert.equal(response.reply, observed.composedResponse);

    const employmentIndex = response.reply.indexOf('If you are paid monthly');
    const financeIndex = response.reply.indexOf('How much money do you want to compare for transfer?');
    assert.equal(employmentIndex >= 0, true);
    assert.equal(financeIndex > employmentIndex, true);
    assert.equal(state.savedConversations.length, 1);
    assert.equal(state.savedConversations[0].answer, response.reply);
    assert.equal(state.memoryExtractions.length, 1);
    assert.equal(state.profileUpdates.length <= 1, true);
  })))));
});

test('regression: three-domain salary money and clinic message preserves all live results in order', async () => {
  setLiveMultiIntentFlags(true);
  const state = mockCoreDependencies(completeProfile({ lastMoneyTransferAmount: '' }));
  const message = 'When should I receive my salary, how can I send 2,000 ILS to Thailand, and how can I find a clinic near me?';
  const observed = {
    detectedIntents: null,
    tasks: null,
    executors: [],
    results: null,
    synthesis: null,
    composedResponse: '',
  };
  const originalCreateNotification = notificationService.createNotification;
  let notificationCreates = 0;
  notificationService.createNotification = async (...args) => {
    notificationCreates += 1;
    return originalCreateNotification(...args);
  };

  try {
    await withSupervisorSpy('detectIntents', (original) => (requestContext) => {
      const detected = original(requestContext);
      observed.detectedIntents = detected;
      return detected;
    }, async () => withSupervisorSpy('createTasksFromIntents', (original) => (requestContext, detectedIntents) => {
      const tasks = original(requestContext, detectedIntents);
      observed.tasks = tasks;
      return tasks;
    }, async () => withSupervisorSpy('executeTask', (original) => async (task, executor, context) => {
      observed.executors.push({
        taskId: task.taskId,
        domain: task.domain,
        intent: task.intent,
        question: task.input.question,
        amount: task.input.amount,
        sourceCurrency: task.input.sourceCurrency,
        targetCurrency: task.input.targetCurrency,
        executorId: executor.executorId,
      });
      return original(task, executor, context);
    }, async () => withSupervisorSpy('synthesizeResults', (original) => (results) => {
      observed.results = results;
      const synthesis = original(results);
      observed.synthesis = synthesis;
      return synthesis;
    }, async () => withSupervisorSpy('composeResponse', (original) => (synthesis) => {
      observed.composedResponse = original(synthesis);
      return observed.composedResponse;
    }, async () => {
      const response = await coreAgentService.processWebMessage({
        requestId: 'req_live_multi_three_domain_regression',
        message,
        channel: 'web',
        channelUserId: 'live-multi-three-domain-regression',
      });

      assert.deepEqual(observed.detectedIntents.intents.map((intent) => [intent.domain, intent.intent]), [
        ['employment_salary', 'salary_question'],
        ['finance_consumer', 'money_transfer'],
        ['health_life_community', 'health_request'],
      ]);
      assert.equal(observed.tasks.length, 3);
      assert.deepEqual(observed.tasks.map((task) => [task.domain, task.intent]), [
        ['employment_salary', 'salary_question'],
        ['finance_consumer', 'money_transfer'],
        ['health_life_community', 'health_request'],
      ]);
      assert.match(observed.tasks[0].input.question, /receive my salary/i);
      assert.doesNotMatch(observed.tasks[0].input.question, /send 2,000/i);
      assert.match(observed.tasks[1].input.question, /send 2,000 ils to thailand/i);
      assert.equal(observed.tasks[1].input.amount, 2000);
      assert.equal(observed.tasks[1].input.sourceCurrency, 'ILS');
      assert.equal(observed.tasks[1].input.targetCurrency, 'THB');
      assert.match(observed.tasks[2].input.question, /clinic near me/i);
      assert.deepEqual(observed.executors.map((item) => item.domain), [
        'employment_salary',
        'finance_consumer',
        'health_life_community',
      ]);
      assert.equal(observed.executors.filter((item) => item.executorId === 'employment_salary_agent').length, 1);
      assert.equal(observed.executors.filter((item) => item.executorId === 'finance_consumer_agent').length, 1);
      assert.equal(observed.executors.filter((item) => item.executorId === 'health_life_community_agent').length, 1);
      assert.equal(observed.results.length, 3);
      assert.deepEqual(observed.results.map((result) => result.domain), [
        'employment_salary',
        'finance_consumer',
        'health_life_community',
      ]);
      assert.equal(observed.synthesis.items.length, 3);
      assert.deepEqual(observed.synthesis.items.map((result) => result.taskId), observed.results.map((result) => result.taskId));
      assert.equal(response.reply, observed.composedResponse);

      const employmentIndex = response.reply.indexOf('If you are paid monthly');
      const financeIndex = response.reply.indexOf('not currently have enough real reported observations');
      const healthIndex = response.reply.indexOf('general information only');
      assert.equal(employmentIndex >= 0, true);
      assert.equal(financeIndex > employmentIndex, true);
      assert.equal(healthIndex > financeIndex, true);
      assert.equal(state.savedConversations.length, 1);
      assert.equal(state.savedConversations[0].answer, response.reply);
      assert.equal(state.memoryExtractions.length, 1);
      assert.equal(state.profileUpdates.length <= 1, true);
      assert.equal(notificationCreates, 0);
    })))));
  } finally {
    notificationService.createNotification = originalCreateNotification;
  }
});

test('two-intent live Web Chat message delivers new composed pipeline response', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_two',
    message: 'How much salary should I receive and how can I send money to Thailand?',
    channel: 'web',
    channelUserId: 'live-multi-two',
  });

  assert.equal(response.category, 'Supervisor');
  assert.equal(response.status, 'SUPERVISOR_MULTI_INTENT_PARTIAL');
  assert.match(response.reply, /need your pay rate and how much you worked/i);
  assert.match(response.reply, /not currently have enough real reported observations/i);
});

test('three-intent live Web Chat message represents all results in order', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_three',
    message: 'How much salary should I receive? How can I send money to Thailand? I need a doctor.',
    channel: 'web',
    channelUserId: 'live-multi-three',
  });

  const salaryIndex = response.reply.indexOf('need your pay rate and how much you worked');
  const moneyIndex = response.reply.indexOf('not currently have enough real reported observations');
  const healthIndex = response.reply.indexOf('general information only');

  assert.equal(response.category, 'Supervisor');
  assert.equal(response.status, 'SUPERVISOR_MULTI_INTENT_PARTIAL');
  assert.equal(salaryIndex >= 0, true);
  assert.equal(moneyIndex > salaryIndex, true);
  assert.equal(healthIndex > moneyIndex, true);
});

test('single-intent message preserves existing legacy behavior', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_single',
    message: 'When should my salary be paid?',
    channel: 'web',
    channelUserId: 'live-multi-single',
  });

  assert.notEqual(response.status, 'SUPERVISOR_MULTI_INTENT_SUCCESS');
  assert.match(response.reply, /paid monthly, hourly, daily, or another way/);
});

test('profile recall single-intent behavior is preserved', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_profile_recall',
    message: 'Where do I work?',
    channel: 'web',
    channelUserId: 'live-multi-profile-recall',
  });

  assert.equal(response.category, 'Profile');
  assert.equal(response.status, 'PROFILE_RECALL');
  assert.match(response.reply, /ABC Construction Company/);
});

test('profile update single-intent behavior is preserved', async () => {
  setLiveMultiIntentFlags(true);
  const state = mockCoreDependencies(completeProfile({ currentEmployer: '' }));
  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_profile_update',
    message: 'I work for ABC Construction Company.',
    channel: 'web',
    channelUserId: 'live-multi-profile-update',
  });

  assert.equal(response.category, 'Profile');
  assert.equal(response.status, 'PROFILE_UPDATED');
  assert.equal(state.getProfile().currentEmployer, 'ABC Construction Company');
  assert.equal(state.profileUpdates.filter((updates) => updates.currentEmployer === 'ABC Construction Company').length, 1);
});

test('profile update plus domain request handles update and domain result', async () => {
  setLiveMultiIntentFlags(true);
  const state = mockCoreDependencies(completeProfile({ city: 'Tel Aviv', preferredJobCity: '' }));
  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_profile_update_domain',
    message: 'I moved to Haifa. Can you find construction jobs near me?',
    channel: 'web',
    channelUserId: 'live-multi-profile-update-domain',
  });

  assert.equal(response.category, 'Supervisor');
  assert.equal(response.status, 'SUPERVISOR_MULTI_INTENT_SUCCESS');
  assert.equal(state.getProfile().city, 'Haifa');
  assert.match(response.reply, /I will remember/);
  assert.match(response.reply, /jobs/i);
});

test('multi-intent pipeline failure falls back to legacy response safely', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    await withSupervisorSpy('executeTasksSequentially', () => async () => {
      throw new Error('internal live multi failure');
    }, async () => {
      const response = await coreAgentService.processWebMessage({
        requestId: 'req_live_multi_failure',
        message: 'How much salary should I receive and how can I send money to Thailand?',
        channel: 'web',
        channelUserId: 'live-multi-failure',
      });

      assert.notEqual(response.status, 'SUPERVISOR_MULTI_INTENT_SUCCESS');
      assert.equal(JSON.stringify(response).includes('internal live multi failure'), false);
      assert.match(warnings.join('\n'), /Supervisor integration warning/);
    });
  } finally {
    console.warn = originalWarn;
  }
});

test('multi-intent cutover prevents duplicate Domain Agent execution', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  let sequentialCalls = 0;
  let legacyPlanCalls = 0;

  await withSupervisorSpy('executeTasksSequentially', (original) => async (...args) => {
    sequentialCalls += 1;
    return original(...args);
  }, async () => withSupervisorSpy('executePlanTasks', (original) => async (...args) => {
    legacyPlanCalls += 1;
    return original(...args);
  }, async () => {
    await coreAgentService.processWebMessage({
      requestId: 'req_live_multi_no_duplicate_execution',
      message: 'How much salary should I receive and how can I send money to Thailand?',
      channel: 'web',
      channelUserId: 'live-multi-no-duplicate-execution',
    });

    assert.equal(sequentialCalls, 1);
    assert.equal(legacyPlanCalls, 0);
  }));
});

test('multi-intent cutover prevents duplicate CRM and profile writes', async () => {
  setLiveMultiIntentFlags(true);
  const state = mockCoreDependencies(completeProfile({ city: 'Tel Aviv' }));

  await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_no_duplicate_crm',
    message: 'I moved to Haifa. Can you find construction jobs near me?',
    channel: 'web',
    channelUserId: 'live-multi-no-duplicate-crm',
  });

  assert.equal(state.savedConversations.length, 1);
  assert.equal(state.memoryExtractions.length, 1);
  assert.equal(state.profileUpdates.filter((updates) => updates.city === 'Haifa').length, 1);
});

test('multi-intent cutover does not create duplicate notifications', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const originalCreateNotification = notificationService.createNotification;
  let notificationCreates = 0;
  notificationService.createNotification = async (...args) => {
    notificationCreates += 1;
    return originalCreateNotification(...args);
  };

  try {
    await coreAgentService.processWebMessage({
      requestId: 'req_live_multi_no_duplicate_notification',
      message: 'How much salary should I receive and how can I send money to Thailand?',
      channel: 'web',
      channelUserId: 'live-multi-no-duplicate-notification',
    });

    assert.equal(notificationCreates, 0);
  } finally {
    notificationService.createNotification = originalCreateNotification;
  }
});

test('ConversationHistory receives the final delivered multi-intent response', async () => {
  setLiveMultiIntentFlags(true);
  const state = mockCoreDependencies();
  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_conversation_history',
    message: 'How much salary should I receive and how can I send money to Thailand?',
    channel: 'web',
    channelUserId: 'live-multi-conversation-history',
  });

  assert.equal(state.savedConversations.length, 1);
  assert.equal(state.savedConversations[0].question, 'How much salary should I receive and how can I send money to Thailand?');
  assert.equal(state.savedConversations[0].answer, response.reply);
  assert.equal(state.savedConversations[0].status, response.status);
});

test('public API response schema remains unchanged', async () => {
  const originalProcessWebMessage = coreAgentService.processWebMessage;
  coreAgentService.processWebMessage = async () => ({
    reply: 'Combined answer.',
    category: 'Supervisor',
    status: 'SUPERVISOR_MULTI_INTENT_SUCCESS',
    multiIntent: {
      handled: true,
    },
  });
  const req = {
    body: {
      message: 'salary and money',
      channel: 'web',
      channelUserId: 'live-multi-schema',
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
    assert.equal(JSON.stringify(payloads[0]).includes('multiIntent'), false);
  } finally {
    coreAgentService.processWebMessage = originalProcessWebMessage;
  }
});

test('multi-intent live response does not expose internal metadata', async () => {
  setLiveMultiIntentFlags(true);
  mockCoreDependencies();
  const response = await coreAgentService.processWebMessage({
    requestId: 'req_live_multi_metadata',
    message: 'How much salary should I receive and how can I send money to Thailand?',
    channel: 'web',
    channelUserId: 'live-multi-metadata',
  });

  assert.equal(response.reply.includes('task_'), false);
  assert.equal(response.reply.includes('employment_salary_agent'), false);
  assert.equal(response.reply.includes('finance_consumer_agent'), false);
  assert.equal(response.reply.includes('executeTasksSequentially'), false);
});
