const fs = require('fs');
const path = require('path');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, 'knowledge-base');

function normalize(value) {
  return String(value || '').toLowerCase();
}

function normalizeText(value) {
  return normalize(value)
    .replace(/[^a-z0-9\u0590-\u05ff%:\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WEAK_RELEVANCE_TERMS = new Set([
  'best',
  'better',
  'cheap',
  'cheapest',
  'company',
  'danger',
  'family',
  'fee',
  'help',
  'job',
  'jobs',
  'pay',
  'paid',
  'problem',
  'rate',
  'safe',
  'send',
  'use',
  'work',
  'worker',
]);

function knowledgeTermMatches(question, term) {
  const normalizedQuestion = normalizeText(question);
  const normalizedTerm = normalizeText(term);
  if (!normalizedQuestion || !normalizedTerm) return false;
  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escapedTerm}(\\b|$)`, 'i').test(normalizedQuestion);
}

function isStrongRelevanceTerm(term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm || WEAK_RELEVANCE_TERMS.has(normalizedTerm)) return false;
  return normalizedTerm.length > 3 || normalizedTerm.includes(' ') || /[%:\d]/.test(normalizedTerm);
}

function getMatchedKnowledgeKeywords(item = {}, question = '') {
  return Array.isArray(item.keywords)
    ? item.keywords.filter((keyword) => knowledgeTermMatches(question, keyword))
    : [];
}

function hasPositiveRelevanceEvidence(item = {}, question = '', category = '') {
  const normalizedQuestion = normalizeText(question);
  const normalizedCategory = normalizeText(category);
  const itemCategory = normalizeText(item.category);
  const categoryMatches = Boolean(normalizedCategory && itemCategory === normalizedCategory);
  const matchedKeywords = getMatchedKnowledgeKeywords(item, normalizedQuestion).filter(isStrongRelevanceTerm);
  const matchedStrongKeyword = matchedKeywords.length > 0;
  const matchedExplicitKeyword = matchedKeywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedKeyword.includes(' ') || /[%:\d]/.test(normalizedKeyword);
  });
  const titleMatches = isStrongRelevanceTerm(item.title) && knowledgeTermMatches(normalizedQuestion, item.title);
  const topicMatches = isStrongRelevanceTerm(item.topic) && knowledgeTermMatches(normalizedQuestion, item.topic);

  return Boolean(
    (categoryMatches && (matchedStrongKeyword || titleMatches || topicMatches))
    || matchedExplicitKeyword
    || titleMatches
    || topicMatches
  );
}

function loadKnowledgeItems() {
  const files = fs.readdirSync(KNOWLEDGE_BASE_DIR).filter((file) => file.endsWith('.json'));

  return files.flatMap((file) => {
    const filePath = path.join(KNOWLEDGE_BASE_DIR, file);
    const contents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(contents);
  });
}

function scoreKnowledgeItem(item, question, category) {
  const normalizedQuestion = normalize(question);
  const normalizedCategory = normalize(category);
  let score = 0;

  if (normalize(item.category) === normalizedCategory) {
    score += 3;
  }

  item.keywords.forEach((keyword) => {
    if (normalizedQuestion.includes(normalize(keyword))) {
      score += 2;
    }
  });

  if (normalizedQuestion.includes(normalize(item.title))) {
    score += 2;
  }

  if (normalize(item.question).split(' ').some((word) => word.length > 3 && normalizedQuestion.includes(word))) {
    score += 1;
  }

  return score;
}

function findRelevantKnowledge(question, category, limit = 5) {
  return loadKnowledgeItems()
    .map((item) => ({
      item,
      score: scoreKnowledgeItem(item, question, category),
    }))
    .filter((match) => match.score > 0 || normalize(match.item.category) === normalize(category))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((match) => ({
      id: match.item.id,
      title: match.item.title,
      category: match.item.category,
      domain: match.item.domain || '',
      topic: match.item.topic || '',
      keywords: Array.isArray(match.item.keywords) ? [...match.item.keywords] : [],
      question: match.item.question,
      answer: match.item.answer,
      score: match.score,
      relevanceEvidence: {
        categoryMatched: normalizeText(match.item.category) === normalizeText(category),
        matchedKeywords: getMatchedKnowledgeKeywords(match.item, question).filter(isStrongRelevanceTerm),
        titleMatched: isStrongRelevanceTerm(match.item.title) && knowledgeTermMatches(question, match.item.title),
        topicMatched: isStrongRelevanceTerm(match.item.topic) && knowledgeTermMatches(question, match.item.topic),
      },
    }));
}

function matchesSalaryPaymentTimingScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'salary_payment_timing'
    && item.workerType === 'monthly'
    && item.source?.verified === true
    && typeof item.source?.title === 'string'
    && typeof item.source?.authority === 'string'
    && item.rule
    && typeof item.rule.salaryDue === 'string'
    && typeof item.rule.delayedAfter === 'string'
  );
}

function findVerifiedSalaryPaymentTimingRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesSalaryPaymentTimingScope) || null;
}

function matchesMissingSalaryScope(item = {}, items = loadKnowledgeItems()) {
  const referencedTimingRule = Array.isArray(items)
    ? items.find((candidate) => candidate.id === item.rule?.salaryDueReference)
    : null;

  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'missing_salary'
    && item.workerType === 'monthly'
    && item.source?.verified === true
    && typeof item.source?.title === 'string'
    && typeof item.source?.authority === 'string'
    && item.rule
    && item.rule.salaryDueReference === 'israel_salary_payment_timing_monthly'
    && item.rule.delayedSalaryStatusReference === 'israel_salary_payment_timing_monthly'
    && typeof item.rule.practicalMissingSalarySituation === 'string'
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('payment_frequency')
    && item.rule.requiredFactsBeforeApplication.includes('salary_payment_period')
    && item.rule.requiredFactsBeforeApplication.includes('payment_received_status')
    && item.rule.requiredFactsBeforeApplication.includes('timing_date_context')
    && matchesSalaryPaymentTimingScope(referencedTimingRule)
  );
}

function findVerifiedMissingSalaryRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find((item) => matchesMissingSalaryScope(item, items)) || null;
}

function matchesBasicHourlySalaryCalculationScope(item = {}) {
  return (
    item.domain === 'employment'
    && item.topic === 'basic_hourly_salary_calculation'
    && item.workerType === 'hourly'
    && item.rule
    && item.rule.calculation === 'basicGrossPay = hourlyRate * regularHours'
    && item.rule.resultType === 'basic_gross_pay'
    && item.rule.currency === 'use_hourly_rate_currency'
    && item.rule.verificationType === 'deterministic_arithmetic'
    && item.rule.requiresRegularHoursKnown === true
    && item.rule.doesNotTreatTotalHoursAsRegularHours === true
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('hourlyRate')
    && item.rule.requiredFactsBeforeApplication.includes('regularHours')
    && Array.isArray(item.rule.formula?.operands)
    && item.rule.formula.operator === 'multiply'
    && item.rule.formula.result === 'basicGrossPay'
    && item.rule.formula.operands[0] === 'hourlyRate'
    && item.rule.formula.operands[1] === 'regularHours'
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('final_salary')
    && item.rule.doesNotDetermine.includes('legal_multipliers')
  );
}

function findBasicHourlySalaryCalculationRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesBasicHourlySalaryCalculationScope) || null;
}

function matchesOvertimeCalculationFoundationScope(item = {}) {
  return (
    item.domain === 'employment'
    && item.topic === 'overtime'
    && item.rule
    && item.rule.foundationType === 'overtime_calculation_prerequisites'
    && Array.isArray(item.rule.concepts)
    && item.rule.concepts.includes('regularHours')
    && item.rule.concepts.includes('overtimeHours')
    && item.rule.concepts.includes('dailyHours')
    && item.rule.concepts.includes('weeklyHours')
    && item.rule.concepts.includes('workDayType')
    && item.rule.calculationStructure?.result === 'overtimePay'
    && item.rule.calculationStructure?.requiresVerifiedMultiplier === true
    && Array.isArray(item.rule.calculationStructure?.operands)
    && item.rule.calculationStructure.operands.includes('hourlyRate')
    && item.rule.calculationStructure.operands.includes('overtimeHours')
    && item.rule.calculationStructure.operands.includes('verifiedOvertimeMultiplier')
    && item.rule.requiresOvertimeHoursKnown === true
    && item.rule.requiresLegalRuleForMultiplier === true
    && item.rule.doesNotTreatTotalHoursAsRegularHours === true
    && item.rule.doesNotTreatTotalHoursAsOvertimeHours === true
    && item.rule.doesNotTreatMonthlyHoursAsOvertimeHours === true
    && item.rule.doesNotInferOvertimeFromMonthlyHours === true
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('overtime_pay')
    && item.rule.doesNotDetermine.includes('overtime_multiplier')
    && item.rule.doesNotDetermine.includes('monthly_overtime_threshold')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('rest_day_work')
    && item.rule.separateKnowledgeRequiredFor.includes('holiday_work')
    && item.rule.separateKnowledgeRequiredFor.includes('saturday_or_shabbat_work')
    && item.rule.separateKnowledgeRequiredFor.includes('night_work_rules')
  );
}

function findOvertimeCalculationFoundation(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesOvertimeCalculationFoundationScope) || null;
}

function matchesVerifiedOvertimePayMultiplierScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'overtime_pay_multipliers'
    && item.source?.verified === true
    && item.source?.title === 'Hours of Work and Rest Law, 5711-1951'
    && item.source?.provision === 'Section 16(a)'
    && item.rule
    && item.rule.ruleType === 'overtime_compensation_multipliers'
    && item.rule.compensationOnly === true
    && item.rule.appliesOnlyAfterOvertimeStatusEstablished === true
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('regularHourlyWage')
    && item.rule.requiredFactsBeforeApplication.includes('verifiedOvertimeHours')
    && item.rule.requiredFactsBeforeApplication.includes('overtimeSequenceWithinWorkday')
    && item.rule.multipliers?.firstOvertimeHourMultiplier === 1.25
    && item.rule.multipliers?.secondOvertimeHourMultiplier === 1.25
    && item.rule.multipliers?.thirdAndLaterOvertimeHourMultiplier === 1.5
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('overtime_status')
    && item.rule.doesNotDetermine.includes('daily_overtime_threshold')
    && item.rule.doesNotDetermine.includes('weekly_overtime_threshold')
    && item.rule.doesNotDetermine.includes('monthly_overtime_threshold')
    && Array.isArray(item.rule.doesNotAutomaticallyApplyTo)
    && item.rule.doesNotAutomaticallyApplyTo.includes('totalHours')
    && item.rule.doesNotAutomaticallyApplyTo.includes('monthlyHours')
    && item.rule.doesNotAutomaticallyApplyTo.includes('unverified_overtime_hours')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('overtime_classification')
  );
}

function findVerifiedOvertimePayMultiplierRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesVerifiedOvertimePayMultiplierScope) || null;
}

function matchesWeeklyOvertimeClassificationScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'weekly_overtime_classification'
    && item.source?.verified === true
    && item.source?.authority === 'Ministry of Labor'
    && item.rule
    && item.rule.ruleType === 'weekly_overtime_classification_foundation'
    && item.rule.classificationOnly === true
    && item.rule.regularWeeklyHours === 42
    && item.rule.requiresWeeklyContext === true
    && item.rule.requiresApplicableWorkweekScope === true
    && item.rule.hoursAboveRegularWeeklyHoursMayBeCandidates === true
    && item.rule.belowRegularWeeklyHoursDoesNotProveNoOvertime === true
    && item.rule.doesNotCalculateOvertimePay === true
    && item.rule.doesNotInvokeOvertimeMultipliers === true
    && item.rule.doesNotTreatTotalHoursAsWeeklyHours === true
    && item.rule.doesNotTreatMonthlyHoursAsWeeklyHours === true
    && item.rule.doesNotInferOvertimeFromMonthlyHours === true
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('weeklyHoursWorked')
    && item.rule.requiredFactsBeforeApplication.includes('regularWeeklyHours')
    && item.rule.requiredFactsBeforeApplication.includes('applicableWorkweekScope')
    && item.rule.weeklyOvertimeCandidateFormula?.candidateOnly === true
    && item.rule.weeklyOvertimeCandidateFormula?.notPayableOvertimeConclusion === true
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('daily_overtime_threshold')
    && item.rule.doesNotDetermine.includes('daily_overtime_classification')
    && item.rule.doesNotDetermine.includes('monthly_overtime_threshold')
    && item.rule.doesNotDetermine.includes('overtime_pay')
    && item.rule.doesNotDetermine.includes('overtime_multiplier')
    && Array.isArray(item.rule.doesNotAutomaticallyApplyTo)
    && item.rule.doesNotAutomaticallyApplyTo.includes('totalHours')
    && item.rule.doesNotAutomaticallyApplyTo.includes('monthlyHours')
    && item.rule.doesNotAutomaticallyApplyTo.includes('dailyHours')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('daily_overtime_classification')
    && item.rule.separateKnowledgeRequiredFor.includes('overtime_pay_multipliers')
  );
}

function findWeeklyOvertimeClassificationRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesWeeklyOvertimeClassificationScope) || null;
}

function matchesFiveDayDailyOvertimeClassificationScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'daily_overtime_classification'
    && item.source?.verified === true
    && item.source?.authority === 'State of Israel / Ministry of Labor'
    && item.rule
    && item.rule.ruleType === 'daily_overtime_classification_foundation'
    && item.rule.classificationOnly === true
    && item.rule.applicableWorkweekDays === 5
    && item.rule.workweekDaysMustBeVerified === true
    && item.rule.regularDailyHoursBoundary === 9
    && item.rule.workDayType === 'regular'
    && item.rule.requiresVerifiedFiveDayWorkweek === true
    && item.rule.doesNotInferWorkweekDaysFromTimeEntryCount === true
    && item.rule.doesNotRequireWeeklyHoursAbove42 === true
    && item.rule.belowWeekly42DoesNotProveNoDailyOvertime === true
    && item.rule.weeklyRuleIndependent === true
    && item.rule.doesNotCalculateOvertimePay === true
    && item.rule.doesNotInvokeOvertimeMultipliers === true
    && item.rule.doesNotTreatTotalHoursAsDailyHours === true
    && item.rule.doesNotTreatMonthlyHoursAsDailyHours === true
    && item.rule.doesNotInferOvertimeFromMonthlyHours === true
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('verifiedWorkweekDays')
    && item.rule.requiredFactsBeforeApplication.includes('dailyHoursWorked')
    && item.rule.requiredFactsBeforeApplication.includes('workDayType')
    && item.rule.requiredFactsBeforeApplication.includes('applicableDailyRule')
    && item.rule.dailyOvertimeCandidateFormula?.candidateOnly === true
    && item.rule.dailyOvertimeCandidateFormula?.notPayableOvertimeConclusion === true
    && item.rule.dailyOvertimeCandidateFormula?.appliesWhenDailyHoursGreaterThan === 9
    && item.rule.exactBoundaryCandidateHours?.dailyHoursWorked === 9
    && item.rule.exactBoundaryCandidateHours?.dailyOvertimeCandidateHours === 0
    && item.rule.exactBoundaryCandidateHours?.doesNotProveNoOtherOvertime === true
    && item.rule.candidateExample?.dailyHoursWorked === 10
    && item.rule.candidateExample?.dailyOvertimeCandidateHours === 1
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('six_day_workweek_daily_rule')
    && item.rule.doesNotDetermine.includes('eight_hour_daily_rule')
    && item.rule.doesNotDetermine.includes('overtime_pay')
    && item.rule.doesNotDetermine.includes('overtime_multiplier')
    && item.rule.doesNotDetermine.includes('breaks_count_as_working_time')
    && item.rule.doesNotDetermine.includes('monthly_overtime_threshold')
    && Array.isArray(item.rule.doesNotAutomaticallyApplyTo)
    && item.rule.doesNotAutomaticallyApplyTo.includes('five_time_entry_days_without_verified_workweek_scope')
    && item.rule.doesNotAutomaticallyApplyTo.includes('weeklyHours')
    && item.rule.doesNotAutomaticallyApplyTo.includes('monthlyHours')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('six_day_workweek_daily_rule')
    && item.rule.separateKnowledgeRequiredFor.includes('weekly_overtime_classification')
    && item.rule.separateKnowledgeRequiredFor.includes('overtime_pay_multipliers')
  );
}

function findFiveDayDailyOvertimeClassificationRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesFiveDayDailyOvertimeClassificationScope) || null;
}

function matchesSixDayDailyOvertimeClassificationScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'daily_overtime_classification'
    && item.source?.verified === true
    && item.source?.authority === 'State of Israel / Ministry of Labor'
    && item.rule
    && item.rule.ruleType === 'daily_overtime_classification_foundation'
    && item.rule.classificationOnly === true
    && item.rule.applicableWorkweekDays === 6
    && item.rule.workweekDaysMustBeVerified === true
    && item.rule.regularDailyHoursBoundary === 8
    && item.rule.workDayType === 'regular'
    && item.rule.requiresVerifiedSixDayWorkweek === true
    && item.rule.doesNotInferWorkweekDaysFromTimeEntryCount === true
    && item.rule.doesNotRequireWeeklyHoursAbove42 === true
    && item.rule.belowWeekly42DoesNotProveNoDailyOvertime === true
    && item.rule.weeklyRuleIndependent === true
    && item.rule.doesNotCalculateOvertimePay === true
    && item.rule.doesNotInvokeOvertimeMultipliers === true
    && item.rule.doesNotTreatTotalHoursAsDailyHours === true
    && item.rule.doesNotTreatMonthlyHoursAsDailyHours === true
    && item.rule.doesNotInferOvertimeFromMonthlyHours === true
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('verifiedWorkweekDays')
    && item.rule.requiredFactsBeforeApplication.includes('dailyHoursWorked')
    && item.rule.requiredFactsBeforeApplication.includes('workDayType')
    && item.rule.requiredFactsBeforeApplication.includes('applicableDailyRule')
    && item.rule.dailyOvertimeCandidateFormula?.candidateOnly === true
    && item.rule.dailyOvertimeCandidateFormula?.notPayableOvertimeConclusion === true
    && item.rule.dailyOvertimeCandidateFormula?.appliesWhenDailyHoursGreaterThan === 8
    && item.rule.exactBoundaryCandidateHours?.dailyHoursWorked === 8
    && item.rule.exactBoundaryCandidateHours?.dailyOvertimeCandidateHours === 0
    && item.rule.exactBoundaryCandidateHours?.doesNotProveNoOtherOvertime === true
    && item.rule.candidateExample?.dailyHoursWorked === 9
    && item.rule.candidateExample?.dailyOvertimeCandidateHours === 1
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('five_day_workweek_daily_rule')
    && item.rule.doesNotDetermine.includes('nine_hour_daily_rule')
    && item.rule.doesNotDetermine.includes('overtime_pay')
    && item.rule.doesNotDetermine.includes('overtime_multiplier')
    && item.rule.doesNotDetermine.includes('breaks_count_as_working_time')
    && item.rule.doesNotDetermine.includes('monthly_overtime_threshold')
    && Array.isArray(item.rule.doesNotAutomaticallyApplyTo)
    && item.rule.doesNotAutomaticallyApplyTo.includes('six_time_entry_days_without_verified_workweek_scope')
    && item.rule.doesNotAutomaticallyApplyTo.includes('weeklyHours')
    && item.rule.doesNotAutomaticallyApplyTo.includes('monthlyHours')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('five_day_workweek_daily_rule')
    && item.rule.separateKnowledgeRequiredFor.includes('weekly_overtime_classification')
    && item.rule.separateKnowledgeRequiredFor.includes('overtime_pay_multipliers')
  );
}

function findSixDayDailyOvertimeClassificationRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesSixDayDailyOvertimeClassificationScope) || null;
}

function matchesNightWorkDailyOvertimeClassificationScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'night_work_classification'
    && item.source?.verified === true
    && item.source?.authority === 'Ministry of Labor'
    && item.rule
    && item.rule.ruleType === 'night_work_daily_overtime_classification_foundation'
    && item.rule.classificationOnly === true
    && item.rule.nightWindowStart === '22:00'
    && item.rule.nightWindowEnd === '06:00'
    && item.rule.minimumHoursWithinNightWindow === 2
    && item.rule.requiresVerifiedNightWork === true
    && item.rule.regularNightWorkdayHoursBoundary === 7
    && item.rule.regularNightWorkdayHoursBoundaryUnit === 'hours'
    && item.rule.nightWorkDailyOvertimeCandidateFormula?.result === 'nightWorkDailyOvertimeCandidateHours'
    && item.rule.nightWorkDailyOvertimeCandidateFormula?.operator === 'subtract'
    && Array.isArray(item.rule.nightWorkDailyOvertimeCandidateFormula?.operands)
    && item.rule.nightWorkDailyOvertimeCandidateFormula.operands[0] === 'dailyHoursWorked'
    && item.rule.nightWorkDailyOvertimeCandidateFormula.operands[1] === 'regularNightWorkdayHoursBoundary'
    && item.rule.nightWorkDailyOvertimeCandidateFormula.appliesWhenDailyHoursGreaterThan === 7
    && item.rule.nightWorkDailyOvertimeCandidateFormula.candidateOnly === true
    && item.rule.nightWorkDailyOvertimeCandidateFormula.notPayableOvertimeConclusion === true
    && item.rule.exactBoundaryCandidateHours?.dailyHoursWorked === 7
    && item.rule.exactBoundaryCandidateHours?.nightWorkDailyOvertimeCandidateHours === 0
    && item.rule.exactBoundaryCandidateHours?.doesNotProveNoWeeklyOvertime === true
    && item.rule.candidateExample?.isNightWork === true
    && item.rule.candidateExample?.dailyHoursWorked === 8
    && item.rule.candidateExample?.nightWorkDailyOvertimeCandidateHours === 1
    && item.rule.lessThanMinimumNightWindowHoursDoesNotEstablishNightWork === true
    && item.rule.shiftLabelAloneInsufficient === true
    && item.rule.oneLateHourInsufficient === true
    && item.rule.oneEarlyMorningHourInsufficient === true
    && item.rule.doesNotUseFiveDayNineHourBoundaryForNightWork === true
    && item.rule.doesNotUseSixDayEightHourBoundaryForNightWork === true
    && item.rule.weeklyRuleIndependent === true
    && item.rule.belowWeekly42DoesNotProveNoNightWorkDailyOvertime === true
    && item.rule.doesNotCalculateOvertimePay === true
    && item.rule.doesNotInvokeOvertimeMultipliers === true
    && item.rule.doesNotInventNightPremium === true
    && item.rule.doesNotImplementNightWorkPermitOrFrequencyRules === true
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('isNightWork')
    && item.rule.requiredFactsBeforeApplication.includes('dailyHoursWorked')
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('overtime_pay')
    && item.rule.doesNotDetermine.includes('night_premium')
    && item.rule.doesNotDetermine.includes('night_work_permit_compliance')
    && item.rule.doesNotDetermine.includes('weekly_overtime_classification')
    && Array.isArray(item.rule.doesNotAutomaticallyApplyTo)
    && item.rule.doesNotAutomaticallyApplyTo.includes('shift_label_night')
    && item.rule.doesNotAutomaticallyApplyTo.includes('one_hour_after_22')
    && item.rule.doesNotAutomaticallyApplyTo.includes('one_hour_before_06')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('holiday_work')
    && item.rule.separateKnowledgeRequiredFor.includes('holiday_eve_work')
    && item.rule.separateKnowledgeRequiredFor.includes('weekly_rest_work')
    && item.rule.separateKnowledgeRequiredFor.includes('shortened_workday')
    && item.rule.separateKnowledgeRequiredFor.includes('break_rules')
    && item.rule.separateKnowledgeRequiredFor.includes('night_work_permit_or_frequency_rules')
  );
}

function findNightWorkDailyOvertimeClassificationRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesNightWorkDailyOvertimeClassificationScope) || null;
}

function matchesShortenedWorkdayClassificationScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'shortened_workday_classification'
    && item.source?.verified === true
    && item.source?.title === 'Hours of Work and Rest Law, 5711-1951'
    && item.source?.provision === 'Section 2(b)'
    && item.rule
    && item.rule.ruleType === 'shortened_workday_daily_overtime_classification_foundation'
    && item.rule.classificationOnly === true
    && item.rule.shortenedWorkdayBoundaryHours === 7
    && item.rule.shortenedWorkdayBoundaryUnit === 'hours'
    && item.rule.appliesToDayBeforeWeeklyRest === true
    && item.rule.appliesToDayBeforeApplicableHoliday === true
    && item.rule.requiresApplicableWeeklyRestKnown === true
    && item.rule.requiresApplicableHolidayKnown === true
    && item.rule.specialAgreementOrCustomMayOverride === true
    && item.rule.scopeRequiresAgreementCheck === true
    && item.rule.doesNotImplementSevenPaidAsEightArrangement === true
    && item.rule.doesNotImplementEightPaidAsNineArrangement === true
    && item.rule.doesNotUseFiveDayNineHourBoundaryForShortenedDay === true
    && item.rule.doesNotUseSixDayEightHourBoundaryForShortenedDay === true
    && item.rule.nightWorkCollisionBoundaryHours === 7
    && item.rule.doesNotCreateSixHourBoundaryWhenNightAndShortened === true
    && item.rule.weeklyRuleIndependent === true
    && item.rule.doesNotCalculateHolidayCompensation === true
    && item.rule.doesNotCalculateWeeklyRestCompensation === true
    && item.rule.doesNotInvokeOvertimeMultipliers === true
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('dailyHoursWorked')
    && item.rule.requiredFactsBeforeApplication.includes('shortenedWorkdayRuleApplicable')
    && Array.isArray(item.rule.shortenedDayOvertimeCandidateFormula?.operands)
    && item.rule.shortenedDayOvertimeCandidateFormula.result === 'shortenedDayOvertimeCandidateHours'
    && item.rule.shortenedDayOvertimeCandidateFormula.operands[0] === 'dailyHoursWorked'
    && item.rule.shortenedDayOvertimeCandidateFormula.operands[1] === 'shortenedWorkdayBoundaryHours'
    && item.rule.shortenedDayOvertimeCandidateFormula.appliesWhenDailyHoursGreaterThan === 7
    && item.rule.shortenedDayOvertimeCandidateFormula.candidateOnly === true
    && item.rule.exactBoundaryCandidateHours?.dailyHoursWorked === 7
    && item.rule.exactBoundaryCandidateHours?.shortenedDayOvertimeCandidateHours === 0
    && item.rule.exactBoundaryCandidateHours?.doesNotProveNoWeeklyOvertime === true
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('holiday_compensation')
    && item.rule.doesNotDetermine.includes('weekly_rest_compensation')
    && item.rule.doesNotDetermine.includes('overtime_multiplier')
    && Array.isArray(item.rule.doesNotAutomaticallyApplyTo)
    && item.rule.doesNotAutomaticallyApplyTo.includes('friday_without_verified_weekly_rest_relation')
    && item.rule.doesNotAutomaticallyApplyTo.includes('weekday_name')
    && item.rule.doesNotAutomaticallyApplyTo.includes('nationality')
    && item.rule.doesNotAutomaticallyApplyTo.includes('countryOfOrigin')
    && item.rule.doesNotAutomaticallyApplyTo.includes('language')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('holiday_work_compensation')
    && item.rule.separateKnowledgeRequiredFor.includes('weekly_rest_work_compensation')
    && item.rule.separateKnowledgeRequiredFor.includes('agreement_or_custom_specific_arrangements')
    && item.rule.separateKnowledgeRequiredFor.includes('compensation_aggregation')
  );
}

function findShortenedWorkdayClassificationRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesShortenedWorkdayClassificationScope) || null;
}

function matchesWeeklyRestWorkFoundationScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'weekly_rest_work_foundation'
    && item.source?.verified === true
    && item.source?.title === 'Hours of Work and Rest Law, 5711-1951'
    && item.source?.provision === 'Section 7'
    && item.rule
    && item.rule.ruleType === 'weekly_rest_work_foundation'
    && item.rule.foundationOnly === true
    && item.rule.minimumWeeklyRestContinuousHours === 36
    && item.rule.minimumWeeklyRestExceptionGuard === true
    && item.rule.doesNotTreatThirtySixHoursAsUniversalExactRestForAllWorkers === true
    && item.rule.weeklyRestDayIdentity?.jewishWorker?.weeklyRestIncludes?.includes('Shabbat')
    && item.rule.weeklyRestDayIdentity?.nonJewishWorker?.possibleWeeklyRestDays?.includes('Friday')
    && item.rule.weeklyRestDayIdentity?.nonJewishWorker?.possibleWeeklyRestDays?.includes('Saturday')
    && item.rule.weeklyRestDayIdentity?.nonJewishWorker?.possibleWeeklyRestDays?.includes('Sunday')
    && item.rule.weeklyRestDayIdentity?.nonJewishWorker?.requiresApplicableWorkerChoiceOrStatus === true
    && item.rule.weeklyRestDayIdentity?.unknownWorkerStatus?.weeklyRestPeriodStatus === 'missing_information'
    && item.rule.weeklyRestBaseMultiplier === 1.5
    && item.rule.weeklyRestBaseMultiplierAppliesOnlyAfterRestWorkVerified === true
    && item.rule.weeklyRestOvertimeInteraction === 'separate_rule_required'
    && item.rule.employmentDuringWeeklyRestPermission?.permitStatusSeparateFromCompensation === true
    && item.rule.employmentDuringWeeklyRestPermission?.permitStatusDoesNotDetermineBaseCompensationEligibility === true
    && item.rule.employmentDuringWeeklyRestPermission?.noPermitDoesNotMeanNoPay === true
    && item.rule.unknownWeeklyRestPeriodIsMissingInformation === true
    && item.rule.workedSaturdayAloneInsufficient === true
    && item.rule.doesNotInferReligionFromNationality === true
    && item.rule.doesNotInferWeeklyRestDayFromNationality === true
    && item.rule.doesNotInferWeeklyRestDayFromCountryOfOrigin === true
    && item.rule.doesNotInferWeeklyRestDayFromLanguage === true
    && item.rule.doesNotCombineWithOvertimeMultipliers === true
    && Array.isArray(item.rule.requiredFactsBeforeClassification)
    && item.rule.requiredFactsBeforeClassification.includes('workerWeeklyRestDay')
    && item.rule.requiredFactsBeforeClassification.includes('workOccurredDuringWeeklyRest')
    && Array.isArray(item.rule.requiredFactsBeforeBaseCompensation)
    && item.rule.requiredFactsBeforeBaseCompensation.includes('regularWage')
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('combined_weekly_rest_overtime_formula')
    && item.rule.doesNotDetermine.includes('employer_violation')
    && item.rule.doesNotDetermine.includes('live_in_caregiving_exception')
    && item.rule.doesNotDetermine.includes('holiday_work')
    && item.rule.doesNotDetermine.includes('holiday_eve_work')
    && item.rule.doesNotDetermine.includes('night_work_rules')
    && Array.isArray(item.rule.doesNotAutomaticallyApplyTo)
    && item.rule.doesNotAutomaticallyApplyTo.includes('worked_saturday')
    && item.rule.doesNotAutomaticallyApplyTo.includes('workerNationality')
    && item.rule.doesNotAutomaticallyApplyTo.includes('countryOfOrigin')
    && item.rule.doesNotAutomaticallyApplyTo.includes('language')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('weekly_rest_overtime_interaction')
    && item.rule.separateKnowledgeRequiredFor.includes('permit_compliance_analysis')
  );
}

function findWeeklyRestWorkFoundationRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesWeeklyRestWorkFoundationScope) || null;
}

function matchesWeeklyRestOvertimeInteractionScope(item = {}) {
  return (
    item.jurisdiction === 'IL'
    && item.domain === 'employment'
    && item.topic === 'weekly_rest_overtime_interaction'
    && item.source?.verified === true
    && item.rule
    && item.rule.ruleType === 'weekly_rest_overtime_interaction_foundation'
    && item.rule.foundationOnly === true
    && item.rule.interactionPrincipleOnly === true
    && item.rule.requiresIndependentWeeklyRestClassification === true
    && item.rule.requiresIndependentOvertimeClassification === true
    && item.rule.weeklyRestOvertimeAdditionalCompensationRequired === true
    && item.rule.additionalOvertimeCompensationAppliesOnlyWhenBothClassificationsVerified === true
    && item.rule.weeklyRestWorkAloneDoesNotImplyOvertime === true
    && item.rule.overtimeAloneDoesNotImplyWeeklyRestWork === true
    && item.rule.exactCombinedMultiplier === 'unresolved'
    && item.rule.exactCombinedCompensationRuleRequired === true
    && item.rule.doesNotSetUniversalCombinedMultiplier === true
    && item.rule.doesNotAddMultipliers === true
    && item.rule.doesNotMultiplyMultipliers === true
    && item.rule.doesNotImplementCompensationAggregation === true
    && item.rule.doesNotImplementDoubleCountingEngine === true
    && item.rule.weeklyRestBaseMultiplierReference === 'israel_weekly_rest_work_foundation_section_7_base_150'
    && item.rule.ordinaryOvertimeMultiplierReference === 'israel_overtime_pay_multipliers_section_16a'
    && Array.isArray(item.rule.requiredFactsBeforeApplication)
    && item.rule.requiredFactsBeforeApplication.includes('workOccurredDuringWeeklyRest')
    && item.rule.requiredFactsBeforeApplication.includes('overtimeStatus')
    && Array.isArray(item.rule.doesNotDetermine)
    && item.rule.doesNotDetermine.includes('work_occurred_during_weekly_rest')
    && item.rule.doesNotDetermine.includes('overtime_status')
    && item.rule.doesNotDetermine.includes('combined_weekly_rest_overtime_multiplier')
    && item.rule.doesNotDetermine.includes('multiplier_addition_formula')
    && item.rule.doesNotDetermine.includes('multiplier_multiplication_formula')
    && item.rule.doesNotDetermine.includes('sector_specific_government_employee_rule')
    && item.rule.doesNotDetermine.includes('municipal_employee_rule')
    && item.rule.doesNotDetermine.includes('employer_violation')
    && Array.isArray(item.rule.doesNotAutomaticallyApplyTo)
    && item.rule.doesNotAutomaticallyApplyTo.includes('worked_saturday')
    && item.rule.doesNotAutomaticallyApplyTo.includes('weekly_rest_work_without_independent_overtime_status')
    && item.rule.doesNotAutomaticallyApplyTo.includes('overtime_without_independent_weekly_rest_work_status')
    && Array.isArray(item.rule.separateKnowledgeRequiredFor)
    && item.rule.separateKnowledgeRequiredFor.includes('exact_combined_weekly_rest_overtime_compensation')
    && item.rule.separateKnowledgeRequiredFor.includes('double_count_prevention')
  );
}

function findWeeklyRestOvertimeInteractionRule(items = loadKnowledgeItems()) {
  if (!Array.isArray(items)) return null;
  return items.find(matchesWeeklyRestOvertimeInteractionScope) || null;
}

async function searchKnowledgeBase(classifiedQuestion) {
  const question = String(classifiedQuestion?.questionContext?.question || '');
  const category = classifiedQuestion?.category || 'Other';
  const relevantKnowledge = findRelevantKnowledge(question, category).filter((match) => {
    if (match.score <= 0) return false;
    return hasPositiveRelevanceEvidence(match, question, category);
  });
  const matches = relevantKnowledge;

  if (matches.length > 0) {
    const bestMatch = matches[0];

    return {
      status: 'FOUND',
      matches: matches.map((match) => match.id),
      answer: bestMatch.answer,
      category: bestMatch.category,
      item: bestMatch,
      relevantKnowledge: matches,
      classifiedQuestion,
    };
  }

  if (/\b(human|person|team)\b/.test(normalize(question))) {
    return {
      status: 'NEEDS_HUMAN',
      matches: [],
      answer: '',
      category,
      relevantKnowledge,
      classifiedQuestion,
    };
  }

  return {
    status: 'NOT_FOUND',
    matches: [],
    answer: '',
    category,
    relevantKnowledge,
    classifiedQuestion,
  };
}

module.exports = {
  findBasicHourlySalaryCalculationRule,
  findFiveDayDailyOvertimeClassificationRule,
  findNightWorkDailyOvertimeClassificationRule,
  findOvertimeCalculationFoundation,
  findShortenedWorkdayClassificationRule,
  findSixDayDailyOvertimeClassificationRule,
  findVerifiedOvertimePayMultiplierRule,
  findVerifiedMissingSalaryRule,
  findVerifiedSalaryPaymentTimingRule,
  findWeeklyOvertimeClassificationRule,
  findWeeklyRestOvertimeInteractionRule,
  findWeeklyRestWorkFoundationRule,
  findRelevantKnowledge,
  loadKnowledgeItems,
  matchesBasicHourlySalaryCalculationScope,
  matchesFiveDayDailyOvertimeClassificationScope,
  matchesNightWorkDailyOvertimeClassificationScope,
  matchesShortenedWorkdayClassificationScope,
  matchesMissingSalaryScope,
  matchesOvertimeCalculationFoundationScope,
  matchesSixDayDailyOvertimeClassificationScope,
  matchesVerifiedOvertimePayMultiplierScope,
  matchesWeeklyOvertimeClassificationScope,
  matchesWeeklyRestOvertimeInteractionScope,
  matchesWeeklyRestWorkFoundationScope,
  matchesSalaryPaymentTimingScope,
  scoreKnowledgeItem,
  searchKnowledgeBase,
  hasPositiveRelevanceEvidence,
};
