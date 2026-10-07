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

const NIGHT_WORK_RECORD_ID = 'israel_night_work_daily_overtime_classification_7_hours';
const FIVE_DAY_DAILY_RECORD_ID = 'israel_daily_overtime_classification_5_day_workweek_9_hours';
const SIX_DAY_DAILY_RECORD_ID = 'israel_daily_overtime_classification_6_day_workweek_8_hours';
const WEEKLY_OVERTIME_RECORD_ID = 'israel_weekly_overtime_classification_foundation_42_hours';
const OVERTIME_MULTIPLIER_RECORD_ID = 'israel_overtime_pay_multipliers_section_16a';
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
    requestId: 'req_night_work_foundation',
    domain,
    capability,
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-10T08:00:00.000Z',
  };
}

test('verified night-work knowledge exists', () => {
  assert.ok(getRecord(NIGHT_WORK_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === NIGHT_WORK_RECORD_ID));
});

test('official Israeli source metadata exists', () => {
  const source = getRecord(NIGHT_WORK_RECORD_ID).source;

  assert.equal(source.title, 'Request for employment during weekly rest or overtime');
  assert.equal(source.authority, 'Ministry of Labor');
  assert.equal(source.jurisdiction, 'IL');
  assert.match(source.url, /gov\.il\/he\/service\/request-for-employment-during-weekend-or-extra-hours/);
  assert.equal(source.verified, true);
  assert.ok(source.corroboratingSources.some((item) => item.url.includes('hachvana.mod.gov.il')));
});

test('night window 22:00 to 06:00 is represented', () => {
  const rule = getRecord(NIGHT_WORK_RECORD_ID).rule;

  assert.equal(rule.nightWindowStart, '22:00');
  assert.equal(rule.nightWindowEnd, '06:00');
  assert.equal(rule.definitionResult, 'isNightWork');
});

test('minimum 2 hours within the night window is represented', () => {
  const rule = getRecord(NIGHT_WORK_RECORD_ID).rule;

  assert.equal(rule.minimumHoursWithinNightWindow, 2);
  assert.equal(rule.minimumHoursWithinNightWindowUnit, 'hours');
});

test('less than 2 hours in the night window does not establish night work', () => {
  const result = resolveOvertimeClassification({
    specialDayContext: 'night work',
    hoursWithinNightWindow: 1,
    dailyHoursWorked: 8,
  });

  assert.equal(getRecord(NIGHT_WORK_RECORD_ID).rule.lessThanMinimumNightWindowHoursDoesNotEstablishNightWork, true);
  assert.equal(result.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.ok(result.dailyClassification.blockers.includes('special_context:night_work'));
});

test('exactly 2 hours within the night window can verify night work from structured facts', () => {
  const result = resolveOvertimeClassification({
    hoursWithinNightWindow: 2,
    dailyHoursWorked: 8,
  });

  assert.equal(getRecord(NIGHT_WORK_RECORD_ID).rule.exactMinimumNightWindowHoursMayEstablishNightWorkWhenTimeFactsVerifyIt, true);
  assert.equal(result.dailyClassification.isNightWork, true);
  assert.equal(result.dailyClassification.nightWorkVerificationBasis, 'hoursWithinNightWindow');
});

test('7-hour regular night-work boundary is represented', () => {
  const rule = getRecord(NIGHT_WORK_RECORD_ID).rule;

  assert.equal(rule.regularNightWorkdayHoursBoundary, 7);
  assert.equal(rule.regularNightWorkdayHoursBoundaryUnit, 'hours');
});

test('verified night work plus 8 daily hours creates 1 candidate hour', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 8,
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.CLASSIFIED);
  assert.equal(result.dailyClassification.regularNightWorkdayHoursBoundary, 7);
  assert.equal(result.dailyClassification.nightWorkDailyOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.sourceKnowledgeId, NIGHT_WORK_RECORD_ID);
});

test('verified night work exact 7-hour boundary creates zero candidate hours', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 7,
  });

  assert.equal(result.dailyClassification.nightWorkDailyOvertimeCandidateHours, 0);
  assert.equal(result.dailyClassification.candidateExists, false);
  assert.equal(getRecord(NIGHT_WORK_RECORD_ID).rule.exactBoundaryCandidateHours.doesNotProveNoWeeklyOvertime, true);
});

test('verified night work with 6 hours creates zero candidate hours', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 6,
  });

  assert.equal(result.dailyClassification.nightWorkDailyOvertimeCandidateHours, 0);
  assert.equal(result.dailyClassification.candidateExists, false);
});

test('night shift label alone does not prove statutory night work', () => {
  const result = resolveOvertimeClassification({
    shiftLabel: 'night shift',
    dailyHoursWorked: 8,
  });

  assert.equal(getRecord(NIGHT_WORK_RECORD_ID).rule.shiftLabelAloneInsufficient, true);
  assert.equal(result.dailyClassification.status, PATH_STATUS.BLOCKED);
});

test('late shift label alone does not prove statutory night work', () => {
  const result = resolveOvertimeClassification({
    shiftLabel: 'late shift',
    dailyHoursWorked: 8,
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.BLOCKED);
  assert.ok(result.missingFacts.includes('workweekDays'));
});

test('one late hour does not establish night work', () => {
  const result = resolveOvertimeClassification({
    specialDayContext: 'night work',
    hoursWithinNightWindow: 1,
    nightHourType: 'after_22',
    dailyHoursWorked: 8,
  });

  assert.equal(getRecord(NIGHT_WORK_RECORD_ID).rule.oneLateHourInsufficient, true);
  assert.equal(result.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
});

test('one early-morning hour does not establish night work', () => {
  const result = resolveOvertimeClassification({
    specialDayContext: 'night work',
    hoursWithinNightWindow: 1,
    nightHourType: 'before_06',
    dailyHoursWorked: 8,
  });

  assert.equal(getRecord(NIGHT_WORK_RECORD_ID).rule.oneEarlyMorningHourInsufficient, true);
  assert.equal(result.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
});

test('verified night-work day does not use 9-hour 5-day boundary', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 5,
    isNightWork: true,
    dailyHoursWorked: 8,
  });

  assert.equal(result.dailyClassification.regularDailyHoursBoundary, 7);
  assert.equal(result.dailyClassification.nightWorkDailyOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.sourceKnowledgeId, NIGHT_WORK_RECORD_ID);
  assert.notEqual(result.dailyClassification.sourceKnowledgeId, FIVE_DAY_DAILY_RECORD_ID);
});

test('verified night-work day does not use 8-hour 6-day boundary', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 6,
    isNightWork: true,
    dailyHoursWorked: 8,
  });

  assert.equal(result.dailyClassification.regularDailyHoursBoundary, 7);
  assert.equal(result.dailyClassification.nightWorkDailyOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.sourceKnowledgeId, NIGHT_WORK_RECORD_ID);
  assert.notEqual(result.dailyClassification.sourceKnowledgeId, SIX_DAY_DAILY_RECORD_ID);
});

test('existing 5-day rule remains unchanged for regular non-night days', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    workDayType: 'regular',
  });

  assert.equal(getRecord(FIVE_DAY_DAILY_RECORD_ID).rule.regularDailyHoursBoundary, 9);
  assert.equal(result.dailyClassification.sourceKnowledgeId, FIVE_DAY_DAILY_RECORD_ID);
  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, 1);
});

test('existing 6-day rule remains unchanged for regular non-night days', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 6,
    dailyHoursWorked: 9,
    workDayType: 'regular',
  });

  assert.equal(getRecord(SIX_DAY_DAILY_RECORD_ID).rule.regularDailyHoursBoundary, 8);
  assert.equal(result.dailyClassification.sourceKnowledgeId, SIX_DAY_DAILY_RECORD_ID);
  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, 1);
});

test('weekly 42-hour rule remains independent', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 7,
    weeklyHoursWorked: 45,
  });

  assert.equal(result.weeklyClassification.sourceKnowledgeId, WEEKLY_OVERTIME_RECORD_ID);
  assert.equal(result.weeklyClassification.weeklyOvertimeCandidateHours, 3);
});

test('below 42 weekly total does not prove no night-work daily overtime', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 8,
    weeklyHoursWorked: 40,
  });

  assert.equal(result.weeklyClassification.weeklyOvertimeCandidateHours, 0);
  assert.equal(result.dailyClassification.nightWorkDailyOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.belowWeekly42DoesNotProveNoNightWorkDailyOvertime, true);
});

test('night-work daily candidates are not aggregated with weekly candidates', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 8,
    weeklyHoursWorked: 45,
  });

  assert.equal(result.dailyClassification.nightWorkDailyOvertimeCandidateHours, 1);
  assert.equal(result.weeklyClassification.weeklyOvertimeCandidateHours, 3);
  assert.equal(result.aggregationRequired, true);
  assert.equal(result.candidateHoursAggregated, false);
  assert.equal(result.doubleCountingResolutionPerformed, false);
});

test('125 and 150 percent overtime multipliers are not invoked', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 8,
  });

  assert.equal(getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule.multipliers.firstOvertimeHourMultiplier, 1.25);
  assert.equal(getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule.multipliers.thirdAndLaterOvertimeHourMultiplier, 1.5);
  assert.equal(result.compensation.overtimeMultipliersInvoked, false);
  assert.equal(result.compensation.overtimePayCalculated, false);
});

test('no night premium is invented', () => {
  const result = resolveOvertimeClassification({
    isNightWork: true,
    dailyHoursWorked: 8,
  });
  const serialized = JSON.stringify(result);

  assert.equal(getRecord(NIGHT_WORK_RECORD_ID).rule.doesNotInventNightPremium, true);
  assert.equal(serialized.includes('nightPremium'), false);
  assert.equal(serialized.includes('night_bonus'), false);
});

test('night-work permit and frequency restrictions are not implemented', () => {
  const rule = getRecord(NIGHT_WORK_RECORD_ID).rule;

  assert.equal(rule.doesNotImplementNightWorkPermitOrFrequencyRules, true);
  assert.ok(rule.doesNotDetermine.includes('night_work_permit_compliance'));
  assert.ok(rule.doesNotDetermine.includes('night_work_frequency_limit'));
});

test('holiday holiday-eve weekly-rest and shortened-workday remain separate', () => {
  const rule = getRecord(NIGHT_WORK_RECORD_ID).rule;
  const holiday = resolveOvertimeClassification({ isNightWork: true, dailyHoursWorked: 8, specialDayContext: 'holiday' });
  const holidayEve = resolveOvertimeClassification({ isNightWork: true, dailyHoursWorked: 8, specialDayContext: 'holiday eve' });
  const weeklyRest = resolveOvertimeClassification({ isNightWork: true, dailyHoursWorked: 8, workOccurredDuringWeeklyRest: true });
  const shortened = resolveOvertimeClassification({ isNightWork: true, dailyHoursWorked: 8, specialDayContext: 'shortened workday' });

  assert.ok(rule.separateKnowledgeRequiredFor.includes('holiday_work'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('holiday_eve_work'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('weekly_rest_work'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('shortened_workday'));
  assert.equal(holiday.status, OVERTIME_CLASSIFICATION_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.equal(holidayEve.status, OVERTIME_CLASSIFICATION_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.equal(weeklyRest.status, OVERTIME_CLASSIFICATION_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.equal(shortened.status, OVERTIME_CLASSIFICATION_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
});

test('break meal travel and waiting-time rules are not invented', () => {
  const rule = getRecord(NIGHT_WORK_RECORD_ID).rule;

  assert.ok(rule.doesNotDetermine.includes('breaks_count_as_working_time'));
  assert.ok(rule.doesNotDetermine.includes('meal_breaks_paid_status'));
  assert.ok(rule.doesNotDetermine.includes('travel_time_working_time_status'));
  assert.ok(rule.doesNotDetermine.includes('waiting_time_working_time_status'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('break_rules'));
});

test('night-work classification rule can be selected by the existing knowledge layer', () => {
  const record = getRecord(NIGHT_WORK_RECORD_ID);
  const selected = knowledgeBaseService.findNightWorkDailyOvertimeClassificationRule([record]);

  assert.equal(selected.id, NIGHT_WORK_RECORD_ID);
  assert.equal(knowledgeBaseService.findNightWorkDailyOvertimeClassificationRule([{ ...record, source: { ...record.source, verified: false } }]), null);
  assert.equal(knowledgeBaseService.findNightWorkDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, minimumHoursWithinNightWindow: 1 } }]), null);
  assert.equal(knowledgeBaseService.findNightWorkDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, regularNightWorkdayHoursBoundary: 8 } }]), null);
  assert.equal(knowledgeBaseService.findNightWorkDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, doesNotInventNightPremium: false } }]), null);
});

test('basic hourly salary logic remains unchanged', () => {
  const record = getRecord(BASIC_HOURLY_RECORD_ID);

  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
});

test('salary calculation handler remains unchanged and is not connected to night work', async () => {
  const result = await employmentSalaryAgent.execute(createTask(
    'employment_salary',
    'jobs.salary',
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.doesNotMatch(result.output.message, /night work|7 hours|night premium/i);
});

test('night-work message is still not connected to salary calculation handler', async () => {
  const result = await employmentSalaryAgent.execute(createTask(
    'employment_salary',
    'jobs.salary',
    'I worked 8 hours in verified night work.'
  ));

  assert.notEqual(result.output.knowledgeId, NIGHT_WORK_RECORD_ID);
  assert.equal(result.output.calculation, undefined);
});

test('salary_payment_timing and missing_salary remain unchanged', () => {
  assert.equal(getRecord(SALARY_TIMING_RECORD_ID).topic, 'salary_payment_timing');
  assert.equal(getRecord(SALARY_TIMING_RECORD_ID).source.verified, true);
  assert.equal(getRecord(MISSING_SALARY_RECORD_ID).topic, 'missing_salary');
  assert.equal(getRecord(MISSING_SALARY_RECORD_ID).source.verified, true);
});

test('Finance and Health/Life/Community agents remain unchanged', async () => {
  const financeTask = createTask(
    'finance_consumer',
    'finance.transfer',
    'How can I send 2000 ILS to Thailand?'
  );
  financeTask.input = { amount: 2000, sourceCurrency: 'ILS', targetCurrency: 'THB' };

  const finance = await financeConsumerAgent.execute(financeTask);
  const health = await healthLifeCommunityAgent.execute(createTask(
    'health_life_community',
    'health.support',
    'I need a doctor in Tel Aviv.'
  ));

  assert.equal(finance.status, 'partial');
  assert.match(finance.output.message, /not currently have enough real reported observations/i);
  assert.equal(health.status, 'success');
  assert.match(JSON.stringify(health.output), /health|doctor|clinic|urgent/i);
});

test('sourceMessage and profile-memory inputs are not parsed for night-work facts', () => {
  const sourceMessage = resolveOvertimeClassification({
    sourceMessage: 'I worked the night shift for 8 hours.',
  });
  const profileMemory = resolveOvertimeClassification({
    profile: { preferredShift: 'night shift' },
    dailyHoursWorked: 8,
  });

  assert.equal(sourceMessage.dailyClassification.status, PATH_STATUS.BLOCKED);
  assert.equal(profileMemory.dailyClassification.status, PATH_STATUS.BLOCKED);
  assert.ok(profileMemory.missingFacts.includes('workweekDays'));
});
