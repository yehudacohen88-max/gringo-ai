const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const {
  OVERTIME_CLASSIFICATION_STATUS,
  PATH_STATUS,
  resolveOvertimeClassification,
} = require('../src/modules/agents/domains/overtime-classification.resolver');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');
const { financeConsumerAgent } = require('../src/modules/agents/domains/finance-consumer.agent');
const { healthLifeCommunityAgent } = require('../src/modules/agents/domains/health-life-community.agent');

const SHORTENED_RECORD_ID = 'israel_shortened_workday_pre_rest_holiday_eve_7_hours';
const NIGHT_WORK_RECORD_ID = 'israel_night_work_daily_overtime_classification_7_hours';
const FIVE_DAY_DAILY_RECORD_ID = 'israel_daily_overtime_classification_5_day_workweek_9_hours';
const SIX_DAY_DAILY_RECORD_ID = 'israel_daily_overtime_classification_6_day_workweek_8_hours';
const WEEKLY_OVERTIME_RECORD_ID = 'israel_weekly_overtime_classification_foundation_42_hours';
const BASIC_HOURLY_RECORD_ID = 'basic_hourly_salary_calculation_gross_pay';
const SALARY_TIMING_RECORD_ID = 'israel_salary_payment_timing_monthly';
const MISSING_SALARY_RECORD_ID = 'israel_missing_salary_monthly_foundation';

function getRecord(id) {
  return workersRightsKnowledge.find((item) => item.id === id);
}

function createTask(domain, capability, question) {
  return {
    taskId: `task_${domain}_${capability}`,
    conversationId: 'web:user',
    requestId: 'req_shortened_workday_foundation',
    domain,
    capability,
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-13T08:00:00.000Z',
  };
}

test('verified shortened-workday knowledge exists', () => {
  assert.ok(getRecord(SHORTENED_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === SHORTENED_RECORD_ID));
});

test('official Israeli source metadata exists', () => {
  const source = getRecord(SHORTENED_RECORD_ID).source;

  assert.equal(source.title, 'Hours of Work and Rest Law, 5711-1951');
  assert.equal(source.authority, 'National Legislation Database / Knesset');
  assert.equal(source.provision, 'Section 2(b)');
  assert.equal(source.jurisdiction, 'IL');
  assert.equal(source.verified, true);
  assert.match(source.url, /main\.knesset\.gov\.il\/apps\/legislation\/main\/laws\/2000019/);
});

test('day-before-weekly-rest 7-hour foundation is represented', () => {
  const rule = getRecord(SHORTENED_RECORD_ID).rule;

  assert.equal(rule.appliesToDayBeforeWeeklyRest, true);
  assert.equal(rule.requiresApplicableWeeklyRestKnown, true);
  assert.equal(rule.shortenedWorkdayBoundaryHours, 7);
});

test('day-before-holiday 7-hour foundation is represented', () => {
  const rule = getRecord(SHORTENED_RECORD_ID).rule;

  assert.equal(rule.appliesToDayBeforeApplicableHoliday, true);
  assert.equal(rule.requiresApplicableHolidayKnown, true);
  assert.equal(rule.shortenedWorkdayBoundaryHours, 7);
});

test('exact 7 hours produces zero shortened-day candidate hours', () => {
  const result = resolveOvertimeClassification({
    isDayBeforeWeeklyRest: true,
    dailyHoursWorked: 7,
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.CLASSIFIED);
  assert.equal(result.dailyClassification.shortenedDayOvertimeCandidateHours, 0);
  assert.equal(result.dailyClassification.candidateExists, false);
  assert.equal(getRecord(SHORTENED_RECORD_ID).rule.exactBoundaryCandidateHours.doesNotProveNoWeeklyOvertime, true);
});

test('8 hours in verified shortened-day context creates one candidate hour', () => {
  const result = resolveOvertimeClassification({
    isDayBeforeApplicableHoliday: true,
    dailyHoursWorked: 8,
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.CLASSIFIED);
  assert.equal(result.dailyClassification.shortenedWorkdayBoundaryHours, 7);
  assert.equal(result.dailyClassification.shortenedDayOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.sourceKnowledgeIds.includes(SHORTENED_RECORD_ID), true);
});

test('applicable weekly-rest status is required and weekday names do not infer it', () => {
  const friday = resolveOvertimeClassification({
    specialDayContext: 'shortened workday',
    workDayName: 'Friday',
    dailyHoursWorked: 8,
  });
  const thursday = resolveOvertimeClassification({
    specialDayContext: 'shortened workday',
    workDayName: 'Thursday',
    dailyHoursWorked: 8,
  });
  const rule = getRecord(SHORTENED_RECORD_ID).rule;

  assert.equal(rule.fridayAloneInsufficient, true);
  assert.equal(rule.thursdayAloneInsufficient, true);
  assert.equal(rule.weekdayNameAloneInsufficient, true);
  assert.equal(friday.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.equal(thursday.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
});

test('applicable holiday status is required and identity facts do not infer it', () => {
  const result = resolveOvertimeClassification({
    specialDayContext: 'holiday eve',
    nationality: 'Thai',
    countryOfOrigin: 'Thailand',
    language: 'Thai',
    dailyHoursWorked: 8,
  });
  const rule = getRecord(SHORTENED_RECORD_ID).rule;

  assert.equal(rule.requiresApplicableHolidayKnown, true);
  assert.equal(rule.doesNotInferHolidayApplicabilityFromNationality, true);
  assert.equal(rule.doesNotInferHolidayApplicabilityFromCountryOfOrigin, true);
  assert.equal(rule.doesNotInferHolidayApplicabilityFromLanguage, true);
  assert.equal(rule.doesNotInferReligionFromNationality, true);
  assert.equal(result.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
});

test('unknown holiday and weekly-rest applicability remain unresolved', () => {
  const holiday = resolveOvertimeClassification({
    specialDayContext: 'holiday eve',
    dailyHoursWorked: 8,
  });
  const rest = resolveOvertimeClassification({
    specialDayContext: 'shortened workday',
    dailyHoursWorked: 8,
  });
  const rule = getRecord(SHORTENED_RECORD_ID).rule;

  assert.equal(rule.unknownHolidayApplicabilityIsMissingInformation, true);
  assert.equal(rule.unknownWeeklyRestApplicabilityIsMissingInformation, true);
  assert.equal(holiday.status, OVERTIME_CLASSIFICATION_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.equal(rest.status, OVERTIME_CLASSIFICATION_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
});

test('agreement custom and five-day special pay arrangements remain guarded', () => {
  const rule = getRecord(SHORTENED_RECORD_ID).rule;

  assert.equal(rule.specialAgreementOrCustomMayOverride, true);
  assert.equal(rule.scopeRequiresAgreementCheck, true);
  assert.equal(rule.doesNotImplementSevenPaidAsEightArrangement, true);
  assert.equal(rule.doesNotImplementEightPaidAsNineArrangement, true);
});

test('verified shortened day does not use ordinary 9-hour or 8-hour boundaries', () => {
  const fiveDay = resolveOvertimeClassification({
    workweekDays: 5,
    isDayBeforeWeeklyRest: true,
    dailyHoursWorked: 8,
  });
  const sixDay = resolveOvertimeClassification({
    workweekDays: 6,
    isDayBeforeApplicableHoliday: true,
    dailyHoursWorked: 8,
  });

  assert.equal(fiveDay.dailyClassification.regularDailyHoursBoundary, 7);
  assert.equal(sixDay.dailyClassification.regularDailyHoursBoundary, 7);
  assert.notEqual(fiveDay.dailyClassification.sourceKnowledgeId, FIVE_DAY_DAILY_RECORD_ID);
  assert.notEqual(sixDay.dailyClassification.sourceKnowledgeId, SIX_DAY_DAILY_RECORD_ID);
});

test('existing regular-day and night-work rules remain unchanged', () => {
  const fiveDay = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    workDayType: 'regular',
  });
  const sixDay = resolveOvertimeClassification({
    workweekDays: 6,
    dailyHoursWorked: 9,
    workDayType: 'regular',
  });
  const night = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 8,
  });

  assert.equal(fiveDay.dailyClassification.sourceKnowledgeId, FIVE_DAY_DAILY_RECORD_ID);
  assert.equal(sixDay.dailyClassification.sourceKnowledgeId, SIX_DAY_DAILY_RECORD_ID);
  assert.equal(night.dailyClassification.sourceKnowledgeId, NIGHT_WORK_RECORD_ID);
});

test('night plus shortened-day context remains a 7-hour boundary and does not create a 6-hour rule', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    isDayBeforeWeeklyRest: true,
    dailyHoursWorked: 8,
  });

  assert.equal(result.dailyClassification.applicableDailyBoundary, 7);
  assert.equal(result.dailyClassification.shortenedWorkdayBoundaryHours, 7);
  assert.equal(result.dailyClassification.regularNightWorkdayHoursBoundary, 7);
  assert.equal(result.dailyClassification.shortenedDayOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.nightWorkDailyOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.doesNotCreateSixHourBoundaryWhenNightAndShortened, true);
  assert.equal(result.dailyClassification.sourceKnowledgeIds.includes(NIGHT_WORK_RECORD_ID), true);
  assert.equal(result.dailyClassification.sourceKnowledgeIds.includes(SHORTENED_RECORD_ID), true);
});

test('weekly 42-hour rule remains independent and candidates are not aggregated', () => {
  const belowWeekly = resolveOvertimeClassification({
    isDayBeforeWeeklyRest: true,
    dailyHoursWorked: 8,
    weeklyHoursWorked: 40,
  });
  const aboveWeekly = resolveOvertimeClassification({
    isDayBeforeApplicableHoliday: true,
    dailyHoursWorked: 8,
    weeklyHoursWorked: 45,
  });

  assert.equal(belowWeekly.weeklyClassification.sourceKnowledgeId, WEEKLY_OVERTIME_RECORD_ID);
  assert.equal(belowWeekly.weeklyClassification.weeklyOvertimeCandidateHours, 0);
  assert.equal(belowWeekly.dailyClassification.shortenedDayOvertimeCandidateHours, 1);
  assert.equal(aboveWeekly.weeklyClassification.weeklyOvertimeCandidateHours, 3);
  assert.equal(aboveWeekly.aggregationRequired, true);
  assert.equal(aboveWeekly.candidateHoursAggregated, false);
  assert.equal(aboveWeekly.doubleCountingResolutionPerformed, false);
});

test('holiday weekly-rest compensation and overtime multipliers are not implemented', () => {
  const result = resolveOvertimeClassification({
    isDayBeforeApplicableHoliday: true,
    dailyHoursWorked: 8,
  });
  const serialized = JSON.stringify(result);

  assert.equal(getRecord(SHORTENED_RECORD_ID).rule.doesNotCalculateHolidayCompensation, true);
  assert.equal(getRecord(SHORTENED_RECORD_ID).rule.doesNotCalculateWeeklyRestCompensation, true);
  assert.equal(result.compensation.overtimeMultipliersInvoked, false);
  assert.equal(result.compensation.weeklyRestPayCalculated, false);
  assert.equal(serialized.includes('holidayPay'), false);
  assert.equal(serialized.includes('1.25'), false);
  assert.equal(serialized.includes('1.5'), false);
  assert.equal(serialized.includes('175'), false);
  assert.equal(serialized.includes('200'), false);
});

test('holiday-work 150 percent and break rules are not invented', () => {
  const rule = getRecord(SHORTENED_RECORD_ID).rule;

  assert.equal(rule.doesNotInventHolidayWork150, true);
  assert.equal(rule.doesNotInvent175PercentRule, true);
  assert.equal(rule.doesNotInvent200PercentRule, true);
  assert.ok(rule.doesNotDetermine.includes('breaks_count_as_working_time'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('break_rules'));
});

test('shortened-workday selector uses the existing knowledge layer strictly', () => {
  const record = getRecord(SHORTENED_RECORD_ID);
  const selected = knowledgeBaseService.findShortenedWorkdayClassificationRule([record]);

  assert.equal(selected.id, SHORTENED_RECORD_ID);
  assert.equal(knowledgeBaseService.findShortenedWorkdayClassificationRule([{ ...record, source: { ...record.source, verified: false } }]), null);
  assert.equal(knowledgeBaseService.findShortenedWorkdayClassificationRule([{ ...record, source: { ...record.source, provision: 'Section 1' } }]), null);
  assert.equal(knowledgeBaseService.findShortenedWorkdayClassificationRule([{ ...record, rule: { ...record.rule, shortenedWorkdayBoundaryHours: 8 } }]), null);
  assert.equal(knowledgeBaseService.findShortenedWorkdayClassificationRule([{ ...record, rule: { ...record.rule, doesNotImplementSevenPaidAsEightArrangement: false } }]), null);
});

test('basic hourly salary logic and salary handler remain unchanged', async () => {
  const result = await employmentSalaryAgent.execute(createTask(
    'employment_salary',
    'jobs.salary',
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(getRecord(BASIC_HOURLY_RECORD_ID).rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
});

test('shortened-day message is still not connected to salary calculation handler', async () => {
  const result = await employmentSalaryAgent.execute(createTask(
    'employment_salary',
    'jobs.salary',
    'I worked 8 hours on the day before my weekly rest.'
  ));

  assert.notEqual(result.output.knowledgeId, SHORTENED_RECORD_ID);
  assert.equal(result.output.calculation, undefined);
});

test('salary_payment_timing missing_salary Finance and Health remain unchanged', async () => {
  const financeTask = createTask('finance_consumer', 'finance.transfer', 'How can I send money to Thailand?');
  financeTask.input = { amount: 2000, sourceCurrency: 'ILS', targetCurrency: 'THB' };
  const finance = await financeConsumerAgent.execute(financeTask);
  const health = await healthLifeCommunityAgent.execute(createTask(
    'health_life_community',
    'health.support',
    'I need a doctor in Tel Aviv.'
  ));

  assert.equal(getRecord(SALARY_TIMING_RECORD_ID).topic, 'salary_payment_timing');
  assert.equal(getRecord(MISSING_SALARY_RECORD_ID).topic, 'missing_salary');
  assert.equal(finance.status, 'partial');
  assert.match(finance.output.message, /not currently have enough real reported observations/i);
  assert.equal(health.status, 'success');
});

test('sourceMessage and profile-memory inputs are not parsed for shortened-day facts', () => {
  const sourceMessage = resolveOvertimeClassification({
    sourceMessage: 'I worked 8 hours on Friday before rest.',
  });
  const profileMemory = resolveOvertimeClassification({
    profile: { weeklyRestDay: 'Saturday' },
    workDayName: 'Friday',
    dailyHoursWorked: 8,
  });

  assert.equal(sourceMessage.dailyClassification.status, PATH_STATUS.BLOCKED);
  assert.equal(profileMemory.dailyClassification.status, PATH_STATUS.BLOCKED);
});
