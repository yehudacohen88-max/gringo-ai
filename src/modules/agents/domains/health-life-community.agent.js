const { multiAgentConfig } = require('../../../config/agents');
const housingService = require('../../housing/housing.service');
const communityService = require('../../community/community.service');
const serviceService = require('../../services/service.service');
const documentService = require('../../documents/document.service');
const knowledgeAgentService = require('../../knowledge-agent/knowledge-agent.service');
const crmAgentService = require('../../crm-agent/crm-agent.service');

const SUPPORTED_CAPABILITIES = Object.freeze([
  'health.support',
  'housing.support',
  'community.support',
  'government.services',
  'life.general',
]);

const URGENT_HEALTH_PATTERN = /\b(chest pain|cannot breathe|can't breathe|unconscious|heavy bleeding|stroke|heart attack|suicide|emergency|urgent|ambulance)\b/i;

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getInput(task = {}) {
  return isObject(task.input) ? task.input : {};
}

function createResult(task, status, output = {}, warnings = [], followUpQuestions = []) {
  return {
    taskId: cleanText(task?.taskId),
    status,
    output,
    factsLearned: [],
    suggestedProfileUpdates: [],
    followUpQuestions,
    warnings,
    completedAt: new Date().toISOString(),
  };
}

function blocked(task, warning, question = '') {
  return createResult(task, 'blocked', null, [warning], question ? [question] : []);
}

async function resolveProfile(input = {}) {
  if (isObject(input.profile)) return input.profile;

  const userId = cleanText(input.userId);
  if (!userId) return {};

  return (await crmAgentService.getUserMemory(userId)) || { userId };
}

function hasHousingSignals(value = {}) {
  return ['city', 'area', 'housingType', 'preferredHousingCity', 'preferredHousingArea', 'preferredHousingType', 'maximumHousingBudget', 'maximumMonthlyBudget'].some((field) =>
    cleanText(value[field])
  );
}

function detectCurrentHousingProblem(message = '') {
  const normalized = normalize(message);
  if (!normalized) return null;

  const hasHousingContext = /\b(apartment|room|housing|house|flat|home|accommodation|landlord|rent|place)\b/.test(normalized);
  const hasProblemSignal = /\b(problem|broken|not working|does not work|isn't working|is not working|not fixing|fixing|repair|leak|leaking|mold|damp|no hot water|without hot water)\b/.test(normalized);

  if (/\b(no hot water|without hot water|hot water.*(?:not working|broken|stopped|problem|does not work|isn't working))\b/.test(normalized)) {
    return {
      type: 'no_hot_water',
      message: 'I understand. Is there no hot water at all, or does it stop after a short time?',
    };
  }

  if (/\b(electricity|power|lights?)\b.*\b(not working|does not work|isn't working|broken|out|problem)\b/.test(normalized)
    || /\b(no electricity|no power|power outage)\b/.test(normalized)) {
    return {
      type: 'electricity_problem',
      message: 'I can help with that. Is the electricity problem only in your room or in the whole apartment?',
    };
  }

  if (/\b(air conditioner|air conditioning|a\/c| ac )\b.*\b(not working|does not work|isn't working|broken|stopped|problem)\b/.test(` ${normalized} `)) {
    return {
      type: 'air_conditioning_problem',
      message: 'I understand. Is the air conditioning not turning on, or is it turning on but not cooling?',
    };
  }

  if (/\b(plumbing|pipe|toilet|sink|shower|water leak|leaking water|leak|leaking)\b/.test(normalized)) {
    return {
      type: 'plumbing_or_water_problem',
      message: 'I can help you organize the next step. Is water leaking now, or is it a blocked toilet, sink, or shower?',
    };
  }

  if (/\b(mold|mould|damp|humidity|wet wall|wet walls)\b/.test(normalized)) {
    return {
      type: 'mold_or_damp_problem',
      message: 'I understand. Is the mold or damp in your room, bathroom, kitchen, or another area?',
    };
  }

  if (/\b(washing machine|washer|fridge|refrigerator|oven|stove|appliance)\b.*\b(not working|does not work|isn't working|broken|stopped|problem)\b/.test(normalized)) {
    return {
      type: 'appliance_problem',
      message: 'I can help with that. Which appliance is the problem, and what is it doing?',
    };
  }

  if (/\b(landlord|housing contact|building contact|owner)\b.*\b(not fixing|does not fix|doesn't fix|won't fix|will not fix|ignoring|repair)\b/.test(normalized)) {
    return {
      type: 'landlord_or_housing_contact_problem',
      message: 'I understand. What problem did you report, and who is the person responsible for the housing?',
    };
  }

  if (hasHousingContext && hasProblemSignal) {
    return {
      type: 'generic_current_housing_problem',
      message: 'I can help you sort this out. What is the main problem in the place where you live?',
    };
  }

  return null;
}

async function answerKnowledge(task, input, capability, fallbackQuestion) {
  const question = cleanText(input.question || input.query || task?.description || task?.title);

  if (!question) return blocked(task, 'missing_required_input', fallbackQuestion);

  const knowledge = await knowledgeAgentService.answerQuestion({
    question,
    userId: cleanText(input.userId),
    channel: cleanText(input.channel),
    channelUserId: cleanText(input.channelUserId),
  });

  if (knowledge.status !== 'FOUND') {
    return blocked(task, 'no_reliable_implementation', fallbackQuestion);
  }

  return createResult(task, 'success', {
    capability,
    knowledge,
  });
}

async function executeHealthSupport(task, input) {
  const query = cleanText(input.question || input.query || task?.description || task?.title);

  if (!query) {
    return blocked(task, 'missing_required_input', 'What health question or service should I look up?');
  }

  const profile = await resolveProfile(input);
  const warnings = ['general_health_guidance_only'];
  const output = {
    capability: 'health.support',
    guidance: 'This is general information only. Gringo does not diagnose medical conditions or prescribe treatment.',
    urgent: URGENT_HEALTH_PATTERN.test(query),
    nextStep: '',
    knowledge: null,
    services: [],
    serviceMessage: '',
  };

  if (output.urgent) {
    warnings.push('urgent_medical_help_may_be_needed');
    output.nextStep = 'If this may be urgent, contact local emergency services or go to the nearest emergency clinic now.';
    return createResult(task, 'partial', output, warnings);
  }

  const knowledge = await knowledgeAgentService.answerQuestion({
    question: query,
    userId: cleanText(input.userId),
    channel: cleanText(input.channel),
    channelUserId: cleanText(input.channelUserId),
  });
  output.knowledge = knowledge.status === 'FOUND' ? knowledge : null;

  const search = isObject(input.search) ? input.search : serviceService.inferServiceSearch(query, profile);
  const services = await serviceService.findMatchingServices(profile, { ...search, category: search.category || 'Medical' });
  output.services = services.slice(0, 5);
  output.serviceMessage = serviceService.formatServicesForChat(output.services);

  return createResult(task, output.knowledge || output.services.length ? 'success' : 'partial', output, warnings);
}

async function executeHousingSupport(task, input) {
  const profile = await resolveProfile(input);
  const searchContext = isObject(input.searchContext) ? input.searchContext : {};
  const query = cleanText(input.question || input.query || task?.description || task?.title);
  const sourceMessage = cleanText(task?.metadata?.sourceMessage || input.sourceMessage);
  const housingProblem = detectCurrentHousingProblem(query) || detectCurrentHousingProblem(sourceMessage);

  if (housingProblem) {
    return createResult(task, 'partial', {
      capability: 'housing.support',
      assistanceType: 'current_housing_problem',
      genericHousingProblemType: housingProblem.type,
      message: housingProblem.message,
    }, ['general_housing_assistance_only'], [housingProblem.message]);
  }

  if (!query && !hasHousingSignals(profile) && !hasHousingSignals(searchContext)) {
    return blocked(task, 'missing_required_input', 'What city, area, housing type, or budget should I use for the housing search?');
  }

  const listings = hasHousingSignals(profile) || hasHousingSignals(searchContext)
    ? await housingService.findMatchingHousing(profile, searchContext)
    : await housingService.getActiveHousingListings();
  const safeListings = listings.slice(0, 5);

  return createResult(task, safeListings.length ? 'success' : 'partial', {
    capability: 'housing.support',
    listings: safeListings,
    count: safeListings.length,
    message: housingService.formatHousingForChat(safeListings),
    safetyNotice: housingService.HOUSING_SAFETY_NOTICE,
  }, [housingService.HOUSING_SAFETY_NOTICE]);
}

async function executeCommunitySupport(task, input) {
  const profile = await resolveProfile(input);
  const filters = isObject(input.filters) ? input.filters : {};
  const posts = Object.keys(filters).length
    ? await communityService.getPublishedPosts(filters)
    : await communityService.getRelevantPosts(profile);

  return createResult(task, posts.length ? 'success' : 'partial', {
    capability: 'community.support',
    posts: posts.slice(0, 5),
    count: Math.min(posts.length, 5),
    message: communityService.formatPostsForChat(posts.slice(0, 5)),
    safetyNotice: communityService.COMMUNITY_SAFETY_NOTICE,
  }, [communityService.COMMUNITY_SAFETY_NOTICE]);
}

async function executeGovernmentServices(task, input) {
  const profile = await resolveProfile(input);
  const query = cleanText(input.question || input.query || task?.description || task?.title);
  const search = isObject(input.search) ? input.search : serviceService.inferServiceSearch(query, profile);
  const serviceSearch = { ...search, category: search.category || 'Government' };
  const services = await serviceService.findMatchingServices(profile, serviceSearch);

  if (services.length) {
    return createResult(task, 'success', {
      capability: 'government.services',
      search: serviceSearch,
      services: services.slice(0, 5),
      message: serviceService.formatServicesForChat(services.slice(0, 5)),
      safetyNotice: 'Verify official requirements with the relevant government office before acting.',
    }, ['verify_official_government_information']);
  }

  return answerKnowledge(
    task,
    input,
    'government.services',
    'Which government service or document process should I check?'
  );
}

async function executeLifeGeneral(task, input) {
  const query = cleanText(input.question || input.query || task?.description || task?.title);

  if (!query) {
    return blocked(task, 'missing_required_input', 'What kind of life support do you need help with?');
  }

  const normalized = normalize(query);

  if (/\b(housing|rent|room|apartment|landlord|hot water|electricity|power|air conditioner|air conditioning|plumbing|leak|mold|mould|damp|washing machine|fridge|refrigerator|appliance)\b/.test(normalized)) return executeHousingSupport(task, input);
  if (/\b(community|event|group|news|post)\b/.test(normalized)) return executeCommunitySupport(task, input);
  if (/\b(documents?|visas?|passports?|permits?)\b/.test(normalized)) {
    const profile = await resolveProfile(input);
    const userId = cleanText(input.userId || profile.userId);
    if (!userId) return blocked(task, 'missing_required_input', 'Which user profile should I check documents for?');
    const documents = await documentService.getUserDocuments(userId);
    const summary = documentService.summarizeDocuments({ ...profile, userId }, documents);
    return createResult(task, 'success', {
      capability: 'life.general',
      routedTo: 'documents',
      documents: documents.map(documentService.toSafeDocument),
      summary,
      message: documentService.formatDocumentsForChat(documents.map(documentService.toSafeDocument), summary),
    });
  }
  if (serviceService.isServiceMessage(query)) return executeGovernmentServices(task, input);

  return answerKnowledge(task, input, 'life.general', 'Which topic should I check: housing, documents, services, health, or community?');
}

const healthLifeCommunityAgent = {
  id: 'health_life_community_agent',
  name: 'Health, Life & Community Agent',
  version: multiAgentConfig.defaultAgentVersion,
  domain: 'health_life_community',
  capabilities: [...SUPPORTED_CAPABILITIES],
  initialize: async () => ({ initialized: true }),
  health: async () => ({ status: 'ok' }),
  validate: async (task = {}) => {
    const capability = cleanText(task.capability);
    if (!SUPPORTED_CAPABILITIES.includes(capability)) {
      return { valid: false, reason: 'unsupported_capability' };
    }
    return { valid: true };
  },
  execute: async (task = {}) => {
    const capability = cleanText(task.capability);
    const input = getInput(task);

    try {
      if (!SUPPORTED_CAPABILITIES.includes(capability)) {
        return blocked(task, 'unsupported_capability');
      }

      if (capability === 'health.support') return executeHealthSupport(task, input);
      if (capability === 'housing.support') return executeHousingSupport(task, input);
      if (capability === 'community.support') return executeCommunitySupport(task, input);
      if (capability === 'government.services') return executeGovernmentServices(task, input);
      if (capability === 'life.general') return executeLifeGeneral(task, input);

      return blocked(task, 'unsupported_capability');
    } catch (error) {
      return createResult(task, 'failed', {}, ['execution_failed'], []);
    }
  },
};

module.exports = {
  healthLifeCommunityAgent,
};
