const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

const SIX_DAY_DAILY_RECORD_ID = 'israel_daily_overtime_classification_6_day_workweek_8_hours';
const FIVE_DAY_DAILY_RECORD_ID = 'israel_daily_overtime_classification_5_day_workweek_9_hours';
const WEEKLY_OVERTIME_RECORD_ID = 'israel_weekly_overtime_classification_foundation_42_hours';
const OVERTIME_MULTIPLIER_RECORD_ID = 'israel_overtime_pay_multipliers_section_16a';
const BASIC_HOURLY_RECORD_ID = 'basic_hourly_salary_calculation_gross_pay';
const SALARY_TIMING_RECORD_ID = 'israel_salary_payment_timing_monthly';
const MISSING_SALARY_RECORD_ID = 'israel_missing_salary_monthly_foundation';

function getRecord(id) {
  return workersRightsKnowledge.find((item) => item.id === id);
}

function createSalaryTask(question) {
  return {
    taskId: 'task_six_day_daily_overtime_classification',
    conversationId: 'web:user',
    requestId: 'req_six_day_daily_overtime_classification',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-08T08:00:00.000Z',
  };
}

test('verified 6-day daily overtime knowledge exists', () => {
  assert.ok(getRecord(SIX_DAY_DAILY_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === SIX_DAY_DAILY_RECORD_ID));
});

test('existing official Israeli government source metadata is reused', () => {
  const sixDaySource = getRecord(SIX_DAY_DAILY_RECORD_ID).source;
  const fiveDaySource = getRecord(FIVE_DAY_DAILY_RECORD_ID).source;

  assert.deepEqual(sixDaySource, fiveDaySource);
  assert.equal(sixDaySource.title, "Foreign Workers' Rights at Work");
  assert.equal(sixDaySource.authority, 'State of Israel / Ministry of Labor');
  assert.equal(sixDaySource.unit, "Foreign Workers' Rights Division");
  assert.equal(sixDaySource.verified, true);
});

test('verified 6-day workweek scope is required', () => {
  const rule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;

  assert.equal(rule.applicableWorkweekDays, 6);
  assert.equal(rule.workweekDaysMustBeVerified, true);
  assert.equal(rule.requiresVerifiedSixDayWorkweek, true);
  assert.ok(rule.requiredFactsBeforeApplication.includes('verifiedWorkweekDays'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('unverified_workweek_days'));
});

test('regular daily boundary is 8 hours for a regular workday', () => {
  const rule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;

  assert.equal(rule.regularDailyHoursBoundary, 8);
  assert.equal(rule.regularDailyHoursBoundaryUnit, 'hours');
  assert.equal(rule.workDayType, 'regular');
  assert.ok(rule.requiredFactsBeforeApplication.includes('dailyHoursWorked'));
  assert.ok(rule.requiredFactsBeforeApplication.includes('workDayType'));
});

test('exactly 8 hours creates zero candidate hours and no other no-overtime conclusion', () => {
  const boundary = getRecord(SIX_DAY_DAILY_RECORD_ID).rule.exactBoundaryCandidateHours;

  assert.equal(boundary.dailyHoursWorked, 8);
  assert.equal(boundary.dailyOvertimeCandidateHours, 0);
  assert.equal(boundary.doesNotProveNoOtherOvertime, true);
});

test('9 regular hours creates 1 candidate hour only when 6-day scope is verified', () => {
  const example = getRecord(SIX_DAY_DAILY_RECORD_ID).rule.candidateExample;

  assert.equal(example.verifiedWorkweekDays, 6);
  assert.equal(example.workDayType, 'regular');
  assert.equal(example.dailyHoursWorked, 9);
  assert.equal(example.dailyOvertimeCandidateHours, 1);
  assert.equal(example.candidateOnly, true);
});

test('daily overtime candidate calculation is represented as candidate-only', () => {
  const formula = getRecord(SIX_DAY_DAILY_RECORD_ID).rule.dailyOvertimeCandidateFormula;

  assert.equal(formula.result, 'dailyOvertimeCandidateHours');
  assert.equal(formula.operator, 'subtract');
  assert.deepEqual(formula.operands, ['dailyHoursWorked', 'regularDailyHoursBoundary']);
  assert.equal(formula.appliesWhenDailyHoursGreaterThan, 8);
  assert.equal(formula.candidateOnly, true);
  assert.equal(formula.notPayableOvertimeConclusion, true);
});

test('dailyHoursWorked alone and six supplied entries are insufficient without verified 6-day scope', () => {
  const rule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;

  assert.equal(rule.doesNotInferWorkweekDaysFromTimeEntryCount, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('hoursWorked_without_daily_context'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('six_time_entry_days_without_verified_workweek_scope'));
});

test('existing 5-day rule remains 9 hours and is not overwritten', () => {
  const fiveDayRule = getRecord(FIVE_DAY_DAILY_RECORD_ID).rule;

  assert.equal(fiveDayRule.applicableWorkweekDays, 5);
  assert.equal(fiveDayRule.regularDailyHoursBoundary, 9);
  assert.equal(fiveDayRule.requiresVerifiedFiveDayWorkweek, true);
  assert.equal(fiveDayRule.candidateExample.dailyHoursWorked, 10);
  assert.equal(fiveDayRule.candidateExample.dailyOvertimeCandidateHours, 1);
});

test('5-day and 6-day rules remain distinguishable', () => {
  const fiveDayRule = getRecord(FIVE_DAY_DAILY_RECORD_ID).rule;
  const sixDayRule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;

  assert.notEqual(fiveDayRule.applicableWorkweekDays, sixDayRule.applicableWorkweekDays);
  assert.notEqual(fiveDayRule.regularDailyHoursBoundary, sixDayRule.regularDailyHoursBoundary);
  assert.equal(knowledgeBaseService.findFiveDayDailyOvertimeClassificationRule([getRecord(FIVE_DAY_DAILY_RECORD_ID)]).id, FIVE_DAY_DAILY_RECORD_ID);
  assert.equal(knowledgeBaseService.findSixDayDailyOvertimeClassificationRule([getRecord(SIX_DAY_DAILY_RECORD_ID)]).id, SIX_DAY_DAILY_RECORD_ID);
});

test('6-day rule does not overwrite 5-day selector', () => {
  assert.equal(knowledgeBaseService.findFiveDayDailyOvertimeClassificationRule([getRecord(SIX_DAY_DAILY_RECORD_ID)]), null);
  assert.equal(knowledgeBaseService.findSixDayDailyOvertimeClassificationRule([getRecord(FIVE_DAY_DAILY_RECORD_ID)]), null);
});

test('daily rule does not require weekly total above 42 and below 42 does not prove no daily overtime', () => {
  const rule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;

  assert.equal(rule.doesNotRequireWeeklyHoursAbove42, true);
  assert.equal(rule.belowWeekly42DoesNotProveNoDailyOvertime, true);
  assert.equal(rule.weeklyRuleIndependent, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('weeklyHours'));
});

test('weekly 42-hour rule remains independent', () => {
  const sixDayRule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;
  const weeklyRule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;

  assert.ok(sixDayRule.separateKnowledgeRequiredFor.includes('weekly_overtime_classification'));
  assert.equal(weeklyRule.regularWeeklyHours, 42);
  assert.equal(weeklyRule.doesNotCalculateOvertimePay, true);
});

test('overtime multipliers remain independent and are not invoked', () => {
  const sixDayRule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;
  const multiplierRule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;
  const serializedSixDay = JSON.stringify(getRecord(SIX_DAY_DAILY_RECORD_ID));

  assert.equal(sixDayRule.doesNotCalculateOvertimePay, true);
  assert.equal(sixDayRule.doesNotInvokeOvertimeMultipliers, true);
  assert.ok(sixDayRule.separateKnowledgeRequiredFor.includes('overtime_pay_multipliers'));
  assert.equal(multiplierRule.multipliers.firstOvertimeHourMultiplier, 1.25);
  assert.equal(multiplierRule.multipliers.thirdAndLaterOvertimeHourMultiplier, 1.5);
  assert.equal(serializedSixDay.includes('125%'), false);
  assert.equal(serializedSixDay.includes('150%'), false);
  assert.equal(serializedSixDay.includes('1.25'), false);
  assert.equal(serializedSixDay.includes('1.5'), false);
});

test('rest day Saturday Shabbat holiday holiday-eve and night work remain separate', () => {
  const separate = getRecord(SIX_DAY_DAILY_RECORD_ID).rule.separateKnowledgeRequiredFor;

  assert.ok(separate.includes('weekly_rest_work'));
  assert.ok(separate.includes('saturday_or_shabbat_work'));
  assert.ok(separate.includes('holiday_work'));
  assert.ok(separate.includes('holiday_eve_work'));
  assert.ok(separate.includes('night_work_rules'));
});

test('break meal unpaid-break travel-time and waiting-time rules are not invented', () => {
  const rule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;

  assert.ok(rule.doesNotDetermine.includes('breaks_count_as_working_time'));
  assert.ok(rule.doesNotDetermine.includes('meal_breaks_paid_status'));
  assert.ok(rule.doesNotDetermine.includes('unpaid_breaks_working_time_status'));
  assert.ok(rule.doesNotDetermine.includes('travel_time_working_time_status'));
  assert.ok(rule.doesNotDetermine.includes('waiting_time_working_time_status'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('break_rules'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('waiting_time_rules'));
});

test('monthly-hours shortcut remains prohibited', () => {
  const rule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;
  const serialized = JSON.stringify(getRecord(SIX_DAY_DAILY_RECORD_ID)).toLowerCase();

  assert.equal(rule.doesNotTreatMonthlyHoursAsDailyHours, true);
  assert.equal(rule.doesNotInferOvertimeFromMonthlyHours, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('monthlyHours'));
  assert.equal(serialized.includes('182'), false);
});

test('6-day daily overtime classification rule can be selected by existing knowledge layer', () => {
  const record = getRecord(SIX_DAY_DAILY_RECORD_ID);
  const selected = knowledgeBaseService.findSixDayDailyOvertimeClassificationRule([record]);

  assert.equal(selected.id, SIX_DAY_DAILY_RECORD_ID);
  assert.equal(knowledgeBaseService.findSixDayDailyOvertimeClassificationRule([{ ...record, source: { ...record.source, verified: false } }]), null);
  assert.equal(knowledgeBaseService.findSixDayDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, applicableWorkweekDays: 5 } }]), null);
  assert.equal(knowledgeBaseService.findSixDayDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, regularDailyHoursBoundary: 9 } }]), null);
  assert.equal(knowledgeBaseService.findSixDayDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, doesNotInvokeOvertimeMultipliers: false } }]), null);
});

test('basic hourly salary knowledge remains unchanged', () => {
  const record = getRecord(BASIC_HOURLY_RECORD_ID);

  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
  assert.equal(record.rule.doesNotTreatTotalHoursAsRegularHours, true);
});

test('salary calculation handler remains unchanged and does not use 6-day daily overtime rule', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.doesNotMatch(result.output.message, /daily overtime|8 hours|6-day/i);
});

test('6-day daily overtime message connects safely to salary calculation handler', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 9 hours today in my verified 6-day workweek.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, SIX_DAY_DAILY_RECORD_ID);
  assert.equal(result.output.calculation.regularHours, 8);
  assert.equal(result.output.calculation.dailyOvertimeCandidateHours, 1);
  assert.equal(result.output.calculation.grossPay, 370);
  assert.match(result.output.message || '', /Gross pay for these supplied hours: 370 ILS/i);
  assert.doesNotMatch(result.output.message || '', /net salary is|complete payslip amount is/i);
});

test('salary payment timing knowledge remains unchanged', () => {
  const record = getRecord(SALARY_TIMING_RECORD_ID);

  assert.equal(record.topic, 'salary_payment_timing');
  assert.equal(record.workerType, 'monthly');
  assert.equal(record.source.title, 'Wage Protection Law, 5718-1958');
  assert.equal(record.source.verified, true);
});

test('missing salary knowledge remains unchanged', () => {
  const record = getRecord(MISSING_SALARY_RECORD_ID);

  assert.equal(record.topic, 'missing_salary');
  assert.equal(record.workerType, 'monthly');
  assert.equal(record.rule.salaryDueReference, SALARY_TIMING_RECORD_ID);
  assert.equal(record.source.title, 'Wage Protection Law, 5718-1958');
  assert.equal(record.source.verified, true);
});
