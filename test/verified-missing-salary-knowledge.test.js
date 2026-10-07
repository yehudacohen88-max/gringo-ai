const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

const MISSING_SALARY_RECORD_ID = 'israel_missing_salary_monthly_foundation';
const SALARY_TIMING_RECORD_ID = 'israel_salary_payment_timing_monthly';

function getMissingSalaryRecord() {
  return workersRightsKnowledge.find((item) => item.id === MISSING_SALARY_RECORD_ID);
}

function getSalaryTimingRecord() {
  return workersRightsKnowledge.find((item) => item.id === SALARY_TIMING_RECORD_ID);
}

test('existing knowledge architecture loads the verified missing-salary record', () => {
  const loaded = knowledgeBaseService.loadKnowledgeItems();
  assert.ok(loaded.find((item) => item.id === MISSING_SALARY_RECORD_ID));
});

test('verified missing_salary knowledge record exists with Israel monthly employment scope', () => {
  const record = getMissingSalaryRecord();

  assert.ok(record);
  assert.equal(record.jurisdiction, 'IL');
  assert.equal(record.domain, 'employment');
  assert.equal(record.topic, 'missing_salary');
  assert.equal(record.workerType, 'monthly');
  assert.equal(record.category, 'Workers Rights');
});

test('missing_salary source metadata is official and verified', () => {
  const record = getMissingSalaryRecord();

  assert.equal(record.source.title, 'Wage Protection Law, 5718-1958');
  assert.equal(record.source.authority, 'State of Israel');
  assert.equal(record.source.verified, true);
  assert.equal(record.lastUpdated, '2026-09-01');
});

test('salary due and missing or delayed salary concepts are not collapsed', () => {
  const record = getMissingSalaryRecord();

  assert.equal(record.rule.salaryDueReference, SALARY_TIMING_RECORD_ID);
  assert.equal(record.rule.delayedSalaryStatusReference, SALARY_TIMING_RECORD_ID);
  assert.match(record.rule.practicalMissingSalarySituation, /not received/i);
  assert.notEqual(record.rule.salaryDueReference, record.rule.practicalMissingSalarySituation);
});

test('required facts before application are represented', () => {
  const record = getMissingSalaryRecord();

  assert.deepEqual(record.rule.requiredFactsBeforeApplication, [
    'payment_frequency',
    'salary_payment_period',
    'payment_received_status',
    'timing_date_context',
  ]);
});

test('verified missing_salary selector rejects unverified wrong jurisdiction and wrong worker type records', () => {
  const record = getMissingSalaryRecord();
  const timing = getSalaryTimingRecord();

  assert.equal(knowledgeBaseService.findVerifiedMissingSalaryRule([record, timing]).id, MISSING_SALARY_RECORD_ID);
  assert.equal(knowledgeBaseService.findVerifiedMissingSalaryRule([{ ...record, source: { verified: false } }, timing]), null);
  assert.equal(knowledgeBaseService.findVerifiedMissingSalaryRule([{ ...record, jurisdiction: 'US' }, timing]), null);
  assert.equal(knowledgeBaseService.findVerifiedMissingSalaryRule([{ ...record, workerType: 'hourly' }, timing]), null);
  assert.equal(knowledgeBaseService.findVerifiedMissingSalaryRule([{ ...record, rule: null }, timing]), null);
  assert.equal(knowledgeBaseService.findVerifiedMissingSalaryRule([record]), null);
});

test('missing_salary knowledge does not invent compensation or automatic violation conclusions', () => {
  const record = getMissingSalaryRecord();
  const serialized = JSON.stringify(record).toLowerCase();

  assert.ok(record.rule.doesNotDetermine.includes('employer_violation'));
  assert.ok(record.rule.doesNotDetermine.includes('compensation_amount'));
  assert.ok(record.rule.doesNotDetermine.includes('wage_delay_compensation_formula'));
  assert.equal(serialized.includes('calculate compensation'), false);
  assert.equal(serialized.includes('compensation is'), false);
  assert.equal(serialized.includes('employer violated'), false);
  assert.equal(serialized.includes('employer is violating'), false);
});

test('existing salary_payment_timing knowledge remains unchanged', () => {
  const record = getSalaryTimingRecord();

  assert.equal(record.jurisdiction, 'IL');
  assert.equal(record.domain, 'employment');
  assert.equal(record.topic, 'salary_payment_timing');
  assert.equal(record.workerType, 'monthly');
  assert.equal(record.rule.salaryDue, 'Salary for a month is due at the end of that month for a monthly-paid employee.');
  assert.equal(record.rule.delayedAfter, 'Unpaid monthly salary becomes delayed salary if it has not been paid by the ninth day after the payment date.');
  assert.equal(record.source.title, 'Wage Protection Law, 5718-1958');
  assert.equal(record.source.verified, true);
});

test('existing missing_salary handler uses verified knowledge when required facts are complete', async () => {
  const result = await employmentSalaryAgent.execute({
    taskId: 'task_missing_salary_knowledge_guard',
    requestId: 'req_missing_salary_knowledge_guard',
    conversationId: 'web:user',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: {
      question: "I didn't receive my August salary. I am paid monthly.",
      currentDate: '2026-09-10',
    },
    metadata: {},
    createdAt: '2026-09-01T08:00:00.000Z',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.output.employmentIntent, 'missing_salary');
  assert.equal(result.output.knowledgeId, MISSING_SALARY_RECORD_ID);
  assert.equal(result.output.needsVerifiedRule, false);
  assert.match(result.output.message, /Salary for a month is due at the end of that month/i);
  assert.match(result.output.message, /Delayed-salary timing/i);
  assert.match(result.output.message, /reached the verified delayed-salary timing/i);
  assert.match(result.output.message, /Source: Wage Protection Law, 5718-1958/i);
  assert.doesNotMatch(result.output.message, /compensation/i);
  assert.doesNotMatch(result.output.message, /broke the law|violated/i);
});
