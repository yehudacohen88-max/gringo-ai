const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService, healthLifeCommunityAgent } = require('../src/modules/agents');
const housingService = require('../src/modules/housing/housing.service');

function createHousingTask(message, overrides = {}) {
  return {
    taskId: 'task_housing_generic_1',
    conversationId: 'web:user_housing_generic',
    requestId: 'req_housing_generic_1',
    domain: 'health_life_community',
    capability: 'housing.support',
    priority: 'normal',
    input: {
      question: message,
      query: message,
      profile: {
        city: 'Tel Aviv',
      },
    },
    metadata: {
      sourceMessage: message,
    },
    createdAt: '2026-08-02T08:00:00.000Z',
    ...overrides,
  };
}

function createRequestContext(message) {
  return {
    requestId: 'req_housing_generic_supervisor',
    conversationId: 'web:user_housing_generic_supervisor',
    userId: 'user_housing_generic_supervisor',
    message,
    profile: {
      fullName: 'David Levi',
      city: 'Tel Aviv',
      preferredCurrency: 'THB',
    },
  };
}

function route(message) {
  const service = new SupervisorService();
  const context = createRequestContext(message);
  const detected = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, detected);
  return { service, context, detected, tasks };
}

async function withPatchedHousing(patches, callback) {
  const originals = Object.entries(patches).map(([name, replacement]) => {
    const original = housingService[name];
    housingService[name] = replacement;
    return [name, original];
  });

  try {
    return await callback();
  } finally {
    originals.reverse().forEach(([name, original]) => {
      housingService[name] = original;
    });
  }
}

async function executeHousingProblem(message) {
  return healthLifeCommunityAgent.execute(createHousingTask(message));
}

test('no hot water returns generic current-housing assistance', async () => {
  const result = await executeHousingProblem('There is no hot water in my apartment.');

  assert.equal(result.status, 'partial');
  assert.equal(result.output.genericHousingProblemType, 'no_hot_water');
  assert.match(result.output.message, /hot water/i);
  assert.equal(result.output.listings, undefined);
  assert.equal(result.output.services, undefined);
  assert.equal(result.output.knowledge, undefined);
});

test('electricity problem returns generic current-housing assistance', async () => {
  const result = await executeHousingProblem('The electricity in my apartment is not working.');

  assert.equal(result.output.genericHousingProblemType, 'electricity_problem');
  assert.match(result.output.message, /electricity/i);
});

test('air conditioning problem routes and returns generic current-housing assistance', async () => {
  const { detected, tasks } = route('The air conditioner is broken.');
  const result = await healthLifeCommunityAgent.execute(tasks[0]);

  assert.deepEqual(detected.intents, [
    {
      domain: 'health_life_community',
      intent: 'housing_request',
    },
  ]);
  assert.equal(tasks[0].capability, 'housing.support');
  assert.equal(result.output.genericHousingProblemType, 'air_conditioning_problem');
});

test('plumbing or water problem returns generic current-housing assistance', async () => {
  const result = await executeHousingProblem('Water is leaking from the bathroom pipe.');

  assert.equal(result.output.genericHousingProblemType, 'plumbing_or_water_problem');
  assert.match(result.output.message, /leaking|blocked/i);
});

test('mold or damp problem returns generic current-housing assistance', async () => {
  const result = await executeHousingProblem('There is mold in my room.');

  assert.equal(result.output.genericHousingProblemType, 'mold_or_damp_problem');
  assert.match(result.output.message, /mold|damp/i);
});

test('appliance problem returns generic current-housing assistance', async () => {
  const result = await executeHousingProblem('The washing machine in the apartment is broken.');

  assert.equal(result.output.genericHousingProblemType, 'appliance_problem');
  assert.match(result.output.message, /appliance/i);
});

test('landlord or housing contact problem returns generic current-housing assistance', async () => {
  const result = await executeHousingProblem('My landlord is not fixing the apartment.');

  assert.equal(result.output.genericHousingProblemType, 'landlord_or_housing_contact_problem');
  assert.match(result.output.message, /reported|responsible/i);
});

test('generic current housing problem returns safe focused question', async () => {
  const result = await executeHousingProblem('There is a problem in my apartment.');

  assert.equal(result.output.genericHousingProblemType, 'generic_current_housing_problem');
  assert.match(result.output.message, /main problem/i);
  assert.equal(result.followUpQuestions.length, 1);
});

test('housing search for apartment keeps existing listing behavior', async () => {
  let searched = false;

  await withPatchedHousing({
    findMatchingHousing: async () => {
      searched = true;
      return [{
        housingId: 'house_1',
        title: 'Room in Tel Aviv',
        city: 'Tel Aviv',
        monthlyPrice: '2500',
        availableFrom: 'Now',
        match: { reason: 'Same city', score: 100 },
      }];
    },
    formatHousingForChat: () => 'I found housing options that may fit you.',
  }, async () => {
    const result = await healthLifeCommunityAgent.execute(createHousingTask('I need an apartment.'));

    assert.equal(searched, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.genericHousingProblemType, undefined);
    assert.match(result.output.message, /housing options/i);
  });
});

test('housing search for room keeps existing listing behavior', async () => {
  let searched = false;

  await withPatchedHousing({
    findMatchingHousing: async () => {
      searched = true;
      return [{
        housingId: 'house_2',
        title: 'Shared room',
        city: 'Tel Aviv',
        monthlyPrice: '2200',
        availableFrom: 'Now',
        match: { reason: 'Same city', score: 90 },
      }];
    },
    formatHousingForChat: () => 'I found housing options that may fit you.',
  }, async () => {
    const result = await healthLifeCommunityAgent.execute(createHousingTask('I am looking for a room.'));

    assert.equal(searched, true);
    assert.equal(result.output.genericHousingProblemType, undefined);
    assert.match(result.output.message, /housing options/i);
  });
});

test('salary and no hot water multi-intent preserves Employment then Housing results', async () => {
  const message = 'My salary was not paid and there is no hot water in my apartment.';
  const { service, detected, tasks } = route(message);

  assert.equal(detected.isMultiIntent, true);
  assert.deepEqual(detected.intents.map((intent) => intent.domain), ['employment_salary', 'health_life_community']);
  assert.deepEqual(tasks.map((task) => task.capability), ['jobs.salary', 'housing.support']);
  assert.equal(tasks.every((task) => task.metadata.sourceMessage === message), true);

  const results = await service.executeTasksSequentially(tasks);
  const synthesis = service.synthesizeResults(results);
  const response = service.composeResponse(synthesis);

  assert.deepEqual(results.map((result) => result.domain), ['employment_salary', 'health_life_community']);
  assert.equal(results[1].output.genericHousingProblemType, 'no_hot_water');
  assert.match(response, /salary|paid|payment/i);
  assert.match(response, /hot water/i);
});

test('urgent health request keeps Health routing', () => {
  const { detected, tasks } = route('I need urgent medical help.');

  assert.deepEqual(detected.intents, [
    {
      domain: 'health_life_community',
      intent: 'health_request',
    },
  ]);
  assert.equal(tasks[0].capability, 'health.support');
});

test('finance money transfer keeps Finance routing', () => {
  const { detected, tasks } = route('I want to send 2,000 ILS to Thailand.');

  assert.deepEqual(detected.intents, [
    {
      domain: 'finance_consumer',
      intent: 'money_transfer',
    },
  ]);
  assert.equal(tasks[0].capability, 'finance.transfer');
});

test('consumer service relevance remains outside housing fallback', () => {
  const { detected, tasks } = route('My bank card is not working.');

  assert.deepEqual(detected.intents, [
    {
      domain: 'finance_consumer',
      intent: 'consumer_finance_request',
    },
  ]);
  assert.equal(tasks[0].capability, 'consumer.services');
});

test('knowledge relevance remains fail-closed for unrelated life questions', async () => {
  const { tasks } = route('Tell me the law about building a software platform.');

  assert.equal(tasks.length, 0);
});

test('housing fallback does not expose internal metadata', async () => {
  const result = await executeHousingProblem('There is no hot water in my apartment.');
  const response = result.output.message;

  assert.equal(/taskId|metadata|sourceMessage|supervisor/i.test(response), false);
});

test('housing fallback does not execute listing search', async () => {
  let searched = false;

  await withPatchedHousing({
    findMatchingHousing: async () => {
      searched = true;
      return [];
    },
    getActiveHousingListings: async () => {
      searched = true;
      return [];
    },
  }, async () => {
    await executeHousingProblem('There is no hot water in my apartment.');
    assert.equal(searched, false);
  });
});

test('housing fallback executes once in multi-intent composition', async () => {
  const message = 'My salary was not paid and there is no hot water in my apartment.';
  const { service, tasks } = route(message);
  const executed = [];
  const originalExecuteTask = service.executeTask.bind(service);

  service.executeTask = async (task, executor, context) => {
    executed.push(task.domain);
    return originalExecuteTask(task, executor, context);
  };

  const results = await service.executeTasksSequentially(tasks);

  assert.deepEqual(executed, ['employment_salary', 'health_life_community']);
  assert.equal(results.length, 2);
});
