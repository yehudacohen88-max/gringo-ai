const { multiAgentConfig } = require('../../../config/agents');
const jobService = require('../../jobs/job.service');
const knowledgeAgentService = require('../../knowledge-agent/knowledge-agent.service');
const knowledgeBaseService = require('../../knowledge-agent/knowledge-base.service');
const documentService = require('../../documents/document.service');
const crmAgentService = require('../../crm-agent/crm-agent.service');
const {
  PATH_STATUS,
  resolveOvertimeClassification,
} = require('./overtime-classification.resolver');

const SUPPORTED_CAPABILITIES = Object.freeze([
  'jobs.search',
  'jobs.match',
  'jobs.salary',
  'employment.documents',
  'employment.support',
]);

const SALARY_PAYMENT_TIMING_SAFE_FALLBACK = 'I should not guess the exact Israel salary-payment deadline because Gringo does not yet have a verified salary-payment timing rule loaded. Use your agreed payday, payslip, contract, or verified worker-rights guidance to confirm when payment is due. If the payment is late, keep your work records, messages, contract, and payslips, then ask the employer clearly about the missing payment.';
const SALARY_PAYMENT_FREQUENCY_QUESTION = 'If you are paid monthly, I can explain the monthly salary-payment rule. Are you paid monthly, hourly, daily, or another way?';
const MISSING_SALARY_PERIOD_AND_FREQUENCY_QUESTION = "I can help you check this. Which month's salary or payment period is missing, and are you paid monthly, hourly, daily, or another way?";
const MISSING_SALARY_PERIOD_QUESTION = "I can help you check this. Which month's salary or payment period is missing?";
const MISSING_SALARY_TIMING_CONTEXT_QUESTION = 'What date should I use to check this missing salary situation?';
const MISSING_SALARY_UNSUPPORTED_FREQUENCY_RESPONSE = 'I only have verified missing-salary knowledge for monthly-paid workers right now. I should not apply that monthly rule to your payment type. Gringo needs the applicable verified rule for how you are paid before evaluating this safely.';
const SALARY_CALCULATION_FACT_QUESTION = 'I can help prepare a salary check, but I need your pay rate and how much you worked in the period you want to calculate.';
const SALARY_CALCULATION_RATE_QUESTION = 'I have the work amount, but I still need your pay rate before I can prepare a salary check.';
const SALARY_CALCULATION_WORK_QUANTITY_QUESTION = 'I have the pay rate, but I still need how many hours or days you worked in the period you want to calculate.';
const SALARY_CALCULATION_REGULAR_HOURS_QUESTION = 'I have your hourly rate, but I need to know how many regular hours you worked before I can calculate basic gross pay.';
const SALARY_CALCULATION_REGULAR_HOURS_FROM_TOTAL_QUESTION = 'I have your hourly rate and total hours, but I need to know how many of those hours were regular hours before I can calculate basic gross pay.';
const SALARY_CALCULATION_CURRENCY_QUESTION = 'I have your hourly rate amount and regular hours, but I need the currency for that hourly rate before I can calculate basic gross pay.';
const SALARY_CALCULATION_DAILY_HOURS_QUESTION = 'I have your hourly rate, but I need how many hours you worked in the day you want to check.';
const SALARY_CALCULATION_WORKWEEK_DAYS_QUESTION = 'I have your hourly rate and daily hours, but I need to know whether the applicable workweek is 5 days or 6 days.';
const SALARY_CALCULATION_UNVERIFIED_RULE_RESPONSE = 'I have the basic salary facts, but Gringo does not yet have verified salary-calculation rules loaded for this situation, so I should not give a final legal salary amount yet.';

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeEmploymentMessage(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[ג€™']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s?.!,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyEmploymentIntent(message = '', context = {}) {
  const normalized = normalizeEmploymentMessage(message || context.message || context.question || context.query);

  if (!normalized) {
    return { intent: 'unknown_employment' };
  }

  if (
    /\b(payslip|pay slip|salary slip|wage slip)\b/.test(normalized)
    || /\bwhat should appear on my pay\b/.test(normalized)
  ) {
    return { intent: 'payslip' };
  }

  if (
    /\b(overtime|extra pay|extra hours|extra time)\b/.test(normalized)
    || /\btime and a half\b/.test(normalized)
  ) {
    return { intent: 'overtime' };
  }

  if (
    /\b(rest day|rest days|weekly rest|day off|days off)\b/.test(normalized)
    || /\bwork every day\b/.test(normalized)
  ) {
    return { intent: 'rest_days' };
  }

  if (
    /\b(safety|safe|unsafe|helmet|protective equipment|safety equipment|ppe|injured at work|work accident)\b/.test(normalized)
  ) {
    return { intent: 'workplace_safety' };
  }

  if (
    /\b(employer housing|employer apartment|employers apartment|provided by my employer|housing provided)\b/.test(normalized)
    || /\b(my employer|employer).*\b(apartment|housing|room|hot water|water|electricity|mold|broken)\b/.test(normalized)
  ) {
    return { intent: 'employer_housing' };
  }

  if (
    /\b(contract|employment agreement|work agreement)\b/.test(normalized)
    || /\bdo i need.*contract\b/.test(normalized)
  ) {
    return { intent: 'employment_contract' };
  }

  if (
    /\b(document|documents|permit|visa|work visa|work permit|passport|missing document)\b/.test(normalized)
  ) {
    return { intent: 'employment_documents' };
  }

  if (
    /\b(working hours|work hours|normal hours|hours can i work|hours may i work|how many hours)\b/.test(normalized)
    || /\bhours did i work\b/.test(normalized)
  ) {
    return { intent: 'working_hours' };
  }

  if (
    /\b(not paid|has not paid|havent been paid|have not been paid|did not get paid|didnt get paid|did not pay me|didnt pay me|did not receive my salary|didnt receive my salary|unpaid|salary is late|salary is missing|late salary|late pay|late wages|missing salary)\b/.test(normalized)
    || /\b(did not receive|didnt receive).*\bsalary\b/.test(normalized)
  ) {
    return { intent: 'missing_salary' };
  }

  if (
    /\b(how much salary|calculate my salary|salary amount|amount correct|salary correct|wage calculation|calculate wages|how much should i receive)\b/.test(normalized)
    || /\b(employer|boss).*\bpaid me\b.*\bcorrect\b/.test(normalized)
    || /\bpaid me\b.*\b(correct|right)\b/.test(normalized)
    || /\b(earn|make|get|paid)\s+\d+.*\b(per|an|a)\s+hour\b/.test(normalized)
    || /\b\d+\s*(ils|nis|shekels?)\s+hour\b/.test(normalized)
  ) {
    return { intent: 'salary_amount_or_calculation' };
  }

  if (
    /\b(when|what day|which day|date|deadline).*\b(salary|pay|paid|wage|wages)\b/.test(normalized)
    || /\b(salary|pay|wage|wages).*\b(when|what day|which day|date|deadline|paid)\b/.test(normalized)
    || /\bemployer have to pay me\b/.test(normalized)
  ) {
    return { intent: 'salary_payment_timing' };
  }

  if (
    /\b(find|looking for|look for|need|search|available|open).*\b(job|jobs|work|position|employment)\b/.test(normalized)
    || /\b(job|jobs|position).*\b(in|near|available|open)\b/.test(normalized)
  ) {
    return { intent: 'job_search' };
  }

  if (
    /\b(problem|issue|trouble|unfair|unfairly|mistreat|treating me badly|treating me unfairly|abuse|complaint).*\bemployer\b/.test(normalized)
    || /\bemployer.*\b(problem|issue|trouble|unfair|unfairly|mistreat|treating me badly|treating me unfairly|abuse|complaint)\b/.test(normalized)
  ) {
    return { intent: 'employer_issue' };
  }

  return { intent: 'unknown_employment' };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePaymentFrequency(value) {
  const normalized = normalizeEmploymentMessage(value).replace(/-/g, ' ');
  if (!normalized) return '';
  if (/\b(monthly|month|per month|salary by month)\b/.test(normalized)) return 'monthly';
  if (/\b(hourly|hour|per hour)\b/.test(normalized)) return 'hourly';
  if (/\b(daily|day|per day)\b/.test(normalized)) return 'daily';
  if (/\b(weekly|week|per week)\b/.test(normalized)) return 'weekly';
  return '';
}

function combinedInputText(input = {}) {
  return [
    input.question,
    input.query,
    input.followUpAnswer,
    input.sourceMessage,
    input.paymentPeriod,
    input.salaryPaymentPeriod,
    input.missingSalaryPeriod,
  ].map(cleanText).filter(Boolean).join(' ');
}

function resolvePaymentPeriod(input = {}) {
  const direct = cleanText(input.paymentPeriod || input.salaryPaymentPeriod || input.missingSalaryPeriod);
  if (direct) return direct;

  const normalized = normalizeEmploymentMessage(combinedInputText(input));
  const monthMatch = normalized.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/);
  if (monthMatch) {
    return [monthMatch[1], monthMatch[2]].filter(Boolean).join(' ');
  }

  const isoMonthMatch = normalized.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  if (isoMonthMatch) return isoMonthMatch[0];

  return '';
}

function resolvePaymentReceivedStatus(input = {}) {
  if (typeof input.paymentReceived === 'boolean') return input.paymentReceived ? 'received' : 'not_received';
  const direct = cleanText(input.paymentReceived || input.paymentReceivedStatus || input.salaryReceived);
  if (direct) {
    const normalizedDirect = normalizeEmploymentMessage(direct);
    if (/\b(no|not|missing|unpaid|didnt|did not)\b/.test(normalizedDirect)) return 'not_received';
    if (/\b(yes|received|paid)\b/.test(normalizedDirect)) return 'received';
  }

  const normalized = normalizeEmploymentMessage(combinedInputText(input));
  if (/\b(did not receive|didnt receive|not received|not paid|has not paid|have not been paid|did not get paid|didnt get paid|unpaid|missing salary|salary is missing)\b/.test(normalized)) {
    return 'not_received';
  }

  return '';
}

function parseCurrentDate(input = {}) {
  const value = cleanText(input.currentDate || input.evaluationDate || input.today || input.dateContext);
  if (!value) return new Date();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePaymentPeriodEnd(paymentPeriod = '', currentDate = new Date()) {
  const normalized = normalizeEmploymentMessage(paymentPeriod);
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthMatch = normalized.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/);
  const isoMonthMatch = normalized.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  let year = currentDate.getUTCFullYear();
  let monthIndex = -1;

  if (monthMatch) {
    monthIndex = months.indexOf(monthMatch[1]);
    if (monthMatch[2]) year = Number(monthMatch[2]);
    if (!monthMatch[2] && monthIndex > currentDate.getUTCMonth()) year -= 1;
  } else if (isoMonthMatch) {
    year = Number(isoMonthMatch[1]);
    monthIndex = Number(isoMonthMatch[2]) - 1;
  }

  if (monthIndex < 0) return null;
  return new Date(Date.UTC(year, monthIndex + 1, 0));
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function resolveMissingSalaryFacts(input = {}) {
  const paymentFrequency = resolvePaymentFrequency(input);
  const paymentPeriod = resolvePaymentPeriod(input);
  const paymentReceivedStatus = resolvePaymentReceivedStatus(input);
  const currentDate = parseCurrentDate(input);
  const periodEndDate = currentDate && paymentPeriod ? parsePaymentPeriodEnd(paymentPeriod, currentDate) : null;
  const delayedSalaryDate = periodEndDate
    ? new Date(Date.UTC(periodEndDate.getUTCFullYear(), periodEndDate.getUTCMonth(), periodEndDate.getUTCDate() + 9))
    : null;

  return {
    paymentFrequency,
    paymentPeriod,
    paymentReceivedStatus,
    currentDate,
    periodEndDate,
    delayedSalaryDate,
  };
}

function resolvePaymentFrequency(input = {}) {
  const profile = isObject(input.profile) ? input.profile : {};
  return normalizePaymentFrequency(
    input.paymentFrequency
    || input.workerType
    || input.payFrequency
    || input.salaryFrequency
    || profile.paymentFrequency
    || profile.workerType
    || profile.payFrequency
    || profile.salaryFrequency
    || combinedInputText(input)
  );
}

function parseNumber(value = '') {
  const normalized = cleanText(value).replace(/,/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseNumberWord(value = '') {
  const normalized = normalizeEmploymentMessage(value);
  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };

  return Object.prototype.hasOwnProperty.call(words, normalized) ? words[normalized] : null;
}

function parseNumberLike(value = '') {
  const numeric = parseNumber(value);
  return numeric !== null ? numeric : parseNumberWord(value);
}

function resolveSalaryRate(input = {}) {
  const direct = parseNumber(input.salaryRate || input.payRate || input.hourlyRate || input.dailyRate || input.monthlyRate);
  if (direct !== null) return direct;

  const text = combinedInputText(input);
  const rateMatch = text.match(/\b(?:earn|make|get|paid|rate is|salary is)\s+([0-9][0-9,]*(?:\.\d+)?)\s*(?:ils|nis|shekels?)?\s*(?:per|an|a|\/)\s*(hour|day|month|week)\b/i)
    || text.match(/\bhourly\s+rate\s+is\s+([0-9][0-9,]*(?:\.\d+)?)\s*(?:ils|nis|shekels?)?\b/i)
    || text.match(/\b([0-9][0-9,]*(?:\.\d+)?)\s*(?:ils|nis|shekels?)\s*(?:per|an|a|\/)\s*(hour|day|month|week)\b/i)
    || text.match(/\b([0-9][0-9,]*(?:\.\d+)?)\s*(?:ils|nis|shekels?)\s*\/\s*(hour|hr|day|month|week)\b/i);
  return rateMatch ? parseNumber(rateMatch[1]) : null;
}
function resolveSalaryRateType(input = {}) {
  const direct = normalizePaymentFrequency(input.salaryRateType || input.rateType || input.paymentFrequency || input.workerType);
  if (direct) return direct;

  const rawText = combinedInputText(input);
  if (/\/\s*(?:hour|hr)\b/i.test(rawText)) return 'hourly';
  if (/\/\s*(?:day)\b/i.test(rawText)) return 'daily';
  if (/\/\s*(?:month)\b/i.test(rawText)) return 'monthly';
  if (/\/\s*(?:week)\b/i.test(rawText)) return 'weekly';

  const text = normalizeEmploymentMessage(combinedInputText(input));
  if (/\bhourly\s+rate\b/.test(text)) return 'hourly';
  if (/\b(?:per|an|a|\/)\s*hour\b|\bhourly\b/.test(text)) return 'hourly';
  if (/\b(?:per|a|\/)\s*day\b|\bdaily\b/.test(text)) return 'daily';
  if (/\b(?:per|a|\/)\s*month\b|\bmonthly\b/.test(text)) return 'monthly';
  if (/\b(?:per|a|\/)\s*week\b|\bweekly\b/.test(text)) return 'weekly';
  return '';
}

function resolveWorkQuantity(input = {}) {
  const direct = parseNumber(input.hoursWorked || input.workHours || input.daysWorked || input.workDays);
  if (direct !== null) return direct;

  const text = combinedInputText(input);
  const match = text.match(/\bworked\s+([0-9][0-9,]*(?:\.\d+)?)\s*(hours?|hrs?|days?)\b/i)
    || text.match(/\b([0-9][0-9,]*(?:\.\d+)?)\s*(hours?|hrs?|days?)\s+(?:worked|this|in)\b/i);
  return match ? parseNumber(match[1]) : null;
}

function resolveDailyHoursWorked(input = {}) {
  const direct = parseNumber(input.dailyHoursWorked || input.dailyHours || input.hoursWorkedToday);
  if (direct !== null) return direct;

  const text = combinedInputText(input);
  const match = text.match(/\b(?:worked|work)\s+([0-9][0-9,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?|hrs?)\s*(?:today|that day|a day|each day|per day|daily)\b/i)
    || text.match(/\b(?:my\s+)?shift\s+was\s+([0-9][0-9,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?|hrs?)\b/i)
    || text.match(/\b([0-9][0-9,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?|hrs?)\s*(?:today|that day|a day|each day|per day|daily)\b/i);
  return match ? parseNumberLike(match[1]) : null;
}

function resolveRegularHours(input = {}) {
  const direct = parseNumber(input.regularHours);
  if (direct !== null) return direct;

  const text = combinedInputText(input);
  const match = text.match(/\b(?:worked|had)\s+([0-9][0-9,]*(?:\.\d+)?)\s*regular\s*(?:hours?|hrs?)\b/i)
    || text.match(/\b([0-9][0-9,]*(?:\.\d+)?)\s*regular\s*(?:hours?|hrs?)\b/i);
  return match ? parseNumber(match[1]) : null;
}

function resolveWorkQuantityType(input = {}) {
  const direct = cleanText(input.workQuantityType || input.hoursType || input.daysType);
  if (direct) return direct;

  const text = normalizeEmploymentMessage(combinedInputText(input));
  if (/\b(hours|hour|hrs|hr)\b/.test(text)) return 'hours';
  if (/\b(days|day)\b/.test(text)) return 'days';
  return '';
}

function resolveAmountAlreadyPaid(input = {}) {
  const direct = parseNumber(input.amountAlreadyPaid || input.amountPaid || input.paidAmount);
  if (direct !== null) return direct;

  const text = combinedInputText(input);
  const match = text.match(/\b(?:employer|boss)?\s*paid me\s+([0-9][0-9,]*(?:\.\d+)?)\s*(?:ils|nis|shekels?|₪)?\b/i);
  return match ? parseNumber(match[1]) : null;
}

function resolveWorkweekDays(input = {}) {
  const direct = parseNumber(input.workweekDays || input.weeklyWorkDays || input.daysPerWeek);
  if (direct !== null) return direct;

  const text = normalizeEmploymentMessage(combinedInputText(input));
  const matches = [];
  const workweekPattern = /\b(?:normally\s+)?(?:work|working|regular|usual|applicable)?\s*(5|6|five|six)\s*(?:day|days)(?:\s*a|\s*per)?\s*week\b|\b(5|6)\s*day\s*workweek\b/g;
  let match = workweekPattern.exec(text);

  while (match) {
    matches.push(parseNumberLike(match[1] || match[2]));
    match = workweekPattern.exec(text);
  }

  const uniqueMatches = Array.from(new Set(matches.filter((value) => value === 5 || value === 6)));
  if (uniqueMatches.length === 1) return uniqueMatches[0];
  return null;
}

function resolveWeeklyHoursWorked(input = {}) {
  const direct = parseNumber(input.weeklyHoursWorked || input.weeklyHours || input.hoursWorkedThisWeek);
  if (direct !== null) return direct;

  const text = combinedInputText(input);
  const match = text.match(/\b(?:worked|work)\s+([0-9][0-9,]*(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:this week|per week|a week|weekly)\b/i)
    || text.match(/\b(?:my\s+)?total\s+(?:this week|for this week)\s+was\s+([0-9][0-9,]*(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i)
    || text.match(/\b([0-9][0-9,]*(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:this week|per week|a week|weekly)\b/i);
  return match ? parseNumber(match[1]) : null;
}

function resolveRepeatedWorkdaysCount(input = {}) {
  const direct = parseNumber(input.repeatedWorkdaysCount || input.sameHoursWorkdaysCount);
  if (direct !== null) return direct;

  const text = combinedInputText(input);
  const match = text.match(/\b(?:worked|work)\s+(?:[0-9][0-9,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?|hrs?)\s*(?:a day|each day|per day|daily)\s+for\s+([0-9][0-9,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:days?|workdays?)\b/i)
    || text.match(/\b(?:for\s+)?([0-9][0-9,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:days?|workdays?)\s*(?:at|with)\s*(?:the\s+same\s+)?(?:[0-9][0-9,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hours?|hrs?)\s*(?:a day|each day|per day|daily)\b/i);
  return match ? parseNumberLike(match[1]) : null;
}

function resolveSameHoursEachDay(input = {}) {
  if (input.sameHoursEachDay === true || input.sameHoursEachDay === false) return input.sameHoursEachDay;

  const text = normalizeEmploymentMessage(combinedInputText(input));
  if (/\b(?:hours?|hrs?)\s*(?:a day|each day|per day|daily)\s+for\s+(?:[0-9]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:days?|workdays?)\b/.test(text)) {
    return true;
  }
  return false;
}

function resolveBooleanFact(input = {}, fields = []) {
  for (const field of fields) {
    if (input[field] === true || input[field] === false) return input[field];
    const normalized = normalizeEmploymentMessage(input[field]);
    if (/\b(true|yes|verified)\b/.test(normalized)) return true;
    if (/\b(false|no|not applicable)\b/.test(normalized)) return false;
  }
  return null;
}

function resolveSpecialDayContext(input = {}) {
  const direct = cleanText(input.specialDayContext || input.workDayType);
  if (direct) return direct;

  const text = normalizeEmploymentMessage(combinedInputText(input));
  if (/\bholiday\b/.test(text)) return 'holiday';
  if (/\bholiday eve\b/.test(text)) return 'holiday_eve';
  if (/\b(rest day|weekly rest)\b/.test(text)) return 'weekly_rest';
  if (/\b(shortened workday|short day)\b/.test(text)) return 'shortened_workday';
  if (/\b(special day|special context)\b/.test(text)) return 'unknown_special_context';
  return '';
}

function resolveSalaryCurrency(input = {}) {
  const direct = cleanText(input.hourlyRateCurrency || input.rateCurrency || input.currency || input.salaryCurrency).toUpperCase();
  if (direct) return direct;

  const text = combinedInputText(input);
  if (/\b(ils|nis|shekels?)\b|₪/i.test(text)) return 'ILS';
  if (/\busd\b|\bdollars?\b/i.test(text)) return 'USD';
  if (/\bthb\b|\bbaht\b/i.test(text)) return 'THB';
  return '';
}

function resolveWorkPeriod(input = {}) {
  const direct = cleanText(input.workPeriod || input.salaryPeriod || input.paymentPeriod);
  if (direct) return direct;

  const text = normalizeEmploymentMessage(combinedInputText(input));
  if (/\bthis month\b/.test(text)) return 'this month';
  const monthMatch = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?\b/);
  return monthMatch ? monthMatch[0] : '';
}

function resolveSalaryCalculationFacts(input = {}) {
  const salaryRate = resolveSalaryRate(input);
  const salaryRateType = resolveSalaryRateType(input);
  const workQuantity = resolveWorkQuantity(input);
  const workQuantityType = resolveWorkQuantityType(input);
  const regularHours = resolveRegularHours(input);
  const amountAlreadyPaid = resolveAmountAlreadyPaid(input);
  const repeatedWorkdaysCount = resolveRepeatedWorkdaysCount(input);

  return {
    paymentFrequency: resolvePaymentFrequency(input),
    salaryRate,
    salaryRateType,
    workPeriod: resolveWorkPeriod(input),
    workQuantity,
    workQuantityType,
    hoursWorked: workQuantityType === 'hours' ? workQuantity : null,
    regularHours,
    dailyHoursWorked: resolveDailyHoursWorked(input),
    workweekDays: resolveWorkweekDays(input),
    weeklyHoursWorked: resolveWeeklyHoursWorked(input),
    repeatedWorkdaysCount,
    sameHoursEachDay: repeatedWorkdaysCount !== null ? resolveSameHoursEachDay(input) : false,
    workDayType: cleanText(input.workDayType) || '',
    isNightWork: resolveBooleanFact(input, ['isNightWork']),
    shortenedWorkdayRuleApplicable: resolveBooleanFact(input, ['shortenedWorkdayRuleApplicable']),
    isDayBeforeWeeklyRest: resolveBooleanFact(input, ['isDayBeforeWeeklyRest']),
    isDayBeforeApplicableHoliday: resolveBooleanFact(input, ['isDayBeforeApplicableHoliday']),
    workOccurredDuringWeeklyRest: resolveBooleanFact(input, ['workOccurredDuringWeeklyRest']),
    specialDayContext: resolveSpecialDayContext(input),
    overtimeHours: parseNumber(input.overtimeHours),
    restDayOrSpecialDayWork: /\b(rest day|holiday|special day)\b/i.test(combinedInputText(input)),
    amountAlreadyPaid,
    currency: resolveSalaryCurrency(input),
  };
}

function shouldAttemptOvertimeSalaryCalculation(facts = {}) {
  return (
    facts.dailyHoursWorked !== null
    || facts.weeklyHoursWorked !== null
    || facts.workweekDays !== null
    || facts.isNightWork === true
    || facts.shortenedWorkdayRuleApplicable === true
    || facts.isDayBeforeWeeklyRest === true
    || facts.isDayBeforeApplicableHoliday === true
    || facts.workOccurredDuringWeeklyRest === true
    || Boolean(facts.specialDayContext)
  );
}

function resolveOvertimeContext(facts = {}) {
  return {
    workweekDays: facts.workweekDays,
    dailyHoursWorked: facts.dailyHoursWorked,
    weeklyHoursWorked: facts.weeklyHoursWorked,
    workDayType: facts.workDayType || (facts.specialDayContext ? '' : 'regular'),
    isNightWork: facts.isNightWork,
    shortenedWorkdayRuleApplicable: facts.shortenedWorkdayRuleApplicable,
    isDayBeforeWeeklyRest: facts.isDayBeforeWeeklyRest,
    isDayBeforeApplicableHoliday: facts.isDayBeforeApplicableHoliday,
    workOccurredDuringWeeklyRest: facts.workOccurredDuringWeeklyRest,
    specialDayContext: facts.specialDayContext,
  };
}

function calculateDailyOvertimePay(hourlyRate, overtimeHours, multiplierRule) {
  const firstTwoHours = Math.min(overtimeHours, 2);
  const laterHours = Math.max(0, overtimeHours - 2);
  const firstTwoMultiplier = multiplierRule.rule.multipliers.firstOvertimeHourMultiplier;
  const laterMultiplier = multiplierRule.rule.multipliers.thirdAndLaterOvertimeHourMultiplier;

  return {
    firstTwoHours,
    laterHours,
    firstTwoMultiplier,
    laterMultiplier,
    firstTwoPay: firstTwoHours * hourlyRate * firstTwoMultiplier,
    laterPay: laterHours * hourlyRate * laterMultiplier,
  };
}

function formatAmount(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function getInput(task = {}) {
  return isObject(task.input) ? task.input : {};
}

function hasSearchSignals(value = {}) {
  return ['profession', 'workSector', 'city', 'area', 'preferredJobProfession', 'preferredJobCity'].some((field) =>
    cleanText(value[field])
  );
}

function createResult(task, status, output = {}, warnings = [], followUpQuestions = []) {
  return {
    taskId: cleanText(task?.taskId),
    status,
    output,
    warnings,
    followUpQuestions,
    completedAt: new Date().toISOString(),
  };
}

function blocked(task, warning, question = '') {
  return createResult(task, 'blocked', {}, [warning], question ? [question] : []);
}

async function resolveProfile(input = {}) {
  if (isObject(input.profile)) return input.profile;

  const userId = cleanText(input.userId);
  if (!userId) return {};

  return (await crmAgentService.getUserMemory(userId)) || { userId };
}

async function executeJobsSearch(task, input) {
  const jobs = await jobService.getActiveJobs();
  return createResult(task, 'success', {
    capability: 'jobs.search',
    jobs,
    count: jobs.length,
  });
}

async function executeJobsMatch(task, input) {
  const profile = await resolveProfile(input);
  const searchContext = isObject(input.searchContext) ? input.searchContext : {};

  if (!hasSearchSignals(profile) && !hasSearchSignals(searchContext)) {
    return blocked(
      task,
      'missing_required_input',
      'What city, work sector, or profession should I use to match jobs?'
    );
  }

  const jobs = await jobService.findMatchingJobs(profile, searchContext);
  return createResult(task, 'success', {
    capability: 'jobs.match',
    jobs,
    count: jobs.length,
    message: jobService.formatJobsForChat(jobs),
  });
}

async function executeKnowledgeCapability(task, input, capability, fallbackQuestion) {
  const question = cleanText(input.question || input.query || task?.description || task?.title);

  if (!question) {
    return blocked(task, 'missing_required_input', fallbackQuestion);
  }

  const employmentIntent = classifyEmploymentIntent(question, input);
  if (capability === 'jobs.salary' && employmentIntent.intent === 'missing_salary') {
    return handleMissingSalary(task, input);
  }

  if (capability === 'jobs.salary' && employmentIntent.intent === 'salary_payment_timing') {
    return handleSalaryPaymentTiming(task, input, employmentIntent);
  }

  if (capability === 'jobs.salary' && employmentIntent.intent === 'salary_amount_or_calculation') {
    return handleSalaryCalculation(task, input);
  }

  const result = await knowledgeAgentService.answerQuestion({
    question,
    userId: cleanText(input.userId),
    channel: cleanText(input.channel),
    channelUserId: cleanText(input.channelUserId),
  });

  return createResult(task, result.status === 'FOUND' ? 'success' : 'partial', {
    capability,
    knowledge: result,
  });
}

function handleSalaryCalculation(task, input = {}) {
  const facts = resolveSalaryCalculationFacts({
    ...input,
    sourceMessage: cleanText(input.sourceMessage || task?.metadata?.sourceMessage),
  });

  if (shouldAttemptOvertimeSalaryCalculation(facts)) {
    const overtimeContext = resolveOvertimeContext(facts);
    const overtimeClassification = resolveOvertimeClassification(overtimeContext);
    const dailyClassification = overtimeClassification.dailyClassification || {};
    const weeklyCandidateHours = overtimeClassification.weeklyClassification?.weeklyOvertimeCandidateHours || 0;
    const hasVerifiedSpecialBoundary = (
      facts.isNightWork === true
      || facts.shortenedWorkdayRuleApplicable === true
      || facts.isDayBeforeWeeklyRest === true
      || facts.isDayBeforeApplicableHoliday === true
    );
    const needsWorkweekDays = (
      facts.dailyHoursWorked !== null
      && facts.workweekDays === null
      && !hasVerifiedSpecialBoundary
      && !facts.specialDayContext
    );

    if (facts.salaryRate === null) {
      return createResult(task, 'blocked', {
        capability: 'jobs.salary',
        employmentIntent: 'salary_amount_or_calculation',
        message: SALARY_CALCULATION_RATE_QUESTION,
        needsSalaryCalculationFacts: true,
        missingFacts: ['salary_rate'],
        knownFacts: facts,
        needsVerifiedRule: true,
      }, ['missing_required_input'], [SALARY_CALCULATION_RATE_QUESTION]);
    }

    if (!facts.currency) {
      return createResult(task, 'blocked', {
        capability: 'jobs.salary',
        employmentIntent: 'salary_amount_or_calculation',
        message: SALARY_CALCULATION_CURRENCY_QUESTION,
        needsSalaryCalculationFacts: true,
        missingFacts: ['hourly_rate_currency'],
        knownFacts: facts,
        needsVerifiedRule: true,
      }, ['missing_required_input'], [SALARY_CALCULATION_CURRENCY_QUESTION]);
    }

    if (facts.salaryRateType !== 'hourly' && facts.paymentFrequency !== 'hourly') {
      return createResult(task, 'blocked', {
        capability: 'jobs.salary',
        employmentIntent: 'salary_amount_or_calculation',
        message: 'I can calculate overtime gross pay only for hourly pay in this step. What is your hourly rate?',
        needsSalaryCalculationFacts: true,
        missingFacts: ['hourly_payment_scope'],
        knownFacts: facts,
        needsVerifiedRule: true,
      }, ['unsupported_payment_scope'], ['I can calculate overtime gross pay only for hourly pay in this step. What is your hourly rate?']);
    }

    if (facts.dailyHoursWorked === null && facts.weeklyHoursWorked !== null) {
      const hasWeeklyOvertimeCandidate = weeklyCandidateHours > 0;
      const message = hasWeeklyOvertimeCandidate
        ? `I can identify possible weekly overtime above 42 hours: ${formatAmount(weeklyCandidateHours)} candidate hour(s), but I should not calculate final overtime pay from a weekly total alone because I do not know the daily sequence or whether any daily overtime overlaps with the weekly candidate hours.`
        : 'I can see the weekly total hours, but I do not have enough daily information to calculate daily overtime pay safely.';

      return createResult(task, 'partial', {
        capability: 'jobs.salary',
        employmentIntent: 'salary_amount_or_calculation',
        message,
        overtimeClassification,
        needsSalaryCalculationFacts: true,
        missingFacts: ['daily_hours_worked'],
        knownFacts: facts,
        needsVerifiedRule: true,
      }, ['weekly_total_only_salary_calculation_unresolved']);
    }

    if (facts.dailyHoursWorked === null) {
      return createResult(task, 'blocked', {
        capability: 'jobs.salary',
        employmentIntent: 'salary_amount_or_calculation',
        message: SALARY_CALCULATION_DAILY_HOURS_QUESTION,
        needsSalaryCalculationFacts: true,
        missingFacts: ['daily_hours_worked'],
        knownFacts: facts,
        needsVerifiedRule: true,
      }, ['missing_required_input'], [SALARY_CALCULATION_DAILY_HOURS_QUESTION]);
    }

    if (needsWorkweekDays) {
      if (weeklyCandidateHours > 0) {
        const message = [
          `I can identify possible weekly overtime above 42 hours: ${formatAmount(weeklyCandidateHours)} candidate hour(s).`,
          SALARY_CALCULATION_WORKWEEK_DAYS_QUESTION,
          'I should not calculate or add daily and weekly overtime together until the daily boundary is clear, because some hours may overlap.',
        ].join(' ');

        return createResult(task, 'partial', {
          capability: 'jobs.salary',
          employmentIntent: 'salary_amount_or_calculation',
          message,
          overtimeClassification,
          needsSalaryCalculationFacts: true,
          missingFacts: ['workweek_days'],
          knownFacts: facts,
          needsVerifiedRule: true,
        }, ['partial_overtime_overlap_unresolved'], [SALARY_CALCULATION_WORKWEEK_DAYS_QUESTION]);
      }

      return createResult(task, 'blocked', {
        capability: 'jobs.salary',
        employmentIntent: 'salary_amount_or_calculation',
        message: SALARY_CALCULATION_WORKWEEK_DAYS_QUESTION,
        needsSalaryCalculationFacts: true,
        missingFacts: ['workweek_days'],
        knownFacts: facts,
        needsVerifiedRule: true,
      }, ['missing_required_input'], [SALARY_CALCULATION_WORKWEEK_DAYS_QUESTION]);
    }

    const dailyCandidateHours = dailyClassification.dailyOvertimeCandidateHours || 0;
    const hasDailyWeeklyOverlap = dailyCandidateHours > 0 && weeklyCandidateHours > 0;
    const hasWeeklyRestInteraction = overtimeClassification.weeklyRestOvertimeInteractionDetected === true;
    const hasUnresolvedSpecialContext = dailyClassification.status === PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE;

    if (dailyClassification.status === PATH_STATUS.CLASSIFIED) {
      const multiplierRule = knowledgeBaseService.findVerifiedOvertimePayMultiplierRule();
      const regularHours = Math.min(facts.dailyHoursWorked, dailyClassification.regularDailyHoursBoundary);
      const regularPay = regularHours * facts.salaryRate;
      const overtimePay = calculateDailyOvertimePay(facts.salaryRate, dailyCandidateHours, multiplierRule);
      const overtimeGrossPay = overtimePay.firstTwoPay + overtimePay.laterPay;
      const dayCount = facts.sameHoursEachDay === true && facts.repeatedWorkdaysCount !== null
        ? facts.repeatedWorkdaysCount
        : 1;
      const grossPay = (regularPay + overtimeGrossPay) * dayCount;
      const regularPayTotal = regularPay * dayCount;
      const overtimeGrossPayTotal = overtimeGrossPay * dayCount;
      const repeatedDayPrefix = dayCount > 1 ? `For ${formatAmount(dayCount)} identical supplied day(s), ` : 'For the supplied day, ';
      const responseLines = [
        `${repeatedDayPrefix}I can safely calculate the gross pay for these hours: regular hours: ${formatAmount(regularHours)} per day at ${formatAmount(facts.salaryRate)} ${facts.currency} = ${formatAmount(regularPayTotal)} ${facts.currency}.`,
      ];

      if (overtimePay.firstTwoHours > 0) {
        responseLines.push(`Overtime at 125%: ${formatAmount(overtimePay.firstTwoHours)} hour(s) per day = ${formatAmount(overtimePay.firstTwoPay * dayCount)} ${facts.currency}.`);
      }

      if (overtimePay.laterHours > 0) {
        responseLines.push(`Overtime at 150%: ${formatAmount(overtimePay.laterHours)} hour(s) per day = ${formatAmount(overtimePay.laterPay * dayCount)} ${facts.currency}.`);
      }

      if (dailyCandidateHours === 0) {
        responseLines.push('There are 0 daily overtime candidate hours for the supplied day.');
      }

      responseLines.push(`Gross pay for these supplied hours: ${formatAmount(grossPay)} ${facts.currency}.`);

      if (hasDailyWeeklyOverlap) {
        responseLines.push('I can also identify possible weekly overtime above 42 hours, but I cannot safely add daily and weekly overtime together yet because some hours may overlap.');
      }

      if (hasWeeklyRestInteraction) {
        responseLines.push('Weekly-rest work may also be relevant, but I cannot safely calculate combined weekly-rest and overtime compensation yet.');
      }

      responseLines.push('This is not a full payslip calculation. It does not calculate net salary, tax, pension, accommodation deductions, holiday pay, weekly-rest pay, allowances, insurance, or other deductions.');

      return createResult(task, hasDailyWeeklyOverlap || hasWeeklyRestInteraction ? 'partial' : 'success', {
        capability: 'jobs.salary',
        employmentIntent: 'salary_amount_or_calculation',
        message: responseLines.join(' '),
        knowledgeId: dailyClassification.sourceKnowledgeId,
        overtimeClassification,
        calculation: {
          formula: 'grossForSuppliedDay = regularHours * hourlyRate + verifiedDailyOvertimePay',
          resultType: 'supplied_day_gross_pay',
          hourlyRate: facts.salaryRate,
          regularHours,
          dailyHoursWorked: facts.dailyHoursWorked,
          dailyOvertimeCandidateHours: dailyCandidateHours,
          overtimeAt125Hours: overtimePay.firstTwoHours,
          overtimeAt125Pay: overtimePay.firstTwoPay * dayCount,
          overtimeAt150Hours: overtimePay.laterHours,
          overtimeAt150Pay: overtimePay.laterPay * dayCount,
          repeatedWorkdaysCount: dayCount,
          sameHoursEachDay: dayCount > 1,
          regularPay: regularPayTotal,
          overtimeGrossPay: overtimeGrossPayTotal,
          grossPay,
          currency: facts.currency,
          isGrossOnly: true,
          isCompletePayslip: false,
        },
        needsSalaryCalculationFacts: false,
        knownFacts: facts,
        needsVerifiedRule: false,
      }, hasDailyWeeklyOverlap || hasWeeklyRestInteraction ? ['partial_overtime_overlap_unresolved'] : []);
    }

    return createResult(task, 'partial', {
      capability: 'jobs.salary',
      employmentIntent: 'salary_amount_or_calculation',
      message: hasUnresolvedSpecialContext
        ? 'I can see this may involve a special workday context, but I should not calculate overtime pay until the applicable special rule is verified for your facts.'
        : 'I can identify that overtime classification may be relevant, but I need the missing daily/workweek facts before I can safely calculate gross pay for those hours.',
      overtimeClassification,
      needsSalaryCalculationFacts: true,
      missingFacts: overtimeClassification.missingFacts,
      knownFacts: facts,
      needsVerifiedRule: true,
    }, ['overtime_classification_unresolved']);
  }

  const missing = [];
  const hasGenericHours = facts.hoursWorked !== null && facts.regularHours === null;

  if (facts.salaryRate === null) missing.push('salary_rate');
  if (facts.regularHours === null) missing.push('regular_hours');
  if (facts.salaryRate !== null && !facts.currency) missing.push('hourly_rate_currency');

  if (missing.length > 0) {
    let followUpQuestion = SALARY_CALCULATION_FACT_QUESTION;
    if (missing.length === 1 && missing[0] === 'salary_rate') {
      followUpQuestion = SALARY_CALCULATION_RATE_QUESTION;
    } else if (missing.length === 1 && missing[0] === 'regular_hours') {
      followUpQuestion = hasGenericHours
        ? SALARY_CALCULATION_REGULAR_HOURS_FROM_TOTAL_QUESTION
        : SALARY_CALCULATION_REGULAR_HOURS_QUESTION;
    } else if (missing.length === 1 && missing[0] === 'hourly_rate_currency') {
      followUpQuestion = SALARY_CALCULATION_CURRENCY_QUESTION;
    } else if (
      missing.length === 2
      && missing.includes('salary_rate')
      && missing.includes('hourly_rate_currency')
      && facts.regularHours !== null
    ) {
      followUpQuestion = SALARY_CALCULATION_RATE_QUESTION;
    }

    return createResult(task, 'blocked', {
      capability: 'jobs.salary',
      employmentIntent: 'salary_amount_or_calculation',
      message: followUpQuestion,
      needsSalaryCalculationFacts: true,
      missingFacts: missing,
      knownFacts: facts,
      needsVerifiedRule: true,
    }, ['missing_required_input'], [followUpQuestion]);
  }

  if (facts.salaryRateType !== 'hourly' && facts.paymentFrequency !== 'hourly') {
    return createResult(task, 'blocked', {
      capability: 'jobs.salary',
      employmentIntent: 'salary_amount_or_calculation',
      message: 'I can calculate basic gross pay only for hourly pay in this step. What is your hourly rate and how many regular hours did you work?',
      needsSalaryCalculationFacts: true,
      missingFacts: ['hourly_payment_scope'],
      knownFacts: facts,
      needsVerifiedRule: true,
    }, ['unsupported_payment_scope'], ['I can calculate basic gross pay only for hourly pay in this step. What is your hourly rate and how many regular hours did you work?']);
  }

  const calculationRule = knowledgeBaseService.findBasicHourlySalaryCalculationRule();
  if (calculationRule) {
    const basicGrossPay = facts.salaryRate * facts.regularHours;
    const formattedPay = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(basicGrossPay);
    const formattedRate = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(facts.salaryRate);
    const formattedHours = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(facts.regularHours);

    return createResult(task, 'success', {
      capability: 'jobs.salary',
      employmentIntent: 'salary_amount_or_calculation',
      message: [
        `For ${formattedHours} regular hours at ${formattedRate} ${facts.currency} per hour, your basic gross pay for those regular hours is ${formattedPay} ${facts.currency}.`,
        'This is not your final salary, net salary, or complete payslip amount, and it does not include overtime, rest-day or holiday work, allowances, deductions, tax, pension, insurance, accommodation, or foreign-worker-specific deductions.'
      ].join(' '),
      knowledgeId: calculationRule.id,
      calculation: {
        formula: calculationRule.rule.calculation,
        resultType: calculationRule.rule.resultType,
        hourlyRate: facts.salaryRate,
        regularHours: facts.regularHours,
        basicGrossPay,
        currency: facts.currency,
      },
      needsSalaryCalculationFacts: false,
      knownFacts: facts,
      needsVerifiedRule: false,
    });
  }

  return createResult(task, 'success', {
    capability: 'jobs.salary',
    employmentIntent: 'salary_amount_or_calculation',
    message: SALARY_CALCULATION_UNVERIFIED_RULE_RESPONSE,
    needsSalaryCalculationFacts: false,
    knownFacts: facts,
    needsVerifiedRule: true,
  });
}

function handleMissingSalary(task, input = {}) {
  const facts = resolveMissingSalaryFacts({
    ...input,
    sourceMessage: cleanText(input.sourceMessage || task?.metadata?.sourceMessage),
  });
  const missing = [];

  if (!facts.paymentFrequency) missing.push('payment_frequency');
  if (!facts.paymentPeriod) missing.push('salary_payment_period');
  if (!facts.paymentReceivedStatus) missing.push('payment_received_status');
  if ((facts.paymentPeriod && !facts.currentDate) || (facts.paymentPeriod && !facts.periodEndDate)) {
    missing.push('timing_date_context');
  }

  if (missing.length > 0) {
    const needsFrequency = missing.includes('payment_frequency');
    const needsPeriod = missing.includes('salary_payment_period');
    const needsReceived = missing.includes('payment_received_status');
    const needsTiming = missing.includes('timing_date_context');
    let followUpQuestion = MISSING_SALARY_PERIOD_AND_FREQUENCY_QUESTION;

    if (needsFrequency && !needsPeriod && !needsReceived && !needsTiming) {
      followUpQuestion = 'Are you paid monthly, hourly, daily, or another way?';
    } else if (needsPeriod && !needsFrequency && !needsReceived && !needsTiming) {
      followUpQuestion = MISSING_SALARY_PERIOD_QUESTION;
    } else if (needsReceived && !needsFrequency && !needsPeriod && !needsTiming) {
      followUpQuestion = 'Did you receive any payment for that salary period?';
    } else if (needsTiming && !needsFrequency && !needsPeriod && !needsReceived) {
      followUpQuestion = MISSING_SALARY_TIMING_CONTEXT_QUESTION;
    }

    return createResult(task, 'blocked', {
      capability: 'jobs.salary',
      employmentIntent: 'missing_salary',
      message: followUpQuestion,
      needsMissingSalaryFacts: true,
      missingFacts: missing,
      knownPaymentFrequency: facts.paymentFrequency || '',
      knownPaymentPeriod: facts.paymentPeriod || '',
      knownPaymentReceivedStatus: facts.paymentReceivedStatus || '',
    }, ['missing_required_input'], [followUpQuestion]);
  }

  if (facts.paymentFrequency !== 'monthly') {
    return createResult(task, 'blocked', {
      capability: 'jobs.salary',
      employmentIntent: 'missing_salary',
      message: MISSING_SALARY_UNSUPPORTED_FREQUENCY_RESPONSE,
      needsVerifiedRule: true,
      knownPaymentFrequency: facts.paymentFrequency,
    }, ['unsupported_payment_frequency'], [MISSING_SALARY_UNSUPPORTED_FREQUENCY_RESPONSE]);
  }

  const missingSalaryKnowledge = knowledgeBaseService.findVerifiedMissingSalaryRule();
  const salaryTimingKnowledge = knowledgeBaseService.findVerifiedSalaryPaymentTimingRule();

  if (!missingSalaryKnowledge || !salaryTimingKnowledge) {
    return createResult(task, 'success', {
      capability: 'jobs.salary',
      employmentIntent: 'missing_salary',
      message: 'I should not guess the missing-salary rule because Gringo does not yet have verified missing-salary knowledge loaded for these facts.',
      needsVerifiedRule: true,
    });
  }

  const currentTime = facts.currentDate.getTime();
  const dueTime = facts.periodEndDate.getTime();
  const delayedTime = facts.delayedSalaryDate.getTime();
  let situation = `For the ${facts.paymentPeriod} salary period, you said the salary was not received.`;

  if (facts.paymentReceivedStatus === 'received') {
    situation = `For the ${facts.paymentPeriod} salary period, you said payment was received, so I should not treat it as a missing-salary situation.`;
  } else if (currentTime <= dueTime) {
    situation = `For the ${facts.paymentPeriod} salary period, based on ${formatDate(facts.currentDate)}, the salary due date has not passed yet.`;
  } else if (currentTime < delayedTime) {
    situation = `For the ${facts.paymentPeriod} salary period, based on ${formatDate(facts.currentDate)}, the salary due date has passed, but the verified delayed-salary threshold has not been reached yet.`;
  } else {
    situation = `For the ${facts.paymentPeriod} salary period, based on ${formatDate(facts.currentDate)}, unpaid salary has reached the verified delayed-salary timing described by this rule.`;
  }

  return createResult(task, 'success', {
    capability: 'jobs.salary',
    employmentIntent: 'missing_salary',
    message: [
      `For monthly pay in Israel: ${salaryTimingKnowledge.rule.salaryDue}`,
      `Delayed-salary timing: ${salaryTimingKnowledge.rule.delayedAfter}`,
      situation,
      `Source: ${missingSalaryKnowledge.source.title}.`
    ].join(' '),
    knowledgeId: missingSalaryKnowledge.id,
    salaryDueReference: missingSalaryKnowledge.rule.salaryDueReference,
    delayedSalaryStatusReference: missingSalaryKnowledge.rule.delayedSalaryStatusReference,
    knownFacts: {
      paymentFrequency: facts.paymentFrequency,
      paymentPeriod: facts.paymentPeriod,
      paymentReceivedStatus: facts.paymentReceivedStatus,
      currentDate: formatDate(facts.currentDate),
      salaryDueDate: formatDate(facts.periodEndDate),
      delayedSalaryDate: formatDate(facts.delayedSalaryDate),
    },
    source: {
      title: missingSalaryKnowledge.source.title,
      authority: missingSalaryKnowledge.source.authority,
      verified: missingSalaryKnowledge.source.verified,
    },
    needsVerifiedRule: false,
  });
}

function handleSalaryPaymentTiming(task, input = {}, employmentIntent = {}) {
  const paymentFrequency = resolvePaymentFrequency(input);

  if (paymentFrequency !== 'monthly') {
    return blocked(task, 'missing_required_input', SALARY_PAYMENT_FREQUENCY_QUESTION);
  }

  const knowledge = knowledgeBaseService.findVerifiedSalaryPaymentTimingRule();
  if (!knowledge) {
    return createResult(task, 'success', {
      capability: 'jobs.salary',
      employmentIntent: employmentIntent.intent || 'salary_payment_timing',
      message: SALARY_PAYMENT_TIMING_SAFE_FALLBACK,
      needsVerifiedRule: true,
    });
  }

  return createResult(task, 'success', {
    capability: 'jobs.salary',
    employmentIntent: employmentIntent.intent || 'salary_payment_timing',
    message: [
      `For monthly pay in Israel: ${knowledge.rule.salaryDue}`,
      `If it is still unpaid: ${knowledge.rule.delayedAfter}`,
      `Source: ${knowledge.source.title}.`
    ].join(' '),
    knowledgeId: knowledge.id,
    source: {
      title: knowledge.source.title,
      authority: knowledge.source.authority,
      verified: knowledge.source.verified,
    },
    needsVerifiedRule: false,
  });
}

async function executeEmploymentDocuments(task, input) {
  const profile = await resolveProfile(input);
  const userId = cleanText(input.userId || profile.userId);

  if (!userId) {
    return blocked(task, 'missing_required_input', 'Which user profile should I check documents for?');
  }

  const documents = await documentService.getUserDocuments(userId);
  const summary = documentService.summarizeDocuments({ ...profile, userId }, documents);

  return createResult(task, 'success', {
    capability: 'employment.documents',
    documents: documents.map(documentService.toSafeDocument),
    checklist: summary.checklist,
    summary,
  });
}

const employmentSalaryAgent = {
  id: 'employment_salary_agent',
  name: 'Employment & Salary Agent',
  version: multiAgentConfig.defaultAgentVersion,
  domain: 'employment_salary',
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

      if (capability === 'jobs.search') return executeJobsSearch(task, input);
      if (capability === 'jobs.match') return executeJobsMatch(task, input);
      if (capability === 'jobs.salary') {
        return executeKnowledgeCapability(
          task,
          input,
          capability,
          'What salary or employment rights question should I check?'
        );
      }
      if (capability === 'employment.documents') return executeEmploymentDocuments(task, input);
      if (capability === 'employment.support') {
        return executeKnowledgeCapability(
          task,
          input,
          capability,
          'What employment support question should I check?'
        );
      }

      return blocked(task, 'unsupported_capability');
    } catch (error) {
      return createResult(task, 'failed', {}, ['execution_failed'], []);
    }
  },
};

module.exports = {
  classifyEmploymentIntent,
  employmentSalaryAgent,
  MISSING_SALARY_PERIOD_AND_FREQUENCY_QUESTION,
  MISSING_SALARY_PERIOD_QUESTION,
  MISSING_SALARY_TIMING_CONTEXT_QUESTION,
  MISSING_SALARY_UNSUPPORTED_FREQUENCY_RESPONSE,
  SALARY_CALCULATION_FACT_QUESTION,
  SALARY_CALCULATION_RATE_QUESTION,
  SALARY_CALCULATION_REGULAR_HOURS_FROM_TOTAL_QUESTION,
  SALARY_CALCULATION_REGULAR_HOURS_QUESTION,
  SALARY_CALCULATION_CURRENCY_QUESTION,
  SALARY_CALCULATION_UNVERIFIED_RULE_RESPONSE,
  SALARY_CALCULATION_WORK_QUANTITY_QUESTION,
  SALARY_PAYMENT_FREQUENCY_QUESTION,
  SALARY_PAYMENT_TIMING_SAFE_FALLBACK,
};
