const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

const DAILY_OVERTIME_RECORD_ID = 'israel_daily_overtime_classification_5_day_workweek_9_hours';
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
    taskId: 'task_daily_overtime_classification',
    conversationId: 'web:user',
    requestId: 'req_daily_overtime_classification',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-08T08:00:00.000Z',
  };
}

test('verified 5-day daily overtime knowledge exists', () => {
  assert.ok(getRecord(DAILY_OVERTIME_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === DAILY_OVERTIME_RECORD_ID));
});

test('official Israeli source metadata exists', () => {
  const source = getRecord(DAILY_OVERTIME_RECORD_ID).source;

  assert.equal(source.title, "Foreign Workers' Rights at Work");
  assert.equal(source.authority, 'State of Israel / Ministry of Labor');
  assert.equal(source.unit, "Foreign Workers' Rights Division");
  assert.equal(source.jurisdiction, 'IL');
  assert.equal(source.verified, true);
  assert.match(source.url, /gov\.il\/en\/pages\/rights-of-foreign-workers/);
});

test('verified 5-day workweek scope is required', () => {
  const rule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.applicableWorkweekDays, 5);
  assert.equal(rule.workweekDaysMustBeVerified, true);
  assert.equal(rule.requiresVerifiedFiveDayWorkweek, true);
  assert.ok(rule.requiredFactsBeforeApplication.includes('verifiedWorkweekDays'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('unverified_workweek_days'));
});

test('regular daily boundary is 9 hours for a regular workday', () => {
  const rule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.regularDailyHoursBoundary, 9);
  assert.equal(rule.regularDailyHoursBoundaryUnit, 'hours');
  assert.equal(rule.workDayType, 'regular');
  assert.ok(rule.requiredFactsBeforeApplication.includes('dailyHoursWorked'));
  assert.ok(rule.requiredFactsBeforeApplication.includes('workDayType'));
});

test('exactly 9 hours creates zero candidate hours and no other no-overtime conclusion', () => {
  const boundary = getRecord(DAILY_OVERTIME_RECORD_ID).rule.exactBoundaryCandidateHours;

  assert.equal(boundary.dailyHoursWorked, 9);
  assert.equal(boundary.dailyOvertimeCandidateHours, 0);
  assert.equal(boundary.doesNotProveNoOtherOvertime, true);
});

test('10 regular hours creates 1 candidate hour only when 5-day scope is verified', () => {
  const example = getRecord(DAILY_OVERTIME_RECORD_ID).rule.candidateExample;

  assert.equal(example.verifiedWorkweekDays, 5);
  assert.equal(example.workDayType, 'regular');
  assert.equal(example.dailyHoursWorked, 10);
  assert.equal(example.dailyOvertimeCandidateHours, 1);
  assert.equal(example.candidateOnly, true);
});

test('daily overtime candidate formula is represented as candidate-only', () => {
  const formula = getRecord(DAILY_OVERTIME_RECORD_ID).rule.dailyOvertimeCandidateFormula;

  assert.equal(formula.result, 'dailyOvertimeCandidateHours');
  assert.equal(formula.operator, 'subtract');
  assert.deepEqual(formula.operands, ['dailyHoursWorked', 'regularDailyHoursBoundary']);
  assert.equal(formula.appliesWhenDailyHoursGreaterThan, 9);
  assert.equal(formula.candidateOnly, true);
  assert.equal(formula.notPayableOvertimeConclusion, true);
});

test('dailyHoursWorked alone and five supplied entries are insufficient without verified 5-day scope', () => {
  const rule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.doesNotInferWorkweekDaysFromTimeEntryCount, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('hoursWorked_without_daily_context'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('five_time_entry_days_without_verified_workweek_scope'));
});

test('daily rule does not require weekly total above 42 and below 42 does not prove no daily overtime', () => {
  const rule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.doesNotRequireWeeklyHoursAbove42, true);
  assert.equal(rule.belowWeekly42DoesNotProveNoDailyOvertime, true);
  assert.equal(rule.weeklyRuleIndependent, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('weeklyHours'));
});

test('weekly 42-hour rule remains independent', () => {
  const dailyRule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;
  const weeklyRule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;

  assert.ok(dailyRule.separateKnowledgeRequiredFor.includes('weekly_overtime_classification'));
  assert.equal(weeklyRule.regularWeeklyHours, 42);
  assert.equal(weeklyRule.doesNotCalculateOvertimePay, true);
});

test('overtime multipliers remain independent and are not invoked', () => {
  const dailyRule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;
  const multiplierRule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;
  const serializedDaily = JSON.stringify(getRecord(DAILY_OVERTIME_RECORD_ID));

  assert.equal(dailyRule.doesNotCalculateOvertimePay, true);
  assert.equal(dailyRule.doesNotInvokeOvertimeMultipliers, true);
  assert.ok(dailyRule.separateKnowledgeRequiredFor.includes('overtime_pay_multipliers'));
  assert.equal(multiplierRule.multipliers.firstOvertimeHourMultiplier, 1.25);
  assert.equal(multiplierRule.multipliers.thirdAndLaterOvertimeHourMultiplier, 1.5);
  assert.equal(serializedDaily.includes('125%'), false);
  assert.equal(serializedDaily.includes('150%'), false);
  assert.equal(serializedDaily.includes('1.25'), false);
  assert.equal(serializedDaily.includes('1.5'), false);
});

test('six-day 8-hour rule is not added', () => {
  const rule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;
  const serialized = JSON.stringify(getRecord(DAILY_OVERTIME_RECORD_ID)).toLowerCase();

  assert.ok(rule.doesNotDetermine.includes('six_day_workweek_daily_rule'));
  assert.ok(rule.doesNotDetermine.includes('six_day_workweek_daily_threshold'));
  assert.ok(rule.doesNotDetermine.includes('eight_hour_daily_rule'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('six_day_workweek_daily_rule'));
  assert.equal(serialized.includes('8-hour'), false);
});

test('rest day Saturday Shabbat holiday holiday-eve and night work remain separate', () => {
  const separate = getRecord(DAILY_OVERTIME_RECORD_ID).rule.separateKnowledgeRequiredFor;

  assert.ok(separate.includes('weekly_rest_work'));
  assert.ok(separate.includes('saturday_or_shabbat_work'));
  assert.ok(separate.includes('holiday_work'));
  assert.ok(separate.includes('holiday_eve_work'));
  assert.ok(separate.includes('night_work_rules'));
});

test('break meal and travel-time rules are not invented', () => {
  const rule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;

  assert.ok(rule.doesNotDetermine.includes('breaks_count_as_working_time'));
  assert.ok(rule.doesNotDetermine.includes('meal_breaks_paid_status'));
  assert.ok(rule.doesNotDetermine.includes('travel_time_working_time_status'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('break_rules'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('travel_time_rules'));
});

test('monthly-hours shortcut remains prohibited', () => {
  const rule = getRecord(DAILY_OVERTIME_RECORD_ID).rule;
  const serialized = JSON.stringify(getRecord(DAILY_OVERTIME_RECORD_ID)).toLowerCase();

  assert.equal(rule.doesNotTreatMonthlyHoursAsDailyHours, true);
  assert.equal(rule.doesNotInferOvertimeFromMonthlyHours, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('monthlyHours'));
  assert.equal(serialized.includes('182'), false);
  assert.equal(serialized.includes('186'), false);
});

test('5-day daily overtime classification rule can be selected by existing knowledge layer', () => {
  const record = getRecord(DAILY_OVERTIME_RECORD_ID);
  const selected = knowledgeBaseService.findFiveDayDailyOvertimeClassificationRule([record]);

  assert.equal(selected.id, DAILY_OVERTIME_RECORD_ID);
  assert.equal(knowledgeBaseService.findFiveDayDailyOvertimeClassificationRule([{ ...record, source: { ...record.source, verified: false } }]), null);
  assert.equal(knowledgeBaseService.findFiveDayDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, applicableWorkweekDays: 6 } }]), null);
  assert.equal(knowledgeBaseService.findFiveDayDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, regularDailyHoursBoundary: 8 } }]), null);
  assert.equal(knowledgeBaseService.findFiveDayDailyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, doesNotInvokeOvertimeMultipliers: false } }]), null);
});

test('basic hourly salary knowledge remains unchanged', () => {
  const record = getRecord(BASIC_HOURLY_RECORD_ID);

  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
  assert.equal(record.rule.doesNotTreatTotalHoursAsRegularHours, true);
});

test('salary calculation handler remains unchanged and does not use daily overtime rule', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.doesNotMatch(result.output.message, /daily overtime|9 hours|5-day/i);
});

test('daily overtime message connects safely to salary calculation handler', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 10 hours today in my verified 5-day workweek.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, DAILY_OVERTIME_RECORD_ID);
  assert.equal(result.output.calculation.regularHours, 9);
  assert.equal(result.output.calculation.dailyOvertimeCandidateHours, 1);
  assert.equal(result.output.calculation.grossPay, 410);
  assert.match(result.output.message || '', /Gross pay for these supplied hours: 410 ILS/i);
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
