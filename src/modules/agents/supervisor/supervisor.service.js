const { randomUUID } = require('node:crypto');
const { employmentSalaryAgent } = require('../domains/employment-salary.agent');
const { financeConsumerAgent } = require('../domains/finance-consumer.agent');
const { healthLifeCommunityAgent } = require('../domains/health-life-community.agent');
const { translationService } = require('../../translation');
const { AgentRegistryService } = require('../registry/agent-registry.service');
const { validateTaskContract } = require('../contracts/task.contract');
const { validateResultContract } = require('../contracts/result.contract');

const SENSITIVE_METADATA_KEYS = new Set([
  'accesstoken',
  'refreshtoken',
  'password',
  'authorization',
  'apikey',
  'credentials',
  'rawprovidererror',
]);

const SUPERVISOR_DOMAINS = Object.freeze([
  'employment_salary',
  'finance_consumer',
  'health_life_community',
]);

const PLAN_REQUEST_TYPES = Object.freeze([
  'unknown',
  'simple',
  'multi_domain',
  'workflow',
  'urgent',
]);

const PLAN_URGENCIES = Object.freeze([
  'low',
  'normal',
  'high',
  'urgent',
]);

const PLAN_STATUSES = Object.freeze([
  'draft',
  'ready',
  'partial',
  'waiting_for_user',
  'waiting_for_approval',
  'completed',
  'failed',
]);

const EXECUTABLE_TASK_STATUS = 'pending';
const FINAL_TASK_STATUSES = Object.freeze([
  'blocked',
  'failed',
  'completed',
  'cancelled',
]);

const AGGREGATED_RESULT_STATUSES = Object.freeze([
  'completed',
  'partial',
  'failed',
  'blocked',
  'empty',
]);

const DEFAULT_RESPONSE_LANGUAGE = 'en';

const ROUTE_TYPES = Object.freeze([
  'none',
  'single_domain',
  'multi_domain',
]);

const DOMAIN_KEYWORDS = Object.freeze({
  employment_salary: Object.freeze([
    'salary',
    'job',
    'employer',
    'worker',
    'contract',
    'payroll',
    'construction',
    'work permit',
    'vacation',
    'dismissal',
  ]),
  finance_consumer: Object.freeze([
    'bank',
    'payment',
    'credit card',
    'loan',
    'budget',
    'shopping',
    'invoice',
    'transfer',
    'exchange',
    'exchange rate',
    'currency',
    'baht',
    'thai baht',
    'shekel',
    'shekels',
    'ils',
    'thb',
    'שער',
    'שער המרה',
    'שער החליפין',
    'המרה',
    'שקל',
    'שקלים',
    'באט',
    'באט תאילנדי',
    'הצעת העברת הכספים',
    'הצעה האחרונה',
    'ההצעה האחרונה',
    'שמרתי',
    'monox',
    'neema',
    'gmt',
    'remitly',
    'rewire',
    'מונוקס',
    'נימה',
    'השווה',
    'עדיף',
    'טובה יותר',
    'נותן יותר',
    'insurance',
  ]),
  health_life_community: Object.freeze([
    'doctor',
    'hospital',
    'clinic',
    'medical help',
    'medical care',
    'medicine',
    'health',
    'apartment',
    'housing',
    'municipality',
    'government',
    'community',
  ]),
});

const BUSINESS_DOMAIN_CLARIFICATION_OPTIONS = Object.freeze([
  Object.freeze({
    value: 'employment_salary',
    label: 'Employment & Salary',
  }),
  Object.freeze({
    value: 'finance_consumer',
    label: 'Finance & Consumer',
  }),
  Object.freeze({
    value: 'health_life_community',
    label: 'Health, Life & Community',
  }),
]);

const WORKFLOW_KEYWORDS = Object.freeze([
  'create',
  'build',
  'setup',
  'process',
  'automate',
  'configure',
  'migration',
  'project',
  'implement',
]);

const URGENT_KEYWORDS = Object.freeze([
  'urgent',
  'immediately',
  'asap',
  'emergency',
  'critical',
]);

function generateId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatches(message, keyword) {
  const normalizedKeyword = cleanText(keyword).toLowerCase();
  if (/[\u0590-\u05ff]/.test(normalizedKeyword)) {
    return message.includes(normalizedKeyword);
  }
  const escapedKeyword = escapeRegExp(normalizedKeyword).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escapedKeyword}(\\b|$)`, 'i').test(message);
}

function isNonMedicalHealthPhrase(message = '') {
  const normalized = cleanText(message).toLowerCase();
  return /\b(financial|business|company|system|app|server|service|project|platform|runtime)\s+health\b/.test(normalized)
    || /\bhealth\s+check\b/.test(normalized);
}

function isHealthSupportRequest(message = '') {
  const normalized = cleanText(message).toLowerCase();
  if (!normalized || isNonMedicalHealthPhrase(normalized)) {
    return false;
  }

  return /\b(doctor|hospital|clinic|medicine|health|pain|emergency)\b/.test(normalized)
    || /\bmedical\s+(help|care|support|assistance|attention|treatment)\b/.test(normalized)
    || /\b(urgent|emergency)\s+medical\b/.test(normalized);
}

function isHousingProblemRequest(message = '') {
  const normalized = cleanText(message).toLowerCase();
  if (!normalized) return false;

  return /\b(no hot water|without hot water|hot water.*(?:not working|broken|stopped|problem|does not work|isn't working))\b/.test(normalized)
    || /\b(electricity|power|lights?)\b.*\b(not working|does not work|isn't working|broken|out|problem)\b/.test(normalized)
    || /\b(no electricity|no power|power outage)\b/.test(normalized)
    || /\b(air conditioner|air conditioning|a\/c| ac )\b.*\b(not working|does not work|isn't working|broken|stopped|problem)\b/.test(` ${normalized} `)
    || /\b(plumbing|pipe|toilet|sink|shower|water leak|leaking water|leak|leaking)\b/.test(normalized)
    || /\b(mold|mould|damp|humidity|wet wall|wet walls)\b/.test(normalized)
    || /\b(washing machine|washer|fridge|refrigerator|oven|stove|appliance)\b.*\b(not working|does not work|isn't working|broken|stopped|problem)\b/.test(normalized)
    || /\b(landlord|housing contact|building contact|owner)\b.*\b(not fixing|does not fix|doesn't fix|won't fix|will not fix|ignoring|repair)\b/.test(normalized)
    || /\b(apartment|room|housing|house|flat|home|accommodation|landlord|rent|place)\b.*\b(problem|broken|not working|does not work|isn't working|not fixing|fixing|repair|leak|leaking|mold|damp)\b/.test(normalized);
}

function scoreDomains(message) {
  const normalizedMessage = cleanText(message).toLowerCase();
  return Object.entries(DOMAIN_KEYWORDS).map(([domain, keywords]) => {
    const matchedKeywords = new Set();

    for (const keyword of keywords) {
      if (keyword === 'health' && domain === 'health_life_community' && isNonMedicalHealthPhrase(normalizedMessage)) {
        continue;
      }

      if (keywordMatches(normalizedMessage, keyword)) {
        matchedKeywords.add(keyword);
      }
    }

    return {
      domain,
      score: matchedKeywords.size,
    };
  });
}

function hasAnyKeyword(message, keywords = []) {
  return keywords.some((keyword) => keywordMatches(message, keyword));
}

function clonePlainObject(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  return Object.keys(value).reduce((accumulator, key) => {
    accumulator[key] = value[key];
    return accumulator;
  }, {});
}

function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizeMetadata(metadata) {
  if (!isPlainObject(metadata)) {
    return {};
  }

  return Object.entries(metadata).reduce((safeMetadata, [key, value]) => {
    if (!SENSITIVE_METADATA_KEYS.has(String(key).toLowerCase())) {
      safeMetadata[key] = value;
    }

    return safeMetadata;
  }, {});
}

function pushUnique(items, value) {
  if (value === undefined || value === null) return;

  if (typeof value === 'string') {
    const cleaned = cleanText(value);
    if (cleaned && !items.includes(cleaned)) items.push(cleaned);
    return;
  }

  if (isPlainObject(value) || Array.isArray(value)) {
    const serialized = JSON.stringify(value);
    if (serialized !== '{}' && serialized !== '[]' && !items.some((item) => JSON.stringify(item) === serialized)) {
      items.push(cloneValue(value));
    }
  }
}

function combineResultArray(items, values = []) {
  if (!Array.isArray(values)) return;

  for (const value of values) {
    pushUnique(items, value);
  }
}

function firstUniqueQuestion(questions = []) {
  const seen = new Set();

  for (const question of questions) {
    const cleaned = cleanText(question);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    return cleaned;
  }

  return '';
}

function languagePrimary(value) {
  return cleanText(value).toLowerCase().split(/[-_]/)[0];
}

function splitCoordinatingClauses(message = '') {
  return cleanText(message)
    .split(/\s+ו(?:אני|גם)?\s+|\s+\b(?:and|also|plus)\b\s+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function transferResponseAlreadyComplete(domainResults = []) {
  const spoken = domainResults.filter((result) => (
    ['completed', 'success', 'partial'].includes(cleanText(result?.status))
    && outputText(result?.output)
  ));

  return spoken.length > 0
    && spoken.every((result) => cleanText(result?.output?.capability) === 'finance.transfer');
}

function outputText(output = {}) {
  if (!isPlainObject(output)) return '';

  if (
    output.capability === 'health.support'
    && output.urgent === true
    && cleanText(output.nextStep)
  ) {
    return [
      cleanText(output.guidance),
      cleanText(output.nextStep),
    ].filter(Boolean).join(' ');
  }

  return cleanText(
    output.message
    || output.summary
    || output.answer
    || output.nextStep
    || output.guidance
    || output.knowledge?.answer
    || output.serviceMessage
  );
}

function isUserSafeWarning(warning) {
  const normalized = cleanText(warning).toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('unsupported_capability')) return false;
  if (normalized.includes('missing_required_input')) return false;
  if (normalized.includes('no_reliable_implementation')) return false;
  if (normalized.includes('execution_failed')) return false;
  return (
    normalized.includes('demo')
    || normalized.includes('verify')
    || normalized.includes('safety')
    || normalized.includes('urgent')
    || normalized.includes('emergency')
    || normalized.includes('general')
    || normalized.includes('not financial advice')
    || normalized.includes('not a live rate')
  );
}

function firstSafeWarning(warnings = []) {
  return cleanText(warnings.find((warning) => (
    isUserSafeWarning(warning) && cleanText(warning) !== 'reported_quote_unverified'
  )));
}

function taskCapabilityForDomain(domain, requestContext = {}) {
  const message = cleanText(requestContext.message).toLowerCase();

  if (domain === 'employment_salary') {
    if (/\b(salary|pay|paid|wage|rights|employer)\b/.test(message)) return 'jobs.salary';
    if (/\b(documents?|visas?|permits?|passports?|contract)\b/.test(message)) return 'employment.documents';
    if (/\b(help|support|human)\b/.test(message)) return 'employment.support';
    if (/\b(match|fit|recommend)\b/.test(message)) return 'jobs.match';
    return 'jobs.search';
  }

  if (domain === 'finance_consumer') {
    if (/\b(budget|expenses|income|salary)\b/.test(message)) return 'finance.budget';
    if (detectSavedTransferQuoteComparisonRequest(requestContext.message)) return 'finance.saved_user_submitted_quote_comparison';
    if (detectLastSavedTransferQuoteRequest(requestContext.message)) return 'finance.saved_user_submitted_quote';
    if (detectUserSubmittedQuoteReport(requestContext.message)) return 'finance.user_submitted_quote';
    if (isExchangeRateQuestion(message)) return 'finance.exchange_rate';
    if (/\b(transfer|send money|baht|currency|exchange)\b/.test(message)
      || /\bsend\b.*\b(thailand|thb|baht|ils|israeli shekels?|shekels?)\b/.test(message)
      || isHebrewThailandTransferRequest(requestContext.message)) return 'finance.transfer';
    if (/\b(bank|account)\b/.test(message)) return 'finance.bank';
    if (/\b(compare|cheapest|cheap|best|price|offer|buy)\b/.test(message)) return 'consumer.compare';
    return 'consumer.services';
  }

  if (domain === 'health_life_community') {
    if (isHealthSupportRequest(message)) return 'health.support';
    if (isHousingProblemRequest(message)) return 'housing.support';
    if (/\b(room|apartment|housing|rent|landlord)\b/.test(message)) return 'housing.support';
    if (/\b(community|event|group|news|post)\b/.test(message)) return 'community.support';
    if (/\b(government|municipality|ministry|visa|passport|permit|document)\b/.test(message)) return 'government.services';
    return 'life.general';
  }

  return '';
}

function normalizeClarificationAnswer(value = '') {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9_\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIntentMessage(value = '') {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s?.!,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntentClauses(message = '') {
  const normalized = normalizeIntentMessage(message);
  if (!normalized) return [];

  return normalized
    .split(/(?:[?.!]+|,\s*(?=(?:and\s+)?(?:how|what|when|where|who|can|do|i|my)\b)|\b(?:and|also|plus)\b|\bi also\b)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function pushIntent(intents, intent) {
  if (!intent?.intent) return;
  const signature = `${intent.domain || 'profile'}:${intent.intent}`;
  if (intents.some((item) => `${item.domain || 'profile'}:${item.intent}` === signature)) return;
  intents.push({ ...intent });
}

function intentSignature(intent = {}) {
  const safeIntent = isPlainObject(intent) ? intent : {};
  return `${cleanText(safeIntent.domain) || 'profile'}:${cleanText(safeIntent.intent)}`;
}

function detectClauseIntent(clause = '') {
  return detectProfileIntent(clause) || detectDomainIntent(clause);
}

function findQuestionForIntent(message = '', targetIntent = {}) {
  const targetSignature = intentSignature(targetIntent);
  const clauses = splitIntentClauses(message);

  for (const clause of clauses) {
    if (intentSignature(detectClauseIntent(clause)) === targetSignature) {
      return clause;
    }
  }

  return cleanText(message);
}

function extractNumericAmount(message = '') {
  const match = cleanText(message).replace(/,/g, '').match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? Number(match[1]) : 0;
}

function mentionsHebrewThailandCountry(message = '') {
  return /(?:^|\s)ל?תאילנד(?:$|[^\u0590-\u05ff])/.test(cleanText(message));
}

function extractMoneyTransferInput(message = '', profile = {}) {
  const normalized = cleanText(message).toLowerCase();
  const input = {};
  const amount = extractNumericAmount(message);

  if (amount > 0) {
    input.amount = amount;
  }

  const mentionsIls = /\bils|israeli shekels?|shekels?|nis\b|שקלים?|שקל|₪/.test(normalized);
  const mentionsUsd = /\busd|u\.s\. dollars?|dollars?\b/.test(normalized);
  const mentionsThb = /\bthb|thai baht|baht\b|באט(?:\s+תאילנדי)?/.test(normalized);

  if (mentionsIls) input.sourceCurrency = 'ILS';
  else if (mentionsUsd) input.sourceCurrency = 'USD';
  else if (mentionsThb) input.sourceCurrency = 'THB';

  if (/\b(?:to|in|into)\s+(?:thb|thai baht|baht)\b/.test(normalized)) {
    input.targetCurrency = 'THB';
  } else if (/\b(?:to|in|into)\s+(?:ils|israeli shekels?|shekels?|nis)\b/.test(normalized)) {
    input.targetCurrency = 'ILS';
  } else if (/\b(?:to|in|into)\s+(?:usd|u\.s\. dollars?|dollars?)\b/.test(normalized)) {
    input.targetCurrency = 'USD';
  } else if (mentionsThb && input.sourceCurrency && input.sourceCurrency !== 'THB') {
    input.targetCurrency = 'THB';
  } else if (mentionsIls && input.sourceCurrency && input.sourceCurrency !== 'ILS') {
    input.targetCurrency = 'ILS';
  } else if (mentionsUsd && input.sourceCurrency && input.sourceCurrency !== 'USD') {
    input.targetCurrency = 'USD';
  }

  if (/\bthailand\b/.test(normalized) || mentionsHebrewThailandCountry(message)) {
    input.country = 'Thailand';
    input.targetCurrency = 'THB';
  } else if (/\bsri lanka\b/.test(normalized)) {
    input.country = 'Sri Lanka';
    input.targetCurrency = 'LKR';
  } else if (/\bindia\b/.test(normalized)) {
    input.country = 'India';
    input.targetCurrency = 'INR';
  } else if (/\bphilippines\b/.test(normalized)) {
    input.country = 'Philippines';
    input.targetCurrency = 'PHP';
  } else if (!input.targetCurrency && profile.preferredCurrency) {
    input.targetCurrency = profile.preferredCurrency;
  }

  return input;
}

function isHebrewThailandTransferRequest(message = '') {
  const text = cleanText(message);
  return mentionsHebrewThailandCountry(text)
    && /(לשלוח|להעביר|העברת\s+כספים?|כסף|שקל|שקלים|₪|ils)/i.test(text);
}

function detectUserSubmittedQuoteReport(message = '') {
  const text = cleanText(message);
  const normalized = text.toLowerCase();
  if (!text) return false;

  const mentionsProvider = /\b(monox|neema|gmt|remitly|rewire)\b/i.test(text)
    || /מונוקס|נימה|רימיטלי|ריוייר|ג'?י\s*אם\s*טי|ג׳י\s*אם\s*טי/.test(text);
  const hasReportVerb = /שמור|מציע(?:ים|ה)?|הציע(?:ו|ה)?|נותן(?:ים|ת)?|אמר(?:ו|ה)?|קיבלתי|הצעה|quote|offered|offers?|they offer/i.test(text);
  const sendTerms = '(?:לשלוח|שולח(?:ת|ים|ות)?|send|sending)';
  const receiveTerms = '(?:לקבל|מקבל(?:ת|ים|ות)?|receive|get|getting)';
  const hasSendAndReceive = new RegExp(`${sendTerms}.*${receiveTerms}|${receiveTerms}.*${sendTerms}|תמורת|עבור|for`, 'i').test(text);
  const mentionsCurrencies = /שקל|שקלים|ils|באט|thb|baht/i.test(text);
  const numbers = normalized.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || [];

  return hasReportVerb && hasSendAndReceive && mentionsCurrencies && (mentionsProvider || numbers.length > 0);
}

function detectLastSavedTransferQuoteRequest(message = '') {
  const text = cleanText(message);
  const normalized = text.toLowerCase();
  if (!text) return false;

  const hebrewLastSavedQuote =
    /(הצעת\s+העברת\s+הכספים\s+האחרונה|ההצעה\s+האחרונה|הצעה\s+האחרונה|ההצעה\s+האחרונה\s+שלי)/.test(text)
    && /(שמרתי|שמרת|אצלך|שלי|להעברת\s+כסף|העברת\s+כספים)/.test(text);

  const englishLastSavedQuote =
    /\b(last|latest|most recent)\b.*\b(saved )?(money transfer|transfer )?quote\b/.test(normalized)
    || /\bshow me\b.*\b(saved )?(money transfer|transfer )?quote\b/.test(normalized);

  return hebrewLastSavedQuote || englishLastSavedQuote;
}

function detectSavedTransferQuoteComparisonRequest(message = '') {
  const text = cleanText(message);
  const normalized = text.toLowerCase();
  if (!text) return false;

  const providerIds = [...new Set(findReportedProviderMentions(text)
    .map((mention) => resolveReportedProviderId(mention.label))
    .filter(Boolean))];
  if (providerIds.length !== 2) return false;

  return /מה\s+עדיף|השווה|מי\s+נותן(?:\s+לי)?\s+יותר|איזו\s+הצעה\s+טובה\s+יותר|טובה\s+יותר/.test(text)
    || /\b(compare|better|which is better|gives? (?:me )?more)\b/.test(normalized);
}

function resolveReportedProviderId(message = '') {
  const text = cleanText(message).toLowerCase();
  if (/\bmonox\b|מונוקס/.test(text)) return 'monox_money';
  if (/\bneema\b|נימה/.test(text)) return 'neema';
  if (/\bgmt\b|ג'?י\s*אם\s*טי|ג׳י\s*אם\s*טי/.test(text)) return 'gmt';
  if (/\b(remitly|rewire)\b|רימיטלי|ריוייר/.test(text)) return 'remitly_rewire';
  return '';
}

function extractSavedTransferQuoteRecallInput(message = '') {
  const mentions = findReportedProviderMentions(message);
  const providerIds = [...new Set(mentions.map((mention) => resolveReportedProviderId(mention.label)).filter(Boolean))];

  return {
    requestedProviderId: providerIds.length === 1 ? providerIds[0] : '',
    providerAmbiguous: providerIds.length > 1,
  };
}

function extractSavedTransferQuoteComparisonInput(message = '') {
  const providerIds = [...new Set(findReportedProviderMentions(message)
    .map((mention) => resolveReportedProviderId(mention.label))
    .filter(Boolean))];

  return {
    providerIds: providerIds.slice(0, 2),
    providerAmbiguous: providerIds.length !== 2,
  };
}

function findReportedProviderMentions(message = '') {
  const text = cleanText(message);
  const providerPattern = /\bmonox\b|\bneema\b|\bgmt\b|\bremitly\b|\brewire\b|מונוקס|נימה|רימיטלי|ריוייר|ג'?י\s*אם\s*טי|ג׳י\s*אם\s*טי/gi;
  const mentions = [];
  let match;

  while ((match = providerPattern.exec(text)) !== null) {
    mentions.push({
      label: match[0],
      index: match.index,
    });
  }

  return mentions;
}

function extractUserSubmittedQuoteInput(message = '') {
  const text = cleanText(message);
  const withoutCommas = text.replace(/,/g, '');
  const shekelMatch = withoutCommas.match(/(\d+(?:\.\d+)?)\s*(?:שקל|שקלים|₪|ils)/i);
  const bahtMatch = withoutCommas.match(/(\d+(?:\.\d+)?)\s*(?:באט|thb|baht)/i);
  const explicitFields = extractExplicitQuoteFields(withoutCommas);

  return {
    providerId: resolveReportedProviderId(text),
    sourceCurrency: shekelMatch ? 'ILS' : '',
    targetCurrency: bahtMatch ? 'THB' : '',
    sendAmount: shekelMatch ? shekelMatch[1] : '',
    recipientAmount: bahtMatch ? bahtMatch[1] : '',
    ...explicitFields,
    userSubmittedAt: new Date().toISOString(),
  };
}

function extractUserSubmittedQuoteFromSegment(segment = '', fallback = {}) {
  const text = cleanText(segment);
  const withoutCommas = text.replace(/,/g, '');
  const shekelMatch = withoutCommas.match(/(\d+(?:\.\d+)?)\s*(?:שקל|שקלים|₪|ils)/i);
  const bahtMatch = withoutCommas.match(/(\d+(?:\.\d+)?)\s*(?:באט|thb|baht)/i);
  const explicitFields = extractExplicitQuoteFields(withoutCommas);

  return {
    providerId: resolveReportedProviderId(text),
    sourceCurrency: shekelMatch || fallback.sendAmount ? 'ILS' : '',
    targetCurrency: bahtMatch ? 'THB' : '',
    sendAmount: shekelMatch ? shekelMatch[1] : cleanText(fallback.sendAmount),
    recipientAmount: bahtMatch ? bahtMatch[1] : '',
    ...explicitFields,
    userSubmittedAt: new Date().toISOString(),
  };
}

function extractExplicitQuoteFields(message = '') {
  const text = cleanText(message);
  const fields = {};
  const feeMatch = text.match(/(?:לקחו\s+לי\s+עמלה\s+של|העמלה\s+(?:היא\s+)?|עמלה\s+(?:של\s+)?|fee\s*(?:of\s*)?)(\d+(?:\.\d+)?)\s*(?:שקל|שקלים|₪|ils)?/i);
  const totalMatch = text.match(/(?:העלות\s+הכוללת\s+שלי|עלות\s+כוללת|בסך\s+הכול\s+(?:זה\s+)?עולה\s+לי|total\s+(?:customer\s+)?cost)(?:\s+(?:היא|שלי))?\s*(\d+(?:\.\d+)?)\s*(?:שקל|שקלים|₪|ils)?/i);
  const rateMatch = text.match(/(?:שער\s+הלקוח|השער\s+שקיבלתי|שער\s+שקיבלתי|customer\s+(?:exchange\s+)?rate|reported\s+(?:customer\s+)?rate|שער)(?:\s+(?:הוא|היא))?\s*(\d+(?:\.\d+)?)(?:\s*(?:באט|באט\s+תאילנדי|thb|baht)\s*(?:לכל|per|\/)\s*(?:שקל|שקלים|₪|ils))?/i);

  if (feeMatch) fields.transferFee = feeMatch[1];
  if (totalMatch) fields.totalCustomerCost = totalMatch[1];
  if (rateMatch) fields.customerExchangeRate = rateMatch[1];

  return fields;
}

function hasExplicitSharedSendAmount(message = '') {
  const text = cleanText(message);
  return /שניהם|שתיהן|שתי ההצעות|שני הספקים|אותו סכום|same amount|both offers|both quotes/i.test(text);
}

function extractUserSubmittedQuoteComparisonInput(message = '') {
  const text = cleanText(message);
  const mentions = findReportedProviderMentions(text);

  if (mentions.length < 2) {
    return null;
  }

  const firstTwoMentions = mentions.slice(0, 2);
  const allowSharedSendAmount = hasExplicitSharedSendAmount(text);
  const segments = firstTwoMentions.map((mention, index) => {
    const nextMention = firstTwoMentions[index + 1];
    return text.slice(mention.index, nextMention ? nextMention.index : text.length);
  });
  const firstQuote = extractUserSubmittedQuoteFromSegment(segments[0]);
  const secondQuote = extractUserSubmittedQuoteFromSegment(segments[1], {
    sendAmount: allowSharedSendAmount ? firstQuote.sendAmount : '',
  });
  const errors = [];

  if (!firstQuote.providerId || !secondQuote.providerId) {
    errors.push('missing_provider');
  }

  if (!firstQuote.sendAmount || !firstQuote.recipientAmount || !secondQuote.recipientAmount) {
    errors.push('missing_amount');
  }

  if (!secondQuote.sendAmount) {
    errors.push('missing_second_send_amount');
  }

  return {
    quotes: [firstQuote, secondQuote],
    errors,
    usedSharedSendAmount: Boolean(allowSharedSendAmount && firstQuote.sendAmount && !segments[1].replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(?:שקל|שקלים|ils)/i)),
  };
}

function detectProfileIntent(clause = '') {
  const normalized = normalizeIntentMessage(clause);
  if (!normalized) return null;

  if (
    /\b(where do i work|who is my employer|what company do i work for|who do i work for|where am i working)\b/.test(normalized)
    || /\b(what is my profession|what is my job|where do i live|what city am i in|which city am i in)\b/.test(normalized)
    || /\b(what language do i speak|what is my language|what currency do i prefer|preferred currency)\b/.test(normalized)
    || /\b(do i have job alerts enabled|are my job alerts enabled|do i want job alerts)\b/.test(normalized)
  ) {
    return {
      domain: 'profile_memory',
      intent: 'profile_field_recall',
    };
  }

  if (
    /\bwhat do you remember about me\b/.test(normalized)
    || /\bwhat do you know about me\b/.test(normalized)
    || /\bwho am i\b/.test(normalized)
    || /\bshow me my profile\b/.test(normalized)
    || /\btell me about myself\b/.test(normalized)
    || /\bdo you remember me\b/.test(normalized)
    || /\bdont you remember me\b/.test(normalized)
    || normalized === 'my profile'
    || /\bmy profile\b/.test(normalized)
  ) {
    return {
      domain: 'profile_memory',
      intent: 'profile_summary_recall',
    };
  }

  if (
    /\b(i moved to|i live in|i am living in|im living in|my city is|i am now in|im now in)\b/.test(normalized)
    || /\b(my profession is|my job is|i am now working for|im now working for|i work for|my employer is)\b/.test(normalized)
    || /\b(i dont want job alerts anymore|i do not want job alerts anymore|stop job alerts|turn off job alerts|i want job alerts)\b/.test(normalized)
    || /\b(i prefer [a-z]{3}|my preferred currency is|preferred currency is)\b/.test(normalized)
    || /\bi am looking for (work|a job|job|jobs|housing)\b/.test(normalized)
    || /\bim looking for (work|a job|job|jobs|housing)\b/.test(normalized)
  ) {
    return {
      domain: 'profile_memory',
      intent: 'profile_update',
    };
  }

  return null;
}

function isExchangeRateQuestion(message = '') {
  const normalized = cleanText(message).toLowerCase();
  return (
    /\b(exchange rate|currency rate|current rate|current exchange|how much is|what is.*(?:ils|thb|baht|shekel|currency))\b/.test(normalized)
    || /שער(?:\s+המרה|\s+החליפין)?|המרה/.test(normalized)
  );
}

function detectDomainIntent(clause = '') {
  const normalized = normalizeIntentMessage(clause);
  if (!normalized) return null;

  if (
    /\b(how much salary|calculate my salary|salary amount|amount correct|salary correct|wage calculation|calculate wages|how much should i receive)\b/.test(normalized)
    || /\b(employer|boss).*\bpaid me\b.*\bcorrect\b/.test(normalized)
    || /\bpaid me\b.*\b(correct|right)\b/.test(normalized)
    || /\b(earn|make|get|paid)\s+\d+.*\bper\s+hour\b/.test(normalized)
  ) {
    return {
      domain: 'employment_salary',
      intent: 'salary_question',
    };
  }

  if (/\b(salary|wage|paid|payroll|employer rights|worker rights|contract|work permit)\b/.test(normalized)) {
    return {
      domain: 'employment_salary',
      intent: 'salary_question',
    };
  }

  if (/\b(find|looking for|need|search)\b.*\b(job|jobs|work|construction)\b|\b(job|jobs|construction work)\b/.test(normalized)) {
    return {
      domain: 'employment_salary',
      intent: 'job_request',
    };
  }

  if (isExchangeRateQuestion(normalized)) {
    return {
      domain: 'finance_consumer',
      intent: 'exchange_rate_question',
    };
  }

  if (detectUserSubmittedQuoteReport(clause)) {
    return {
      domain: 'finance_consumer',
      intent: 'user_submitted_quote',
    };
  }

  if (detectSavedTransferQuoteComparisonRequest(clause)) {
    return {
      domain: 'finance_consumer',
      intent: 'saved_user_submitted_quote_comparison',
    };
  }

  if (detectLastSavedTransferQuoteRequest(clause)) {
    return {
      domain: 'finance_consumer',
      intent: 'saved_user_submitted_quote_recall',
    };
  }

  if (/\b(transfer|send money|money transfer|exchange|currency|baht|thailand)\b/.test(normalized)
    || isHebrewThailandTransferRequest(clause)) {
    return {
      domain: 'finance_consumer',
      intent: 'money_transfer',
    };
  }

  if (/\b(bank|bank account|bank card|budget|loan|credit card|debit card|card|shopping|invoice|bill|consumer|cheap phone)\b|\bbuy\b.*\bphone\b/.test(normalized)) {
    return {
      domain: 'finance_consumer',
      intent: 'consumer_finance_request',
    };
  }

  if (isHealthSupportRequest(normalized)) {
    return {
      domain: 'health_life_community',
      intent: 'health_request',
    };
  }

  if (isHousingProblemRequest(normalized) || /\b(housing|apartment|room|rent|landlord|place to live)\b/.test(normalized)) {
    return {
      domain: 'health_life_community',
      intent: 'housing_request',
    };
  }

  if (/\b(community|government|municipality|ministry|services|documents)\b/.test(normalized)) {
    return {
      domain: 'health_life_community',
      intent: 'life_community_request',
    };
  }

  return null;
}

function taskCapabilityForIntent(intent = {}, requestContext = {}) {
  const intentName = cleanText(intent.intent);
  const domain = cleanText(intent.domain);

  if (domain === 'profile_memory') {
    if (intentName === 'profile_update') return 'profile.memory_update';
    if (intentName === 'profile_field_recall') return 'profile.field_recall';
    if (intentName === 'profile_summary_recall') return 'profile.recall';
    return 'profile.memory';
  }

  if (intentName === 'salary_question') return 'jobs.salary';
  if (intentName === 'job_request') return 'jobs.match';
  if (intentName === 'exchange_rate_question') return 'finance.exchange_rate';
  if (intentName === 'user_submitted_quote') return 'finance.user_submitted_quote';
  if (intentName === 'saved_user_submitted_quote_comparison') return 'finance.saved_user_submitted_quote_comparison';
  if (intentName === 'saved_user_submitted_quote_recall') return 'finance.saved_user_submitted_quote';
  if (intentName === 'money_transfer') return 'finance.transfer';
  if (intentName === 'consumer_finance_request') return 'consumer.services';
  if (intentName === 'health_request') return 'health.support';
  if (intentName === 'housing_request') return 'housing.support';
  if (intentName === 'life_community_request') return 'life.general';

  return taskCapabilityForDomain(domain, requestContext);
}

function normalizeTaskResult(task = {}, result = {}, fallbackStatus = 'failed', fallbackWarning = 'execution_failed') {
  const normalized = {
    taskId: cleanText(result.taskId) || cleanText(task.taskId),
    requestId: cleanText(result.requestId) || cleanText(task.requestId),
    conversationId: cleanText(result.conversationId) || cleanText(task.conversationId),
    domain: cleanText(result.domain) || cleanText(task.domain),
    intent: cleanText(result.intent) || cleanText(task.intent || task.metadata?.intent),
    status: cleanText(result.status) || fallbackStatus,
    output: result.output === undefined ? null : result.output,
    factsLearned: Array.isArray(result.factsLearned) ? [...result.factsLearned] : [],
    suggestedProfileUpdates: Array.isArray(result.suggestedProfileUpdates) ? [...result.suggestedProfileUpdates] : [],
    followUpQuestions: Array.isArray(result.followUpQuestions) ? [...result.followUpQuestions] : [],
    warnings: Array.isArray(result.warnings) ? [...result.warnings] : [fallbackWarning],
    completedAt: result.completedAt || new Date().toISOString(),
  };

  validateResultContract(normalized);
  return normalized;
}

function createProfileMemoryTaskResult(task = {}, context = {}) {
  const capability = cleanText(task.capability);
  const intent = cleanText(task.intent || task.metadata?.intent);
  const profile = isPlainObject(task.input?.profile) ? task.input.profile : {};
  const profileMemory = isPlainObject(context.profileMemory) ? context.profileMemory : {};
  const composeTaskResponse = typeof profileMemory.composeTaskResponse === 'function'
    ? profileMemory.composeTaskResponse
    : null;
  let output = {
    capability,
    handledBy: 'core_profile_memory',
  };

  if (capability === 'profile.field_recall' || intent === 'profile_field_recall') {
    output = {
      ...output,
      profile: clonePlainObject(profile) || {},
    };
  }

  if (capability === 'profile.recall' || intent === 'profile_summary_recall') {
    output = {
      ...output,
      profile: clonePlainObject(profile) || {},
    };
  }

  if (capability === 'profile.memory_update' || intent === 'profile_update') {
    output = {
      ...output,
      profileUpdates: clonePlainObject(task.input?.profileUpdates) || {},
    };
  }

  if (composeTaskResponse) {
    const message = cleanText(composeTaskResponse({
      capability,
      intent,
      profile,
      profileUpdates: output.profileUpdates || {},
    }));
    if (message) {
      output.message = message;
    }
  }

  return normalizeTaskResult(task, {
    status: 'success',
    output,
    warnings: [],
  });
}

class SupervisorService {
  constructor() {
    this.plansByRequestId = new Map();
    this.agentRegistry = new AgentRegistryService();
    this.agentRegistry.registerAgent(employmentSalaryAgent);
    this.agentRegistry.registerAgent(financeConsumerAgent);
    this.agentRegistry.registerAgent(healthLifeCommunityAgent);
    this.agentsByDomain = new Map(
      this.agentRegistry.listAgents().map((agent) => [agent.domain, agent])
    );
  }

  isSingleFinanceTransferRequest(message = '') {
    const detected = this.detectIntents({ message: cleanText(message) });
    const intents = Array.isArray(detected?.intents) ? detected.intents : [];
    if (detected?.isMultiIntent || intents.length !== 1) return false;
    return taskCapabilityForIntent(intents[0], { message }) === 'finance.transfer';
  }

  isExclusiveFinanceTransferRequest(message = '') {
    const text = cleanText(message);
    if (!this.isSingleFinanceTransferRequest(text)) return false;

    const clauses = splitCoordinatingClauses(text);
    if (clauses.length <= 1) return true;
    return clauses.every((clause) => this.isSingleFinanceTransferRequest(clause));
  }

  shouldPreserveOriginalTransferLanguage(message = '', languages = {}) {
    const requested = isPlainObject(languages) ? languages : { userLanguage: languages, textLanguage: languages };
    const userLanguage = languagePrimary(requested.userLanguage);
    const textLanguage = languagePrimary(requested.textLanguage || requested.userLanguage);
    if (!userLanguage || textLanguage !== userLanguage) return false;
    if (!financeConsumerAgent.supportsTransferResponseLanguage(userLanguage)) return false;
    return this.isExclusiveFinanceTransferRequest(message);
  }

  hasCompleteNativeIntentCoverage(message = '') {
    const text = cleanText(message);
    const detected = this.detectIntents({ message: text });
    const intents = Array.isArray(detected?.intents) ? detected.intents : [];

    if (detected?.isMultiIntent && intents.length > 1) return true;
    if (detected?.isMultiIntent || intents.length !== 1) return false;

    const clauses = splitCoordinatingClauses(text);
    if (clauses.length <= 1) return true;

    const signature = intentSignature(intents[0]);
    return clauses.every((clause) => {
      const clauseDetected = this.detectIntents({ message: clause });
      const clauseIntents = Array.isArray(clauseDetected?.intents) ? clauseDetected.intents : [];
      return !clauseDetected?.isMultiIntent
        && clauseIntents.length === 1
        && intentSignature(clauseIntents[0]) === signature;
    });
  }

  createRequestContext(input = {}) {
    const safeInput = isPlainObject(input) ? input : {};

    return {
      requestId: normalizeRequiredString(safeInput.requestId, 'requestId'),
      conversationId: normalizeRequiredString(safeInput.conversationId, 'conversationId'),
      userId: safeInput.userId || null,
      message: String(safeInput.message || '').trim(),
      detectedLanguage: safeInput.detectedLanguage || null,
      preferredLanguage: safeInput.preferredLanguage || null,
      memorySnapshot: clonePlainObject(safeInput.memorySnapshot),
      workingMemory: clonePlainObject(safeInput.workingMemory),
      profile: clonePlainObject(safeInput.profile),
      profileMemoryUpdates: clonePlainObject(safeInput.profileMemoryUpdates),
      searchContext: clonePlainObject(safeInput.searchContext),
      recentContext: Array.isArray(safeInput.recentContext) ? [...safeInput.recentContext] : [],
      metadata: sanitizeMetadata(safeInput.metadata),
      createdAt: safeInput.createdAt || new Date().toISOString(),
    };
  }

  createPlan(requestContext = {}) {
    const safeContext = isPlainObject(requestContext) ? requestContext : {};
    const createdAt = new Date().toISOString();
    const primaryDomain = this.detectPrimaryDomain(safeContext);
    const secondaryDomains = this.detectSecondaryDomains({
      ...safeContext,
      primaryDomain,
    });
    const routingDecision = this.createRoutingDecision({
      primaryDomain,
      secondaryDomains,
    });
    const detectedIntents = this.detectIntents(safeContext);

    const plan = {
      planId: generateId('plan'),
      requestId: normalizeRequiredString(safeContext.requestId, 'requestId'),
      conversationId: normalizeRequiredString(safeContext.conversationId, 'conversationId'),
      requestType: 'unknown',
      primaryDomain,
      secondaryDomains,
      detectedIntents,
      routingDecision,
      sourceMessage: cleanText(safeContext.message),
      tasks: [],
      requiresUserInput: false,
      missingInformation: [],
      requiresApproval: false,
      urgency: 'normal',
      status: 'draft',
      createdAt,
      updatedAt: createdAt,
    };
    plan.requestType = this.detectRequestType({
      ...plan,
      message: safeContext.message,
    });

    const finalizedPlan = this.applyUnknownDomainFallback(plan);
    this.buildClarificationQuestion(finalizedPlan);
    return finalizedPlan;
  }

  detectIntents(requestContext = {}) {
    const safeContext = isPlainObject(requestContext) ? requestContext : {};
  const message = cleanText(safeContext.message);
  const clauses = splitIntentClauses(message);
  const intents = [];

  if (isHebrewThailandTransferRequest(message)) {
    return {
      isMultiIntent: false,
      intents: [
        {
          domain: 'finance_consumer',
          intent: 'money_transfer',
        },
      ],
    };
  }

  if (!clauses.length) {
      const primaryDomain = this.detectPrimaryDomain(safeContext);
      if (primaryDomain) {
        pushIntent(intents, {
          domain: primaryDomain,
          intent: taskCapabilityForDomain(primaryDomain, safeContext) || 'domain_request',
        });
      }

      return {
        isMultiIntent: false,
        intents,
      };
    }

    for (const clause of clauses) {
      const profileIntent = detectProfileIntent(clause);
      pushIntent(intents, profileIntent);
      if (profileIntent) continue;
      pushIntent(intents, detectDomainIntent(clause));
    }

    if (!intents.length) {
      const primaryDomain = this.detectPrimaryDomain(safeContext);
      if (primaryDomain) {
        pushIntent(intents, {
          domain: primaryDomain,
          intent: taskCapabilityForDomain(primaryDomain, safeContext) || 'domain_request',
        });
      }
    }

    return {
      isMultiIntent: intents.length > 1,
      intents,
    };
  }

  createTasksFromIntents(requestContext = {}, detectedIntents = {}) {
    const safeContext = isPlainObject(requestContext) ? requestContext : {};
    const rawIntents = Array.isArray(detectedIntents)
      ? detectedIntents
      : Array.isArray(detectedIntents.intents)
        ? detectedIntents.intents
        : [];
    const uniqueIntents = [];

    for (const intent of rawIntents) {
      if (!isPlainObject(intent)) continue;
      pushIntent(uniqueIntents, {
        domain: cleanText(intent.domain),
        intent: cleanText(intent.intent),
      });
    }

    return uniqueIntents.map((intent, index) => {
      const createdAt = new Date().toISOString();
      const taskQuestion = findQuestionForIntent(safeContext.message, intent);
      const profile = cloneValue(safeContext.profile || {});
      let extractedInput = {};
      const capability = taskCapabilityForIntent(intent, safeContext);
      if (['exchange_rate_question', 'money_transfer'].includes(intent.intent)) {
        extractedInput = extractMoneyTransferInput(taskQuestion, profile);
      } else if (intent.intent === 'user_submitted_quote' || capability === 'finance.user_submitted_quote') {
        const comparisonInput = extractUserSubmittedQuoteComparisonInput(taskQuestion || safeContext.message);
        extractedInput = {
          ...(comparisonInput
            ? { userSubmittedQuoteComparison: comparisonInput }
            : { userSubmittedQuote: extractUserSubmittedQuoteInput(taskQuestion || safeContext.message) }),
        };
      } else if (intent.intent === 'saved_user_submitted_quote_recall' || capability === 'finance.saved_user_submitted_quote') {
        extractedInput = {
          savedTransferQuoteRecall: extractSavedTransferQuoteRecallInput(`${taskQuestion} ${safeContext.message}`),
        };
      } else if (intent.intent === 'saved_user_submitted_quote_comparison' || capability === 'finance.saved_user_submitted_quote_comparison') {
        extractedInput = {
          savedTransferQuoteComparison: extractSavedTransferQuoteComparisonInput(`${taskQuestion} ${safeContext.message}`),
        };
      }
      const task = {
        taskId: `${cleanText(safeContext.requestId) || 'request'}_intent_task_${index + 1}_${randomUUID()}`,
        conversationId: normalizeRequiredString(safeContext.conversationId, 'conversationId'),
        requestId: normalizeRequiredString(safeContext.requestId, 'requestId'),
        domain: cleanText(intent.domain),
        intent: cleanText(intent.intent),
        capability,
        status: EXECUTABLE_TASK_STATUS,
        priority: cleanText(safeContext.urgency) || 'normal',
        input: {
          question: taskQuestion,
          query: taskQuestion,
          userId: cleanText(safeContext.userId),
          profile,
          profileUpdates: cloneValue(safeContext.profileMemoryUpdates || {}),
          searchContext: cloneValue(safeContext.searchContext || {}),
          ...extractedInput,
        },
        metadata: {
          source: 'detected_intent',
          intent: cleanText(intent.intent),
          sourceMessage: cleanText(safeContext.message),
        },
        createdAt,
      };

      validateTaskContract(task);
      return task;
    });
  }

  detectPrimaryDomain(requestContext = {}) {
    const safeContext = isPlainObject(requestContext) ? requestContext : {};
    const message = cleanText(safeContext.message).toLowerCase();

    if (!message) {
      return null;
    }

    if (isHebrewThailandTransferRequest(safeContext.message)) {
      return 'finance_consumer';
    }

    const scores = scoreDomains(message);

    const highestScore = Math.max(...scores.map((item) => item.score));

    if (highestScore === 0) {
      return null;
    }

    const winners = scores.filter((item) => item.score === highestScore);
    return winners.length === 1 ? winners[0].domain : null;
  }

  detectSecondaryDomains(requestContext = {}) {
    const safeContext = isPlainObject(requestContext) ? requestContext : {};
    const message = cleanText(safeContext.message).toLowerCase();
    const primaryDomain = safeContext.primaryDomain || this.detectPrimaryDomain(safeContext);

    if (!message) {
      return [];
    }

    return scoreDomains(message)
      .filter((item) => item.score > 0 && item.domain !== primaryDomain)
      .map((item) => item.domain)
      .slice(0, 2);
  }

  createRoutingDecision(plan = {}) {
    const safePlan = isPlainObject(plan) ? plan : {};
    const primaryDomain = SUPERVISOR_DOMAINS.includes(safePlan.primaryDomain) ? safePlan.primaryDomain : null;

    if (!primaryDomain) {
      return {
        routeType: 'none',
        targetDomains: [],
      };
    }

    const targetDomains = [
      primaryDomain,
      ...(Array.isArray(safePlan.secondaryDomains) ? safePlan.secondaryDomains : []),
    ].reduce((domains, domain) => {
      if (SUPERVISOR_DOMAINS.includes(domain) && !domains.includes(domain)) {
        domains.push(domain);
      }

      return domains;
    }, []).slice(0, 3);

    return {
      routeType: targetDomains.length > 1 ? 'multi_domain' : 'single_domain',
      targetDomains,
    };
  }

  detectRequestType(plan = {}) {
    const safePlan = isPlainObject(plan) ? plan : {};
    const message = cleanText(safePlan.message).toLowerCase();
    let requestType = 'unknown';

    if (hasAnyKeyword(message, URGENT_KEYWORDS)) {
      requestType = 'urgent';
    } else if (hasAnyKeyword(message, WORKFLOW_KEYWORDS)) {
      requestType = 'workflow';
    } else if (!safePlan.primaryDomain) {
      requestType = 'unknown';
    } else if (Array.isArray(safePlan.secondaryDomains) && safePlan.secondaryDomains.length > 0) {
      requestType = 'multi_domain';
    } else {
      requestType = 'simple';
    }

    if (isPlainObject(plan)) {
      plan.requestType = requestType;
    }

    return requestType;
  }

  applyUnknownDomainFallback(plan = {}) {
    const safePlan = isPlainObject(plan) ? clonePlan(plan) : {};

    if (safePlan.routingDecision?.routeType !== 'none') {
      return safePlan;
    }

    return {
      ...safePlan,
      requiresUserInput: true,
      missingInformation: ['business_domain'],
      status: 'waiting_for_user',
    };
  }

  buildClarificationQuestion(plan = {}) {
    if (
      plan.requiresUserInput !== true
      || !Array.isArray(plan.missingInformation)
      || !plan.missingInformation.includes('business_domain')
    ) {
      return null;
    }

    const question = {
      type: 'business_domain',
      question: 'Which area do you need help with?',
      options: BUSINESS_DOMAIN_CLARIFICATION_OPTIONS.map((option) => ({ ...option })),
    };

    plan.clarificationQuestion = {
      ...question,
      options: question.options.map((option) => ({ ...option })),
    };

    return question;
  }

  validatePlan(plan) {
    const errors = [];

    if (!isPlainObject(plan)) {
      return {
        valid: false,
        errors: ['plan must be an object'],
      };
    }

    for (const field of ['planId', 'requestId', 'conversationId']) {
      if (!cleanText(plan[field])) {
        errors.push(`${field} is required`);
      }
    }

    if (!PLAN_REQUEST_TYPES.includes(plan.requestType)) {
      errors.push('requestType is invalid');
    }

    if (plan.primaryDomain !== null && !SUPERVISOR_DOMAINS.includes(plan.primaryDomain)) {
      errors.push('primaryDomain is invalid');
    }

    if (!Array.isArray(plan.secondaryDomains)) {
      errors.push('secondaryDomains must be an array');
    } else {
      const seenDomains = new Set();

      for (const domain of plan.secondaryDomains) {
        if (!SUPERVISOR_DOMAINS.includes(domain)) {
          errors.push('secondaryDomains contains invalid domain');
          break;
        }

        if (seenDomains.has(domain)) {
          errors.push('secondaryDomains contains duplicate domain');
          break;
        }

        seenDomains.add(domain);
      }

      if (plan.primaryDomain !== null && seenDomains.has(plan.primaryDomain)) {
        errors.push('primaryDomain cannot repeat as secondaryDomain');
      }
    }

    if (!Array.isArray(plan.tasks)) {
      errors.push('tasks must be an array');
    }

    if (!Array.isArray(plan.missingInformation)) {
      errors.push('missingInformation must be an array');
    }

    if (typeof plan.requiresUserInput !== 'boolean') {
      errors.push('requiresUserInput must be boolean');
    }

    if (typeof plan.requiresApproval !== 'boolean') {
      errors.push('requiresApproval must be boolean');
    }

    if (!PLAN_URGENCIES.includes(plan.urgency)) {
      errors.push('urgency is invalid');
    }

    if (!PLAN_STATUSES.includes(plan.status)) {
      errors.push('status is invalid');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  storePlan(plan) {
    const validation = this.validatePlan(plan);

    if (!validation.valid) {
      return {
        stored: false,
        errors: [...validation.errors],
      };
    }

    this.plansByRequestId.set(cleanText(plan.requestId), clonePlan(plan));

    return {
      stored: true,
      errors: [],
    };
  }

  getPlan(requestId) {
    const plan = this.plansByRequestId.get(cleanText(requestId));
    return plan ? clonePlan(plan) : null;
  }

  clearPlan(requestId) {
    this.plansByRequestId.delete(cleanText(requestId));
    return {
      cleared: true,
      errors: [],
    };
  }

  getWaitingPlanForConversation(conversationId) {
    const normalizedConversationId = cleanText(conversationId);
    const waitingPlans = [...this.plansByRequestId.values()]
      .filter((plan) =>
        cleanText(plan.conversationId) === normalizedConversationId
        && plan.requiresUserInput === true
        && cleanText(plan.status) === 'waiting_for_user'
      )
      .sort((a, b) => cleanText(b.updatedAt).localeCompare(cleanText(a.updatedAt)));

    return waitingPlans.length ? clonePlan(waitingPlans[0]) : null;
  }

  resolveClarificationDomain(answer = '') {
    const normalized = normalizeClarificationAnswer(answer);
    if (!normalized) return null;

    const direct = normalized.replace(/\s+/g, '_');
    if (SUPERVISOR_DOMAINS.includes(direct)) return direct;

    for (const option of BUSINESS_DOMAIN_CLARIFICATION_OPTIONS) {
      const value = normalizeClarificationAnswer(option.value).replace(/\s+/g, '_');
      const label = normalizeClarificationAnswer(option.label);

      if (direct === value || normalized === label || normalized.includes(label)) {
        return option.value;
      }
    }

    if (/\b(employment|salary|job|jobs|work|worker|employer)\b/.test(normalized)) return 'employment_salary';
    if (/\b(finance|consumer|money|bank|payment|transfer|budget)\b/.test(normalized)) return 'finance_consumer';
    if (isHealthSupportRequest(normalized) || /\b(life|community|housing|doctor|clinic|government)\b/.test(normalized)) return 'health_life_community';

    return null;
  }

  buildClarificationContinuation(plan = {}, requestContext = {}) {
    const safePlan = isPlainObject(plan) ? clonePlan(plan) : {};
    const safeContext = isPlainObject(requestContext) ? requestContext : {};
    const selectedDomain = this.resolveClarificationDomain(safeContext.message);

    if (!selectedDomain) {
      const stillWaiting = {
        ...safePlan,
        requiresUserInput: true,
        missingInformation: ['business_domain'],
        status: 'waiting_for_user',
        updatedAt: new Date().toISOString(),
      };
      this.buildClarificationQuestion(stillWaiting);
      return stillWaiting;
    }

    const selectedLabel = BUSINESS_DOMAIN_CLARIFICATION_OPTIONS.find((option) => option.value === selectedDomain)?.label || '';
    const normalizedAnswer = normalizeClarificationAnswer(safeContext.message);
    const normalizedLabel = normalizeClarificationAnswer(selectedLabel);
    const answerIsOnlyDomain =
      normalizedAnswer === normalizeClarificationAnswer(selectedDomain).replace(/_/g, ' ')
      || normalizedAnswer === normalizedLabel;
    const executionMessage = answerIsOnlyDomain
      ? cleanText(safePlan.sourceMessage || safeContext.message)
      : cleanText(safeContext.message || safePlan.sourceMessage);
    const secondaryDomains = this.detectSecondaryDomains({
      ...safeContext,
      message: executionMessage,
      primaryDomain: selectedDomain,
    });
    const continuedPlan = {
      ...safePlan,
      primaryDomain: selectedDomain,
      secondaryDomains,
      routingDecision: this.createRoutingDecision({
        primaryDomain: selectedDomain,
        secondaryDomains,
      }),
      requestType: this.detectRequestType({
        ...safePlan,
        primaryDomain: selectedDomain,
        secondaryDomains,
        message: executionMessage,
      }),
      requiresUserInput: false,
      missingInformation: [],
      status: 'draft',
      clarificationAnswer: cleanText(safeContext.message),
      executionMessage,
      updatedAt: new Date().toISOString(),
    };

    delete continuedPlan.clarificationQuestion;
    return continuedPlan;
  }

  buildTaskFollowUpContinuation(plan = {}, requestContext = {}) {
    const safePlan = isPlainObject(plan) ? clonePlan(plan) : {};
    const safeContext = isPlainObject(requestContext) ? requestContext : {};
    const tasks = Array.isArray(safePlan.tasks) ? safePlan.tasks : [];
    const answer = cleanText(safeContext.message);
    const blockedTaskIndex = tasks.findIndex((task) =>
      cleanText(task.status) === 'blocked'
      && Array.isArray(task.result?.followUpQuestions)
      && task.result.followUpQuestions.some((question) => cleanText(question))
    );

    if (blockedTaskIndex < 0 || !answer) {
      return null;
    }

    const nextTasks = tasks.map((task, index) => {
      if (index !== blockedTaskIndex) return task;

      const originalQuestion = cleanText(task.input?.question || task.input?.query || safePlan.sourceMessage);
      const input = {
        ...(isPlainObject(task.input) ? cloneValue(task.input) : {}),
        question: originalQuestion || answer,
        query: originalQuestion || answer,
        followUpAnswer: answer,
        paymentFrequency: answer,
      };

      return {
        ...task,
        status: EXECUTABLE_TASK_STATUS,
        input,
        metadata: {
          ...(isPlainObject(task.metadata) ? cloneValue(task.metadata) : {}),
          followUpAnswer: answer,
        },
      };
    });

    const continuedPlan = {
      ...safePlan,
      tasks: nextTasks,
      requiresUserInput: false,
      missingInformation: [],
      status: 'draft',
      clarificationAnswer: answer,
      executionMessage: cleanText(safePlan.sourceMessage || nextTasks[blockedTaskIndex]?.input?.question || answer),
      updatedAt: new Date().toISOString(),
    };

    delete continuedPlan.clarificationQuestion;
    return continuedPlan;
  }

  buildTaskSkeleton(plan = {}, requestContext = {}) {
    const safePlan = isPlainObject(plan) ? clonePlan(plan) : {};
    const safeContext = isPlainObject(requestContext) ? requestContext : {};
    const targetDomains = Array.isArray(safePlan.routingDecision?.targetDomains)
      ? safePlan.routingDecision.targetDomains
      : [];
    const domains = targetDomains.length ? targetDomains : [safePlan.primaryDomain].filter(Boolean);

    return {
      ...safePlan,
      tasks: domains.map((domain, index) => {
        const capability = taskCapabilityForDomain(domain, safeContext);
        const profile = cloneValue(safeContext.profile || {});
        let extractedInput = {};

        if (['finance.exchange_rate', 'finance.transfer'].includes(capability)) {
          extractedInput = extractMoneyTransferInput(safeContext.message, profile);
        } else if (capability === 'finance.user_submitted_quote') {
          const comparisonInput = extractUserSubmittedQuoteComparisonInput(safeContext.message);
          extractedInput = {
            ...(comparisonInput
              ? { userSubmittedQuoteComparison: comparisonInput }
              : { userSubmittedQuote: extractUserSubmittedQuoteInput(safeContext.message) }),
          };
        } else if (capability === 'finance.saved_user_submitted_quote') {
          extractedInput = {
            savedTransferQuoteRecall: extractSavedTransferQuoteRecallInput(safeContext.message),
          };
        } else if (capability === 'finance.saved_user_submitted_quote_comparison') {
          extractedInput = {
            savedTransferQuoteComparison: extractSavedTransferQuoteComparisonInput(safeContext.message),
          };
        }

        return {
          taskId: `${cleanText(safePlan.planId) || 'plan'}_task_${index + 1}`,
          conversationId: cleanText(safePlan.conversationId),
          requestId: cleanText(safePlan.requestId),
          domain,
          capability,
          status: 'pending',
          input: {
            question: cleanText(safeContext.message),
            query: cleanText(safeContext.message),
            userId: cleanText(safeContext.userId),
            channel: cleanText(safeContext.metadata?.channel),
            channelUserId: cleanText(safeContext.metadata?.channelUserId),
            profile,
            searchContext: cloneValue(safeContext.searchContext || {}),
            ...extractedInput,
          },
          metadata: {},
          createdAt: new Date().toISOString(),
        };
      }),
      updatedAt: new Date().toISOString(),
    };
  }

  assignAgentsToTasks(plan = {}) {
    const safePlan = isPlainObject(plan) ? clonePlan(plan) : {};
    const tasks = Array.isArray(safePlan.tasks) ? safePlan.tasks : [];

    return {
      ...safePlan,
      tasks: tasks.map((task) => {
        const agent = this.getAgentForTask(task);
        if (agent) {
          return {
            ...task,
            assignedAgentId: agent.id,
          };
        }

        return {
          ...task,
          assignedAgentId: '',
          status: 'blocked',
          result: {
            taskId: cleanText(task.taskId),
            status: 'blocked',
            output: null,
            factsLearned: [],
            suggestedProfileUpdates: [],
            followUpQuestions: ['Which area should I check first?'],
            warnings: ['unsupported_capability'],
            completedAt: new Date().toISOString(),
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    };
  }

  selectExecutorForTask(task = {}) {
    const domain = cleanText(task.domain);
    const capability = cleanText(task.capability);
    const intent = cleanText(task.intent || task.metadata?.intent);

    if (domain === 'profile_memory') {
      if (!capability || !capability.startsWith('profile.')) {
        return {
          executorType: 'unresolved',
          executorId: '',
          reason: 'unsupported_profile_memory_task',
        };
      }

      return {
        executorType: 'core_profile_memory',
        executorId: 'core_agent_profile_memory',
        domain,
        capability,
        intent,
      };
    }

    const agent = this.getAgentForTask(task);
    if (!agent) {
      return {
        executorType: 'unresolved',
        executorId: '',
        reason: 'unsupported_task',
      };
    }

    return {
      executorType: 'domain_agent',
      executorId: agent.id,
      domain: agent.domain,
      capability,
      intent,
    };
  }

  async executeTask(task = {}, executorDescriptor = {}, context = {}) {
    try {
      validateTaskContract(task);
    } catch (error) {
      return normalizeTaskResult(task, {
        status: 'failed',
        output: null,
        warnings: ['invalid_task'],
      }, 'failed', 'invalid_task');
    }

    const executor = isPlainObject(executorDescriptor) && cleanText(executorDescriptor.executorType)
      ? executorDescriptor
      : this.selectExecutorForTask(task);
    const executorType = cleanText(executor.executorType);

    if (executorType === 'core_profile_memory') {
      if (cleanText(executor.executorId) !== 'core_agent_profile_memory') {
        return normalizeTaskResult(task, {
          status: 'blocked',
          output: null,
          warnings: ['unsupported_executor'],
        }, 'blocked', 'unsupported_executor');
      }

      return createProfileMemoryTaskResult(task, context);
    }

    if (executorType !== 'domain_agent') {
      return normalizeTaskResult(task, {
        status: 'blocked',
        output: null,
        warnings: ['unsupported_executor'],
      }, 'blocked', 'unsupported_executor');
    }

    const agent = this.agentRegistry.getAgent(cleanText(executor.executorId));

    if (
      !agent
      || cleanText(agent.domain) !== cleanText(task.domain)
      || !Array.isArray(agent.capabilities)
      || !agent.capabilities.includes(cleanText(task.capability))
    ) {
      return normalizeTaskResult(task, {
        status: 'blocked',
        output: null,
        warnings: ['unsupported_executor'],
      }, 'blocked', 'unsupported_executor');
    }

    try {
      const validation = typeof agent.validate === 'function'
        ? await agent.validate(cloneValue(task))
        : { valid: true };

      if (validation && validation.valid === false) {
        return normalizeTaskResult(task, {
          status: 'blocked',
          output: null,
          warnings: [cleanText(validation.reason) || 'unsupported_capability'],
        }, 'blocked', 'unsupported_capability');
      }

      const result = await agent.execute(cloneValue(task), cloneValue(context || {}));
      return normalizeTaskResult(task, result);
    } catch (error) {
      return normalizeTaskResult(task, {
        status: 'failed',
        output: null,
        warnings: ['execution_failed'],
      });
    }
  }

  async executeTasksSequentially(tasks = [], context = {}) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return [];
    }

    const results = [];

    for (const task of tasks) {
      const executor = this.selectExecutorForTask(task);
      const result = await this.executeTask(task, executor, context);
      results.push(result);
    }

    return results;
  }

  synthesizeResults(results = []) {
    const items = Array.isArray(results) ? cloneValue(results) : [];
    const successCount = items.filter((result) => ['success', 'partial'].includes(cleanText(result.status))).length;
    const failureCount = items.filter((result) => ['failed', 'blocked'].includes(cleanText(result.status))).length;
    let status = 'partial';

    if (items.length === 0) {
      status = 'empty';
    } else if (successCount === items.length) {
      status = 'success';
    } else if (failureCount === items.length) {
      status = 'failure';
    }

    return {
      status,
      items,
      successCount,
      failureCount,
    };
  }

  composeResponse(synthesis = {}) {
    const safeSynthesis = isPlainObject(synthesis) ? synthesis : {};
    const status = cleanText(safeSynthesis.status) || 'empty';
    const items = Array.isArray(safeSynthesis.items) ? safeSynthesis.items : [];
    const parts = items
      .map((result) => {
        const resultStatus = cleanText(result.status);

        if (['success', 'partial'].includes(resultStatus)) {
          return outputText(result.output);
        }

        if (resultStatus === 'blocked') {
          return firstUniqueQuestion(result.followUpQuestions);
        }

        return '';
      })
      .filter(Boolean);

    if (parts.length) {
      return parts.join('\n\n');
    }

    if (status === 'empty') {
      return 'I do not have enough information to answer that yet. Please tell me what you want to check first.';
    }

    return 'Sorry, I could not complete that request safely right now. Please try again with one specific detail, or ask for help from the Gringo team.';
  }

  getAgentForTask(task = {}) {
    const domain = cleanText(task.domain);
    const agent = this.agentsByDomain.get(domain);

    if (!agent || !Array.isArray(agent.capabilities) || !agent.capabilities.includes(cleanText(task.capability))) {
      return null;
    }

    return agent;
  }

  async executeAgent(task = {}) {
    const agent = this.getAgentForTask(task);

    if (!agent) {
      return {
        taskId: cleanText(task.taskId),
        status: 'blocked',
        output: null,
        factsLearned: [],
        suggestedProfileUpdates: [],
        followUpQuestions: [],
        warnings: ['unsupported_capability'],
        completedAt: new Date().toISOString(),
      };
    }

    return agent.execute(cloneValue(task));
  }

  buildExecutedTask(task = {}, result = {}) {
    let status = 'failed';

    if (result.status === 'blocked') {
      status = 'blocked';
    } else if (result.status === 'success' || result.status === 'partial') {
      status = 'completed';
    }

    const nextTask = {
      ...task,
      status,
      result: cloneValue(result),
      completedAt: status === 'completed' ? result.completedAt : task.completedAt,
      updatedAt: new Date().toISOString(),
    };

    if (status === 'failed') {
      nextTask.error = {
        message: Array.isArray(result.warnings) && result.warnings.length
          ? result.warnings.join(', ')
          : 'Task execution failed.',
      };
    }

    return nextTask;
  }

  buildFailedTask(task = {}, error) {
    return {
      ...task,
      status: 'failed',
      result: {
        taskId: cleanText(task.taskId),
        status: 'failed',
        output: null,
        factsLearned: [],
        suggestedProfileUpdates: [],
        followUpQuestions: [],
        warnings: ['execution_failed'],
        completedAt: new Date().toISOString(),
      },
      error: {
        message: cleanText(error?.message) || 'Task execution failed.',
      },
      updatedAt: new Date().toISOString(),
    };
  }

  resolveExecutedPlanStatus(tasks = [], executableTaskIds = new Set()) {
    const executableTasks = tasks.filter((task) => executableTaskIds.has(cleanText(task.taskId)));
    const allTasks = tasks.filter((task) => !FINAL_TASK_STATUSES.includes(cleanText(task.status)) || cleanText(task.status) !== 'cancelled');
    const completedCount = tasks.filter((task) => task.status === 'completed').length;
    const failedCount = executableTasks.filter((task) => task.status === 'failed').length;
    const blockedCount = tasks.filter((task) => task.status === 'blocked').length;

    if (tasks.length > 0 && tasks.every((task) => task.status === 'completed' || task.status === 'cancelled')) {
      return 'completed';
    }

    if (tasks.length > 0 && tasks.every((task) => task.status === 'blocked' || task.status === 'cancelled')) {
      return 'waiting_for_user';
    }

    if (executableTasks.length > 0 && failedCount === executableTasks.length) {
      return 'failed';
    }

    if (completedCount > 0 && (failedCount > 0 || blockedCount > 0)) {
      return 'partial';
    }

    if (completedCount > 0 && allTasks.every((task) => task.status === 'completed' || task.status === 'cancelled')) {
      return 'completed';
    }

    if (blockedCount > 0 && failedCount === 0 && completedCount === 0) {
      return 'waiting_for_user';
    }

    if (failedCount > 0) {
      return completedCount > 0 ? 'partial' : 'failed';
    }

    return 'ready';
  }

  async executePlanTasks(plan = {}) {
    const nextPlan = isPlainObject(plan) ? clonePlan(plan) : {};
    const tasks = Array.isArray(nextPlan.tasks) ? nextPlan.tasks : [];
    const executableTaskIds = new Set(
      tasks
        .filter((task) => cleanText(task.status) === EXECUTABLE_TASK_STATUS)
        .map((task) => cleanText(task.taskId))
    );
    const updatedTasks = [];

    for (const task of tasks) {
      if (cleanText(task.status) !== EXECUTABLE_TASK_STATUS) {
        updatedTasks.push(task);
        continue;
      }

      try {
        const result = await this.executeAgent(task);
        updatedTasks.push(this.buildExecutedTask(task, result));
      } catch (error) {
        updatedTasks.push(this.buildFailedTask(task, error));
      }
    }

    nextPlan.tasks = updatedTasks;
    nextPlan.status = this.resolveExecutedPlanStatus(updatedTasks, executableTaskIds);
    nextPlan.requiresUserInput = nextPlan.status === 'waiting_for_user';
    nextPlan.missingInformation = nextPlan.requiresUserInput ? ['task_follow_up'] : [];
    nextPlan.updatedAt = new Date().toISOString();

    return nextPlan;
  }

  resolveAggregatedStatus(domainResults = []) {
    if (!domainResults.length) return 'empty';

    const statuses = domainResults.map((result) => cleanText(result.status));
    const completedCount = statuses.filter((status) => status === 'completed' || status === 'success').length;
    const failedCount = statuses.filter((status) => status === 'failed').length;
    const blockedCount = statuses.filter((status) => status === 'blocked').length;

    if (completedCount === domainResults.length) return 'completed';
    if (failedCount === domainResults.length) return 'failed';
    if (blockedCount === domainResults.length) return 'blocked';
    if (completedCount > 0 && (failedCount > 0 || blockedCount > 0)) return 'partial';

    return 'partial';
  }

  aggregatePlanResults(plan = {}) {
    const safePlan = isPlainObject(plan) ? clonePlan(plan) : {};
    const tasks = Array.isArray(safePlan.tasks) ? safePlan.tasks : [];
    const domainResults = [];
    const combinedFacts = [];
    const suggestedProfileUpdates = [];
    const followUpQuestions = [];
    const warnings = [];
    const blockedDomains = [];
    const failedDomains = [];

    for (const task of tasks) {
      if (!isPlainObject(task.result)) continue;

      const storedTaskStatus = cleanText(task.status);
      const resultStatus = cleanText(task.result.status);
      const taskStatus = FINAL_TASK_STATUSES.includes(storedTaskStatus) || storedTaskStatus === 'completed'
        ? storedTaskStatus
        : resultStatus;
      const normalizedStatus = taskStatus === 'success' ? 'completed' : taskStatus;
      const domain = cleanText(task.domain);

      domainResults.push({
        taskId: cleanText(task.taskId || task.result.taskId),
        domain,
        status: normalizedStatus,
        output: cloneValue(task.result.output),
      });

      combineResultArray(combinedFacts, task.result.factsLearned);
      combineResultArray(suggestedProfileUpdates, task.result.suggestedProfileUpdates);
      combineResultArray(followUpQuestions, task.result.followUpQuestions);
      combineResultArray(warnings, task.result.warnings);

      if (normalizedStatus === 'blocked') pushUnique(blockedDomains, domain);
      if (normalizedStatus === 'failed') pushUnique(failedDomains, domain);
    }

    const status = this.resolveAggregatedStatus(domainResults);

    return {
      planId: cleanText(safePlan.planId),
      status: AGGREGATED_RESULT_STATUSES.includes(status) ? status : 'partial',
      domainResults,
      combinedFacts,
      suggestedProfileUpdates,
      followUpQuestions,
      warnings,
      blockedDomains,
      failedDomains,
      createdAt: new Date().toISOString(),
    };
  }

  composeEnglishResponse(aggregatedResult = {}) {
    const safeResult = isPlainObject(aggregatedResult) ? aggregatedResult : {};
    const status = cleanText(safeResult.status) || 'empty';
    const domainResults = Array.isArray(safeResult.domainResults) ? safeResult.domainResults : [];
    const usefulResults = domainResults
      .filter((result) => ['completed', 'success', 'partial'].includes(cleanText(result.status)))
      .map((result) => outputText(result.output))
      .filter(Boolean);
    const suppressGenericFollowUp = domainResults.some((result) => result.output?.suppressGenericFollowUp === true);
    const suppressTransferPartialNotice = transferResponseAlreadyComplete(domainResults);
    const warning = firstSafeWarning(safeResult.warnings);
    const question = firstUniqueQuestion(safeResult.followUpQuestions);

    if (status === 'blocked') {
      return question || 'I need one more detail before I can help. What should I check first?';
    }

    if (status === 'failed') {
      return 'Sorry, I could not complete that request safely right now. Please try again with one specific detail, or ask for help from the Gringo team.';
    }

    if (status === 'empty') {
      return 'I do not have enough information to answer that yet. Please tell me what you want to check first.';
    }

    const parts = [];

    if (usefulResults.length) {
      parts.push(usefulResults[0]);
    } else if (Array.isArray(safeResult.combinedFacts) && safeResult.combinedFacts.length) {
      parts.push(cleanText(safeResult.combinedFacts[0]));
    } else {
      parts.push('I found some information, but I need one more detail to make it useful.');
    }

    if (warning) {
      parts.push(warning);
    }

    if (status === 'partial' && !suppressTransferPartialNotice) {
      parts.push('Some parts could not be completed yet.');
    }

    if (question) {
      parts.push(question);
    } else if (status === 'completed' && !suppressGenericFollowUp) {
      parts.push('Tell me which detail you want to check next.');
    } else if (status === 'partial' && !suppressTransferPartialNotice) {
      parts.push('Tell me the missing detail and I can continue.');
    }

    return parts.filter(Boolean).join('\n\n');
  }

  resolveResponseLanguage(context = {}) {
    const safeContext = isPlainObject(context) ? context : {};
    return cleanText(
      safeContext.resolvedLanguage
      || safeContext.userLanguage
      || safeContext.preferredLanguage
      || safeContext.language
      || safeContext.targetLanguage
      || DEFAULT_RESPONSE_LANGUAGE
    ) || DEFAULT_RESPONSE_LANGUAGE;
  }

  async buildUserResponse(aggregatedResult = {}, context = {}) {
    const englishResponse = this.composeEnglishResponse(aggregatedResult);
    const targetLanguage = this.resolveResponseLanguage(context);

    if (!englishResponse || targetLanguage === DEFAULT_RESPONSE_LANGUAGE) {
      return englishResponse;
    }

    try {
      const result = await translationService.translateText(englishResponse, DEFAULT_RESPONSE_LANGUAGE, targetLanguage);
      return result.translated && !result.fallbackUsed ? result.translatedText : englishResponse;
    } catch (error) {
      return englishResponse;
    }
  }
}

const supervisorService = new SupervisorService();

module.exports = {
  BUSINESS_DOMAIN_CLARIFICATION_OPTIONS,
  DOMAIN_KEYWORDS,
  PLAN_REQUEST_TYPES,
  PLAN_STATUSES,
  PLAN_URGENCIES,
  ROUTE_TYPES,
  SENSITIVE_METADATA_KEYS,
  SupervisorService,
  SUPERVISOR_DOMAINS,
  URGENT_KEYWORDS,
  WORKFLOW_KEYWORDS,
  supervisorService,
};
