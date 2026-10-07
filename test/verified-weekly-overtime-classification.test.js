const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

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
    taskId: 'task_weekly_overtime_classification',
    conversationId: 'web:user',
    requestId: 'req_weekly_overtime_classification',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-08T08:00:00.000Z',
  };
}

test('verified weekly overtime classification knowledge exists', () => {
  assert.ok(getRecord(WEEKLY_OVERTIME_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === WEEKLY_OVERTIME_RECORD_ID));
});

test('official Israeli government source metadata exists', () => {
  const source = getRecord(WEEKLY_OVERTIME_RECORD_ID).source;

  assert.equal(source.title, 'Request for employment during weekly rest or overtime');
  assert.equal(source.authority, 'Ministry of Labor');
  assert.equal(source.jurisdiction, 'IL');
  assert.equal(source.verified, true);
  assert.match(source.url, /gov\.il\/he\/service\/request-for-employment-during-weekend-or-extra-hours/);
});

test('regular weekly hours equals 42', () => {
  const rule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.regularWeeklyHours, 42);
  assert.equal(rule.regularWeeklyHoursUnit, 'hours');
});

test('weekly context and applicable workweek scope are required', () => {
  const rule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.requiresWeeklyContext, true);
  assert.equal(rule.requiresApplicableWorkweekScope, true);
  assert.deepEqual(rule.requiredFactsBeforeApplication, [
    'weeklyHoursWorked',
    'regularWeeklyHours',
    'applicableWorkweekScope',
  ]);
});

test('42 hours is represented as regular weekly work scope', () => {
  const record = getRecord(WEEKLY_OVERTIME_RECORD_ID);

  assert.equal(record.rule.classificationOnly, true);
  assert.equal(record.rule.regularWeeklyHours, 42);
  assert.match(record.answer, /regular workweek is 42 regular working hours/i);
});

test('hours above 42 are represented only as overtime classification candidates', () => {
  const formula = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule.weeklyOvertimeCandidateFormula;

  assert.equal(formula.result, 'weeklyOvertimeCandidateHours');
  assert.equal(formula.operator, 'subtract');
  assert.deepEqual(formula.operands, ['weeklyHoursWorked', 'regularWeeklyHours']);
  assert.equal(formula.candidateOnly, true);
  assert.equal(formula.notPayableOvertimeConclusion, true);
});

test('weekly rule does not calculate overtime pay or invoke multipliers', () => {
  const rule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.doesNotCalculateOvertimePay, true);
  assert.equal(rule.doesNotInvokeOvertimeMultipliers, true);
  assert.ok(rule.doesNotDetermine.includes('overtime_pay'));
  assert.ok(rule.doesNotDetermine.includes('overtime_multiplier'));
});

test('daily overtime rules remain unimplemented and below 42 does not prove no overtime', () => {
  const rule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.belowRegularWeeklyHoursDoesNotProveNoOvertime, true);
  assert.ok(rule.doesNotDetermine.includes('daily_overtime_classification'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('daily_overtime_classification'));
});

test('no five-day or six-day daily threshold rule is added', () => {
  const rule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;
  const serialized = JSON.stringify(getRecord(WEEKLY_OVERTIME_RECORD_ID)).toLowerCase();

  assert.ok(rule.doesNotDetermine.includes('five_day_workweek_daily_rule'));
  assert.ok(rule.doesNotDetermine.includes('six_day_workweek_daily_rule'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('five_day_workweek_daily_rule'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('six_day_workweek_daily_rule'));
  assert.equal(serialized.includes('9-hour'), false);
  assert.equal(serialized.includes('8-hour'), false);
});

test('holiday eve night work rest day and holiday rules remain separate', () => {
  const separate = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule.separateKnowledgeRequiredFor;

  assert.ok(separate.includes('holiday_eve_work'));
  assert.ok(separate.includes('night_work_rules'));
  assert.ok(separate.includes('weekly_rest_work'));
  assert.ok(separate.includes('saturday_or_shabbat_work'));
  assert.ok(separate.includes('holiday_work'));
});

test('monthly shortcut and 182-hour shortcut are not added', () => {
  const rule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;
  const serialized = JSON.stringify(getRecord(WEEKLY_OVERTIME_RECORD_ID)).toLowerCase();

  assert.equal(rule.doesNotTreatMonthlyHoursAsWeeklyHours, true);
  assert.equal(rule.doesNotInferOvertimeFromMonthlyHours, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('monthlyHours'));
  assert.equal(serialized.includes('182'), false);
  assert.equal(serialized.includes('183'), false);
});

test('weekly overtime classification rule can be selected by existing knowledge layer', () => {
  const record = getRecord(WEEKLY_OVERTIME_RECORD_ID);
  const selected = knowledgeBaseService.findWeeklyOvertimeClassificationRule([record]);

  assert.equal(selected.id, WEEKLY_OVERTIME_RECORD_ID);
  assert.equal(knowledgeBaseService.findWeeklyOvertimeClassificationRule([{ ...record, source: { ...record.source, verified: false } }]), null);
  assert.equal(knowledgeBaseService.findWeeklyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, regularWeeklyHours: 40 } }]), null);
  assert.equal(knowledgeBaseService.findWeeklyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, doesNotCalculateOvertimePay: false } }]), null);
  assert.equal(knowledgeBaseService.findWeeklyOvertimeClassificationRule([{ ...record, rule: { ...record.rule, belowRegularWeeklyHoursDoesNotProveNoOvertime: false } }]), null);
});

test('overtime multiplier knowledge remains unchanged', () => {
  const record = getRecord(OVERTIME_MULTIPLIER_RECORD_ID);

  assert.equal(record.topic, 'overtime_pay_multipliers');
  assert.equal(record.rule.multipliers.firstOvertimeHourMultiplier, 1.25);
  assert.equal(record.rule.multipliers.secondOvertimeHourMultiplier, 1.25);
  assert.equal(record.rule.multipliers.thirdAndLaterOvertimeHourMultiplier, 1.5);
  assert.equal(record.rule.appliesOnlyAfterOvertimeStatusEstablished, true);
});

test('basic hourly salary knowledge remains unchanged', () => {
  const record = getRecord(BASIC_HOURLY_RECORD_ID);

  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
  assert.equal(record.rule.doesNotTreatTotalHoursAsRegularHours, true);
});

test('salary calculation handler remains unchanged and does not use weekly overtime rule', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.doesNotMatch(result.output.message, /weekly overtime|42/i);
});

test('weekly overtime message is still not connected to salary calculation handler', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 45 hours this week.'
  ));

  assert.notEqual(result.output.knowledgeId, WEEKLY_OVERTIME_RECORD_ID);
  assert.equal(result.output.calculation, undefined);
  assert.doesNotMatch(result.output.message || '', /120 ILS|125%|150%|weekly overtime pay is/i);
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
