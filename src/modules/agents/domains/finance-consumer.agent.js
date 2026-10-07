const { multiAgentConfig } = require('../../../config/agents');
const moneyService = require('../../money/money.service');
const { normalizeUserSubmittedMoneyTransferQuote } = require('../../money/user-submitted-money-transfer-quote');
const { compareUserSubmittedTransferQuotes } = require('../../money/user-submitted-transfer-quote-comparison');
const { findProviderById } = require('../../money/money-transfer-provider-registry');
const {
  userSubmittedTransferQuoteRepository,
} = require('../../money/user-submitted-transfer-quote.repository');
const serviceService = require('../../services/service.service');
const knowledgeAgentService = require('../../knowledge-agent/knowledge-agent.service');
const crmAgentService = require('../../crm-agent/crm-agent.service');

const SUPPORTED_CAPABILITIES = Object.freeze([
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

const TRANSFER_RESPONSE_LANGUAGES = Object.freeze(['he', 'en']);

function supportsTransferResponseLanguage(language = '') {
  const primary = cleanText(language).toLowerCase().split(/[-_]/)[0];
  return TRANSFER_RESPONSE_LANGUAGES.includes(primary);
}

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function isHebrewText(value = '') {
  return /[\u0590-\u05ff]/.test(cleanText(value));
}

let quoteRepository = userSubmittedTransferQuoteRepository;
const savedSingleQuoteTaskKeys = new Set();

function setUserSubmittedTransferQuoteRepositoryForTest(repository) {
  quoteRepository = repository || userSubmittedTransferQuoteRepository;
  savedSingleQuoteTaskKeys.clear();
}

function detectGenericFinanceRequest(question = '') {
  const normalized = normalize(question);

  if (/\b(bank card|debit card|credit card|atm card|card)\b/.test(normalized)) {
    return {
      type: 'bank_card_problem',
      message: 'I can help you understand the problem. Is the card being declined, blocked, lost or stolen, or is there another problem?',
    };
  }

  if (/\b(bank account|account)\b/.test(normalized)) {
    return {
      type: 'bank_account_problem',
      message: 'I can help you understand what to do next. Is the problem with access to the account, a transfer, a charge, or something else?',
    };
  }

  if (/\b(bill|invoice)\b/.test(normalized)) {
    return {
      type: 'bill_payment_problem',
      message: 'I can help. What bill are you trying to pay?',
    };
  }

  if (/\b(loan|borrow|debt)\b/.test(normalized)) {
    return {
      type: 'loan_question',
      message: 'I can help you understand the options. How much do you need and what is the loan for?',
    };
  }

  if (/\b(cheap phone|buy.*phone|phone.*buy|shopping|cheapest|price|compare)\b/.test(normalized)) {
    return {
      type: 'shopping_price_help',
      message: 'I can help you compare options. What is your budget?',
    };
  }

  return null;
}

function createGenericFinanceFallback(task, capability, question = '') {
  const fallback = detectGenericFinanceRequest(question);

  if (!fallback) {
    return null;
  }

  return createResult(task, 'partial', {
    capability,
    genericFinanceRequestType: fallback.type,
    message: fallback.message,
  }, ['generic_finance_assistance_only'], [fallback.message]);
}

async function resolveProfile(input = {}) {
  if (isObject(input.profile)) return input.profile;

  const userId = cleanText(input.userId);
  if (!userId) return {};

  return (await crmAgentService.getUserMemory(userId)) || { userId };
}

function readBudgetValue(input = {}, profile = {}, names = []) {
  for (const name of names) {
    const value = toNumber(input[name] || profile[name]);
    if (value > 0) return value;
  }
  return 0;
}

function buildExpenseBreakdown(input = {}, profile = {}) {
  const directExpenses = toNumber(input.monthlyExpenses || input.expenses || profile.monthlyExpenses || profile.expenses);
  if (directExpenses > 0) return { total: directExpenses, items: [] };

  const fields = ['rent', 'food', 'transportation', 'utilities', 'phone', 'debt', 'otherExpenses'];
  const items = fields
    .map((field) => ({ name: field, amount: toNumber(input[field] || profile[field]) }))
    .filter((item) => item.amount > 0);

  return {
    total: items.reduce((sum, item) => sum + item.amount, 0),
    items,
  };
}

function quotePayload(storedQuote = {}) {
  return isObject(storedQuote.quote) ? storedQuote.quote : storedQuote;
}

function sameSendAmount(quote = {}, amount = 0) {
  const sendAmount = Number(quote.sendAmount);
  return Number.isFinite(sendAmount) && sendAmount === Number(amount);
}

function isHebrewLanguage(language = 'en') {
  return String(language || '').toLowerCase().startsWith('he');
}

function hasStoredValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function formatGroupedNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return cleanText(value);
  const fractionMatch = String(value).trim().match(/\.(\d+)/);
  const fractionDigits = fractionMatch ? Math.min(fractionMatch[1].length, 8) : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(number);
}

function formatObservationDate(value, language = 'en') {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return text;
  }

  return new Intl.DateTimeFormat(isHebrewLanguage(language) ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utc);
}

function reportedProviderName(storedQuote = {}, language = 'en') {
  const quote = quotePayload(storedQuote);
  const useHebrew = isHebrewLanguage(language);
  return quote.providerName || storedQuote.providerName || quote.providerId || storedQuote.providerId || (useHebrew ? 'לא ידוע' : 'unknown');
}

function reporterLabel(quote = {}, language = 'en') {
  if (cleanText(quote.reporterType) !== 'ambassador') return '';
  return isHebrewLanguage(language) ? 'דווח על ידי שגריר.' : 'Reported by an ambassador.';
}

function evidenceLabel(quote = {}, language = 'en') {
  if (cleanText(quote.evidenceStatus) !== 'submitted') return '';
  return isHebrewLanguage(language)
    ? 'אסמכתא נמסרה; היא לא אומתה מול הספק.'
    : 'Evidence was submitted; it was not verified with the provider.';
}

function formatReportedQuoteLine(storedQuote = {}, language = 'en') {
  const quote = quotePayload(storedQuote);
  const useHebrew = isHebrewLanguage(language);
  const lines = [reportedProviderName(storedQuote, language)];
  const sourceCurrency = cleanText(quote.sourceCurrency);
  const targetCurrency = cleanText(quote.targetCurrency);

  if (hasStoredValue(quote.sendAmount) && sourceCurrency) {
    lines.push(useHebrew
      ? `שליחה: ${formatGroupedNumber(quote.sendAmount)} ${sourceCurrency}`
      : `Send: ${formatGroupedNumber(quote.sendAmount)} ${sourceCurrency}`);
  }
  if (hasStoredValue(quote.recipientAmount) && targetCurrency) {
    lines.push(useHebrew
      ? `קבלה: ${formatGroupedNumber(quote.recipientAmount)} ${targetCurrency}`
      : `Recipient: ${formatGroupedNumber(quote.recipientAmount)} ${targetCurrency}`);
  }
  if (hasStoredValue(quote.transferFee)) {
    const fee = formatGroupedNumber(quote.transferFee);
    lines.push(useHebrew
      ? `עמלה שדווחה: ${fee}${sourceCurrency ? ` ${sourceCurrency}` : ''}`
      : `Reported fee: ${fee}${sourceCurrency ? ` ${sourceCurrency}` : ''}`);
  }
  if (hasStoredValue(quote.totalCustomerCost)) {
    const total = formatGroupedNumber(quote.totalCustomerCost);
    lines.push(useHebrew
      ? `עלות כוללת שדווחה: ${total}${sourceCurrency ? ` ${sourceCurrency}` : ''}`
      : `Reported total cost: ${total}${sourceCurrency ? ` ${sourceCurrency}` : ''}`);
  }
  if (hasStoredValue(quote.customerExchangeRate) && sourceCurrency && targetCurrency) {
    const rate = formatGroupedNumber(quote.customerExchangeRate);
    lines.push(useHebrew
      ? `שער לקוח שדווח: ${rate} ${targetCurrency} לכל ${sourceCurrency}`
      : `Reported customer rate: ${rate} ${targetCurrency} per ${sourceCurrency}`);
  }

  const observedAt = quote.observedAt || storedQuote.observedAt;
  if (hasStoredValue(observedAt)) {
    lines.push(useHebrew
      ? `תאריך תצפית: ${formatObservationDate(observedAt, language)}`
      : `Observation date: ${formatObservationDate(observedAt, language)}`);
  }

  const reporter = reporterLabel(quote, language);
  if (reporter) lines.push(reporter);
  const evidence = evidenceLabel(quote, language);
  if (evidence) lines.push(evidence);

  return lines.join('\n');
}

function sameReportedCorridor(quotes = []) {
  const payloads = quotes.map((storedQuote) => quotePayload(storedQuote));
  if (payloads.length < 2) return false;

  const sourceCurrency = cleanText(payloads[0].sourceCurrency).toUpperCase();
  const targetCurrency = cleanText(payloads[0].targetCurrency).toUpperCase();
  const sendAmount = Number(payloads[0].sendAmount);
  if (!sourceCurrency || !targetCurrency || !Number.isFinite(sendAmount)) return false;

  return payloads.every((quote) => (
    cleanText(quote.sourceCurrency).toUpperCase() === sourceCurrency
    && cleanText(quote.targetCurrency).toUpperCase() === targetCurrency
    && Number(quote.sendAmount) === sendAmount
    && hasStoredValue(quote.recipientAmount)
    && Number.isFinite(Number(quote.recipientAmount))
  ));
}

function formatRecipientAmountDifference(quotes = [], language = 'en') {
  if (!sameReportedCorridor(quotes)) return '';

  const useHebrew = isHebrewLanguage(language);
  const ranked = quotes.map((storedQuote) => {
    const quote = quotePayload(storedQuote);
    return {
      name: reportedProviderName(storedQuote, language),
      recipientAmount: Number(quote.recipientAmount),
      targetCurrency: cleanText(quote.targetCurrency),
    };
  });
  const highest = Math.max(...ranked.map((item) => item.recipientAmount));
  const leaders = ranked.filter((item) => item.recipientAmount === highest);
  const others = ranked.filter((item) => item.recipientAmount !== highest);
  const targetCurrency = ranked[0].targetCurrency;
  const formatGap = (higher, lower) => {
    const gap = Math.abs(higher - lower);
    if (Number.isInteger(higher) && Number.isInteger(lower)) return formatGroupedNumber(String(Math.round(gap)));
    return formatGroupedNumber(gap.toFixed(8).replace(/\.?0+$/, ''));
  };

  if (others.length === 0) {
    return useHebrew
      ? 'לפי סכום הקבלה בלבד, הדיווחים האלה נותנים אותו סכום למקבל. לא נבחר ספק.'
      : 'By recipient amount only, these reports give the recipient the same amount. No provider is selected.';
  }

  if (leaders.length !== 1) {
    return useHebrew
      ? 'לפי סכום הקבלה בלבד, יותר מדיווח אחד נותן את אותו סכום קבלה גבוה יותר. לא נבחר ספק.'
      : 'By recipient amount only, more than one report gives the same higher recipient amount. No provider is selected.';
  }

  if (ranked.length === 2) {
    const difference = formatGap(highest, others[0].recipientAmount);
    return useHebrew
      ? `לפי סכום הקבלה בלבד, בדיווח של ${leaders[0].name} המקבל קיבל ${difference} ${targetCurrency} יותר.`
      : `By recipient amount only, in the ${leaders[0].name} report the recipient received ${difference} ${targetCurrency} more.`;
  }

  const gaps = others.map((item) => {
    const difference = formatGap(highest, item.recipientAmount);
    return useHebrew
      ? `${difference} ${targetCurrency} יותר מ-${item.name}`
      : `${difference} ${targetCurrency} more than ${item.name}`;
  });
  const joinedGaps = useHebrew ? gaps.join(' ו-') : gaps.join(' and ');

  return useHebrew
    ? `לפי סכום הקבלה בלבד, בדיווח של ${leaders[0].name} המקבל קיבל ${joinedGaps}.`
    : `By recipient amount only, in the ${leaders[0].name} report the recipient received ${joinedGaps}.`;
}

function formatReportedTransferObservationsForChat({
  amount,
  sourceCurrency,
  targetCurrency,
  quotes = [],
  hasSameAmount = false,
  hasCorridorObservations = false,
  language = 'en',
} = {}) {
  const useHebrew = isHebrewLanguage(language);

  if (!quotes.length && hasCorridorObservations) {
    return useHebrew
      ? `יש לי דיווחים שמורים עבור ${sourceCurrency} → ${targetCurrency}, אבל אין לי דיווח ישיר עבור ${amount} ${sourceCurrency}. לא אחשב או אכפיל סכומים מדיווחים אחרים.`
      : `I have saved reports for ${sourceCurrency} → ${targetCurrency}, but no direct report for ${amount} ${sourceCurrency}. I will not scale or calculate values from other reports.`;
  }

  if (!quotes.length) {
    return useHebrew
      ? `אין לי כרגע מספיק דיווחים אמיתיים עבור ${sourceCurrency} → ${targetCurrency} כדי לבצע השוואה. לא אציג דירוג הדגמה כספק מומלץ.`
      : `I do not currently have enough real reported observations for ${sourceCurrency} → ${targetCurrency} to compare options. I will not show demo provider ranking as a recommendation.`;
  }

  const formattedAmount = formatGroupedNumber(amount);
  const destination = cleanText(targetCurrency).toUpperCase() === 'THB'
    ? (useHebrew ? 'לתאילנד' : 'Thailand')
    : (useHebrew ? `ל-${targetCurrency}` : targetCurrency);
  const header = useHebrew
    ? (hasSameAmount
      ? `לפי דיווחים שנשמרו ב-Gringo עבור העברות של ${formattedAmount} ${sourceCurrency} ${destination}:`
      : `יש לי דיווחים שמורים עבור ${sourceCurrency} → ${targetCurrency}, אבל לא דיווח ישיר עבור ${amount} ${sourceCurrency}:`)
    : (hasSameAmount
      ? `Based on reports saved in Gringo for transfers of ${formattedAmount} ${sourceCurrency} to ${destination}:`
      : `I have saved reports for ${sourceCurrency} → ${targetCurrency}, but no direct report for ${amount} ${sourceCurrency}:`);
  const blocks = quotes.map((quote) => formatReportedQuoteLine(quote, language)).join('\n\n');
  const difference = hasSameAmount ? formatRecipientAmountDifference(quotes, language) : '';
  const safety = useHebrew
    ? 'חשוב: אלה דיווחים שנמסרו ואינם הצעות חיות או מידע רשמי מהחברות. נתונים חסרים לא חושבו.'
    : 'Important: these are submitted reports, not live quotes or official company information. Missing values were not calculated.';
  const amountNotice = hasSameAmount
    ? ''
    : (useHebrew
      ? 'לא חישבתי סכומי קבלה, עמלות או שערים חסרים, ולא הסקתי מה היה קורה בסכום אחר.'
      : 'I did not calculate missing recipient amounts, fees, or rates, and did not infer what would happen for a different amount.');

  return [header, blocks, difference, amountNotice, safety].filter(Boolean).join('\n\n');
}

async function executeBudget(task, input) {
  const profile = await resolveProfile(input);
  const income = readBudgetValue(input, profile, ['monthlyIncome', 'income', 'salary', 'monthlySalary']);
  const expenses = buildExpenseBreakdown(input, profile);

  if (income <= 0) {
    return blocked(task, 'missing_required_input', 'What is your estimated monthly income?');
  }

  if (expenses.total <= 0) {
    return blocked(task, 'missing_required_input', 'What are your estimated monthly expenses?');
  }

  const currency = cleanText(input.currency || profile.preferredCurrency || 'ILS') || 'ILS';
  const remaining = income - expenses.total;

  return createResult(task, 'success', {
    capability: 'finance.budget',
    currency,
    monthlyIncome: income,
    monthlyExpenses: expenses.total,
    estimatedRemaining: remaining,
    expenseBreakdown: expenses.items,
    summary: remaining >= 0
      ? `Estimated monthly balance: ${remaining} ${currency}.`
      : `Estimated monthly shortfall: ${Math.abs(remaining)} ${currency}.`,
    safetyNotice: 'This is a simple estimate from provided data, not financial advice.',
  });
}

async function executeTransfer(task, input) {
  const profile = await resolveProfile(input);
  const amount = toNumber(input.amount || profile.lastMoneyTransferAmount);
  const sourceCurrency = cleanText(input.sourceCurrency || 'ILS');
  const targetCurrency = cleanText(input.targetCurrency || profile.preferredCurrency);
  const trustedUserId = cleanText(input.userId);
  const responseLanguage = isHebrewText(input.question || input.query) ? 'he' : 'en';

  if (amount <= 0) {
    return blocked(task, 'missing_required_input', 'How much money do you want to compare for transfer?');
  }

  if (!targetCurrency) {
    return blocked(task, 'missing_required_input', 'Which target currency should I compare?');
  }

  let recent = { ok: true, quotes: [] };
  if (trustedUserId) {
    try {
      recent = await quoteRepository.findRecentUserSubmittedTransferQuotes({
        userId: trustedUserId,
        requesterUserId: trustedUserId,
        sourceCurrency,
        targetCurrency,
        limit: 10,
      });
    } catch (error) {
      recent = { ok: false, quotes: [] };
    }
  }

  const corridorQuotes = recent?.ok && Array.isArray(recent.quotes) ? recent.quotes : [];
  const sameAmountQuotes = corridorQuotes.filter((storedQuote) => sameSendAmount(quotePayload(storedQuote), amount));
  const selectedQuotes = sameAmountQuotes.length ? sameAmountQuotes : corridorQuotes.slice(0, 5);
  const hasSameAmount = sameAmountQuotes.length > 0;
  const hasCorridorObservations = corridorQuotes.length > 0;
  const message = formatReportedTransferObservationsForChat({
    amount,
    sourceCurrency,
    targetCurrency,
    quotes: selectedQuotes.slice(0, 5),
    hasSameAmount,
    hasCorridorObservations,
    language: responseLanguage,
  });
  const warnings = ['reported_quote_unverified'];
  if (!trustedUserId) warnings.push('missing_trusted_user_identity');
  if (!recent?.ok) warnings.push('reported_quote_retrieval_failed');
  if (!hasCorridorObservations) warnings.push('insufficient_reported_quote_data');
  if (hasCorridorObservations && !hasSameAmount) warnings.push('no_same_amount_reported_quote');

  return createResult(task, hasSameAmount ? 'success' : 'partial', {
    capability: 'finance.transfer',
    amount,
    sourceCurrency,
    targetCurrency,
    reportedQuotes: selectedQuotes,
    directAmountMatch: hasSameAmount,
    corridorObservationCount: corridorQuotes.length,
    message,
    responseLanguage,
    safetyNotice: moneyService.SAFETY_NOTICE,
    suppressGenericFollowUp: true,
  }, warnings);
}

function formatExchangeRateForChat(rate, sourceCurrency, targetCurrency, language = 'en') {
  const useHebrew = String(language || '').toLowerCase().startsWith('he');

  if (!rate) {
    return useHebrew
      ? `לא נמצא שער המרה עבור ${sourceCurrency} ל-${targetCurrency}.`
      : `No exchange rate found for ${sourceCurrency} to ${targetCurrency}.`;
  }

  if (rate.rateType === 'reference') {
    if (useHebrew) {
      return [
        `שער ההמרה הייחוסי הוא 1 ${sourceCurrency} = ${rate.exchangeRate} ${targetCurrency}.`,
        `מקור: ${rate.sourceName}. תאריך שער המקור: ${rate.providerUpdatedAt || rate.updatedAt || 'unknown'}. זמן השליפה על ידי Gringo: ${rate.retrievedAt || 'unknown'}.`,
        'זהו שער שוק ייחוסי, לא שער לקוח של ספק, לא הצעת העברה חיה, ולא הצעת העברה מאושרת.',
        'שערים, עמלות, זמני מסירה, ספקים וזמינות עשויים להשתנות. לפני השליחה, אשר את הסכום הסופי ואת התנאים ישירות מול הספק. זה אינו ייעוץ פיננסי.',
      ].join('\n');
    }

    return [
      `The reference exchange rate is 1 ${sourceCurrency} = ${rate.exchangeRate} ${targetCurrency}.`,
      `Source: ${rate.sourceName}. Provider rate date: ${rate.providerUpdatedAt || rate.updatedAt || 'unknown'}. Retrieved by Gringo: ${rate.retrievedAt || 'unknown'}.`,
      'This is a reference market rate, not a provider customer rate, live quote, or confirmed transfer offer.',
      moneyService.SAFETY_NOTICE,
    ].join('\n');
  }

  if (useHebrew) {
    return [
      'זהו מידע הדגמה בלבד, לא שער חי, לא הצעת העברה חיה, ולא הצעת העברה מאושרת.',
      `שער ההמרה להדגמה הוא 1 ${sourceCurrency} = ${rate.exchangeRate} ${targetCurrency}.`,
      'שערים, עמלות, זמני מסירה, ספקים וזמינות עשויים להשתנות. לפני השליחה, אשר את הסכום הסופי ואת התנאים ישירות מול הספק. זה אינו ייעוץ פיננסי.',
    ].join('\n');
  }

  return [
    moneyService.DEMO_NOTICE,
    `The demo exchange rate is 1 ${sourceCurrency} = ${rate.exchangeRate} ${targetCurrency}.`,
    moneyService.SAFETY_NOTICE,
  ].join('\n');
}

async function executeExchangeRate(task, input) {
  const profile = await resolveProfile(input);
  const sourceCurrency = cleanText(input.sourceCurrency || 'ILS');
  const targetCurrency = cleanText(input.targetCurrency || profile.preferredCurrency);
  const responseLanguage = isHebrewText(input.question || input.query) ? 'he' : 'en';

  if (!targetCurrency) {
    return blocked(task, 'missing_required_input', 'Which target currency should I check?');
  }

  const rate = await moneyService.getExchangeRate(sourceCurrency, targetCurrency);
  const message = formatExchangeRateForChat(rate, sourceCurrency, targetCurrency, responseLanguage);

  return createResult(task, rate ? 'success' : 'partial', {
    capability: 'finance.exchange_rate',
    sourceCurrency,
    targetCurrency,
    rate,
    message,
    safetyNotice: moneyService.SAFETY_NOTICE,
    suppressGenericFollowUp: true,
  });
}

function formatUserSubmittedQuoteForChat(result = {}, language = 'en', persistence = {}) {
  const quote = isObject(result.quote) ? result.quote : {};
  const useHebrew = String(language || '').toLowerCase().startsWith('he');
  const unknown = useHebrew ? 'לא ידוע' : 'unknown';
  const fee = quote.transferFee === null || quote.transferFee === undefined
    ? unknown
    : `${quote.transferFee} ${quote.sourceCurrency}`;
  const total = quote.totalCustomerCost === null || quote.totalCustomerCost === undefined
    ? unknown
    : `${quote.totalCustomerCost} ${quote.sourceCurrency}`;
  const rate = quote.customerExchangeRate === null || quote.customerExchangeRate === undefined
    ? unknown
    : (useHebrew
      ? `${quote.customerExchangeRate} ${quote.targetCurrency} לכל ${quote.sourceCurrency}`
      : `${quote.customerExchangeRate} ${quote.targetCurrency} per ${quote.sourceCurrency}`);
  const recipient = quote.recipientAmount === null || quote.recipientAmount === undefined
    ? unknown
    : `${quote.recipientAmount} ${quote.targetCurrency}`;
  const persistenceLine = (() => {
    if (persistence.status === 'saved') {
      return useHebrew
        ? 'שמרתי את ההצעה בפרופיל שלך כדי שתוכל להשתמש בה בהמשך.'
        : 'I saved this quote to your profile so you can use it later.';
    }
    if (persistence.status === 'missing_identity') {
      return useHebrew
        ? 'לא שמרתי את ההצעה כי לא זיהיתי פרופיל משתמש מאומת בבקשה הזו.'
        : 'I did not save this quote because I could not identify a trusted user profile for this request.';
    }
    if (persistence.status === 'failed') {
      return useHebrew
        ? 'לא הצלחתי לשמור את ההצעה כרגע, אבל סיכמתי את הפרטים שדיווחת.'
        : 'I could not save this quote right now, but I summarized the details you reported.';
    }
    return '';
  })();

  if (useHebrew) {
    return [
      'רשמתי את הצעת ההעברה כפי שדיווחת עליה, לא כמידע מאומת מהספק.',
      `ספק: ${quote.providerName || quote.providerId || unknown}.`,
      `סכום לשליחה: ${quote.sendAmount} ${quote.sourceCurrency}.`,
      `סכום לקבלה: ${recipient}.`,
      `עמלה: ${fee}.`,
      `עלות כוללת: ${total}.`,
      `שער לקוח שדווח: ${rate}.`,
      persistenceLine,
      'המידע הזה הוא user-reported בלבד. לא בדקתי אותו מול הספק, לא חישבתי שדות חסרים, ולא מדובר בהוראה לבצע העברה.',
    ].filter(Boolean).join('\n');
  }

  return [
    'I recorded the transfer quote as user-reported, not verified provider information.',
    `Provider: ${quote.providerName || quote.providerId || unknown}.`,
    `Send amount: ${quote.sendAmount} ${quote.sourceCurrency}.`,
    `Recipient amount: ${recipient}.`,
    `Fee: ${fee}.`,
    `Total customer cost: ${total}.`,
    `Reported customer rate: ${rate}.`,
    persistenceLine,
    'This is user-reported only. I did not verify it with the provider, calculate missing fields, or treat this as an instruction to send money.',
  ].filter(Boolean).join('\n');
}

function formatUserSubmittedQuoteComparisonForChat(comparison = {}, language = 'en') {
  const useHebrew = String(language || '').toLowerCase().startsWith('he');
  const unknown = useHebrew ? 'לא ידוע' : 'unknown';
  const providerA = comparison.providerA?.providerName || comparison.providerA?.providerId || unknown;
  const providerB = comparison.providerB?.providerName || comparison.providerB?.providerId || unknown;
  const sendAmount = comparison.sendAmount === null || comparison.sendAmount === undefined
    ? unknown
    : `${comparison.sendAmount} ${comparison.sourceCurrency}`;
  const recipientA = comparison.recipientAmountA === null || comparison.recipientAmountA === undefined
    ? unknown
    : `${comparison.recipientAmountA} ${comparison.targetCurrency}`;
  const recipientB = comparison.recipientAmountB === null || comparison.recipientAmountB === undefined
    ? unknown
    : `${comparison.recipientAmountB} ${comparison.targetCurrency}`;
  const difference = comparison.recipientAmountDifference === null || comparison.recipientAmountDifference === undefined
    ? unknown
    : `${Math.abs(comparison.recipientAmountDifference)} ${comparison.targetCurrency}`;
  const feeStatus = comparison.feeKnownA && comparison.feeKnownB
    ? (useHebrew ? 'העמלות דווחו בשתי ההצעות.' : 'Fees were reported for both quotes.')
    : (useHebrew ? 'עמלות: לא ידוע באחת ההצעות או בשתיהן.' : 'Fees: unknown in one or both quotes.');
  const totalStatus = comparison.totalCostKnownA && comparison.totalCostKnownB
    ? (useHebrew ? 'עלות כוללת דווחה בשתי ההצעות.' : 'Total customer cost was reported for both quotes.')
    : (useHebrew ? 'עלות כוללת: לא ידוע, ולכן אי אפשר להסיק חיסכון בשקלים.' : 'Total customer cost: unknown, so I cannot infer ILS savings.');
  const deliveryStatus = comparison.deliveryMethodMatch === true
    ? (useHebrew ? 'שיטת מסירה: זהה לפי הדיווח.' : 'Delivery method: reported as matching.')
    : comparison.deliveryMethodMatch === false
      ? (useHebrew ? 'שיטת מסירה: שונה לפי הדיווח.' : 'Delivery method: reported as different.')
      : (useHebrew ? 'שיטת מסירה: לא ידוע.' : 'Delivery method: unknown.');

  if (useHebrew) {
    return [
      'השוויתי רק את שתי ההצעות כפי שדיווחת עליהן. הן user-reported בלבד ולא אומתו מול הספקים.',
      `${providerA}: לשלוח ${sendAmount}, לקבל ${recipientA}.`,
      `${providerB}: לשלוח ${sendAmount}, לקבל ${recipientB}.`,
      `הפרש בסכום לקבלה: ${difference}.`,
      `סטטוס השוואה: ${comparison.comparisonStatus}.`,
      feeStatus,
      totalStatus,
      deliveryStatus,
      'טריות ההצעות: לא ידוע.',
      'לא קבעתי מי הכי טוב, לא חישבתי חיסכון בשקלים, ולא מדובר בהמלצה או בהוראה לבצע העברה.',
    ].join('\n');
  }

  return [
    'I compared only the two quotes you reported. They are user-reported and not verified with the providers.',
    `${providerA}: send ${sendAmount}, receive ${recipientA}.`,
    `${providerB}: send ${sendAmount}, receive ${recipientB}.`,
    `Recipient amount difference: ${difference}.`,
    `Comparison status: ${comparison.comparisonStatus}.`,
    feeStatus,
    totalStatus,
    deliveryStatus,
    'Quote freshness: unknown.',
    'I did not choose a best provider, calculate ILS savings, or treat this as advice or an instruction to transfer money.',
  ].join('\n');
}

function formatSavedUserSubmittedQuoteForChat(storedQuote = {}, language = 'en') {
  const quote = isObject(storedQuote.quote) ? storedQuote.quote : storedQuote;
  const useHebrew = String(language || '').toLowerCase().startsWith('he');
  const unknown = useHebrew ? 'לא ידוע' : 'unknown';
  const provider = quote.providerName || storedQuote.providerName || quote.providerId || storedQuote.providerId || unknown;
  const sendAmount = quote.sendAmount ?? storedQuote.sendAmount;
  const sourceCurrency = quote.sourceCurrency || storedQuote.sourceCurrency || '';
  const recipientAmount = quote.recipientAmount ?? storedQuote.recipientAmount;
  const targetCurrency = quote.targetCurrency || storedQuote.targetCurrency || '';
  const fee = quote.transferFee ?? storedQuote.transferFee;
  const total = quote.totalCustomerCost ?? storedQuote.totalCustomerCost;
  const rate = quote.customerExchangeRate ?? storedQuote.customerExchangeRate;
  const savedAt = cleanText(storedQuote.savedAt);
  const feeLine = fee === null || fee === undefined
    ? ''
    : (useHebrew ? `עמלה: ${fee} ${sourceCurrency}.` : `Fee: ${fee} ${sourceCurrency}.`);
  const totalLine = total === null || total === undefined
    ? ''
    : (useHebrew ? `עלות כוללת: ${total} ${sourceCurrency}.` : `Total customer cost: ${total} ${sourceCurrency}.`);
  const rateLine = rate === null || rate === undefined
    ? ''
    : (useHebrew
      ? `שער לקוח שדווח: ${rate} ${targetCurrency} לכל ${sourceCurrency}.`
      : `Reported customer rate: ${rate} ${targetCurrency} per ${sourceCurrency}.`);
  const savedAtLine = savedAt
    ? (useHebrew ? `נשמר בתאריך: ${savedAt}.` : `Saved at: ${savedAt}.`)
    : '';

  if (useHebrew) {
    return [
      'זו הצעת העברת הכספים האחרונה ששמורה אצלך.',
      `ספק: ${provider}.`,
      `סכום לשליחה: ${sendAmount ?? unknown} ${sourceCurrency}.`,
      `סכום לקבלה: ${recipientAmount ?? unknown} ${targetCurrency}.`,
      feeLine,
      totalLine,
      rateLine,
      savedAtLine,
      'ההצעה הזו היא user-reported בלבד ולא אומתה מול הספק. היא לא הצעה חיה, לא מידע רשמי, ולא הוראה לבצע העברה.',
    ].filter(Boolean).join('\n');
  }

  return [
    'This is your most recently saved money-transfer quote.',
    `Provider: ${provider}.`,
    `Send amount: ${sendAmount ?? unknown} ${sourceCurrency}.`,
    `Recipient amount: ${recipientAmount ?? unknown} ${targetCurrency}.`,
    feeLine,
    totalLine,
    rateLine,
    savedAtLine,
    'This quote is user-reported only and was not verified with the provider. It is not a live quote, official information, or an instruction to transfer money.',
  ].filter(Boolean).join('\n');
}

function formatSavedUserSubmittedQuoteComparisonForChat(comparison = {}, quoteA = {}, quoteB = {}, language = 'en') {
  const useHebrew = String(language || '').toLowerCase().startsWith('he');
  const unknown = useHebrew ? 'לא ידוע' : 'unknown';
  const providerA = comparison.providerA?.providerName || comparison.providerA?.providerId || unknown;
  const providerB = comparison.providerB?.providerName || comparison.providerB?.providerId || unknown;
  const sendA = quoteA.sendAmount === null || quoteA.sendAmount === undefined
    ? unknown
    : `${quoteA.sendAmount} ${quoteA.sourceCurrency}`;
  const sendB = quoteB.sendAmount === null || quoteB.sendAmount === undefined
    ? unknown
    : `${quoteB.sendAmount} ${quoteB.sourceCurrency}`;
  const recipientA = quoteA.recipientAmount === null || quoteA.recipientAmount === undefined
    ? unknown
    : `${quoteA.recipientAmount} ${quoteA.targetCurrency}`;
  const recipientB = quoteB.recipientAmount === null || quoteB.recipientAmount === undefined
    ? unknown
    : `${quoteB.recipientAmount} ${quoteB.targetCurrency}`;
  const difference = comparison.recipientAmountDifference;
  const hasDifference = typeof difference === 'number' && Number.isFinite(difference);
  const higherProvider = hasDifference && difference > 0
    ? providerB
    : hasDifference && difference < 0
      ? providerA
      : '';
  const differenceLine = (() => {
    if (comparison.comparisonStatus === 'incompatible') {
      return useHebrew
        ? 'ההצעות השמורות אינן ניתנות להשוואה ישירה, כי סכום השליחה או המטבעות אינם תואמים.'
        : 'The saved quotes are not directly comparable because the send amount or currencies do not match.';
    }
    if (!hasDifference) {
      return useHebrew
        ? 'אין מספיק מידע שמור כדי לחשב הבדל בסכום הקבלה.'
        : 'There is not enough saved information to calculate a recipient-amount difference.';
    }
    if (difference === 0) {
      return useHebrew
        ? 'לפי סכום הקבלה בלבד, שתי ההצעות נותנות אותו סכום למקבל.'
        : 'By recipient amount only, both quotes give the same amount to the recipient.';
    }

    return useHebrew
      ? `לפי סכום הקבלה בלבד, ${higherProvider} נותנת ${Math.abs(difference)} ${comparison.targetCurrency} יותר למקבל.`
      : `By recipient amount only, ${higherProvider} gives ${Math.abs(difference)} ${comparison.targetCurrency} more to the recipient.`;
  })();
  const feeWarning = (!comparison.feeKnownA || !comparison.feeKnownB)
    ? (useHebrew
      ? 'העמלות או העלות הכוללת אינן ידועות במלואן, ולכן זו אינה השוואה מלאה של העלות הכוללת.'
      : 'Fees or total customer cost are not fully known, so this is not a full total-cost comparison.')
    : '';
  const safety = useHebrew
    ? 'חשוב: שתי ההצעות הן user-reported ולא אומתו מול הספקים. זו אינה הצעה חיה, אינה מידע רשמי, אינה המלצה פיננסית, ואינה הוראה לבצע העברה.'
    : 'Important: both quotes are user-reported and were not verified with the providers. This is not a live quote, official information, financial advice, or an instruction to transfer money.';

  if (useHebrew) {
    return [
      'בהצעות ששמרת:',
      `${providerA}: ${sendA} -> ${recipientA}.`,
      `${providerB}: ${sendB} -> ${recipientB}.`,
      '',
      differenceLine,
      feeWarning,
      safety,
    ].filter((line) => line !== '').join('\n');
  }

  return [
    'In your saved quotes:',
    `${providerA}: ${sendA} -> ${recipientA}.`,
    `${providerB}: ${sendB} -> ${recipientB}.`,
    '',
    differenceLine,
    feeWarning,
    safety,
  ].filter((line) => line !== '').join('\n');
}

function providerDisplayName(providerId = '') {
  const provider = findProviderById(cleanText(providerId));
  return provider?.providerName || cleanText(providerId);
}

function storedQuotePayload(storedQuote = {}) {
  return isObject(storedQuote.quote) ? storedQuote.quote : storedQuote;
}

function missingSavedQuoteComparisonMessage(providerAId = '', providerBId = '', quoteA = null, quoteB = null, language = 'en') {
  const useHebrew = String(language || '').toLowerCase().startsWith('he');
  const providerA = providerDisplayName(providerAId);
  const providerB = providerDisplayName(providerBId);

  if (quoteA && !quoteB) {
    return useHebrew
      ? `יש לי הצעה שמורה של ${providerA}, אבל אין לי עדיין הצעה שמורה של ${providerB}, ולכן אני לא יכול לבצע השוואה מלאה ביניהן.`
      : `I have a saved quote from ${providerA}, but I do not have a saved quote from ${providerB} yet, so I cannot make a full comparison.`;
  }

  if (!quoteA && quoteB) {
    return useHebrew
      ? `יש לי הצעה שמורה של ${providerB}, אבל אין לי עדיין הצעה שמורה של ${providerA}, ולכן אני לא יכול לבצע השוואה מלאה ביניהן.`
      : `I have a saved quote from ${providerB}, but I do not have a saved quote from ${providerA} yet, so I cannot make a full comparison.`;
  }

  return useHebrew
    ? `אין לי עדיין הצעות שמורות של ${providerA} ושל ${providerB}, ולכן אני לא יכול לבצע השוואה ביניהן.`
    : `I do not have saved quotes from ${providerA} and ${providerB} yet, so I cannot compare them.`;
}

function blockedUserSubmittedQuoteComparison(task, responseLanguage, warning = 'ambiguous_user_submitted_quote_comparison') {
  const question = responseLanguage === 'he'
    ? 'כדי להשוות, כתוב לכל ספק כמה שקל שולחים וכמה באט מקבלים. אם שתי ההצעות הן על אותו סכום שליחה, כתוב זאת במפורש.'
    : 'To compare, tell me for each provider the send amount and recipient amount. If both quotes use the same send amount, say that explicitly.';
  return createResult(task, 'blocked', null, [warning], [question]);
}

async function executeUserSubmittedQuoteComparison(task, input) {
  const responseLanguage = isHebrewText(input.question || input.query) ? 'he' : 'en';
  const comparisonInput = isObject(input.userSubmittedQuoteComparison) ? input.userSubmittedQuoteComparison : {};
  const quoteInputs = Array.isArray(comparisonInput.quotes) ? comparisonInput.quotes : [];

  if (Array.isArray(comparisonInput.errors) && comparisonInput.errors.length > 0) {
    return blockedUserSubmittedQuoteComparison(task, responseLanguage);
  }

  if (quoteInputs.length !== 2) {
    return blockedUserSubmittedQuoteComparison(task, responseLanguage);
  }

  const first = normalizeUserSubmittedMoneyTransferQuote(quoteInputs[0]);
  const second = normalizeUserSubmittedMoneyTransferQuote(quoteInputs[1]);

  if (!first.ok || !second.ok || !first.providerKnown || !second.providerKnown) {
    return blockedUserSubmittedQuoteComparison(task, responseLanguage, 'invalid_user_submitted_quote_comparison');
  }

  const comparison = compareUserSubmittedTransferQuotes(first.quote, second.quote);

  return createResult(task, comparison.comparisonStatus === 'incompatible' ? 'partial' : 'success', {
    capability: 'finance.user_submitted_quote',
    quoteA: first.quote,
    quoteB: second.quote,
    comparison,
    message: formatUserSubmittedQuoteComparisonForChat(comparison, responseLanguage),
    suppressGenericFollowUp: true,
  }, ['user_reported_unverified_quote']);
}

async function executeUserSubmittedQuote(task, input) {
  const responseLanguage = isHebrewText(input.question || input.query) ? 'he' : 'en';

  if (isObject(input.userSubmittedQuoteComparison)) {
    return executeUserSubmittedQuoteComparison(task, input);
  }

  const quoteInput = isObject(input.userSubmittedQuote) ? input.userSubmittedQuote : {};
  const result = normalizeUserSubmittedMoneyTransferQuote(quoteInput);

  if (!result.ok) {
    const question = responseLanguage === 'he'
      ? 'איזה ספק, כמה שקל לשלוח, וכמה באט לקבל מופיעים בהצעה?'
      : 'Which provider, send amount, and recipient amount are shown in the quote?';
    return createResult(task, 'blocked', null, ['invalid_user_submitted_quote'], [question]);
  }

  if (!result.providerKnown || !result.quote.recipientAmount) {
    const question = responseLanguage === 'he'
      ? 'איזה ספק וכמה באט תקבל לפי ההצעה?'
      : 'Which provider and recipient amount are shown in the quote?';
    return createResult(task, 'blocked', null, ['ambiguous_user_submitted_quote'], [question]);
  }

  const trustedUserId = cleanText(input.userId);
  const taskKey = `${cleanText(task.requestId)}:${cleanText(task.taskId)}`;
  let persistence = { status: trustedUserId ? 'not_attempted' : 'missing_identity' };

  if (trustedUserId && !savedSingleQuoteTaskKeys.has(taskKey)) {
    try {
      const saved = await quoteRepository.saveUserSubmittedTransferQuote({
        userId: trustedUserId,
        requesterUserId: trustedUserId,
        quote: result.quote,
      });
      if (saved.saved) {
        savedSingleQuoteTaskKeys.add(taskKey);
        persistence = { status: 'saved' };
      } else {
        persistence = { status: 'failed' };
      }
    } catch (error) {
      persistence = { status: 'failed' };
    }
  } else if (trustedUserId && savedSingleQuoteTaskKeys.has(taskKey)) {
    persistence = { status: 'saved' };
  }

  return createResult(task, 'success', {
    capability: 'finance.user_submitted_quote',
    quote: result.quote,
    suppliedFields: result.suppliedFields,
    providerKnown: result.providerKnown,
    sourceTrust: result.quote.sourceTrust,
    quotePersistence: persistence,
    message: formatUserSubmittedQuoteForChat(result, responseLanguage, persistence),
    responseLanguage,
    suppressGenericFollowUp: true,
  }, ['user_reported_unverified_quote']);
}

async function executeSavedUserSubmittedQuote(task, input) {
  const responseLanguage = isHebrewText(input.question || input.query) ? 'he' : 'en';
  const trustedUserId = cleanText(input.userId);
  const recallInput = isObject(input.savedTransferQuoteRecall) ? input.savedTransferQuoteRecall : {};
  const requestedProviderId = cleanText(recallInput.requestedProviderId);
  const requestedProviderName = providerDisplayName(requestedProviderId);

  if (!trustedUserId) {
    const question = responseLanguage === 'he'
      ? 'לא הצלחתי לזהות פרופיל משתמש מאומת, ולכן איני יכול להציג הצעות שמורות.'
      : 'I could not identify a trusted user profile, so I cannot show saved quotes.';
    return createResult(task, 'blocked', {
      capability: 'finance.saved_user_submitted_quote',
      message: question,
      responseLanguage,
      suppressGenericFollowUp: true,
    }, ['missing_trusted_user_identity'], [question]);
  }

  if (recallInput.providerAmbiguous) {
    const message = responseLanguage === 'he'
      ? 'איזה ספק לבדוק בהצעות השמורות שלך? למשל Neema, Monox, GMT או Remitly/Rewire.'
      : 'Which provider should I check in your saved quotes? For example: Neema, Monox, GMT, or Remitly/Rewire.';
    return createResult(task, 'blocked', {
      capability: 'finance.saved_user_submitted_quote',
      message,
      responseLanguage,
      suppressGenericFollowUp: true,
    }, ['ambiguous_saved_quote_provider'], [message]);
  }

  let recent;
  try {
    recent = await quoteRepository.findRecentUserSubmittedTransferQuotes({
      userId: trustedUserId,
      requesterUserId: trustedUserId,
      providerId: requestedProviderId || undefined,
      limit: 1,
    });
  } catch (error) {
    recent = { ok: false, quotes: [] };
  }

  if (!recent?.ok) {
    const message = responseLanguage === 'he'
      ? 'לא הצלחתי לקרוא את ההצעות השמורות כרגע. נסה שוב מאוחר יותר.'
      : 'I could not read your saved quotes right now. Please try again later.';
    return createResult(task, 'partial', {
      capability: 'finance.saved_user_submitted_quote',
      message,
      responseLanguage,
      suppressGenericFollowUp: true,
    }, ['saved_quote_retrieval_failed']);
  }

  const [latestQuote] = Array.isArray(recent.quotes) ? recent.quotes : [];
  if (!latestQuote) {
    const message = responseLanguage === 'he'
      ? (requestedProviderId
        ? `אין לי עדיין הצעת העברת כספים שמורה עבורך מחברת ${requestedProviderName}.`
        : 'אין לי עדיין הצעת העברת כספים שמורה עבורך.')
      : (requestedProviderId
        ? `I do not have a saved money-transfer quote for you from ${requestedProviderName} yet.`
        : 'I do not have a saved money-transfer quote for you yet.');
    return createResult(task, 'partial', {
      capability: 'finance.saved_user_submitted_quote',
      message,
      responseLanguage,
      suppressGenericFollowUp: true,
    }, ['no_saved_user_submitted_quote']);
  }

  return createResult(task, 'success', {
    capability: 'finance.saved_user_submitted_quote',
    quote: latestQuote.quote || latestQuote,
    storedQuote: latestQuote,
    sourceTrust: latestQuote.quote?.sourceTrust || latestQuote.sourceTrust || {},
    message: formatSavedUserSubmittedQuoteForChat(latestQuote, responseLanguage),
    responseLanguage,
    suppressGenericFollowUp: true,
  }, ['user_reported_unverified_quote']);
}

async function findLatestSavedQuoteForProvider(userId, providerId) {
  const result = await quoteRepository.findRecentUserSubmittedTransferQuotes({
    userId,
    requesterUserId: userId,
    providerId,
    limit: 1,
  });

  if (!result?.ok) {
    return { ok: false, quote: null };
  }

  return {
    ok: true,
    quote: Array.isArray(result.quotes) ? result.quotes[0] || null : null,
  };
}

async function executeSavedUserSubmittedQuoteComparison(task, input) {
  const responseLanguage = isHebrewText(input.question || input.query) ? 'he' : 'en';
  const trustedUserId = cleanText(input.userId);
  const comparisonInput = isObject(input.savedTransferQuoteComparison) ? input.savedTransferQuoteComparison : {};
  const providerIds = Array.isArray(comparisonInput.providerIds)
    ? comparisonInput.providerIds.map(cleanText).filter(Boolean)
    : [];

  if (!trustedUserId) {
    const message = responseLanguage === 'he'
      ? 'לא הצלחתי לזהות פרופיל משתמש מאומת, ולכן איני יכול להשוות הצעות שמורות.'
      : 'I could not identify a trusted user profile, so I cannot compare saved quotes.';
    return createResult(task, 'blocked', {
      capability: 'finance.saved_user_submitted_quote_comparison',
      message,
      suppressGenericFollowUp: true,
    }, ['missing_trusted_user_identity'], [message]);
  }

  if (comparisonInput.providerAmbiguous || providerIds.length !== 2 || providerIds[0] === providerIds[1]) {
    const message = responseLanguage === 'he'
      ? 'כדי להשוות הצעות שמורות, כתוב שני ספקים ברורים, למשל Monox ו-Neema.'
      : 'To compare saved quotes, tell me two clear providers, for example Monox and Neema.';
    return createResult(task, 'blocked', {
      capability: 'finance.saved_user_submitted_quote_comparison',
      message,
      suppressGenericFollowUp: true,
    }, ['ambiguous_saved_quote_comparison_provider'], [message]);
  }

  let first;
  let second;
  try {
    [first, second] = await Promise.all([
      findLatestSavedQuoteForProvider(trustedUserId, providerIds[0]),
      findLatestSavedQuoteForProvider(trustedUserId, providerIds[1]),
    ]);
  } catch (error) {
    first = { ok: false, quote: null };
    second = { ok: false, quote: null };
  }

  if (!first?.ok || !second?.ok) {
    const message = responseLanguage === 'he'
      ? 'לא הצלחתי לקרוא את ההצעות השמורות כרגע. נסה שוב מאוחר יותר.'
      : 'I could not read your saved quotes right now. Please try again later.';
    return createResult(task, 'partial', {
      capability: 'finance.saved_user_submitted_quote_comparison',
      message,
      suppressGenericFollowUp: true,
    }, ['saved_quote_retrieval_failed']);
  }

  if (!first.quote || !second.quote) {
    const message = missingSavedQuoteComparisonMessage(
      providerIds[0],
      providerIds[1],
      first.quote,
      second.quote,
      responseLanguage
    );
    return createResult(task, 'partial', {
      capability: 'finance.saved_user_submitted_quote_comparison',
      quoteA: first.quote,
      quoteB: second.quote,
      message,
      suppressGenericFollowUp: true,
    }, ['missing_saved_user_submitted_quote']);
  }

  const quoteA = storedQuotePayload(first.quote);
  const quoteB = storedQuotePayload(second.quote);
  const comparison = compareUserSubmittedTransferQuotes(quoteA, quoteB);
  const status = comparison.comparisonStatus === 'incompatible' || comparison.comparisonStatus === 'insufficient_data'
    ? 'partial'
    : 'success';

  return createResult(task, status, {
    capability: 'finance.saved_user_submitted_quote_comparison',
    quoteA,
    quoteB,
    storedQuoteA: first.quote,
    storedQuoteB: second.quote,
    comparison,
    message: formatSavedUserSubmittedQuoteComparisonForChat(comparison, quoteA, quoteB, responseLanguage),
    suppressGenericFollowUp: true,
  }, ['user_reported_unverified_quote']);
}

async function executeKnowledgeCapability(task, input, capability, fallbackQuestion) {
  const question = cleanText(input.question || input.query || task?.description || task?.title);

  if (!question) return blocked(task, 'missing_required_input', fallbackQuestion);

  const result = await knowledgeAgentService.answerQuestion({
    question,
    userId: cleanText(input.userId),
    channel: cleanText(input.channel),
    channelUserId: cleanText(input.channelUserId),
  });

  if (result.status !== 'FOUND') {
    const fallback = createGenericFinanceFallback(task, capability, question);
    if (fallback) return fallback;
    return blocked(task, 'no_reliable_implementation', fallbackQuestion);
  }

  return createResult(task, 'success', {
    capability,
    knowledge: result,
  });
}

async function executeConsumerServices(task, input) {
  const profile = await resolveProfile(input);
  const query = cleanText(input.query || input.question || task?.description || task?.title);
  const search = isObject(input.search) ? input.search : serviceService.inferServiceSearch(query, profile);

  if (!query && !cleanText(search.category) && !cleanText(search.city) && !cleanText(search.language)) {
    return blocked(task, 'missing_required_input', 'What type of service, city, or language should I search for?');
  }

  const services = await serviceService.findMatchingServices(profile, search);
  if (!services.length) {
    const fallback = createGenericFinanceFallback(task, 'consumer.services', query);
    if (fallback) return fallback;
  }

  return createResult(task, services.length ? 'success' : 'partial', {
    capability: 'consumer.services',
    search,
    services,
    count: services.length,
    message: serviceService.formatServicesForChat(services),
  });
}

const financeConsumerAgent = {
  id: 'finance_consumer_agent',
  name: 'Finance & Consumer Agent',
  version: multiAgentConfig.defaultAgentVersion,
  domain: 'finance_consumer',
  capabilities: [...SUPPORTED_CAPABILITIES],
  transferResponseLanguages: TRANSFER_RESPONSE_LANGUAGES,
  supportsTransferResponseLanguage,
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

      if (capability === 'finance.budget') return executeBudget(task, input);
      if (capability === 'finance.exchange_rate') return executeExchangeRate(task, input);
      if (capability === 'finance.transfer') return executeTransfer(task, input);
      if (capability === 'finance.user_submitted_quote') return executeUserSubmittedQuote(task, input);
      if (capability === 'finance.saved_user_submitted_quote') return executeSavedUserSubmittedQuote(task, input);
      if (capability === 'finance.saved_user_submitted_quote_comparison') {
        return executeSavedUserSubmittedQuoteComparison(task, input);
      }
      if (capability === 'finance.bank') {
        return executeKnowledgeCapability(
          task,
          input,
          capability,
          'What banking question should I check?'
        );
      }
      if (capability === 'consumer.compare') {
        return executeKnowledgeCapability(
          task,
          input,
          capability,
          'What product, service, or provider should I compare?'
        );
      }
      if (capability === 'consumer.services') return executeConsumerServices(task, input);

      return blocked(task, 'unsupported_capability');
    } catch (error) {
      return createResult(task, 'failed', {}, ['execution_failed'], []);
    }
  },
};

module.exports = {
  financeConsumerAgent,
  setUserSubmittedTransferQuoteRepositoryForTest,
};
