const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');

function createRequestContext(message, overrides = {}) {
  return {
    requestId: 'req_multi_intent',
    conversationId: 'web:user_multi_intent',
    message,
    ...overrides,
  };
}

test('detects profile field recall and profile summary recall in order', () => {
  const service = new SupervisorService();
  const result = service.detectIntents(
    createRequestContext('What is my profession? What do you remember about me?')
  );

  assert.equal(result.isMultiIntent, true);
  assert.deepEqual(result.intents, [
    {
      domain: 'profile_memory',
      intent: 'profile_field_recall',
    },
    {
      domain: 'profile_memory',
      intent: 'profile_summary_recall',
    },
  ]);
});

test('detects profile update before job request', () => {
  const service = new SupervisorService();
  const result = service.detectIntents(
    createRequestContext('I moved to Haifa. Can you find construction jobs near me?')
  );

  assert.equal(result.isMultiIntent, true);
  assert.deepEqual(result.intents, [
    {
      domain: 'profile_memory',
      intent: 'profile_update',
    },
    {
      domain: 'employment_salary',
      intent: 'job_request',
    },
  ]);
});

test('detects employment salary and finance consumer intents in user order', () => {
  const service = new SupervisorService();
  const result = service.detectIntents(
    createRequestContext('How much salary should I receive and where can I transfer money to Thailand?')
  );

  assert.equal(result.isMultiIntent, true);
  assert.deepEqual(result.intents, [
    {
      domain: 'employment_salary',
      intent: 'salary_question',
    },
    {
      domain: 'finance_consumer',
      intent: 'money_transfer',
    },
  ]);
});

test('detects distinct health and housing intents in the same domain', () => {
  const service = new SupervisorService();
  const result = service.detectIntents(
    createRequestContext('I need a doctor and I also need help finding housing.')
  );

  assert.equal(result.isMultiIntent, true);
  assert.deepEqual(result.intents, [
    {
      domain: 'health_life_community',
      intent: 'health_request',
    },
    {
      domain: 'health_life_community',
      intent: 'housing_request',
    },
  ]);
});

test('single salary question produces exactly one intent', () => {
  const service = new SupervisorService();
  const result = service.detectIntents(createRequestContext('When should my salary be paid?'));

  assert.equal(result.isMultiIntent, false);
  assert.deepEqual(result.intents, [
    {
      domain: 'employment_salary',
      intent: 'salary_question',
    },
  ]);
});

test('repeated equivalent requests are deduplicated', () => {
  const service = new SupervisorService();
  const result = service.detectIntents(
    createRequestContext('What is my profession? What is my job? What do you remember about me?')
  );

  assert.equal(result.isMultiIntent, true);
  assert.deepEqual(result.intents, [
    {
      domain: 'profile_memory',
      intent: 'profile_field_recall',
    },
    {
      domain: 'profile_memory',
      intent: 'profile_summary_recall',
    },
  ]);
});

test('existing single-intent routing behavior remains unchanged', () => {
  const service = new SupervisorService();
  const context = createRequestContext('My employer did not pay my salary');
  const plan = service.createPlan(context);

  assert.equal(service.detectPrimaryDomain(context), 'employment_salary');
  assert.deepEqual(service.detectSecondaryDomains(context), []);
  assert.equal(plan.primaryDomain, 'employment_salary');
  assert.deepEqual(plan.secondaryDomains, []);
  assert.equal(plan.requestType, 'simple');
  assert.deepEqual(plan.detectedIntents, {
    isMultiIntent: false,
    intents: [
      {
        domain: 'employment_salary',
        intent: 'salary_question',
      },
    ],
  });
  assert.deepEqual(plan.tasks, []);
});
