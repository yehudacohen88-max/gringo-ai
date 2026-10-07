const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

const INTERACTION_RECORD_ID = 'israel_weekly_rest_overtime_interaction_foundation';
const WEEKLY_REST_RECORD_ID = 'israel_weekly_rest_work_foundation_section_7_base_150';
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

function createSalaryTask(question) {
  return {
    taskId: 'task_weekly_rest_overtime_interaction',
    conversationId: 'web:user',
    requestId: 'req_weekly_rest_overtime_interaction',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-09T08:00:00.000Z',
  };
}

test('weekly-rest overtime interaction knowledge exists', () => {
  assert.ok(getRecord(INTERACTION_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === INTERACTION_RECORD_ID));
});

test('official Israeli government source metadata exists', () => {
  const source = getRecord(INTERACTION_RECORD_ID).source;

  assert.equal(source.title, 'Ministry of Economy - Employment Service');
  assert.equal(source.authority, 'Ministry of Economy / Employment Service');
  assert.equal(source.hostPortal, 'State of Israel Ministry of Defense guidance portal');
  assert.equal(source.jurisdiction, 'IL');
  assert.equal(source.verified, true);
  assert.match(source.url, /hachvana\.mod\.gov\.il\/Benefits\/migufey\/Pages\/shirot\.aspx/);
});

test('interaction requires verified weekly-rest work and independently verified overtime status', () => {
  const rule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.equal(rule.requiresIndependentWeeklyRestClassification, true);
  assert.equal(rule.requiresIndependentOvertimeClassification, true);
  assert.ok(rule.requiredFactsBeforeApplication.includes('workOccurredDuringWeeklyRest'));
  assert.ok(rule.requiredFactsBeforeApplication.includes('overtimeStatus'));
});

test('weekly-rest work alone does not imply overtime and overtime alone does not imply weekly-rest work', () => {
  const rule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.equal(rule.weeklyRestWorkAloneDoesNotImplyOvertime, true);
  assert.equal(rule.overtimeAloneDoesNotImplyWeeklyRestWork, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('weekly_rest_work_without_independent_overtime_status'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('overtime_without_independent_weekly_rest_work_status'));
});

test('additional overtime compensation principle is represented', () => {
  const rule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.equal(rule.weeklyRestOvertimeAdditionalCompensationRequired, true);
  assert.equal(rule.additionalOvertimeCompensationAppliesOnlyWhenBothClassificationsVerified, true);
});

test('exact combined multiplier remains unresolved', () => {
  const rule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.equal(rule.exactCombinedMultiplier, 'unresolved');
  assert.equal(rule.exactCombinedCompensationRuleRequired, true);
  assert.equal(rule.doesNotSetUniversalCombinedMultiplier, true);
});

test('universal 175 and 200 percent rules are not added', () => {
  const serialized = JSON.stringify(getRecord(INTERACTION_RECORD_ID));

  assert.equal(serialized.includes('175%'), false);
  assert.equal(serialized.includes('200%'), false);
  assert.equal(serialized.includes('1.75'), false);
  assert.equal(serialized.includes('2.0'), false);
});

test('multiplier addition and multiplication formulas are not added', () => {
  const rule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.equal(rule.doesNotAddMultipliers, true);
  assert.equal(rule.doesNotMultiplyMultipliers, true);
  assert.ok(rule.doesNotDetermine.includes('multiplier_addition_formula'));
  assert.ok(rule.doesNotDetermine.includes('multiplier_multiplication_formula'));
});

test('sector-specific government municipal and civil-service rules are not universalized', () => {
  const rule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.ok(rule.doesNotDetermine.includes('sector_specific_government_employee_rule'));
  assert.ok(rule.doesNotDetermine.includes('municipal_employee_rule'));
  assert.ok(rule.doesNotDetermine.includes('civil_service_rule'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('government_employee_specific_framework'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('municipal_employee_specific_framework'));
});

test('weekly-rest base multiplier remains 1.50', () => {
  const weeklyRestRule = getRecord(WEEKLY_REST_RECORD_ID).rule;
  const interactionRule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.equal(weeklyRestRule.weeklyRestBaseMultiplier, 1.5);
  assert.equal(interactionRule.weeklyRestBaseMultiplierReference, WEEKLY_REST_RECORD_ID);
});

test('ordinary overtime multipliers remain unchanged', () => {
  const multiplierRule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;
  const interactionRule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.equal(multiplierRule.multipliers.firstOvertimeHourMultiplier, 1.25);
  assert.equal(multiplierRule.multipliers.secondOvertimeHourMultiplier, 1.25);
  assert.equal(multiplierRule.multipliers.thirdAndLaterOvertimeHourMultiplier, 1.5);
  assert.equal(interactionRule.ordinaryOvertimeMultiplierReference, OVERTIME_MULTIPLIER_RECORD_ID);
});

test('5-day 6-day and weekly 42-hour overtime rules remain unchanged', () => {
  assert.equal(getRecord(FIVE_DAY_DAILY_RECORD_ID).rule.regularDailyHoursBoundary, 9);
  assert.equal(getRecord(SIX_DAY_DAILY_RECORD_ID).rule.regularDailyHoursBoundary, 8);
  assert.equal(getRecord(WEEKLY_OVERTIME_RECORD_ID).rule.regularWeeklyHours, 42);
});

test('weekly-rest classification guards are preserved', () => {
  const rule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.ok(rule.doesNotDetermine.includes('weekly_rest_day_from_saturday_alone'));
  assert.ok(rule.doesNotDetermine.includes('weekly_rest_day_from_nationality'));
  assert.ok(rule.doesNotDetermine.includes('weekly_rest_day_from_country_of_origin'));
  assert.ok(rule.doesNotDetermine.includes('weekly_rest_day_from_language'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('worked_saturday'));
});

test('holiday holiday-eve and night-work rules remain separate', () => {
  const separate = getRecord(INTERACTION_RECORD_ID).rule.separateKnowledgeRequiredFor;

  assert.ok(separate.includes('holiday_work'));
  assert.ok(separate.includes('holiday_eve_work'));
  assert.ok(separate.includes('night_work_rules'));
});

test('no double-counting engine or compensation aggregation is implemented', () => {
  const rule = getRecord(INTERACTION_RECORD_ID).rule;

  assert.equal(rule.doesNotImplementCompensationAggregation, true);
  assert.equal(rule.doesNotImplementDoubleCountingEngine, true);
  assert.ok(rule.separateKnowledgeRequiredFor.includes('compensation_aggregation'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('double_count_prevention'));
});

test('weekly-rest overtime interaction can be selected by existing knowledge layer', () => {
  const record = getRecord(INTERACTION_RECORD_ID);
  const selected = knowledgeBaseService.findWeeklyRestOvertimeInteractionRule([record]);

  assert.equal(selected.id, INTERACTION_RECORD_ID);
  assert.equal(knowledgeBaseService.findWeeklyRestOvertimeInteractionRule([{ ...record, source: { ...record.source, verified: false } }]), null);
  assert.equal(knowledgeBaseService.findWeeklyRestOvertimeInteractionRule([{ ...record, rule: { ...record.rule, exactCombinedMultiplier: 1.75 } }]), null);
  assert.equal(knowledgeBaseService.findWeeklyRestOvertimeInteractionRule([{ ...record, rule: { ...record.rule, weeklyRestWorkAloneDoesNotImplyOvertime: false } }]), null);
});

test('basic hourly salary knowledge remains unchanged', () => {
  const record = getRecord(BASIC_HOURLY_RECORD_ID);

  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
  assert.equal(record.rule.doesNotTreatTotalHoursAsRegularHours, true);
});

test('salary calculation handler remains unchanged and does not use weekly-rest overtime interaction', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.doesNotMatch(result.output.message, /weekly rest|additional overtime|175|200/i);
});

test('weekly-rest overtime interaction message is still not connected to salary calculation handler', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I worked overtime during my weekly rest.'
  ));

  assert.notEqual(result.output.knowledgeId, INTERACTION_RECORD_ID);
  assert.equal(result.output.calculation, undefined);
  assert.doesNotMatch(result.output.message || '', /additional overtime compensation applies|175%|200%/i);
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
