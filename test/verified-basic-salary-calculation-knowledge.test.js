const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

const BASIC_HOURLY_RECORD_ID = 'basic_hourly_salary_calculation_gross_pay';
const SALARY_TIMING_RECORD_ID = 'israel_salary_payment_timing_monthly';
const MISSING_SALARY_RECORD_ID = 'israel_missing_salary_monthly_foundation';

function getRecord() {
  return workersRightsKnowledge.find((item) => item.id === BASIC_HOURLY_RECORD_ID);
}

function getSalaryTimingRecord() {
  return workersRightsKnowledge.find((item) => item.id === SALARY_TIMING_RECORD_ID);
}

function getMissingSalaryRecord() {
  return workersRightsKnowledge.find((item) => item.id === MISSING_SALARY_RECORD_ID);
}

function createSalaryTask(question) {
  return {
    taskId: 'task_basic_salary_calculation_knowledge',
    conversationId: 'web:user',
    requestId: 'req_basic_salary_calculation_knowledge',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-07T08:00:00.000Z',
  };
}

test('basic hourly salary calculation knowledge record exists', () => {
  assert.ok(getRecord());
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === BASIC_HOURLY_RECORD_ID));
});

test('record represents hourly rate times regular hours as basic gross pay', () => {
  const record = getRecord();

  assert.equal(record.domain, 'employment');
  assert.equal(record.topic, 'basic_hourly_salary_calculation');
  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.formula, {
    result: 'basicGrossPay',
    operator: 'multiply',
    operands: ['hourlyRate', 'regularHours'],
  });
});

test('required facts include hourly rate and regular hours', () => {
  const record = getRecord();

  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
});

test('result is basic gross pay and not final salary', () => {
  const record = getRecord();

  assert.equal(record.rule.resultType, 'basic_gross_pay');
  assert.ok(record.rule.doesNotDetermine.includes('final_salary'));
  assert.ok(record.rule.doesNotDetermine.includes('final_payslip_amount'));
});

test('hourly-worker scope is represented', () => {
  const record = getRecord();

  assert.equal(record.workerType, 'hourly');
  assert.deepEqual(record.rule.appliesTo, ['hourly']);
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('monthly'));
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('daily'));
});

test('currency handling uses hourly-rate currency without inventing a fixed currency', () => {
  const record = getRecord();

  assert.equal(record.rule.currency, 'use_hourly_rate_currency');
  assert.notEqual(record.rule.currency, 'ILS');
  assert.notEqual(record.rule.currency, 'USD');
  assert.notEqual(record.rule.currency, 'THB');
});

test('overtime and unsupported legal multipliers are excluded', () => {
  const record = getRecord();

  assert.ok(record.rule.doesNotDetermine.includes('overtime'));
  assert.ok(record.rule.doesNotDetermine.includes('weekly_overtime'));
  assert.ok(record.rule.doesNotDetermine.includes('legal_multipliers'));
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('overtime_hours'));
  assert.equal(JSON.stringify(record).toLowerCase().includes('1.25'), false);
  assert.equal(JSON.stringify(record).toLowerCase().includes('150%'), false);
});

test('rest-day special-day and holiday work are excluded', () => {
  const record = getRecord();

  assert.ok(record.rule.doesNotDetermine.includes('rest_day_work'));
  assert.ok(record.rule.doesNotDetermine.includes('saturday_or_shabbat_work'));
  assert.ok(record.rule.doesNotDetermine.includes('holiday_work'));
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('rest_day_hours'));
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('holiday_hours'));
});

test('allowances deductions tax pension and foreign-worker-specific deductions are excluded', () => {
  const record = getRecord();

  assert.ok(record.rule.doesNotDetermine.includes('allowances'));
  assert.ok(record.rule.doesNotDetermine.includes('deductions'));
  assert.ok(record.rule.doesNotDetermine.includes('income_tax'));
  assert.ok(record.rule.doesNotDetermine.includes('pension'));
  assert.ok(record.rule.doesNotDetermine.includes('foreign_worker_specific_deductions'));
});

test('total hours are not automatically treated as regular hours', () => {
  const record = getRecord();

  assert.equal(record.rule.requiresRegularHoursKnown, true);
  assert.equal(record.rule.doesNotTreatTotalHoursAsRegularHours, true);
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('total_hours_without_regular_hours_breakdown'));
});

test('unsupported legal citation is not invented', () => {
  const record = getRecord();
  const serialized = JSON.stringify(record).toLowerCase();

  assert.equal(record.source, undefined);
  assert.equal(serialized.includes('wage protection law'), false);
  assert.equal(serialized.includes('state of israel'), false);
  assert.equal(serialized.includes('minimum wage law'), false);
});

test('basic hourly salary knowledge can be selected by the existing knowledge layer', () => {
  const selected = knowledgeBaseService.findBasicHourlySalaryCalculationRule([getRecord()]);

  assert.equal(selected.id, BASIC_HOURLY_RECORD_ID);
  assert.equal(knowledgeBaseService.findBasicHourlySalaryCalculationRule([{ ...getRecord(), workerType: 'monthly' }]), null);
  assert.equal(knowledgeBaseService.findBasicHourlySalaryCalculationRule([{ ...getRecord(), rule: null }]), null);
  assert.equal(knowledgeBaseService.findBasicHourlySalaryCalculationRule([{ ...getRecord(), rule: { ...getRecord().rule, doesNotTreatTotalHoursAsRegularHours: false } }]), null);
});

test('salary_amount_or_calculation handler consumes basic hourly knowledge when facts are safe', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours this month. How much should I receive?'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.employmentIntent, 'salary_amount_or_calculation');
  assert.equal(result.output.needsVerifiedRule, false);
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.match(result.output.message, /basic gross pay for those regular hours is 4,000 ILS/i);
  assert.doesNotMatch(result.output.message, /final salary is|net salary is/i);
});

test('salary_payment_timing knowledge remains unchanged', () => {
  const record = getSalaryTimingRecord();

  assert.equal(record.topic, 'salary_payment_timing');
  assert.equal(record.workerType, 'monthly');
  assert.equal(record.source.title, 'Wage Protection Law, 5718-1958');
  assert.equal(record.source.verified, true);
});

test('missing_salary knowledge remains unchanged', () => {
  const record = getMissingSalaryRecord();

  assert.equal(record.topic, 'missing_salary');
  assert.equal(record.workerType, 'monthly');
  assert.equal(record.rule.salaryDueReference, SALARY_TIMING_RECORD_ID);
  assert.equal(record.source.title, 'Wage Protection Law, 5718-1958');
  assert.equal(record.source.verified, true);
});
