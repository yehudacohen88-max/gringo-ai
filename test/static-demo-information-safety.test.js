const test = require('node:test');
const assert = require('node:assert/strict');

const { env } = require('../src/config/env');
const { SupervisorService } = require('../src/modules/agents');
const {
  employmentSalaryAgent,
  financeConsumerAgent,
  healthLifeCommunityAgent,
} = require('../src/modules/agents');
const moneyService = require('../src/modules/money/money.service');
const serviceService = require('../src/modules/services/service.service');
const knowledgeAgentService = require('../src/modules/knowledge-agent/knowledge-agent.service');

function createTask(overrides = {}) {
  return {
    taskId: 'task_static_demo_safety',
    requestId: 'req_static_demo_safety',
    conversationId: 'web:static-demo-safety',
    domain: 'finance_consumer',
    capability: 'finance.transfer',
    priority: 'normal',
    input: {},
    metadata: {},
    createdAt: '2026-09-19T00:00:00.000Z',
    ...overrides,
  };
}

async function withPatchedServices(patches, callback) {
  const originals = [];

  for (const [service, methods] of patches) {
    for (const [name, replacement] of Object.entries(methods)) {
      originals.push([service, name, service[name]]);
      service[name] = replacement;
    }
  }

  try {
    return await callback();
  } finally {
    originals.reverse().forEach(([service, name, original]) => {
      service[name] = original;
    });
  }
}

async function withDemoExchangeRateFallback(callback) {
  const originalEndpoint = env.money.referenceRateEndpoint;
  env.money.referenceRateEndpoint = '';

  try {
    return await callback();
  } finally {
    env.money.referenceRateEndpoint = originalEndpoint;
  }
}

test('demo money-transfer comparison is clearly labeled and remains functional', async () => {
  const comparison = await moneyService.compareTransfers(2000, 'ILS', 'THB');
  const message = moneyService.formatComparisonForChat(2000, 'ILS', 'THB', comparison);

  assert.equal(comparison.length > 0, true);
  assert.match(message, /Demo data - not a live rate/i);
  assert.match(message, /demonstration data only/i);
  assert.match(message, /not a live quote/i);
  assert.match(message, /not.*confirmed transaction offer/i);
  assert.match(message, /recipient gets about/i);
});

test('demo exchange rates are not presented as live rates', async () => {
  await withDemoExchangeRateFallback(async () => {
    const rate = await moneyService.getExchangeRate('ILS', 'THB');

    assert.equal(rate.sourceName, 'Demo data - not a live rate.');
    assert.match(moneyService.DEMO_NOTICE, /not a live rate/i);
    assert.match(moneyService.DEMO_NOTICE, /not a live quote/i);
  });
});

test('demo fees are not presented as confirmed current fees', async () => {
  const comparison = await moneyService.compareTransfers(2000, 'ILS', 'THB');
  const message = moneyService.formatComparisonForChat(2000, 'ILS', 'THB', comparison);

  assert.match(message, /Fee:/i);
  assert.match(message, /fees.*may change/i);
  assert.match(message, /Confirm the final amount and terms directly with the provider/i);
});

test('static government information is not falsely presented as currently verified', () => {
  const message = serviceService.formatServicesForChat([
    {
      title: 'Worker Government and Translation Desk',
      category: 'Government',
      rating: '4.1',
      verified: 'Yes',
      phone: '03-555-7070',
      address: 'Menachem Begin 125, Tel Aviv',
      languages: 'Thai, English, Hebrew',
      openingHours: 'Sun-Thu 09:00-16:00',
      match: { reason: 'Government match' },
    },
  ]);

  assert.match(message, /Directory trust flag: Yes/i);
  assert.match(message, /Government and public-service requirements may have changed/i);
  assert.match(message, /relevant official source/i);
  assert.doesNotMatch(message, /currently verified/i);
});

test('static service information is not falsely presented as currently available', () => {
  const message = serviceService.formatServicesForChat([
    {
      title: 'Thai Friendly Clinic Tel Aviv',
      category: 'Medical',
      rating: '4.7',
      verified: 'Yes',
      phone: '03-555-1010',
      address: 'Allenby 80, Tel Aviv',
      languages: 'Thai, English, Hebrew',
      openingHours: 'Sun-Thu 09:00-18:00',
      match: { reason: 'Medical match' },
    },
  ]);

  assert.match(message, /Service directory details may have changed/i);
  assert.match(message, /not confirmation that the service is currently available/i);
});

test('verified-current metadata is respected when actually present', () => {
  const message = serviceService.formatServicesForChat([
    {
      title: 'Current Service Desk',
      category: 'Medical',
      rating: '4.7',
      verified: 'Yes',
      freshnessStatus: 'verified_current',
      phone: '03-555-1010',
      address: 'Tel Aviv',
      languages: 'English',
      openingHours: 'Sun-Thu 09:00-18:00',
      match: { reason: 'Current metadata match' },
    },
  ]);

  assert.match(message, /Current verification metadata: Yes/i);
  assert.match(message, /include current verification metadata/i);
  assert.doesNotMatch(message, /may have changed/i);
});

test('unsupported current-information requests fail safely', async () => {
  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async () => ({ status: 'NOT_FOUND', answer: '', relevantKnowledge: [] }),
    }],
  ], async () => {
    const result = await financeConsumerAgent.execute(createTask({
      capability: 'finance.bank',
      input: { question: 'Which bank has the best live offer today?' },
    }));

    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.warnings, ['no_reliable_implementation']);
    assert.equal(result.output, null);
  });
});

test('unrelated knowledge and services are not returned for unsupported requests', async () => {
  const result = await financeConsumerAgent.execute(createTask({
    capability: 'consumer.services',
    input: { question: 'Can you improve my credit score immediately?', profile: { city: 'Tel Aviv' } },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.count, 0);
  assert.deepEqual(result.output.services, []);
  assert.doesNotMatch(result.output.message, /government|clinic|provider|approved score/i);
});

test('Finance transfer execution avoids demo ranking when reported observations are unavailable', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('external provider call should not happen');
  };

  try {
    const result = await withDemoExchangeRateFallback(() => financeConsumerAgent.execute(createTask({
        input: {
          amount: 2000,
          sourceCurrency: 'ILS',
          targetCurrency: 'THB',
          profile: { userId: 'usr_demo_safety', preferredCurrency: 'THB' },
        },
      })));

    assert.equal(result.status, 'partial');
    assert.equal(fetchCalled, false);
    assert.match(result.output.message, /not currently have enough real reported observations/i);
    assert.match(result.output.message, /will not show demo provider ranking/i);
    assert.doesNotMatch(result.output.message, /Demo data - not a live rate/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Employment salary behavior remains unchanged', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    domain: 'employment_salary',
    capability: 'jobs.salary',
    input: { question: 'When should I receive my salary?', paymentFrequency: 'monthly' },
  }));

  assert.equal(result.status, 'success');
  assert.match(result.output.message, /Wage Protection Law, 5718-1958/i);
  assert.match(result.output.message, /delayed salary/i);
});

test('Finance generic assistance remains unchanged', async () => {
  const result = await financeConsumerAgent.execute(createTask({
    capability: 'consumer.services',
    input: { question: 'My bank card is not working.' },
  }));

  assert.equal(result.status, 'partial');
  assert.match(result.output.message, /declined, blocked, lost or stolen/i);
});

test('Housing assistance remains unchanged', async () => {
  const result = await healthLifeCommunityAgent.execute(createTask({
    domain: 'health_life_community',
    capability: 'housing.support',
    input: { query: 'I have no hot water in my apartment.', profile: { city: 'Tel Aviv' } },
  }));

  assert.equal(['partial', 'success'].includes(result.status), true);
  assert.equal(result.output.capability, 'housing.support');
});

test('Urgent Health guidance remains unchanged', async () => {
  const result = await healthLifeCommunityAgent.execute(createTask({
    domain: 'health_life_community',
    capability: 'health.support',
    input: { question: 'I have chest pain and cannot breathe' },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.urgent, true);
  assert.match(result.output.nextStep, /emergency/i);
});

test('Hebrew translation behavior remains outside static demo labeling changes', async () => {
  const hebrewService = serviceService.formatServicesForChat([
    {
      title: 'מרפאה',
      category: 'Medical',
      rating: '4.7',
      verified: 'Yes',
      phone: '03-555-1010',
      address: 'Tel Aviv',
      languages: 'Hebrew',
      openingHours: 'Sun-Thu 09:00-18:00',
      match: { reason: 'Medical match' },
    },
  ]);

  assert.match(hebrewService, /מרפאה/);
  assert.match(hebrewService, /Service directory details may have changed/i);
});

test('multi-intent task isolation remains unchanged', () => {
  const service = new SupervisorService();
  const message = 'When should I receive my salary, how can I send 2,000 ILS to Thailand, and how can I find a clinic near me?';
  const context = service.createRequestContext({
    requestId: 'req_static_multi',
    conversationId: 'web:static-multi',
    userId: 'usr_static_multi',
    message,
    profile: { preferredCurrency: 'THB', city: 'Tel Aviv' },
  });
  const detected = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, detected);

  assert.deepEqual(tasks.map((task) => task.domain), [
    'employment_salary',
    'finance_consumer',
    'health_life_community',
  ]);
  assert.equal(tasks.every((task) => task.metadata.sourceMessage === message), true);
  assert.doesNotMatch(tasks[1].input.question, /salary|clinic/i);
});

test('no new provider or external API is added for service formatting', () => {
  const message = serviceService.formatServicesForChat([
    {
      title: 'Central SIM Card Desk',
      category: 'SIM Card',
      rating: '4.4',
      verified: 'Yes',
      phone: '03-555-3030',
      address: 'Levinsky 108, Tel Aviv',
      languages: 'English, Hebrew, Thai',
      openingHours: 'Sun-Fri 08:00-20:00',
      match: { reason: 'SIM Card match' },
    },
  ]);

  assert.match(message, /Central SIM Card Desk/i);
  assert.doesNotMatch(message, /live API|external provider|web search/i);
});
