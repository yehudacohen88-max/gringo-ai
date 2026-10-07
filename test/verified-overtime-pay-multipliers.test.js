const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

const OVERTIME_MULTIPLIER_RECORD_ID = 'israel_overtime_pay_multipliers_section_16a';
const OVERTIME_FOUNDATION_RECORD_ID = 'overtime_calculation_foundation';
const BASIC_HOURLY_RECORD_ID = 'basic_hourly_salary_calculation_gross_pay';
const SALARY_TIMING_RECORD_ID = 'israel_salary_payment_timing_monthly';
const MISSING_SALARY_RECORD_ID = 'israel_missing_salary_monthly_foundation';

function getRecord(id) {
  return workersRightsKnowledge.find((item) => item.id === id);
}

function createSalaryTask(question) {
  return {
    taskId: 'task_overtime_multiplier',
    conversationId: 'web:user',
    requestId: 'req_overtime_multiplier',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-08T08:00:00.000Z',
  };
}

test('verified overtime multiplier knowledge record exists', () => {
  assert.ok(getRecord(OVERTIME_MULTIPLIER_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === OVERTIME_MULTIPLIER_RECORD_ID));
});

test('official Israeli legal source metadata exists', () => {
  const source = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).source;

  assert.equal(source.title, 'Hours of Work and Rest Law, 5711-1951');
  assert.equal(source.hebrewTitle, 'חוק שעות עבודה ומנוחה, התשי"א-1951');
  assert.equal(source.authority, 'State of Israel');
  assert.equal(source.legislationDatabase, 'Israel National Legislation Database / Knesset');
  assert.equal(source.verified, true);
  assert.match(source.url, /main\.knesset\.gov\.il\/apps\/legislation\/main\/laws\/2000019/);
});

test('Section 16(a) is represented', () => {
  const record = getRecord(OVERTIME_MULTIPLIER_RECORD_ID);

  assert.equal(record.source.provision, 'Section 16(a)');
  assert.equal(record.rule.legalProvision, 'Section 16(a)');
});

test('first and second overtime hour multipliers are 1.25', () => {
  const multipliers = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule.multipliers;

  assert.equal(multipliers.firstOvertimeHourMultiplier, 1.25);
  assert.equal(multipliers.secondOvertimeHourMultiplier, 1.25);
});

test('third and later overtime hour multiplier is 1.50', () => {
  const multipliers = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule.multipliers;

  assert.equal(multipliers.thirdAndLaterOvertimeHourMultiplier, 1.5);
});

test('sequence rules preserve first two and third-later split', () => {
  const sequenceRules = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule.sequenceRules;

  assert.deepEqual(sequenceRules, [
    { sequenceWithinWorkday: 1, multiplier: 1.25 },
    { sequenceWithinWorkday: 2, multiplier: 1.25 },
    { sequenceWithinWorkday: 'third_and_later', multiplier: 1.5 },
  ]);
});

test('multipliers apply only to already verified overtime hours', () => {
  const rule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;

  assert.equal(rule.compensationOnly, true);
  assert.equal(rule.appliesOnlyAfterOvertimeStatusEstablished, true);
  assert.deepEqual(rule.requiredFactsBeforeApplication, [
    'regularHourlyWage',
    'verifiedOvertimeHours',
    'overtimeSequenceWithinWorkday',
  ]);
});

test('record does not determine overtime status', () => {
  const rule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;

  assert.ok(rule.doesNotDetermine.includes('overtime_status'));
  assert.ok(rule.doesNotDetermine.includes('when_hours_become_overtime'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('overtime_classification'));
});

test('daily weekly and monthly overtime thresholds are not invented', () => {
  const rule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;
  const serialized = JSON.stringify(getRecord(OVERTIME_MULTIPLIER_RECORD_ID)).toLowerCase();

  assert.ok(rule.doesNotDetermine.includes('daily_overtime_threshold'));
  assert.ok(rule.doesNotDetermine.includes('weekly_overtime_threshold'));
  assert.ok(rule.doesNotDetermine.includes('monthly_overtime_threshold'));
  assert.equal(/after\s+\d+\s+hours/.test(serialized), false);
});

test('totalHours and monthlyHours alone cannot trigger overtime calculation', () => {
  const rule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;

  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('hoursWorked'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('totalHours'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('monthlyHours'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('unverified_overtime_hours'));
});

test('rest day Saturday Shabbat holiday and night work remain separate', () => {
  const separate = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule.separateKnowledgeRequiredFor;

  assert.ok(separate.includes('rest_day_work'));
  assert.ok(separate.includes('saturday_or_shabbat_work'));
  assert.ok(separate.includes('holiday_work'));
  assert.ok(separate.includes('night_work_rules'));
});

test('no sector-specific or collective-agreement rule is invented', () => {
  const rule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;

  assert.ok(rule.doesNotDetermine.includes('sector_specific_rules'));
  assert.ok(rule.doesNotDetermine.includes('collective_agreement_rules'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('sector_specific_arrangements'));
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('collective_agreement_arrangements'));
});

test('verified overtime multiplier rule can be selected by the existing knowledge layer', () => {
  const record = getRecord(OVERTIME_MULTIPLIER_RECORD_ID);
  const selected = knowledgeBaseService.findVerifiedOvertimePayMultiplierRule([record]);

  assert.equal(selected.id, OVERTIME_MULTIPLIER_RECORD_ID);
  assert.equal(knowledgeBaseService.findVerifiedOvertimePayMultiplierRule([{ ...record, topic: 'overtime' }]), null);
  assert.equal(knowledgeBaseService.findVerifiedOvertimePayMultiplierRule([{ ...record, source: { ...record.source, verified: false } }]), null);
  assert.equal(knowledgeBaseService.findVerifiedOvertimePayMultiplierRule([{
    ...record,
    rule: { ...record.rule, appliesOnlyAfterOvertimeStatusEstablished: false },
  }]), null);
  assert.equal(knowledgeBaseService.findVerifiedOvertimePayMultiplierRule([{
    ...record,
    rule: { ...record.rule, doesNotDetermine: record.rule.doesNotDetermine.filter((item) => item !== 'overtime_status') },
  }]), null);
});

test('overtime foundation remains classification-prerequisite only', () => {
  const foundation = getRecord(OVERTIME_FOUNDATION_RECORD_ID);

  assert.equal(foundation.rule.foundationType, 'overtime_calculation_prerequisites');
  assert.equal(foundation.rule.requiresLegalRuleForMultiplier, true);
  assert.equal(foundation.rule.doesNotInferOvertimeFromMonthlyHours, true);
  assert.deepEqual(foundation.rule.verifiedLegalFactsAvailable, []);
});

test('basic hourly salary knowledge remains unchanged', () => {
  const record = getRecord(BASIC_HOURLY_RECORD_ID);

  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
  assert.equal(record.rule.doesNotTreatTotalHoursAsRegularHours, true);
  assert.ok(record.rule.doesNotDetermine.includes('legal_multipliers'));
});

test('basic hourly calculation handler remains unchanged and does not use overtime multipliers', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.doesNotMatch(result.output.message, /125%|150%|1\.25|1\.5/i);
});

test('overtime message is still not connected to salary calculation handler', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 3 verified overtime hours.'
  ));

  assert.notEqual(result.output.knowledgeId, OVERTIME_MULTIPLIER_RECORD_ID);
  assert.equal(result.output.calculation, undefined);
  assert.doesNotMatch(result.output.message || '', /140 ILS|160 ILS|overtime pay is/i);
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
