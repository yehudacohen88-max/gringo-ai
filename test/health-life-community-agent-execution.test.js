const test = require('node:test');
const assert = require('node:assert/strict');

const {
  employmentSalaryAgent,
  financeConsumerAgent,
  healthLifeCommunityAgent,
  resultContract,
} = require('../src/modules/agents');
const housingService = require('../src/modules/housing/housing.service');
const communityService = require('../src/modules/community/community.service');
const serviceService = require('../src/modules/services/service.service');
const documentService = require('../src/modules/documents/document.service');
const knowledgeAgentService = require('../src/modules/knowledge-agent/knowledge-agent.service');
const crmAgentService = require('../src/modules/crm-agent/crm-agent.service');

function createTask(overrides = {}) {
  return {
    taskId: 'task_health_1',
    conversationId: 'web:user',
    requestId: 'req_health_1',
    domain: 'health_life_community',
    capability: 'health.support',
    priority: 'normal',
    input: {},
    metadata: {},
    createdAt: '2026-08-02T08:00:00.000Z',
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

function assertResultContract(result) {
  assert.deepEqual(Object.keys(result), [
    'taskId',
    'status',
    'output',
    'factsLearned',
    'suggestedProfileUpdates',
    'followUpQuestions',
    'warnings',
    'completedAt',
  ]);
  assert.equal(result.taskId, 'task_health_1');
  assert.equal(Array.isArray(result.factsLearned), true);
  assert.equal(Array.isArray(result.suggestedProfileUpdates), true);
  assert.equal(Array.isArray(result.followUpQuestions), true);
  assert.equal(Array.isArray(result.warnings), true);
  assert.equal(resultContract.validateResultContract(result), true);
}

test('health.support returns safe general guidance without diagnosis', async () => {
  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async () => ({ status: 'FOUND', answer: 'Clinic information.' }),
    }],
    [serviceService, {
      inferServiceSearch: () => ({ category: 'Medical', city: 'Tel Aviv' }),
      findMatchingServices: async () => [{ id: 'svc_1', title: 'Clinic', match: { score: 80 } }],
      formatServicesForChat: () => 'Found clinic',
    }],
  ], async () => {
    const result = await healthLifeCommunityAgent.execute(createTask({
      capability: 'health.support',
      input: { question: 'I need a clinic in Tel Aviv' },
    }));

    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'health.support');
    assert.match(result.output.guidance, /does not diagnose/i);
    assert.equal(/diagnosis:|take \d+mg|prescription/i.test(JSON.stringify(result.output)), false);
    assertResultContract(result);
  });
});

test('health.support returns urgent warning and focused next step', async () => {
  const result = await healthLifeCommunityAgent.execute(createTask({
    capability: 'health.support',
    input: { question: 'I have chest pain and cannot breathe' },
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.output.urgent, true);
  assert.equal(result.warnings.includes('urgent_medical_help_may_be_needed'), true);
  assert.match(result.output.nextStep, /emergency/i);
  assertResultContract(result);
});

test('housing.support reuses Housing logic and returns maximum 5 results', async () => {
  let called = false;
  const listings = Array.from({ length: 7 }, (_, index) => ({
    housingId: `house_${index}`,
    title: `Room ${index}`,
    city: 'Tel Aviv',
    monthlyPrice: '2500',
    availableFrom: 'Now',
    match: { reason: 'Same city', score: 100 - index },
  }));

  await withPatchedServices([
    [housingService, {
      findMatchingHousing: async () => {
        called = true;
        return listings;
      },
      formatHousingForChat: (items) => `Housing ${items.length}`,
    }],
  ], async () => {
    const result = await healthLifeCommunityAgent.execute(createTask({
      capability: 'housing.support',
      input: { profile: { preferredHousingCity: 'Tel Aviv' } },
    }));

    assert.equal(called, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.listings.length, 5);
    assert.equal(result.output.message, 'Housing 5');
    assertResultContract(result);
  });
});

test('community.support reuses Community logic', async () => {
  let called = false;

  await withPatchedServices([
    [communityService, {
      getRelevantPosts: async (profile) => {
        called = true;
        assert.equal(profile.city, 'Tel Aviv');
        return [{ postId: 'post_1', title: 'Community update', relevance: { score: 90 } }];
      },
      formatPostsForChat: (posts) => `Posts ${posts.length}`,
    }],
  ], async () => {
    const result = await healthLifeCommunityAgent.execute(createTask({
      capability: 'community.support',
      input: { profile: { city: 'Tel Aviv' } },
    }));

    assert.equal(called, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.message, 'Posts 1');
    assertResultContract(result);
  });
});

test('government.services uses Services data when available', async () => {
  let called = false;

  await withPatchedServices([
    [serviceService, {
      inferServiceSearch: () => ({ category: 'Government', city: 'Jerusalem' }),
      findMatchingServices: async () => {
        called = true;
        return [{ id: 'svc_gov', title: 'Government Office', match: { score: 80 } }];
      },
      formatServicesForChat: () => 'Government service',
    }],
  ], async () => {
    const result = await healthLifeCommunityAgent.execute(createTask({
      capability: 'government.services',
      input: { query: 'government office in Jerusalem' },
    }));

    assert.equal(called, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'government.services');
    assertResultContract(result);
  });
});

test('government.services blocks when reliable information is unavailable', async () => {
  await withPatchedServices([
    [serviceService, {
      inferServiceSearch: () => ({ category: 'Government' }),
      findMatchingServices: async () => [],
    }],
    [knowledgeAgentService, {
      answerQuestion: async () => ({ status: 'NOT_FOUND', answer: '' }),
    }],
  ], async () => {
    const result = await healthLifeCommunityAgent.execute(createTask({
      capability: 'government.services',
      input: { query: 'unknown legal procedure' },
    }));

    assert.equal(result.status, 'blocked');
    assert.equal(result.output, null);
    assert.equal(result.warnings.includes('no_reliable_implementation'), true);
    assertResultContract(result);
  });
});

test('life.general reuses Documents module for document requests', async () => {
  let readDocuments = false;

  await withPatchedServices([
    [crmAgentService, {
      getUserMemory: async () => ({ userId: 'usr_1', workSector: 'Construction' }),
    }],
    [documentService, {
      getUserDocuments: async (userId) => {
        readDocuments = true;
        assert.equal(userId, 'usr_1');
        return [{ documentId: 'doc_1', userId, documentType: 'Passport', status: 'Valid' }];
      },
      summarizeDocuments: () => ({ checklist: [], documentsComplete: 'Yes' }),
      toSafeDocument: (document) => document,
      formatDocumentsForChat: () => 'Documents summary',
    }],
  ], async () => {
    const result = await healthLifeCommunityAgent.execute(createTask({
      capability: 'life.general',
      input: { userId: 'usr_1', query: 'check my documents' },
    }));

    assert.equal(readDocuments, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.routedTo, 'documents');
    assert.equal(result.output.message, 'Documents summary');
    assertResultContract(result);
  });
});

test('unsupported capability is blocked safely', async () => {
  const result = await healthLifeCommunityAgent.execute(createTask({ capability: 'health.diagnose' }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.output, null);
  assert.deepEqual(result.warnings, ['unsupported_capability']);
  assertResultContract(result);
});

test('missing input is blocked safely', async () => {
  const result = await healthLifeCommunityAgent.execute(createTask({ capability: 'life.general', input: {} }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.output, null);
  assert.deepEqual(result.warnings, ['missing_required_input']);
  assert.equal(result.followUpQuestions.length, 1);
  assertResultContract(result);
});

test('health execution is read-only and does not call profile writes or external actions', async () => {
  let profileWriteCalled = false;
  let externalActionCalled = false;

  await withPatchedServices([
    [crmAgentService, {
      getUserMemory: async () => ({ userId: 'usr_1', city: 'Tel Aviv' }),
      updateUserProfile: async () => {
        profileWriteCalled = true;
      },
    }],
    [communityService, {
      getRelevantPosts: async () => [{ postId: 'post_1', title: 'Post', relevance: { score: 80 } }],
      formatPostsForChat: () => 'Posts',
    }],
  ], async () => {
    const result = await healthLifeCommunityAgent.execute(createTask({
      capability: 'community.support',
      input: { userId: 'usr_1' },
      metadata: {
        contactClinic: () => {
          externalActionCalled = true;
        },
      },
    }));

    assert.equal(result.status, 'success');
    assert.equal(profileWriteCalled, false);
    assert.equal(externalActionCalled, false);
    assertResultContract(result);
  });
});

test('Employment and Finance Agents remain unchanged', async () => {
  assert.deepEqual(employmentSalaryAgent.capabilities, [
    'jobs.search',
    'jobs.match',
    'jobs.salary',
    'employment.documents',
    'employment.support',
  ]);
  assert.equal((await employmentSalaryAgent.validate({ capability: 'jobs.search' })).valid, true);
  assert.deepEqual(financeConsumerAgent.capabilities, [
    'finance.budget',
    'finance.exchange_rate',
    'finance.transfer',
    'finance.user_submitted_quote',
    'finance.saved_user_submitted_quote',
    'finance.saved_user_submitted_quote_comparison',
    'finance.bank',
    'consumer.compare',
    'consumer.services',
  ]);
  assert.equal((await financeConsumerAgent.validate({ capability: 'finance.transfer' })).valid, true);
});
