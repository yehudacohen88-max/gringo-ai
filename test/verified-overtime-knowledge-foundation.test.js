const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

const OVERTIME_RECORD_ID = 'overtime_calculation_foundation';
const BASIC_HOURLY_RECORD_ID = 'basic_hourly_salary_calculation_gross_pay';
const SALARY_TIMING_RECORD_ID = 'israel_salary_payment_timing_monthly';
const MISSING_SALARY_RECORD_ID = 'israel_missing_salary_monthly_foundation';

function getRecord(id) {
  return workersRightsKnowledge.find((item) => item.id === id);
}

function createSalaryTask(question) {
  return {
    taskId: 'task_overtime_foundation',
    conversationId: 'web:user',
    requestId: 'req_overtime_foundation',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-07T08:00:00.000Z',
  };
}

test('overtime knowledge foundation record exists', () => {
  assert.ok(getRecord(OVERTIME_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === OVERTIME_RECORD_ID));
});

test('overtime foundation uses existing employment knowledge shape', () => {
  const record = getRecord(OVERTIME_RECORD_ID);

  assert.equal(record.category, 'Workers Rights');
  assert.equal(record.domain, 'employment');
  assert.equal(record.topic, 'overtime');
  assert.equal(record.workerType, 'hourly');
  assert.equal(record.rule.foundationType, 'overtime_calculation_prerequisites');
});

test('regularHours and overtimeHours are distinct concepts', () => {
  const concepts = getRecord(OVERTIME_RECORD_ID).rule.concepts;

  assert.ok(concepts.includes('regularHours'));
  assert.ok(concepts.includes('overtimeHours'));
  assert.notEqual(concepts.indexOf('regularHours'), concepts.indexOf('overtimeHours'));
});

test('total hours are not automatically regular hours or overtime hours', () => {
  const rule = getRecord(OVERTIME_RECORD_ID).rule;

  assert.equal(rule.doesNotTreatTotalHoursAsRegularHours, true);
  assert.equal(rule.doesNotTreatTotalHoursAsOvertimeHours, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('total_hours_without_regular_and_overtime_breakdown'));
});

test('monthly hours alone cannot determine overtime', () => {
  const rule = getRecord(OVERTIME_RECORD_ID).rule;

  assert.equal(rule.doesNotTreatMonthlyHoursAsOvertimeHours, true);
  assert.equal(rule.doesNotInferOvertimeFromMonthlyHours, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('monthly_hours_without_daily_or_weekly_context'));
  assert.ok(rule.doesNotDetermine.includes('monthly_overtime_threshold'));
});

test('daily and weekly context is represented as potentially relevant', () => {
  const rule = getRecord(OVERTIME_RECORD_ID).rule;

  assert.ok(rule.concepts.includes('dailyHours'));
  assert.ok(rule.concepts.includes('weeklyHours'));
  assert.ok(rule.contextThatMayBeRelevant.includes('dailyHours'));
  assert.ok(rule.contextThatMayBeRelevant.includes('weeklyHours'));
  assert.ok(rule.requiredVerifiedLegalFactsBeforeCalculation.includes('daily_threshold_if_applicable'));
  assert.ok(rule.requiredVerifiedLegalFactsBeforeCalculation.includes('weekly_threshold_if_applicable'));
});

test('overtime calculation structure requires a verified multiplier', () => {
  const structure = getRecord(OVERTIME_RECORD_ID).rule.calculationStructure;

  assert.equal(structure.result, 'overtimePay');
  assert.equal(structure.requiresVerifiedMultiplier, true);
  assert.deepEqual(structure.operands, ['hourlyRate', 'overtimeHours', 'verifiedOvertimeMultiplier']);
});

test('unsupported 125 and 150 percent multipliers are not added', () => {
  const serialized = JSON.stringify(getRecord(OVERTIME_RECORD_ID)).toLowerCase();

  assert.equal(serialized.includes('125%'), false);
  assert.equal(serialized.includes('1.25'), false);
  assert.equal(serialized.includes('150%'), false);
  assert.equal(serialized.includes('1.5'), false);
});

test('unsupported legal thresholds and monthly overtime threshold are not added', () => {
  const rule = getRecord(OVERTIME_RECORD_ID).rule;
  const serialized = JSON.stringify(getRecord(OVERTIME_RECORD_ID)).toLowerCase();

  assert.ok(rule.doesNotDetermine.includes('daily_overtime_threshold'));
  assert.ok(rule.doesNotDetermine.includes('weekly_overtime_threshold'));
  assert.ok(rule.doesNotDetermine.includes('monthly_overtime_threshold'));
  assert.equal(/after\s+\d+\s+hours/.test(serialized), false);
});

test('rest day holiday Saturday Shabbat and night work remain separate', () => {
  const separate = getRecord(OVERTIME_RECORD_ID).rule.separateKnowledgeRequiredFor;

  assert.ok(separate.includes('rest_day_work'));
  assert.ok(separate.includes('holiday_work'));
  assert.ok(separate.includes('saturday_or_shabbat_work'));
  assert.ok(separate.includes('night_work_rules'));
});

test('unsupported legal citation is not invented for overtime', () => {
  const record = getRecord(OVERTIME_RECORD_ID);
  const serialized = JSON.stringify(record).toLowerCase();

  assert.equal(record.source, undefined);
  assert.equal(serialized.includes('wage protection law'), false);
  assert.equal(serialized.includes('hours of work and rest law'), false);
  assert.equal(serialized.includes('state of israel'), false);
});

test('verified legal facts are explicitly empty until a verified source exists', () => {
  const rule = getRecord(OVERTIME_RECORD_ID).rule;

  assert.deepEqual(rule.verifiedLegalFactsAvailable, []);
  assert.ok(rule.verifiedLegalFactsMissing.includes('overtime_thresholds'));
  assert.ok(rule.verifiedLegalFactsMissing.includes('overtime_multipliers'));
  assert.ok(rule.verifiedLegalFactsMissing.includes('official_legal_source'));
});

test('overtime foundation can be selected by the existing knowledge layer', () => {
  const selected = knowledgeBaseService.findOvertimeCalculationFoundation([getRecord(OVERTIME_RECORD_ID)]);

  assert.equal(selected.id, OVERTIME_RECORD_ID);
  assert.equal(knowledgeBaseService.findOvertimeCalculationFoundation([{ ...getRecord(OVERTIME_RECORD_ID), topic: 'working_hours' }]), null);
  assert.equal(knowledgeBaseService.findOvertimeCalculationFoundation([{ ...getRecord(OVERTIME_RECORD_ID), rule: null }]), null);
  assert.equal(knowledgeBaseService.findOvertimeCalculationFoundation([{
    ...getRecord(OVERTIME_RECORD_ID),
    rule: { ...getRecord(OVERTIME_RECORD_ID).rule, requiresLegalRuleForMultiplier: false },
  }]), null);
});

test('basic hourly calculation knowledge remains unchanged', () => {
  const record = getRecord(BASIC_HOURLY_RECORD_ID);

  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
  assert.equal(record.rule.doesNotTreatTotalHoursAsRegularHours, true);
  assert.ok(record.rule.doesNotDetermine.includes('overtime'));
  assert.ok(record.rule.doesNotDetermine.includes('legal_multipliers'));
});

test('basic hourly calculation handler remains unchanged', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.match(result.output.message, /basic gross pay for those regular hours is 4,000 ILS/i);
});

test('overtime question is not connected to the basic salary calculation handler yet', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 10 overtime hours.'
  ));

  assert.notEqual(result.output.knowledgeId, OVERTIME_RECORD_ID);
  assert.equal(result.output.calculation, undefined);
  assert.doesNotMatch(result.output.message || '', /400 ILS|500 ILS|600 ILS|overtime pay is/i);
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
