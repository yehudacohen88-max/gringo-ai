const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');

const EMPTY_FALLBACK = 'I do not have enough information to answer that yet. Please tell me what you want to check first.';
const FAILURE_FALLBACK = 'Sorry, I could not complete that request safely right now. Please try again with one specific detail, or ask for help from the Gringo team.';

function createResult(overrides = {}) {
  return {
    taskId: 'task_response',
    requestId: 'req_response',
    conversationId: 'web:user_response',
    domain: 'employment_salary',
    intent: 'salary_question',
    status: 'success',
    output: {
      message: 'Your employer must pay your salary on time.',
      metadata: {
        executorId: 'internal_executor',
      },
    },
    factsLearned: [],
    suggestedProfileUpdates: [],
    followUpQuestions: [],
    warnings: [],
    completedAt: '2026-08-31T08:00:00.000Z',
    ...overrides,
  };
}

function createSynthesis(items = [], overrides = {}) {
  const service = new SupervisorService();
  return {
    ...service.synthesizeResults(items),
    ...overrides,
  };
}

test('empty synthesis returns safe fallback string', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([]));

  assert.equal(response, EMPTY_FALLBACK);
});

test('single successful Result returns exact user-facing content', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      output: {
        message: 'Your profession is ironworker.',
      },
    }),
  ]));

  assert.equal(response, 'Your profession is ironworker.');
});

test('two successful Results are joined in order with deterministic separator', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_first',
      output: {
        message: 'Your employer is ABC Construction Company.',
      },
    }),
    createResult({
      taskId: 'task_second',
      domain: 'finance_consumer',
      intent: 'money_transfer',
      output: {
        message: 'To send money to Thailand, compare fees before you transfer.',
      },
    }),
  ]));

  assert.equal(
    response,
    'Your employer is ABC Construction Company.\n\nTo send money to Thailand, compare fees before you transfer.'
  );
});

test('three mixed-domain Results preserve all usable contents in original order', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_employment',
      domain: 'employment_salary',
      output: { message: 'Salary should be checked against your contract.' },
    }),
    createResult({
      taskId: 'task_finance',
      domain: 'finance_consumer',
      intent: 'money_transfer',
      output: { answer: 'Use a licensed transfer provider.' },
    }),
    createResult({
      taskId: 'task_health',
      domain: 'health_life_community',
      intent: 'housing_request',
      output: { summary: 'For housing, check location and rent before signing.' },
    }),
  ]));

  assert.equal(
    response,
    'Salary should be checked against your contract.\n\nUse a licensed transfer provider.\n\nFor housing, check location and rent before signing.'
  );
});

test('urgent Health result preserves guidance and urgent nextStep', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      domain: 'health_life_community',
      intent: 'health_request',
      status: 'partial',
      output: {
        capability: 'health.support',
        guidance: 'This is general information only. Gringo does not diagnose medical conditions or prescribe treatment.',
        urgent: true,
        nextStep: 'If this may be urgent, contact local emergency services or go to the nearest emergency clinic now.',
      },
    }),
  ]));

  assert.match(response, /general information only/i);
  assert.match(response, /contact local emergency services/i);
});

test('urgent Health result with nextStep only preserves nextStep', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      domain: 'health_life_community',
      intent: 'health_request',
      status: 'partial',
      output: {
        capability: 'health.support',
        urgent: true,
        nextStep: 'Go to the nearest emergency clinic now.',
      },
    }),
  ]));

  assert.equal(response, 'Go to the nearest emergency clinic now.');
});

test('non-urgent Health composition remains unchanged', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      domain: 'health_life_community',
      intent: 'health_request',
      output: {
        capability: 'health.support',
        guidance: 'This is general information only.',
        urgent: false,
        nextStep: 'This non-urgent next step should not be prioritized.',
      },
    }),
  ]));

  assert.equal(response, 'This non-urgent next step should not be prioritized.');
});

test('normal Employment composition remains unchanged', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      domain: 'employment_salary',
      output: {
        guidance: 'Employment guidance.',
        nextStep: 'Employment next step should not be prioritized.',
      },
    }),
  ]));

  assert.equal(response, 'Employment next step should not be prioritized.');
});

test('normal Finance composition remains unchanged', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      domain: 'finance_consumer',
      output: {
        message: 'Compare fees before sending money.',
        nextStep: 'Finance next step should not override message.',
      },
    }),
  ]));

  assert.equal(response, 'Compare fees before sending money.');
});

test('urgent Health plus Finance preserves urgent nextStep and Finance result', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_urgent_health',
      domain: 'health_life_community',
      intent: 'health_request',
      status: 'partial',
      output: {
        capability: 'health.support',
        guidance: 'This is general information only.',
        urgent: true,
        nextStep: 'Contact local emergency services now.',
      },
    }),
    createResult({
      taskId: 'task_finance',
      domain: 'finance_consumer',
      intent: 'money_transfer',
      output: {
        message: 'For 2,000 ILS to THB, compare providers before sending.',
      },
    }),
  ]));

  assert.match(response, /Contact local emergency services now/i);
  assert.match(response, /For 2,000 ILS to THB/i);
  assert.equal(response.indexOf('Contact local emergency services now') < response.indexOf('For 2,000 ILS'), true);
});

test('urgent Health plus Employment preserves urgent nextStep and Employment result', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_urgent_health',
      domain: 'health_life_community',
      intent: 'health_request',
      status: 'partial',
      output: {
        capability: 'health.support',
        guidance: 'This is general information only.',
        urgent: true,
        nextStep: 'Go to the nearest emergency clinic now.',
      },
    }),
    createResult({
      taskId: 'task_employment',
      domain: 'employment_salary',
      output: {
        message: 'Your salary question needs the payment period.',
      },
    }),
  ]));

  assert.match(response, /nearest emergency clinic/i);
  assert.match(response, /salary question/i);
});

test('urgent Health survives partial second result', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_urgent_health',
      domain: 'health_life_community',
      intent: 'health_request',
      status: 'partial',
      output: {
        capability: 'health.support',
        urgent: true,
        nextStep: 'Contact local emergency services now.',
      },
    }),
    createResult({
      taskId: 'task_partial',
      domain: 'finance_consumer',
      status: 'partial',
      output: {
        message: 'I need one more detail to compare this safely.',
      },
    }),
  ]));

  assert.match(response, /Contact local emergency services now/i);
  assert.match(response, /one more detail/i);
});

test('urgent Health survives blocked second result', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_urgent_health',
      domain: 'health_life_community',
      intent: 'health_request',
      status: 'partial',
      output: {
        capability: 'health.support',
        urgent: true,
        nextStep: 'Contact local emergency services now.',
      },
    }),
    createResult({
      taskId: 'task_blocked',
      domain: 'finance_consumer',
      status: 'blocked',
      output: null,
      followUpQuestions: ['How much money do you want to compare for transfer?'],
    }),
  ]));

  assert.match(response, /Contact local emergency services now/i);
  assert.match(response, /How much money/i);
});

test('Supervisor does not infer urgency without existing urgent Health signal', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      domain: 'health_life_community',
      intent: 'health_request',
      output: {
        capability: 'health.support',
        guidance: 'This is general information only.',
        nextStep: 'This next step exists but urgent is not true.',
      },
    }),
  ]));

  assert.equal(response, 'This next step exists but urgent is not true.');
  assert.equal(response.includes('This is general information only.'), false);
});

test('partial success preserves successful content and failed Result does not crash response', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_success',
      status: 'success',
      output: { message: 'I remember your current city is Haifa.' },
    }),
    createResult({
      taskId: 'task_failed',
      status: 'failed',
      output: null,
      warnings: ['execution_failed'],
    }),
  ]));

  assert.equal(response, 'I remember your current city is Haifa.');
});

test('all failed returns safe fallback without internal error leakage', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_internal_failure',
      status: 'failed',
      output: {
        message: 'stack trace: task_internal_failure executor finance_consumer_agent failed',
      },
      warnings: ['Error: database stack trace'],
    }),
  ]));

  assert.equal(response, FAILURE_FALLBACK);
  assert.equal(response.includes('stack trace'), false);
  assert.equal(response.includes('task_internal_failure'), false);
});

test('internal metadata is not exposed', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      output: {
        message: 'This is the safe answer.',
        metadata: {
          rawProviderError: 'do not show',
          executorName: 'employment_salary_agent',
        },
      },
    }),
  ]));

  assert.equal(response, 'This is the safe answer.');
  assert.equal(response.includes('rawProviderError'), false);
  assert.equal(response.includes('employment_salary_agent'), false);
});

test('task IDs are not exposed', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      taskId: 'task_secret_identifier',
      output: {
        message: 'Your job alert is enabled.',
      },
    }),
  ]));

  assert.equal(response.includes('task_secret_identifier'), false);
});

test('executor names are not exposed', () => {
  const service = new SupervisorService();
  const response = service.composeResponse(createSynthesis([
    createResult({
      output: {
        message: 'Your preferred currency is USD.',
        executorName: 'core_profile_memory',
      },
    }),
  ]));

  assert.equal(response, 'Your preferred currency is USD.');
  assert.equal(response.includes('core_profile_memory'), false);
});

test('original synthesis is not mutated', () => {
  const service = new SupervisorService();
  const synthesis = createSynthesis([
    createResult({
      output: {
        message: 'Original content.',
        nested: {
          value: 'kept',
        },
      },
    }),
  ]);
  const before = JSON.stringify(synthesis);

  service.composeResponse(synthesis);

  assert.equal(JSON.stringify(synthesis), before);
});

test('original Results are not mutated', () => {
  const service = new SupervisorService();
  const result = createResult({
    output: {
      message: 'Keep this result unchanged.',
      nested: {
        value: 'kept',
      },
    },
  });
  const before = JSON.stringify(result);

  service.composeResponse(createSynthesis([result]));

  assert.equal(JSON.stringify(result), before);
});

test('composition does not execute tasks', () => {
  const service = new SupervisorService();
  let executed = false;
  service.executeTask = async () => {
    executed = true;
  };
  service.executeTasksSequentially = async () => {
    executed = true;
  };

  service.composeResponse(createSynthesis([createResult()]));

  assert.equal(executed, false);
});

test('composition does not perform routing', () => {
  const service = new SupervisorService();
  let routed = false;
  service.detectIntents = () => {
    routed = true;
  };
  service.createTasksFromIntents = () => {
    routed = true;
  };
  service.selectExecutorForTask = () => {
    routed = true;
  };

  service.composeResponse(createSynthesis([createResult()]));

  assert.equal(routed, false);
});

test('composition does not call an LLM or response builder', () => {
  const service = new SupervisorService();
  let responseBuilt = false;
  service.buildUserResponse = async () => {
    responseBuilt = true;
  };
  service.composeEnglishResponse = () => {
    responseBuilt = true;
  };

  service.composeResponse(createSynthesis([createResult()]));

  assert.equal(responseBuilt, false);
});

test('live Web Chat behavior remains unchanged', () => {
  const { coreAgentService } = require('../src/modules/core-agent');

  assert.equal(Object.hasOwn(coreAgentService, 'composeResponse'), false);
});
