const { randomUUID } = require('node:crypto');

const {
  isActiveSupervisorDeliveryEnabled,
  isSupervisorIntegrationEnabled,
  isSupervisorMultiIntentLiveEnabled,
  isSupervisorShadowModeEnabled,
} = require('../../config/agents');
const { aiProviderService } = require('../ai-provider');
const { supervisorService } = require('../agents');
const { crmAgentService } = require('../crm-agent');
const communityService = require('../community/community.service');
const documentService = require('../documents/document.service');
const housingService = require('../housing/housing.service');
const jobService = require('../jobs/job.service');
const moneyService = require('../money/money.service');
const serviceService = require('../services/service.service');
const taskService = require('../tasks/task.service');
const { knowledgeAgentService } = require('../knowledge-agent');
const { languageDetectionService } = require('../language');
const { translationService } = require('../translation');
const {
  contextManagerService,
  conversationMemoryService,
  memoryLifecycleService,
  memorySnapshotService,
  workingMemoryService,
} = require('../memory');
const onboardingService = require('./onboarding.service');
const personalizationService = require('./personalization.service');

const recentConversationByUser = new Map();
const CORE_AGENT_WORKING_LANGUAGE = 'en';
const CORE_AGENT_RESPONSE_LANGUAGE = 'en';
const OUTGOING_TRANSLATION_METADATA = Symbol('outgoingTranslation');

function createInternalRequestId() {
  return `req_${randomUUID()}`;
}

function languagePrimary(value) {
  return String(value || '').trim().toLowerCase().split(/[-_]/)[0];
}

const INCOMING_TRANSLATION_INCOMPLETE_WARNING = 'incoming_translation_incomplete';
const TRANSLATION_UNCERTAINTY_NOTICE = Object.freeze({
  he: 'ייתכן שחלק מההודעה לא הובן בגלל בעיה זמנית בעיבוד השפה. אפשר לשלוח שוב או לנסח את החלק הזה מחדש.',
  en: 'Part of your message may not have been understood because of a temporary language-processing problem. Please resend or rephrase that part.',
});
const INCOMING_LANGUAGE_FAILURE_REPLY = 'לא הצלחתי להבין את כל ההודעה בגלל בעיה זמנית בעיבוד השפה. אפשר לשלוח אותה שוב או לנסח אותה מחדש.';
const OUTGOING_HEBREW_TRANSLATION_NOTICE = 'לא הצלחתי לתרגם כרגע את התשובה לעברית, אז היא מוצגת באנגלית.';

function translationUncertaintyNotice(userLanguage = '') {
  return languagePrimary(userLanguage) === 'he'
    ? TRANSLATION_UNCERTAINTY_NOTICE.he
    : TRANSLATION_UNCERTAINTY_NOTICE.en;
}

function incomingTranslationIsUncertain(metadata = {}, originalQuestion = '', languages = {}) {
  if (!metadata?.fallbackUsed) return false;
  if (supervisorService.shouldPreserveOriginalTransferLanguage(originalQuestion, languages)) return false;
  return !supervisorService.hasCompleteNativeIntentCoverage(originalQuestion);
}

function appendTranslationUncertaintyNotice(reply = '', userLanguage = '') {
  const notice = translationUncertaintyNotice(userLanguage);
  const text = String(reply || '').trim();
  if (!text) return notice;
  if (text.includes(notice)) return text;
  return `${text}\n\n${notice}`;
}

function recordIncomingTranslationUncertainty(plan, aggregatedResult, metadata = {}) {
  if (!Array.isArray(aggregatedResult.warnings)) aggregatedResult.warnings = [];
  if (!aggregatedResult.warnings.includes(INCOMING_TRANSLATION_INCOMPLETE_WARNING)) {
    aggregatedResult.warnings.push(INCOMING_TRANSLATION_INCOMPLETE_WARNING);
  }
  if (aggregatedResult.status === 'completed' || aggregatedResult.status === 'success' || aggregatedResult.status === 'empty') {
    aggregatedResult.status = 'partial';
  }
  if (plan.status === 'completed') plan.status = 'partial';
  if (!Array.isArray(plan.warnings)) plan.warnings = [];
  if (!plan.warnings.includes(INCOMING_TRANSLATION_INCOMPLETE_WARNING)) {
    plan.warnings.push(INCOMING_TRANSLATION_INCOMPLETE_WARNING);
  }
  plan.incomingTranslation = {
    fallbackUsed: true,
    errorCode: String(metadata.errorCode || '').trim(),
    failureType: String(metadata.failureType || '').trim(),
  };
  plan.updatedAt = new Date().toISOString();
  storeSupervisorPlan(plan, 'storeIncomingTranslationUncertainty');
}

function explicitDomainReplyLanguage(aggregatedResult = {}) {
  const domainResults = Array.isArray(aggregatedResult.domainResults) ? aggregatedResult.domainResults : [];
  const useful = domainResults.find((result) => (
    ['completed', 'success', 'partial'].includes(String(result?.status || '').trim())
    && String(result?.output?.message || '').trim()
  ));
  return languagePrimary(useful?.output?.responseLanguage);
}

function responseAlreadyMatchesUserLanguage(response = {}, userLanguage = '') {
  const replyLanguage = languagePrimary(response.replyLanguage);
  const targetLanguage = languagePrimary(userLanguage);
  return Boolean(replyLanguage && targetLanguage && replyLanguage === targetLanguage);
}

function deliveredTextLanguage(text = '') {
  return languagePrimary(languageDetectionService.detectLanguage(text).language);
}

function deliveredTextAlreadyInLanguage(text = '', language = '') {
  const textLanguage = deliveredTextLanguage(text);
  const targetLanguage = languagePrimary(language);
  return Boolean(textLanguage && targetLanguage && textLanguage === targetLanguage);
}

function logSupervisorWarning(stage, error) {
  const message = error && error.message ? error.message : 'unknown error';
  console.warn(`Supervisor integration warning: ${stage}: ${message}`);
}

function storeSupervisorPlan(plan, stage) {
  const storage = supervisorService.storePlan(plan);

  if (!storage.stored) {
    logSupervisorWarning(stage, new Error(storage.errors.join('; ')));
    return false;
  }

  return true;
}

function normalizeBusinessDomainAnswer(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[_/,-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function isExactBusinessDomainClarificationAnswer(message = '', selectedDomain = '') {
  const normalized = normalizeBusinessDomainAnswer(message);
  if (!normalized || !selectedDomain) return false;

  const exactAnswers = {
    employment_salary: ['employment salary', 'employment and salary'],
    finance_consumer: ['finance consumer', 'finance and consumer'],
    health_life_community: ['health life community', 'health and life and community'],
  };

  return (exactAnswers[selectedDomain] || []).includes(normalized);
}

function getConversationKey(userContext) {
  return `${userContext.channel}:${userContext.channelUserId || 'local-web-user'}`;
}

function getRecentConversation(userContext) {
  return recentConversationByUser.get(getConversationKey(userContext)) || [];
}

function rememberConversation(userContext, question, answer) {
  const key = getConversationKey(userContext);
  const recent = getRecentConversation(userContext);
  const createdAt = new Date().toISOString();
  recent.push({
    question,
    answer,
    createdAt,
  });
  recentConversationByUser.set(key, recent.slice(-5));

  try {
    conversationMemoryService.addMessage(key, {
      role: 'user',
      content: question,
      timestamp: createdAt,
      metadata: {
        source: 'core-agent',
      },
    });
    conversationMemoryService.addMessage(key, {
      role: 'assistant',
      content: answer,
      timestamp: createdAt,
      metadata: {
        source: 'core-agent',
      },
    });
  } catch (error) {
    // Short-term context should never block the chat response.
  }
}

function attachSupervisorPlanIfEnabled({
  messageContext,
  userContext,
  originalQuestion,
  conversationId,
  languageResolution,
  savedLanguage,
  memorySnapshot,
  workingMemory,
  conversationContext,
  profile,
}) {
  if (!isSupervisorIntegrationEnabled() || isActiveSupervisorDeliveryEnabled()) {
    return null;
  }

  try {
    const requestContext = supervisorService.createRequestContext({
      requestId: messageContext.requestId || createInternalRequestId(),
      conversationId,
      userId: profile?.userId || null,
      message: originalQuestion,
      detectedLanguage: languageResolution?.language || null,
      preferredLanguage: savedLanguage?.preferredLanguage || null,
      memorySnapshot,
      workingMemory,
      recentContext: conversationContext?.messages || [],
      metadata: {
        channel: userContext.channel,
        channelUserId: userContext.channelUserId,
      },
    });
    const plan = supervisorService.createPlan(requestContext);
    const validation = supervisorService.validatePlan(plan);

    if (!validation.valid) {
      logSupervisorWarning('validatePlan', new Error(validation.errors.join('; ')));
      return null;
    }

    if (!storeSupervisorPlan(plan, 'storePlan')) {
      return null;
    }

    const storedPlan = supervisorService.getPlan(plan.requestId) || plan;
    messageContext.supervisorPlan = storedPlan;
    userContext.supervisorPlan = storedPlan;
    return storedPlan;
  } catch (error) {
    logSupervisorWarning('createDraftPlan', error);
    return null;
  }
}

async function buildActiveSupervisorResponse({
  messageContext,
  userContext,
  originalQuestion,
  question,
  conversationId,
  languageResolution,
  savedLanguage,
  memorySnapshot,
  workingMemory,
  conversationContext,
  profile,
  userLanguage,
  incomingTranslationUncertain = false,
  incomingTranslationMetadata = null,
}) {
  if (!isActiveSupervisorDeliveryEnabled()) {
    return null;
  }

  try {
    const requestContext = supervisorService.createRequestContext({
      requestId: messageContext.requestId || createInternalRequestId(),
      conversationId,
      userId: profile?.userId || null,
      message: question || originalQuestion,
      detectedLanguage: languageResolution?.language || null,
      preferredLanguage: savedLanguage?.preferredLanguage || null,
      memorySnapshot,
      workingMemory,
      recentContext: conversationContext?.messages || [],
      metadata: {
        channel: userContext.channel,
        channelUserId: userContext.channelUserId,
      },
      profile,
    });
    const waitingPlan = supervisorService.getWaitingPlanForConversation(conversationId);
    const waitingForBusinessDomain = Boolean(waitingPlan?.missingInformation?.includes('business_domain'));
    const clarificationDomain = waitingForBusinessDomain
      ? supervisorService.resolveClarificationDomain(requestContext.message)
      : null;
    const requestPrimaryDomain = waitingForBusinessDomain
      ? supervisorService.detectPrimaryDomain(requestContext)
      : null;
    const shouldStartFreshPlan =
      waitingForBusinessDomain
      && requestPrimaryDomain
      && !isExactBusinessDomainClarificationAnswer(requestContext.message, clarificationDomain);

    if (shouldStartFreshPlan) {
      supervisorService.clearPlan(waitingPlan.requestId);
    }

    let plan = waitingPlan && !shouldStartFreshPlan
      ? (
          waitingForBusinessDomain
            ? supervisorService.buildClarificationContinuation(waitingPlan, requestContext)
            : supervisorService.buildTaskFollowUpContinuation(waitingPlan, requestContext)
        )
      : supervisorService.createPlan(requestContext);

    if (!plan) {
      plan = supervisorService.createPlan(requestContext);
    }
    let validation = supervisorService.validatePlan(plan);

    if (!validation.valid) {
      logSupervisorWarning('validatePlan', new Error(validation.errors.join('; ')));
      return null;
    }

    if (plan.requiresUserInput) {
      const domainMenu = Array.isArray(plan.missingInformation)
        && plan.missingInformation.includes('business_domain');
      if (incomingTranslationUncertain && domainMenu) {
        plan.requiresUserInput = false;
        plan.status = 'partial';
        plan.missingInformation = [];
        if (!Array.isArray(plan.warnings)) plan.warnings = [];
        if (!plan.warnings.includes(INCOMING_TRANSLATION_INCOMPLETE_WARNING)) {
          plan.warnings.push(INCOMING_TRANSLATION_INCOMPLETE_WARNING);
        }
        plan.incomingTranslation = {
          fallbackUsed: true,
          errorCode: String(incomingTranslationMetadata?.errorCode || '').trim(),
          failureType: String(incomingTranslationMetadata?.failureType || '').trim(),
        };
        plan.updatedAt = new Date().toISOString();
        storeSupervisorPlan(plan, 'storeIncomingLanguageFailure');
        return {
          reply: INCOMING_LANGUAGE_FAILURE_REPLY,
          replyLanguage: 'he',
          skipOutgoingTranslation: true,
          category: 'Supervisor',
          status: 'SUPERVISOR_PARTIAL',
        };
      }

      storeSupervisorPlan(plan, 'storeWaitingPlan');
      const reply = plan.clarificationQuestion
        ? `${plan.clarificationQuestion.question}\n\n${plan.clarificationQuestion.options
            .map((option) => option.label)
            .join('\n')}`
        : 'Which area do you need help with?';

      return {
        reply,
        category: 'Supervisor',
        status: 'SUPERVISOR_NEEDS_CLARIFICATION',
      };
    }

    const hasResumedTaskFollowUp = Boolean(
      waitingPlan
      && !waitingPlan.missingInformation?.includes('business_domain')
      && Array.isArray(plan.tasks)
      && plan.tasks.some((task) => task?.status === 'pending')
    );
    const executionRequestContext = plan.executionMessage
      ? {
          ...requestContext,
          requestId: plan.requestId,
          message: plan.executionMessage,
        }
      : {
          ...requestContext,
          requestId: plan.requestId,
        };

    if (!hasResumedTaskFollowUp) {
      plan = supervisorService.buildTaskSkeleton(plan, executionRequestContext);
    }
    plan = supervisorService.assignAgentsToTasks(plan);
    validation = supervisorService.validatePlan(plan);

    if (!validation.valid) {
      logSupervisorWarning('validateAssignedPlan', new Error(validation.errors.join('; ')));
      return null;
    }

    if (!storeSupervisorPlan(plan, 'storeAssignedPlan')) {
      return null;
    }

    const executedPlan = await supervisorService.executePlanTasks(plan);
    if (!storeSupervisorPlan(executedPlan, 'storeExecutedPlan')) {
      return null;
    }
    const aggregatedResult = supervisorService.aggregatePlanResults(executedPlan);
    if (incomingTranslationUncertain) {
      recordIncomingTranslationUncertainty(executedPlan, aggregatedResult, incomingTranslationMetadata);
    }
    let reply = await supervisorService.buildUserResponse(aggregatedResult, {
      resolvedLanguage: CORE_AGENT_RESPONSE_LANGUAGE,
      requestContext,
    });

    if (incomingTranslationUncertain) {
      reply = appendTranslationUncertaintyNotice(reply, userLanguage);
    }

    if (!String(reply || '').trim()) {
      return null;
    }

    const replyLanguage = explicitDomainReplyLanguage(aggregatedResult);
    return {
      reply,
      ...(replyLanguage ? { replyLanguage } : {}),
      category: 'Supervisor',
      status: `SUPERVISOR_${String(aggregatedResult.status || 'partial').toUpperCase()}`,
    };
  } catch (error) {
    logSupervisorWarning('activeDelivery', error);
    return null;
  }
}

async function attachSupervisorShadowIfEnabled({
  messageContext,
  userContext,
  originalQuestion,
  question,
  conversationId,
  languageResolution,
  savedLanguage,
  memorySnapshot,
  workingMemory,
  conversationContext,
  profile,
}) {
  if (!isSupervisorShadowModeEnabled()) {
    return null;
  }

  try {
    const requestContext = supervisorService.createRequestContext({
      requestId: messageContext.requestId || createInternalRequestId(),
      conversationId,
      userId: profile?.userId || null,
      message: question || originalQuestion,
      detectedLanguage: languageResolution?.language || null,
      preferredLanguage: savedLanguage?.preferredLanguage || null,
      memorySnapshot,
      workingMemory,
      recentContext: conversationContext?.messages || [],
      metadata: {
        channel: userContext.channel,
        channelUserId: userContext.channelUserId,
        mode: 'shadow',
      },
      profile,
    });
    const detectedIntents = supervisorService.detectIntents(requestContext);
    const tasks = supervisorService.createTasksFromIntents(requestContext, detectedIntents);
    const results = await supervisorService.executeTasksSequentially(tasks, {
      requestContext,
      shadow: true,
    });
    const synthesis = supervisorService.synthesizeResults(results);
    const composedResponse = supervisorService.composeResponse(synthesis);
    const shadow = {
      mode: 'shadow',
      requestId: requestContext.requestId,
      conversationId: requestContext.conversationId,
      detectedIntents,
      tasks,
      results,
      synthesis,
      composedResponse,
    };

    messageContext.supervisorShadow = shadow;
    userContext.supervisorShadow = shadow;
    return shadow;
  } catch (error) {
    logSupervisorWarning('shadowPipeline', error);
    messageContext.supervisorShadow = {
      mode: 'shadow',
      failed: true,
      error: 'shadow_pipeline_failed',
    };
    return null;
  }
}

function composeProfileMemoryTaskResponseForMessage(message = '') {
  return ({ capability = '', intent = '', profile = {}, profileUpdates = {} } = {}) => {
    if (capability === 'profile.memory_update' || intent === 'profile_update') {
      return formatProfileUpdateAcknowledgement(profileUpdates, profile);
    }

    if (capability === 'profile.field_recall' || intent === 'profile_field_recall') {
      return formatProfileRecallByIntent(profile, getProfileRecallIntent(message) || 'summary');
    }

    if (capability === 'profile.recall' || intent === 'profile_summary_recall') {
      return formatProfileRecallByIntent(profile, 'summary');
    }

    return '';
  };
}

async function buildLiveMultiIntentSupervisorResponse({
  messageContext,
  userContext,
  originalQuestion,
  question,
  conversationId,
  languageResolution,
  savedLanguage,
  memorySnapshot,
  workingMemory,
  conversationContext,
  profile,
  profileMemoryUpdates,
  userLanguage,
  incomingTranslationUncertain = false,
}) {
  if (!isSupervisorMultiIntentLiveEnabled()) {
    return null;
  }

  try {
    const requestContext = supervisorService.createRequestContext({
      requestId: messageContext.requestId || createInternalRequestId(),
      conversationId,
      userId: profile?.userId || null,
      message: question || originalQuestion,
      detectedLanguage: languageResolution?.language || null,
      preferredLanguage: savedLanguage?.preferredLanguage || null,
      memorySnapshot,
      workingMemory,
      recentContext: conversationContext?.messages || [],
      metadata: {
        channel: userContext.channel,
        channelUserId: userContext.channelUserId,
        mode: 'live_multi_intent',
      },
      profile,
      profileMemoryUpdates,
    });
    const detectedIntents = supervisorService.detectIntents(requestContext);

    if (!detectedIntents.isMultiIntent || detectedIntents.intents.length <= 1) {
      return null;
    }

    const tasks = supervisorService.createTasksFromIntents(requestContext, detectedIntents);
    if (tasks.length <= 1) {
      return null;
    }

    const results = await supervisorService.executeTasksSequentially(tasks, {
      requestContext,
      profileMemory: {
        composeTaskResponse: composeProfileMemoryTaskResponseForMessage(question || originalQuestion),
      },
    });
    const synthesis = supervisorService.synthesizeResults(results);
    let reply = supervisorService.composeResponse(synthesis);
    let status = `SUPERVISOR_MULTI_INTENT_${String(synthesis.status || 'partial').toUpperCase()}`;

    if (incomingTranslationUncertain) {
      if (synthesis.status === 'success' || synthesis.status === 'completed') {
        status = 'SUPERVISOR_MULTI_INTENT_PARTIAL';
      }
      reply = appendTranslationUncertaintyNotice(reply, userLanguage);
    }

    if (!String(reply || '').trim()) {
      return null;
    }

    return {
      reply,
      category: 'Supervisor',
      status,
      multiIntent: {
        handled: true,
        intentCount: detectedIntents.intents.length,
        resultCount: results.length,
      },
    };
  } catch (error) {
    logSupervisorWarning('multiIntentLive', error);
    return null;
  }
}

function shouldUseAiProvider(question, knowledgeResult) {
  const normalized = String(question || '').trim().toLowerCase();

  if (knowledgeResult.status === 'NOT_FOUND') return true;
  if (knowledgeResult.category === 'Other') return true;
  if (/^(hi|hello|hey|shalom|good morning|good evening|good afternoon|\u05e9\u05dc\u05d5\u05dd|\u05d4\u05d9\u05d9|\u05d0\u05d4\u05dc\u05df)\b/.test(normalized)) {
    return true;
  }

  return false;
}

function createFriendlyFallback(language) {
  if (String(language).toLowerCase().startsWith('he')) {
    return 'אני לא בטוח בתשובה כרגע, אבל גרינגו יבדוק ויחזור אליך עם תשובה.';
  }

  return "I'm not fully sure yet, but Gringo will check and come back with an answer.";
}

function isJobSearchMessage(message) {
  return /\b(looking for work|find me a job|job|jobs|work|construction work)\b|\u05e2\u05d1\u05d5\u05d3\u05d4|\u05de\u05d7\u05e4\u05e9 \u05e2\u05d1\u05d5\u05d3\u05d4|\u05d1\u05e0\u05d9\u05d9\u05d4/.test(
    String(message || '').toLowerCase()
  );
}

function isMoneyMessage(message) {
  return /\b(exchange rate|baht|send money|money transfer|transfer companies|cheapest way|best way to send|shekels|compare money)\b|\u05d1\u05d0\u05d8|\u05db\u05e1\u05e3|\u05dc\u05e9\u05dc\u05d5\u05d7|\u05dc\u05ea\u05d0\u05d9\u05dc\u05e0\u05d3|\u05de\u05e9\u05ea\u05dc\u05dd/.test(
    String(message || '').toLowerCase()
  );
}

function isHousingMessage(message) {
  return /\b(room|apartment|housing|shared room|bed space|place to live|rent)\b|\u05d7\u05d3\u05e8|\u05d3\u05d9\u05e8\u05d4|\u05de\u05d2\u05d5\u05e8\u05d9\u05dd|\u05de\u05d7\u05e4\u05e9 \u05d7\u05d3\u05e8|\u05de\u05d7\u05e4\u05e9 \u05d3\u05d9\u05e8\u05d4/.test(
    String(message || '').toLowerCase()
  );
}

function isCommunityMessage(message) {
  return /\b(community updates|community|what is new today|what's new today|news from|discussions?|updates today|new today)\b|\u05e2\u05d3\u05db\u05d5\u05e0\u05d9\u05dd \u05de\u05d4\u05e7\u05d4\u05d9\u05dc\u05d4|\u05de\u05d4 \u05d7\u05d3\u05e9 \u05d4\u05d9\u05d5\u05dd|\u05ea\u05e8\u05d0\u05d4 \u05dc\u05d9 \u05e2\u05d3\u05db\u05d5\u05e0\u05d9\u05dd/.test(
    String(message || '').toLowerCase()
  );
}

function isDocumentMessage(message) {
  return /\b(document|documents|passport|visa|work permit|contract|health insurance|payslip|bank document|residence document|driving license|medical document|expire|expires|expiry|missing documents)\b|\u05d5\u05d5\u05d9\u05d6\u05d4|\u05d5\u05d9\u05d6\u05d4|\u05d3\u05e8\u05db\u05d5\u05df|\u05de\u05e1\u05de\u05db\u05d9\u05dd|\u05e4\u05d2\u05d4|\u05dc\u05e4\u05d5\u05d2/.test(
    String(message || '').toLowerCase()
  );
}

function inferDocumentType(message = '') {
  const normalized = String(message || '').toLowerCase();
  if (/\bpassport\b|\u05d3\u05e8\u05db\u05d5\u05df/.test(normalized)) return 'Passport';
  if (/\bvisa\b|\u05d5\u05d9\u05d6\u05d4|\u05d5\u05d5\u05d9\u05d6\u05d4/.test(normalized)) return 'Visa';
  if (/\bwork permit\b/.test(normalized)) return 'Work Permit';
  if (/\bcontract|employment contract\b/.test(normalized)) return 'Employment Contract';
  if (/\bhealth insurance|insurance\b/.test(normalized)) return 'Health Insurance';
  if (/\bpayslip\b/.test(normalized)) return 'Payslip';
  if (/\bbank\b/.test(normalized)) return 'Bank Document';
  if (/\bresidence\b/.test(normalized)) return 'Residence Document';
  if (/\bdriving license|driver/.test(normalized)) return 'Driving License';
  if (/\bmedical\b/.test(normalized)) return 'Medical Document';
  return '';
}

function extractExpiryDate(message = '') {
  const match = String(message || '').match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match ? match[1] : '';
}

function isMissingDocumentsQuestion(message = '') {
  return /\bmissing documents|documents am i missing|what documents.*missing\b|\u05d0\u05d9\u05dc\u05d5 \u05de\u05e1\u05de\u05db\u05d9\u05dd \u05d7\u05e1\u05e8\u05d9\u05dd/.test(
    String(message || '').toLowerCase()
  );
}

function isAddDocumentMessage(message = '') {
  return /\b(add my|save my|my .* expires|expires soon|passport expires|visa expires|work permit expires)\b|\u05e2\u05d5\u05de\u05d3 \u05dc\u05e4\u05d5\u05d2/.test(
    String(message || '').toLowerCase()
  );
}

function documentQuestionForMissing(type) {
  if (type) return `What is the expiry date for your ${type}? Please use YYYY-MM-DD.`;
  return 'Which document should I save or check?';
}

function isGoalCompletionMessage(message) {
  return /\b(i found a job|found a job|got a job|i got work|i found an apartment|found an apartment|i found housing|found housing|found a room|i found a room|i no longer need this alert|no longer need this alert|stop this alert|stop alerts|stop alert)\b/.test(
    String(message || '').toLowerCase()
  );
}

function normalizeIntentText(message = '') {
  return String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProfileRecallMessage(message = '') {
  return Boolean(getProfileRecallIntent(message));
}

function getProfileRecallIntent(message = '') {
  const normalized = normalizeIntentText(message);
  if (!normalized) return '';

  if (
    /\bwhere do i work\b/.test(normalized)
    || /\bwho is my employer\b/.test(normalized)
    || /\bwhat company do i work for\b/.test(normalized)
    || /\bwho do i work for\b/.test(normalized)
    || /\bwhere am i working\b/.test(normalized)
  ) {
    return 'currentEmployer';
  }

  if (/\bwhat is my profession\b/.test(normalized) || /\bwhat is my job\b/.test(normalized)) {
    return 'profession';
  }

  if (
    /\bwhere do i live\b/.test(normalized)
    || /\bwhat city am i in\b/.test(normalized)
    || /\bwhich city am i in\b/.test(normalized)
    || /\bwhere am i living\b/.test(normalized)
  ) {
    return 'city';
  }

  if (
    /\bwhat language do i speak\b/.test(normalized)
    || /\bwhich language do i speak\b/.test(normalized)
    || /\bwhat is my language\b/.test(normalized)
  ) {
    return 'language';
  }

  if (
    /\bwhat currency do i prefer\b/.test(normalized)
    || /\bwhich currency do i prefer\b/.test(normalized)
    || /\bwhat is my preferred currency\b/.test(normalized)
  ) {
    return 'preferredCurrency';
  }

  if (
    /\bdo i have job alerts enabled\b/.test(normalized)
    || /\bare my job alerts enabled\b/.test(normalized)
    || /\bdo i want job alerts\b/.test(normalized)
  ) {
    return 'wantsJobAlerts';
  }

  if (
    /\bwhat do you remember about me\b/.test(normalized)
    || /\bwhat do you know about me\b/.test(normalized)
    || /\bwho am i\b/.test(normalized)
    || /\bshow me my profile\b/.test(normalized)
    || /\btell me about myself\b/.test(normalized)
    || /\bdo you remember me\b/.test(normalized)
    || /\bdon t you remember me\b/.test(normalized)
    || normalized === 'my profile'
    || /\bmy profile\b/.test(normalized)
  ) {
    return 'summary';
  }

  return '';
}

function readableList(items = []) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values.join('');
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function formatProfileRecall(profile = {}) {
  return formatProfileRecallByIntent(profile, 'summary');
}

function formatMissingProfileField(profile = {}, label) {
  const name = String(profile.fullName || '').trim();
  const intro = name ? `I do not have that saved yet, ${name}.` : 'I do not have that saved yet.';
  return `${intro} You can tell me, and I will remember it.`;
}

function formatProfileRecallByIntent(profile = {}, intent = 'summary') {
  if (!intent || intent === 'summary') return formatProfileRecallSummary(profile);

  const name = String(profile.fullName || '').trim();
  const intro = name ? `${name}, ` : '';
  const employer = String(profile.currentEmployer || '').trim();
  const profession = String(profile.profession || '').trim();
  const city = String(profile.city || '').trim();
  const language = String(profile.preferredLanguage || profile.language || profile.detectedLanguage || '').trim();
  const currency = String(profile.preferredCurrency || '').trim();

  if (intent === 'currentEmployer') {
    return employer ? `${intro}you work for ${employer}.` : formatMissingProfileField(profile, 'employer');
  }

  if (intent === 'profession') {
    return profession ? `${intro}your profession is ${profession}.` : formatMissingProfileField(profile, 'profession');
  }

  if (intent === 'city') {
    return city ? `${intro}you are currently in ${city}.` : formatMissingProfileField(profile, 'city');
  }

  if (intent === 'language') {
    return language ? `${intro}you speak ${language}.` : formatMissingProfileField(profile, 'language');
  }

  if (intent === 'preferredCurrency') {
    return currency ? `${intro}you prefer ${currency}.` : formatMissingProfileField(profile, 'preferred currency');
  }

  if (intent === 'wantsJobAlerts') {
    if (profile.wantsJobAlerts === 'Yes') return `${intro}yes, your job alerts are enabled.`;
    if (profile.wantsJobAlerts === 'No') return `${intro}no, your job alerts are turned off.`;
    return formatMissingProfileField(profile, 'job alert preference');
  }

  return formatProfileRecallSummary(profile);
}

function formatProfileRecallSummary(profile = {}) {
  const name = String(profile.fullName || '').trim();
  const intro = name ? `Of course, ${name}.` : 'Of course.';
  const facts = [];
  const origin = String(profile.country || '').trim();
  const language = String(profile.preferredLanguage || profile.language || profile.detectedLanguage || '').trim();
  const profession = String(profile.profession || '').trim();
  const workSector = String(profile.workSector || '').trim();
  const currentEmployer = String(profile.currentEmployer || '').trim();
  const city = String(profile.city || '').trim();
  const jobInterest = profile.lookingForJob === 'Yes' || profile.wantsJobAlerts === 'Yes';
  const moneyInterest = profile.interestedInMoneyTransfers === 'Yes' || profile.wantsExchangeRateAlerts === 'Yes';
  const housingInterest = profile.lookingForHousing === 'Yes';
  const currency = String(profile.preferredCurrency || '').trim();
  const interests = String(profile.interests || '').trim();
  const activeGoals = String(profile.activeGoals || '').trim();

  if (origin) facts.push(`you're from ${origin}`);
  if (language) facts.push(`you speak ${language}`);

  if (workSector && profession) {
    facts.push(`you work in ${workSector} as ${profession}`);
  } else if (profession) {
    facts.push(`you work as ${profession}`);
  } else if (workSector) {
    facts.push(`you work in ${workSector}`);
  }

  if (currentEmployer) facts.push(`you work for ${currentEmployer}`);
  if (city) facts.push(`you're currently in ${city}`);
  if (jobInterest) facts.push(`you're interested in job opportunities`);
  if (profile.wantsJobAlerts === 'Yes') facts.push(`you have job alerts enabled`);
  if (currency) facts.push(`you prefer ${currency}`);
  if (moneyInterest && profile.wantsExchangeRateAlerts === 'Yes') facts.push(`you have exchange-rate alerts enabled`);
  if (housingInterest) facts.push(`you're looking for housing`);
  if (interests) facts.push(`your interests include ${interests}`);
  if (activeGoals) facts.push(`your current goals include ${activeGoals}`);

  if (!facts.length) {
    return `${intro} I have your profile, but it does not have many details saved yet.`;
  }

  return `${intro} I remember that ${readableList(facts)}.`;
}

function formatProfileUpdateValue(field, value) {
  if (field === 'wantsJobAlerts') {
    return value === 'Yes' ? 'you want job alerts' : 'you do not want job alerts';
  }
  if (field === 'lookingForJob') return 'you are looking for work';
  if (field === 'lookingForHousing') return 'you are looking for housing';
  if (field === 'preferredJobCity') return `you prefer job opportunities in ${value}`;
  if (field === 'preferredJobProfession') return `you prefer ${value} job opportunities`;
  if (field === 'preferredHousingCity') return `you are looking for housing in ${value}`;
  if (field === 'preferredCurrency') return `you prefer ${value}`;
  if (field === 'currentEmployer') return `you work for ${value}`;
  if (field === 'profession') return `your profession is ${value}`;
  if (field === 'workSector') return `you work in ${value}`;
  if (field === 'city') return `you are now in ${value}`;
  if (field === 'country') return `you are from ${value}`;
  if (field === 'fullName') return `your name is ${value}`;
  return '';
}

function formatProfileUpdateAcknowledgement(updates = {}, profile = {}) {
  const name = String(profile.fullName || '').trim();
  const facts = Object.entries(updates)
    .filter(([field]) => field !== 'lastActivityAt')
    .map(([field, value]) => formatProfileUpdateValue(field, String(value || '').trim()))
    .filter(Boolean);
  const intro = name ? `Got it, ${name}.` : 'Got it.';

  if (!facts.length) {
    return `${intro} I updated your profile.`;
  }

  return `${intro} I will remember that ${readableList(facts)}.`;
}

function hasFollowUpRequest(message = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  const normalized = normalizeIntentText(text);
  if (text.includes('?')) return true;
  return (
    /\b(can you|could you|please|find|show|search|help|tell me|what|where|which|how|are there|do you know)\b/.test(normalized)
    || /\b(exchange rate|jobs near me|documents|notifications|rights)\b/.test(normalized)
  );
}

function formatGoalCompletionReply(message) {
  const normalized = String(message || '').toLowerCase();
  if (/\bjob|work\b/.test(normalized)) return 'Great. I marked your job search as completed.';
  if (/\balert|alerts\b/.test(normalized)) return 'Got it. I turned off that active alert and kept the history in your profile.';
  return 'Great. I marked your housing search as completed.';
}

function idList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function preferUnseen(items = [], idKey, seenValue = '') {
  const seenIds = new Set(idList(seenValue));
  const unseen = items.filter((item) => !seenIds.has(item[idKey]));
  return unseen.length ? unseen : items;
}

function extractHousingContext(message, userProfile = {}) {
  const normalized = String(message || '').toLowerCase();
  const context = {};
  const budgetMatch = String(message || '').replace(/,/g, '').match(/\b(\d+(?:\.\d+)?)\b/);

  if (/\btel aviv\b|\u05ea\u05dc \u05d0\u05d1\u05d9\u05d1/.test(normalized)) context.city = 'Tel Aviv';
  else if (/\bashdod\b/.test(normalized)) context.city = 'Ashdod';
  else if (/\bjerusalem\b/.test(normalized)) context.city = 'Jerusalem';

  if (/\bshared room\b/.test(normalized)) context.housingType = 'Shared Room';
  else if (/\broom\b|\u05d7\u05d3\u05e8/.test(normalized)) context.housingType = 'Room';
  else if (/\bapartment\b|\u05d3\u05d9\u05e8\u05d4/.test(normalized)) context.housingType = 'Apartment';
  else if (/\bbed space\b/.test(normalized)) context.housingType = 'Bed Space';
  else if (/\bemployer housing\b/.test(normalized)) context.housingType = 'Employer Housing';

  if (budgetMatch) context.maximumMonthlyBudget = Number(budgetMatch[1]);

  return {
    lookingForHousing: 'Yes',
    preferredHousingCity: context.city || userProfile.preferredHousingCity || userProfile.city || '',
    preferredHousingArea: context.area || userProfile.preferredHousingArea || '',
    preferredHousingType: context.housingType || userProfile.preferredHousingType || '',
    maximumHousingBudget: context.maximumMonthlyBudget || userProfile.maximumHousingBudget || userProfile.maximumMonthlyBudget || '',
    maximumMonthlyBudget: context.maximumMonthlyBudget || userProfile.maximumMonthlyBudget || userProfile.maximumHousingBudget || '',
    preferredMoveInDate: userProfile.preferredMoveInDate || '',
  };
}

function extractAmount(message) {
  const match = String(message || '').replace(/,/g, '').match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? Number(match[1]) : 0;
}

function extractMoneyContext(message, userProfile = {}) {
  const normalized = String(message || '').toLowerCase();
  const context = {
    amount: extractAmount(message),
    sourceCurrency: 'ILS',
    targetCurrency: userProfile.preferredCurrency || '',
    country: userProfile.moneyTransferCountry || userProfile.country || '',
  };

  if (/\bthailand\b|\u05ea\u05d0\u05d9\u05dc\u05e0\u05d3/.test(normalized)) {
    context.country = 'Thailand';
    context.targetCurrency = 'THB';
  }

  if (/\bbaht|thb\b|\u05d1\u05d0\u05d8/.test(normalized)) {
    context.targetCurrency = 'THB';
  } else if (/\blkr|sri lanka\b/.test(normalized)) {
    context.targetCurrency = 'LKR';
  } else if (/\binr|india\b/.test(normalized)) {
    context.targetCurrency = 'INR';
  } else if (/\bphp|philippines\b/.test(normalized)) {
    context.targetCurrency = 'PHP';
  }

  return context;
}

function formatExchangeRateForChat(rate, sourceCurrency, targetCurrency) {
  if (!rate) {
    return `I do not have a verified demo rate for ${sourceCurrency} to ${targetCurrency} yet. ${moneyService.SAFETY_NOTICE}`;
  }

  if (rate.rateType === 'reference') {
    return [
      `The reference exchange rate is 1 ${sourceCurrency} = ${rate.exchangeRate} ${targetCurrency}.`,
      `Source: ${rate.sourceName}. Provider rate date: ${rate.providerUpdatedAt || rate.updatedAt || 'unknown'}. Retrieved by Gringo: ${rate.retrievedAt || 'unknown'}.`,
      'This is a reference market rate, not a provider customer rate, live quote, or confirmed transfer offer.',
      moneyService.SAFETY_NOTICE,
    ].join('\n');
  }

  return [
    `${moneyService.DEMO_NOTICE}`,
    `The demo exchange rate is 1 ${sourceCurrency} = ${rate.exchangeRate} ${targetCurrency}.`,
    moneyService.SAFETY_NOTICE,
  ].join('\n');
}

function extractJobSearchContext(message, userProfile = {}) {
  const normalized = String(message || '').toLowerCase();
  const context = {};

  if (/\bconstruction\b|\u05d1\u05e0\u05d9\u05d9\u05d4/.test(normalized)) {
    context.workSector = 'Construction';
  } else if (/\bagriculture\b/.test(normalized)) {
    context.workSector = 'Agriculture';
  } else if (/\bcaregiving|caregiver\b/.test(normalized)) {
    context.workSector = 'Caregiving';
  }

  if (/\btel aviv\b/.test(normalized)) {
    context.city = 'Tel Aviv';
  } else if (/\bashkelon\b/.test(normalized)) {
    context.city = 'Ashkelon';
  } else if (/\bjerusalem\b/.test(normalized)) {
    context.city = 'Jerusalem';
  }

  if (context.workSector === 'Construction') {
    context.profession = userProfile.profession || 'Construction worker';
  }

  return context;
}

async function loadUserProfile(userContext) {
  try {
    const user = await crmAgentService.findOrCreateUser(userContext);
    return crmAgentService.getUserMemory(user.userId);
  } catch (error) {
    return null;
  }
}

function hasMeaningfulProfileUpdates(updates = {}) {
  return Object.keys(updates).some((key) => key !== 'lastActivityAt' && String(updates[key] || '').trim() !== '');
}

function isChannelControlMessage(message = '') {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith('/')) return true;
  if (normalized.startsWith('[callback:')) return true;
  if (/^link(?:\s|$)/i.test(normalized)) return true;
  if (/^unlink(?:\s|$)/i.test(normalized)) return true;
  return false;
}

async function resolveIncomingProcessingText(originalText, languageResolution) {
  const originalLanguage = languageResolution.language || CORE_AGENT_WORKING_LANGUAGE;
  const metadata = {
    originalLanguage,
    processingLanguage: CORE_AGENT_WORKING_LANGUAGE,
    translated: false,
    provider: translationService.getProviderName(),
    fallbackUsed: false,
  };

  if (
    !String(originalText || '').trim() ||
    originalLanguage === CORE_AGENT_WORKING_LANGUAGE ||
    isChannelControlMessage(originalText)
  ) {
    return {
      processingText: originalText,
      metadata,
    };
  }

  try {
    const result = await translationService.translateText(originalText, originalLanguage, CORE_AGENT_WORKING_LANGUAGE);
    metadata.provider = result.provider;
    metadata.translated = Boolean(result.translated);
    metadata.fallbackUsed = Boolean(result.fallbackUsed);
    if (result.errorCode) metadata.errorCode = result.errorCode;
    if (result.failureType) metadata.failureType = result.failureType;

    return {
      processingText: result.translated && !result.fallbackUsed ? result.translatedText : originalText,
      metadata,
    };
  } catch (error) {
    return {
      processingText: originalText,
      metadata: {
        ...metadata,
        fallbackUsed: true,
        failureType: 'exception',
      },
    };
  }
}

function protectOutgoingText(text = '') {
  const protectedValues = [];
  const pattern =
    /(`[^`]+`|https?:\/\/[^\s)]+|\b[A-Z]{2,}[-_][A-Z0-9_-]+\b|\b[A-Z0-9]{6,}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d+(?:[,.]\d+)?\s?(?:NIS|ILS|THB|USD|EUR|LKR|INR|PHP)\b|\+?\d[\d\s().-]{6,}\d)/g;
  const protectedText = String(text || '').replace(pattern, (value) => {
    const token = `__GRINGO_KEEP_${protectedValues.length}__`;
    protectedValues.push({ token, value });
    return token;
  });

  return {
    protectedText,
    restore(value = '') {
      return protectedValues.reduce((result, item) => result.split(item.token).join(item.value), String(value || ''));
    },
  };
}

async function applyOutgoingTranslation(response = {}, targetLanguage = CORE_AGENT_RESPONSE_LANGUAGE) {
  const originalResponse = String(response.reply || '');
  const metadata = {
    sourceLanguage: CORE_AGENT_RESPONSE_LANGUAGE,
    targetLanguage: targetLanguage || CORE_AGENT_RESPONSE_LANGUAGE,
    translated: false,
    provider: translationService.getProviderName(),
    fallbackUsed: false,
  };

  const finalized = {
    ...response,
    reply: originalResponse,
  };

  if (
    !originalResponse.trim()
    || metadata.targetLanguage === CORE_AGENT_RESPONSE_LANGUAGE
    || deliveredTextAlreadyInLanguage(originalResponse, metadata.targetLanguage)
  ) {
    Object.defineProperty(finalized, OUTGOING_TRANSLATION_METADATA, {
      value: {
        ...metadata,
        originalResponse,
        deliveryResponse: finalized.reply,
      },
      enumerable: false,
    });
    return finalized;
  }

  try {
    const protectedResponse = protectOutgoingText(originalResponse);
    const result = await translationService.translateText(
      protectedResponse.protectedText,
      CORE_AGENT_RESPONSE_LANGUAGE,
      metadata.targetLanguage
    );
    metadata.provider = result.provider;
    metadata.translated = Boolean(result.translated);
    metadata.fallbackUsed = Boolean(result.fallbackUsed);
    if (result.errorCode) metadata.errorCode = result.errorCode;
    if (result.failureType) metadata.failureType = result.failureType;

    if (result.translated && !result.fallbackUsed) {
      finalized.reply = protectedResponse.restore(result.translatedText);
    }
  } catch (error) {
    metadata.fallbackUsed = true;
    metadata.failureType = 'exception';
  }

  const outgoingDelivered = metadata.translated && !metadata.fallbackUsed;
  const showHebrewTranslationNotice = metadata.targetLanguage !== CORE_AGENT_RESPONSE_LANGUAGE
    && languagePrimary(metadata.targetLanguage) === 'he'
    && !outgoingDelivered
    && !deliveredTextAlreadyInLanguage(finalized.reply, metadata.targetLanguage)
    && !finalized.reply.includes(OUTGOING_HEBREW_TRANSLATION_NOTICE)
    && !finalized.reply.includes(TRANSLATION_UNCERTAINTY_NOTICE.he)
    && !finalized.reply.includes(INCOMING_LANGUAGE_FAILURE_REPLY);
  if (showHebrewTranslationNotice) {
    finalized.reply = `${OUTGOING_HEBREW_TRANSLATION_NOTICE}\n\n${finalized.reply}`;
    finalized.responseTranslation = {
      fallbackUsed: true,
      errorCode: String(metadata.errorCode || '').trim(),
      failureType: String(metadata.failureType || '').trim(),
    };
  }

  Object.defineProperty(finalized, OUTGOING_TRANSLATION_METADATA, {
    value: {
      ...metadata,
      originalResponse,
      deliveryResponse: finalized.reply,
    },
    enumerable: false,
  });
  return finalized;
}

async function applyPersonalization(question, userContext, loadedProfile = null) {
  const hasLoadedProfile = loadedProfile && loadedProfile.userId;
  const user = hasLoadedProfile ? loadedProfile : await crmAgentService.findOrCreateUser(userContext);
  const currentProfile = hasLoadedProfile ? loadedProfile : (await crmAgentService.getUserMemory(user.userId)) || user;
  const pendingUpdates = personalizationService.answerPendingNeed(question, currentProfile);
  const goalUpdates = personalizationService.updateGoalsFromMessage(question, {
    ...currentProfile,
    ...pendingUpdates,
  });
  const profileMemory = personalizationService.extractExplicitProfileUpdates(question, {
    ...currentProfile,
    ...pendingUpdates,
    ...goalUpdates,
  });
  const updates = {
    ...pendingUpdates,
    ...goalUpdates,
    ...profileMemory.updates,
  };

  if (Object.keys(updates).length > 0) {
    try {
      const updatedProfile = await crmAgentService.updateUserProfile(user.userId, updates);
      return {
        user,
        profile: updatedProfile,
        pendingUpdates,
        goalUpdates,
        profileMemoryUpdates: profileMemory.updates,
        profileMemoryFields: profileMemory.fieldNames,
      };
    } catch (error) {
      return {
        user,
        profile: {
          ...currentProfile,
          ...updates,
        },
        pendingUpdates,
        goalUpdates,
        profileMemoryUpdates: profileMemory.updates,
        profileMemoryFields: profileMemory.fieldNames,
      };
    }
  }

  return {
    user,
    profile: currentProfile,
    pendingUpdates,
    goalUpdates,
    profileMemoryUpdates: profileMemory.updates,
    profileMemoryFields: profileMemory.fieldNames,
  };
}

async function receiveMessage(messageContext) {
  return {
    status: 'placeholder',
    agent: 'core-agent',
    nextStep: 'knowledge-agent',
    messageContext,
  };
}

async function routeMessage(messageContext) {
  return {
    status: 'placeholder',
    agent: 'core-agent',
    route: 'knowledge-agent',
    messageContext,
  };
}

async function coordinateAgents(agentContext) {
  const user = await crmAgentService.findOrCreateUser(agentContext.userContext || {});
  await crmAgentService.saveConversation({
    userId: user.userId,
    channel: user.channel,
    question: agentContext.question,
    answer: agentContext.answer,
    category: agentContext.category,
    status: agentContext.status,
    needsHumanFollowUp: agentContext.needsHumanFollowUp,
  });
  await crmAgentService.extractAndUpdateMemory(user.userId, agentContext.question || '');

  return {
    status: 'placeholder',
    agent: 'core-agent',
    crmAgent: {
      userId: user.userId,
      conversationSaved: true,
      memoryUpdated: true,
    },
    agentContext,
  };
}

async function getPersonalizedStartup(userContext = {}) {
  const user = await crmAgentService.findOrCreateUser(userContext);
  const profile = (await crmAgentService.getUserMemory(user.userId)) || user;
  const summaryLines = [];
  const updates = {
    lastActivityAt: new Date().toISOString(),
  };

  if (
    profile.lookingForJob === 'Yes' &&
    profile.wantsJobAlerts !== 'No' &&
    personalizationService.hasActiveGoal(profile, 'Find Job')
  ) {
    const matchingJobs = await jobService.findMatchingJobs(profile, {
      city: profile.preferredJobCity || profile.city,
      profession: profile.preferredJobProfession || profile.profession,
    });
    const jobs = preferUnseen(matchingJobs, 'jobId', profile.lastRecommendedJobIds);
    if (jobs.length > 0) {
      summaryLines.push(`${jobs.length} ${profile.preferredJobProfession || profile.profession || 'job'} option${jobs.length === 1 ? '' : 's'} in ${profile.preferredJobCity || profile.city || 'your area'}`);
      updates.lastRecommendedJobIds = jobs
        .slice(0, 5)
        .map((job) => job.jobId)
        .join(', ');
    }
  }

  if (profile.lookingForHousing === 'Yes' && personalizationService.hasActiveGoal(profile, 'Find Housing')) {
    const matchingListings = await housingService.findMatchingHousing(profile, {
      city: profile.preferredHousingCity || profile.city,
      maximumMonthlyBudget: profile.maximumHousingBudget || profile.maximumMonthlyBudget,
    });
    const listings = preferUnseen(matchingListings, 'housingId', profile.lastRecommendedHousingIds);
    if (listings.length > 0) {
      summaryLines.push(`${listings.length} housing option${listings.length === 1 ? '' : 's'} within your budget`);
      updates.lastRecommendedHousingIds = listings
        .slice(0, 5)
        .map((listing) => listing.housingId)
        .join(', ');
    }
  }

  if (personalizationService.hasActiveGoal(profile, 'Follow Community Updates')) {
    const matchingPosts = await communityService.getRelevantPosts(profile);
    const posts = preferUnseen(matchingPosts, 'postId', profile.lastRelevantPostIds);
    if (posts.length > 0) {
      summaryLines.push(`${Math.min(posts.length, 3)} community update${posts.length === 1 ? '' : 's'} for ${profile.country || profile.workSector || 'you'}`);
      updates.lastRelevantPostIds = posts
        .slice(0, 5)
        .map((post) => post.postId)
        .join(', ');
    }
  }

  if (profile.interestedInMoneyTransfers === 'Yes' && personalizationService.hasActiveGoal(profile, 'Send Money')) {
    const country = profile.lastMoneyTransferCountry || profile.moneyTransferCountry || profile.country;
    if (country) summaryLines.push(`money transfer help for ${country}`);
  }

  try {
    await crmAgentService.updateUserProfile(user.userId, updates);
  } catch (error) {
    // Startup should still load even if profile persistence is unavailable.
  }

  const name = profile.fullName || 'there';
  const message = summaryLines.length
    ? `Hello ${name}.\n\nI found:\n\n${summaryLines.map((line) => `- ${line}`).join('\n')}`
    : `Hello ${name}. I am ready to help.`;

  return {
    message,
    items: summaryLines,
    profile: {
      ...profile,
      ...updates,
    },
  };
}

async function processWebMessage(messageContext = {}) {
  const originalQuestion = String(messageContext.message || '').trim();
  let question = originalQuestion;
  const channel = messageContext.channel || 'web';
  const channelUserId = messageContext.channelUserId || 'local-web-user';
  const incomingLanguageResolution = languageDetectionService.resolveLanguage({
    explicitLanguage: messageContext.explicitLanguage,
    channelLanguage: messageContext.language || messageContext.languageCode || messageContext.channelLanguage,
    text: originalQuestion,
  });
  let userLanguage = incomingLanguageResolution.language;
  const userContext = {
    channel,
    channelUserId,
    fullName: messageContext.fullName || '',
    language: userLanguage,
  };
  const onboardingStatus = await onboardingService.getStatus(userContext);
  const savedLanguage = await crmAgentService.getUserLanguage(onboardingStatus.profile || {});
  const languageResolution = languageDetectionService.resolveLanguage({
    explicitLanguage: messageContext.explicitLanguage,
    profile: {
      ...onboardingStatus.profile,
      preferredLanguage: savedLanguage.preferredLanguage,
      detectedLanguage: savedLanguage.detectedLanguage,
      language: savedLanguage.language,
    },
    channelLanguage: messageContext.language || messageContext.languageCode || messageContext.channelLanguage,
    text: originalQuestion,
  });
  userLanguage = languageResolution.language;
  userContext.language = userLanguage;
  const conversationId = getConversationKey(userContext);
  const conversationContext = contextManagerService.buildContext(conversationId, {
    currentMessage: {
      role: 'user',
      content: originalQuestion,
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'core-agent',
      },
    },
  });
  const memorySnapshot = memorySnapshotService.buildSnapshot(conversationId);
  const workingMemory = workingMemoryService.getWorkingMemory(conversationId);
  userContext.conversationId = conversationId;
  userContext.conversationContext = conversationContext;
  userContext.memorySnapshot = memorySnapshot;
  userContext.workingMemory = workingMemory;
  messageContext.conversationContext = conversationContext;
  messageContext.memorySnapshot = memorySnapshot;
  messageContext.workingMemory = workingMemory;
  attachSupervisorPlanIfEnabled({
    messageContext,
    userContext,
    originalQuestion,
    conversationId,
    languageResolution: incomingLanguageResolution,
    savedLanguage,
    memorySnapshot,
    workingMemory,
    conversationContext,
    profile: onboardingStatus.profile,
  });

  if (['channel', 'text'].includes(languageResolution.source) && onboardingStatus.profile?.userId) {
    try {
      await crmAgentService.updateDetectedLanguage(onboardingStatus.profile.userId, languageResolution);
    } catch (error) {
      // Chat should keep working even if language persistence is unavailable.
    }
  }

  const deliverResponse = async (response) => {
    try {
      memoryLifecycleService.notifyRequestCompleted(conversationId, {
        waitingForUser: /NEEDS|ONBOARDING/i.test(response.status || '') || /\?\s*$/.test(response.reply || ''),
      });
    } catch (error) {
      // Lifecycle maintenance should never block a user response.
    }
    const finalized = { ...response };
    delete finalized.replyLanguage;
    if (response.skipOutgoingTranslation || responseAlreadyMatchesUserLanguage(response, userLanguage)) {
      delete finalized.skipOutgoingTranslation;
      if (response.skipOutgoingTranslation && finalized.reply === INCOMING_LANGUAGE_FAILURE_REPLY) {
        Object.defineProperty(finalized, OUTGOING_TRANSLATION_METADATA, {
          value: {
            sourceLanguage: CORE_AGENT_RESPONSE_LANGUAGE,
            targetLanguage: userLanguage,
            translated: false,
            provider: translationService.getProviderName(),
            fallbackUsed: true,
            originalResponse: finalized.reply,
            deliveryResponse: finalized.reply,
          },
          enumerable: false,
        });
      }
      return finalized;
    }
    const delivered = await applyOutgoingTranslation(finalized, userLanguage);
    if (delivered.responseTranslation?.fallbackUsed && messageContext.requestId) {
      const plan = supervisorService.getPlan(messageContext.requestId);
      if (plan) {
        plan.responseTranslation = delivered.responseTranslation;
        plan.updatedAt = new Date().toISOString();
        storeSupervisorPlan(plan, 'storeResponseTranslationFailure');
      }
    }
    return delivered;
  };

  if (!onboardingStatus.complete || /^(restart onboarding|restart profile|start over|reset profile|correct|correct previous|change previous|fix previous)$/i.test(originalQuestion)) {
    const onboardingResult = await onboardingService.handleMessage(originalQuestion, userContext);

    if (onboardingResult.handled) {
      return deliverResponse({
        reply: onboardingResult.reply,
        category: 'Onboarding',
        status: onboardingResult.complete ? 'ONBOARDING_COMPLETE' : 'ONBOARDING',
        onboarding: {
          complete: onboardingResult.complete,
        },
        crm: {
          attempted: true,
          saved: true,
          memoryUpdated: false,
          error: '',
        },
      });
    }
  }

  const nativeTransferLanguages = {
    userLanguage,
    textLanguage: incomingLanguageResolution.language,
  };
  const keepNativeTransferLanguage = isActiveSupervisorDeliveryEnabled()
    && supervisorService.shouldPreserveOriginalTransferLanguage(originalQuestion, nativeTransferLanguages);
  const incomingTranslation = keepNativeTransferLanguage
    ? {
        processingText: originalQuestion,
        metadata: {
          originalLanguage: incomingLanguageResolution.language || CORE_AGENT_WORKING_LANGUAGE,
          processingLanguage: incomingLanguageResolution.language || CORE_AGENT_WORKING_LANGUAGE,
          translated: false,
          provider: translationService.getProviderName(),
          fallbackUsed: false,
        },
      }
    : await resolveIncomingProcessingText(originalQuestion, incomingLanguageResolution);
  question = incomingTranslation.processingText;
  userContext.translation = incomingTranslation.metadata;
  messageContext.originalText = originalQuestion;
  messageContext.processingText = question;
  messageContext.translation = incomingTranslation.metadata;
  const incomingTranslationUncertain = incomingTranslationIsUncertain(
    incomingTranslation.metadata,
    originalQuestion,
    nativeTransferLanguages
  );

  const personalization = await applyPersonalization(question, userContext, onboardingStatus.profile);
  const userProfile = personalization.profile;
  const profileMemoryFields = personalization.profileMemoryFields || [];

  if (profileMemoryFields.length > 0 && !hasFollowUpRequest(question)) {
    const reply = formatProfileUpdateAcknowledgement(personalization.profileMemoryUpdates, userProfile || {});
    const crm = {
      attempted: true,
      saved: false,
      memoryUpdated: true,
      error: '',
    };

    try {
      const user = personalization.user || (await crmAgentService.findOrCreateUser(userContext));
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Profile',
        status: 'PROFILE_UPDATED',
        needsHumanFollowUp: false,
      });
      crm.saved = true;
      crm.userId = user.userId;
    } catch (error) {
      crm.error = error.message;
    }

    rememberConversation(userContext, originalQuestion, reply);
    return deliverResponse({
      reply,
      category: 'Profile',
      status: 'PROFILE_UPDATED',
      crm,
    });
  }

  const liveMultiIntentSupervisorResponse = await buildLiveMultiIntentSupervisorResponse({
    messageContext,
    userContext,
    originalQuestion,
    question,
    conversationId,
    languageResolution,
    savedLanguage,
    memorySnapshot,
    workingMemory,
    conversationContext,
    profile: userProfile || onboardingStatus.profile,
    profileMemoryUpdates: personalization.profileMemoryUpdates || {},
    userLanguage,
    incomingTranslationUncertain,
  });

  if (liveMultiIntentSupervisorResponse) {
    const crm = {
      attempted: true,
      saved: false,
      memoryUpdated: false,
      error: '',
    };

    try {
      const user = personalization.user || (await crmAgentService.findOrCreateUser(userContext));
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: liveMultiIntentSupervisorResponse.reply,
        category: liveMultiIntentSupervisorResponse.category,
        status: liveMultiIntentSupervisorResponse.status,
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
      crm.saved = true;
      crm.memoryUpdated = true;
      crm.userId = user.userId;
    } catch (error) {
      crm.error = error.message;
    }

    rememberConversation(userContext, originalQuestion, liveMultiIntentSupervisorResponse.reply);
    return deliverResponse({
      ...liveMultiIntentSupervisorResponse,
      crm,
    });
  }

  const profileRecallIntent = getProfileRecallIntent(question);

  if (profileRecallIntent) {
    const reply = formatProfileRecallByIntent(userProfile || onboardingStatus.profile || {}, profileRecallIntent);
    const crm = {
      attempted: true,
      saved: false,
      memoryUpdated: false,
      error: '',
    };

    try {
      const user = personalization.user || (await crmAgentService.findOrCreateUser(userContext));
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Profile',
        status: 'PROFILE_RECALL',
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
      crm.saved = true;
      crm.memoryUpdated = true;
      crm.userId = user.userId;
    } catch (error) {
      crm.error = error.message;
    }

    rememberConversation(userContext, originalQuestion, reply);
    return deliverResponse({
      reply,
      category: 'Profile',
      status: 'PROFILE_RECALL',
      crm,
    });
  }

  await attachSupervisorShadowIfEnabled({
    messageContext,
    userContext,
    originalQuestion,
    question,
    conversationId,
    languageResolution,
    savedLanguage,
    memorySnapshot,
    workingMemory,
    conversationContext,
    profile: userProfile || onboardingStatus.profile,
  });

  const supervisorResponse = await buildActiveSupervisorResponse({
    messageContext,
    userContext,
    originalQuestion,
    question,
    conversationId,
    languageResolution,
    savedLanguage,
    memorySnapshot,
    workingMemory,
    conversationContext,
    profile: userProfile || onboardingStatus.profile,
    userLanguage,
    incomingTranslationUncertain,
    incomingTranslationMetadata: incomingTranslation.metadata,
  });

  if (supervisorResponse) {
    const crm = {
      attempted: true,
      saved: false,
      memoryUpdated: false,
      error: '',
    };

    try {
      const user = await crmAgentService.findOrCreateUser(userContext);
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: supervisorResponse.reply,
        category: supervisorResponse.category,
        status: supervisorResponse.status,
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
      crm.saved = true;
      crm.memoryUpdated = true;
      crm.userId = user.userId;
    } catch (error) {
      crm.error = error.message;
    }

    rememberConversation(userContext, originalQuestion, supervisorResponse.reply);
    return deliverResponse({
      ...supervisorResponse,
      crm,
    });
  }

  const answeredPendingNeed = hasMeaningfulProfileUpdates(personalization.pendingUpdates);
  const jobIntent = isJobSearchMessage(question) || (answeredPendingNeed && userProfile?.lookingForJob === 'Yes');
  const housingIntent = isHousingMessage(question) || (answeredPendingNeed && userProfile?.lookingForHousing === 'Yes');
  const moneyIntent = isMoneyMessage(question) || (answeredPendingNeed && userProfile?.interestedInMoneyTransfers === 'Yes');
  const serviceIntent = serviceService.isServiceMessage(question);
  const documentIntent = isDocumentMessage(question);
  const taskIntent = taskService.isTaskMessage(question);

  if (isGoalCompletionMessage(question)) {
    const reply = formatGoalCompletionReply(question);
    const normalizedGoalText = normalize(question);
    const completedGoal = /\bjob|work\b/.test(normalizedGoalText) ? 'Find Job' : 'Find Housing';
    try {
      await taskService.completeTasksForGoal(personalization.user.userId, completedGoal);
      await crmAgentService.saveConversation({
        userId: personalization.user.userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Profile',
        status: 'GOAL_COMPLETED',
        needsHumanFollowUp: false,
      });
    } catch (error) {
      // Chat should keep working even if CRM storage is unavailable.
    }
    rememberConversation(userContext, originalQuestion, reply);
    return deliverResponse({
      reply,
      category: 'Profile',
      status: 'GOAL_COMPLETED',
      crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
    });
  }

  if (taskIntent) {
    const taskResult = await taskService.handleTaskChat(question, personalization.user, userProfile || {}, channel);
    rememberConversation(userContext, originalQuestion, taskResult.reply);
    return deliverResponse({
      ...taskResult,
      crm: { attempted: true, saved: true, memoryUpdated: false, error: '' },
    });
  }

  if (jobIntent) {
    const searchContext = extractJobSearchContext(question, userProfile || {});
    const missing = [];

    if (!searchContext.city && !userProfile?.preferredJobCity && !userProfile?.city) missing.push('city');
    if (!searchContext.profession && !userProfile?.preferredJobProfession && !userProfile?.profession && !userProfile?.workSector) {
      missing.push('kind of work');
    }

    if (missing.length > 0) {
      const questionByMissing = {
        city: 'Which city would you like to work in?',
        'kind of work': 'What kind of work are you looking for?',
      };
      return deliverResponse({
        reply: questionByMissing[missing[0]] || `I can help you look for jobs. What ${missing[0]} should I search for?`,
        category: 'Jobs',
        status: 'JOBS_NEEDS_DETAILS',
        crm: {
          attempted: true,
          saved: false,
          memoryUpdated: false,
          error: '',
        },
      });
    }

    const matchingJobs = await jobService.findMatchingJobs(userProfile || {}, {
      ...searchContext,
      city: searchContext.city || userProfile.preferredJobCity || userProfile.city,
      profession: searchContext.profession || userProfile.preferredJobProfession || userProfile.profession,
    });
    const jobs = preferUnseen(matchingJobs, 'jobId', userProfile.lastRecommendedJobIds);
    const reply = jobService.formatJobsForChat(jobs);

    try {
      await crmAgentService.updateUserProfile(personalization.user.userId, {
        lastRecommendedJobIds: jobs
          .slice(0, 5)
          .map((job) => job.jobId)
          .join(', '),
      });
      const user = personalization.user;
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Jobs',
        status: jobs.length ? 'JOBS_FOUND' : 'JOBS_NOT_FOUND',
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
    } catch (error) {
      // Chat should keep working even if CRM storage is unavailable.
    }

    rememberConversation(userContext, originalQuestion, reply);

    return deliverResponse({
      reply,
      category: 'Jobs',
      status: jobs.length ? 'JOBS_FOUND' : 'JOBS_NOT_FOUND',
      jobs: jobs.slice(0, 5),
      crm: {
        attempted: true,
        saved: false,
        memoryUpdated: false,
        error: '',
      },
    });
  }

  if (housingIntent) {
    const housingContext = extractHousingContext(question, userProfile || {});
    const missing = [];

    if (!housingContext.preferredHousingCity) missing.push('city');
    if (!housingContext.preferredHousingType) missing.push('housing type');
    if (!housingContext.maximumMonthlyBudget && !housingContext.maximumHousingBudget) missing.push('maximum monthly budget');

    if (missing.length > 0) {
      const questionByMissing = {
        city: 'Which city should I search in?',
        'housing type': 'What type of housing do you need?',
        'maximum monthly budget': 'What is your monthly budget?',
      };
      return deliverResponse({
        reply: questionByMissing[missing[0]] || `I can help you look for housing. What ${missing[0]} should I search for?`,
        category: 'Housing',
        status: 'HOUSING_NEEDS_DETAILS',
        crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
      });
    }

    let updatedProfile = userProfile || {};

    try {
      const user = personalization.user;
      updatedProfile = await crmAgentService.updateUserProfile(user.userId, housingContext);
    } catch (error) {
      updatedProfile = {
        ...(userProfile || {}),
        ...housingContext,
      };
    }

    const matchingListings = await housingService.findMatchingHousing(updatedProfile, housingContext);
    const listings = preferUnseen(matchingListings, 'housingId', updatedProfile.lastRecommendedHousingIds);
    const reply = housingService.formatHousingForChat(listings);

    try {
      await crmAgentService.updateUserProfile(personalization.user.userId, {
        lastRecommendedHousingIds: listings
          .slice(0, 5)
          .map((listing) => listing.housingId)
          .join(', '),
      });
      const user = personalization.user;
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Housing',
        status: listings.length ? 'HOUSING_FOUND' : 'HOUSING_NOT_FOUND',
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
    } catch (error) {
      // Chat should keep working even if CRM storage is unavailable.
    }

    rememberConversation(userContext, originalQuestion, reply);

    return deliverResponse({
      reply,
      category: 'Housing',
      status: listings.length ? 'HOUSING_FOUND' : 'HOUSING_NOT_FOUND',
      housing: {
        listings: listings.slice(0, 5),
        preferences: housingContext,
      },
      crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
    });
  }

  if (isCommunityMessage(question)) {
    const matchingPosts = await communityService.getRelevantPosts(userProfile || {});
    const posts = preferUnseen(matchingPosts, 'postId', userProfile?.lastRelevantPostIds);
    const reply = communityService.formatPostsForChat(posts);

    try {
      await crmAgentService.updateUserProfile(personalization.user.userId, {
        lastRelevantPostIds: posts
          .slice(0, 5)
          .map((post) => post.postId)
          .join(', '),
      });
      const user = personalization.user;
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Community',
        status: posts.length ? 'COMMUNITY_POSTS_FOUND' : 'COMMUNITY_POSTS_NOT_FOUND',
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
    } catch (error) {
      // Chat should keep working even if CRM storage is unavailable.
    }

    rememberConversation(userContext, originalQuestion, reply);

    return deliverResponse({
      reply,
      category: 'Community',
      status: posts.length ? 'COMMUNITY_POSTS_FOUND' : 'COMMUNITY_POSTS_NOT_FOUND',
      community: {
        posts: posts.slice(0, 5),
      },
      crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
    });
  }

  if (moneyIntent) {
    const moneyContext = extractMoneyContext(question, userProfile || {});
    const asksOnlyRate = /\b(exchange rate|baht rate|baht)\b|\u05db\u05de\u05d4 \u05e9\u05d5\u05d5\u05d4 \u05d1\u05d0\u05d8|\u05d1\u05d0\u05d8/.test(
      question.toLowerCase()
    );

    if (!moneyContext.country && !moneyContext.targetCurrency) {
      return deliverResponse({
        reply: 'Which country are you sending money to?',
        category: 'Money',
        status: 'MONEY_NEEDS_COUNTRY',
        crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
      });
    }

    if (!moneyContext.targetCurrency) {
      return deliverResponse({
        reply: 'Which currency should the recipient receive?',
        category: 'Money',
        status: 'MONEY_NEEDS_TARGET_CURRENCY',
        crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
      });
    }

    if (asksOnlyRate && !moneyContext.amount) {
      const rate = await moneyService.getExchangeRate(moneyContext.sourceCurrency, moneyContext.targetCurrency);
      const reply = formatExchangeRateForChat(rate, moneyContext.sourceCurrency, moneyContext.targetCurrency);

      return deliverResponse({
        reply,
        category: 'Money',
        status: rate ? 'EXCHANGE_RATE_FOUND' : 'EXCHANGE_RATE_NOT_FOUND',
        crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
      });
    }

    if (!moneyContext.amount) {
      return deliverResponse({
        reply: 'How much do you want to send?',
        category: 'Money',
        status: 'MONEY_NEEDS_AMOUNT',
        crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
      });
    }

    const comparison = await moneyService.compareTransfers(
      moneyContext.amount,
      moneyContext.sourceCurrency,
      moneyContext.targetCurrency
    );
    const reply = moneyService.formatComparisonForChat(
      moneyContext.amount,
      moneyContext.sourceCurrency,
      moneyContext.targetCurrency,
      comparison
    );

    try {
      await crmAgentService.updateUserProfile(personalization.user.userId, {
        interestedInMoneyTransfers: 'Yes',
        lastMoneyTransferAmount: moneyContext.amount,
        lastMoneyTransferCountry: moneyContext.country || userProfile.lastMoneyTransferCountry || userProfile.country || '',
      });
      const user = personalization.user;
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Money',
        status: comparison.length ? 'MONEY_COMPARISON_FOUND' : 'MONEY_COMPARISON_NOT_FOUND',
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
    } catch (error) {
      // Chat should keep working even if CRM storage is unavailable.
    }

    rememberConversation(userContext, originalQuestion, reply);

    return deliverResponse({
      reply,
      category: 'Money',
      status: comparison.length ? 'MONEY_COMPARISON_FOUND' : 'MONEY_COMPARISON_NOT_FOUND',
      money: {
        amount: moneyContext.amount,
        sourceCurrency: moneyContext.sourceCurrency,
        targetCurrency: moneyContext.targetCurrency,
        results: comparison,
        bestOption: comparison[0] || null,
      },
      crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
    });
  }

  if (documentIntent) {
    const userId = personalization.user.userId;
    let documents = await documentService.getUserDocuments(userId);
    let summary = documentService.summarizeDocuments(userProfile || {}, documents);
    const documentType = inferDocumentType(question);
    const expiryDate = extractExpiryDate(question);
    let reply = '';
    let status = 'DOCUMENTS_FOUND';

    if (isAddDocumentMessage(question)) {
      if (!documentType) {
        reply = documentQuestionForMissing('');
        status = 'DOCUMENTS_NEEDS_TYPE';
      } else if (!expiryDate && documentType !== 'Employment Contract') {
        reply = documentQuestionForMissing(documentType);
        status = 'DOCUMENTS_NEEDS_EXPIRY';
      } else {
        const existing = documentService.findDocumentByType(documents, documentType);
        const savedDocument = existing
          ? await documentService.updateDocument(existing.documentId, {
              expiryDate: expiryDate || existing.expiryDate,
              notes: 'Updated from chat',
            })
          : await documentService.createDocument({
              userId,
              documentType,
              expiryDate,
              status: expiryDate ? '' : 'Valid',
              notes: 'Added from chat',
            });
        documents = await documentService.getUserDocuments(userId);
        summary = documentService.summarizeDocuments(userProfile || {}, documents);
        reply = `Saved your ${savedDocument.documentType}. Status: ${savedDocument.status}${
          savedDocument.expiryDate ? `, expiry date: ${savedDocument.expiryDate}` : ''
        }.`;
        status = 'DOCUMENT_SAVED';
      }
    } else if (isMissingDocumentsQuestion(question)) {
      reply = summary.missingDocumentTypes
        ? `You are missing these required documents: ${summary.missingDocumentTypes}.`
        : 'Your required document checklist is complete.';
      status = summary.missingDocumentTypes ? 'DOCUMENTS_MISSING' : 'DOCUMENTS_COMPLETE';
    } else if (documentType && /\bwhen|expire|expires|expiry\b|\u05de\u05ea\u05d9|\u05e4\u05d2\u05d4|\u05dc\u05e4\u05d5\u05d2/.test(question.toLowerCase())) {
      const document = documentService.findDocumentByType(documents, documentType);
      reply = document?.expiryDate
        ? `Your ${document.documentType} expires on ${document.expiryDate}. Status: ${document.status}.`
        : `I do not have an expiry date for your ${documentType} yet. Please add the expiry date in YYYY-MM-DD format.`;
      status = document?.expiryDate ? 'DOCUMENT_EXPIRY_FOUND' : 'DOCUMENT_EXPIRY_MISSING';
    } else {
      reply = documentService.formatDocumentsForChat(documents, summary);
      status = documents.length ? 'DOCUMENTS_FOUND' : 'DOCUMENTS_NOT_FOUND';
    }

    try {
      await crmAgentService.updateUserProfile(userId, {
        documentsComplete: summary.documentsComplete,
        missingDocumentTypes: summary.missingDocumentTypes,
        expiringDocumentCount: summary.expiringDocumentCount,
        expiredDocumentCount: summary.expiredDocumentCount,
        nextDocumentExpiryDate: summary.nextDocumentExpiryDate,
        lastActivityAt: new Date().toISOString(),
      });
      await crmAgentService.saveConversation({
        userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Documents',
        status,
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(userId, originalQuestion);
    } catch (error) {
      // Chat should keep working even if CRM storage is unavailable.
    }

    rememberConversation(userContext, originalQuestion, reply);

    return deliverResponse({
      reply,
      category: 'Documents',
      status,
      documents: documents.slice(0, 10),
      summary,
      crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
    });
  }

  if (serviceIntent) {
    const search = serviceService.inferServiceSearch(question, userProfile || {});
    const services = await serviceService.findMatchingServices(userProfile || {}, search);
    const reply = serviceService.formatServicesForChat(services);

    try {
      await crmAgentService.updateUserProfile(personalization.user.userId, {
        lastViewedServices: services
          .slice(0, 5)
          .map((service) => service.id)
          .join(', '),
        lastServiceCategory: search.category || services[0]?.category || '',
        lastServiceCity: search.city || services[0]?.city || userProfile.city || '',
        lastActivityAt: new Date().toISOString(),
      });
      const user = personalization.user;
      await crmAgentService.saveConversation({
        userId: user.userId,
        channel,
        question: originalQuestion,
        answer: reply,
        category: 'Services',
        status: services.length ? 'SERVICES_FOUND' : 'SERVICES_NOT_FOUND',
        needsHumanFollowUp: false,
      });
      await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
    } catch (error) {
      // Chat should keep working even if CRM storage is unavailable.
    }

    rememberConversation(userContext, originalQuestion, reply);

    return deliverResponse({
      reply,
      category: 'Services',
      status: services.length ? 'SERVICES_FOUND' : 'SERVICES_NOT_FOUND',
      services: services.slice(0, 5),
      crm: { attempted: true, saved: false, memoryUpdated: false, error: '' },
    });
  }

  const knowledgeResult = await knowledgeAgentService.answerQuestion({
    question,
    userContext,
    source: channel,
  });
  let reply = knowledgeResult.answer || createFriendlyFallback(userLanguage);
  let finalStatus = knowledgeResult.status;
  const ai = {
    attempted: false,
    used: false,
    error: '',
  };

  if (shouldUseAiProvider(question, knowledgeResult)) {
    ai.attempted = true;

    try {
      const aiResult = await aiProviderService.generateReply({
        message: question,
        userLanguage,
        userProfile,
        relevantKnowledge: knowledgeResult.relevantKnowledge || [],
        recentConversation: getRecentConversation(userContext),
        conversationContext,
        memorySnapshot,
        workingMemory,
      });

      reply = aiResult.text;
      finalStatus = 'AI_PROVIDER';
      ai.used = true;
      ai.provider = aiResult.provider;
      ai.model = aiResult.model;
    } catch (error) {
      reply = createFriendlyFallback(userLanguage);
      ai.error = error.message;
    }
  }

  const crm = {
    attempted: true,
    saved: false,
    memoryUpdated: false,
    error: '',
  };

  try {
    const user = await crmAgentService.findOrCreateUser(userContext);
    await crmAgentService.saveConversation({
      userId: user.userId,
      channel,
      question: originalQuestion,
      answer: reply,
      category: knowledgeResult.category,
      status: finalStatus,
      needsHumanFollowUp: knowledgeResult.status === 'NEEDS_HUMAN',
    });
    await crmAgentService.extractAndUpdateMemory(user.userId, originalQuestion);
    crm.saved = true;
    crm.memoryUpdated = true;
    crm.userId = user.userId;
  } catch (error) {
    crm.error = error.message;
  }

  rememberConversation(userContext, originalQuestion, reply);

  return deliverResponse({
    reply,
    category: knowledgeResult.category,
    status: finalStatus,
    ai,
    crm,
  });
}

module.exports = {
  coordinateAgents,
  getOnboardingStatus: onboardingService.getStatus,
  getPersonalizedStartup,
  updateUserProfile: onboardingService.updateUserProfile,
  processWebMessage,
  receiveMessage,
  routeMessage,
};
