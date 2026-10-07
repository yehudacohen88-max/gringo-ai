const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const { employmentSalaryAgent, classifyEmploymentIntent } = require('../src/modules/agents/domains/employment-salary.agent');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');

const RECORD_ID = 'israel_salary_payment_timing_monthly';

function getRecord() {
  return workersRightsKnowledge.find((item) => item.id === RECORD_ID);
}

function createSalaryTask(question) {
  return {
    taskId: 'task_salary_payment_timing_knowledge',
    conversationId: 'web:user',
    requestId: 'req_salary_payment_timing_knowledge',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question, paymentFrequency: 'monthly' },
    metadata: {},
    createdAt: '2026-09-01T08:00:00.000Z',
  };
}

test('verified salary-payment knowledge record exists', () => {
  assert.ok(getRecord());
});

test('salary-payment knowledge record represents Israel jurisdiction and employment topic', () => {
  const record = getRecord();

  assert.equal(record.jurisdiction, 'IL');
  assert.equal(record.domain, 'employment');
  assert.equal(record.topic, 'salary_payment_timing');
  assert.equal(record.category, 'Workers Rights');
});

test('salary-payment knowledge record scope is monthly workers only', () => {
  const record = getRecord();

  assert.equal(record.workerType, 'monthly');
  assert.deepEqual(record.rule.appliesTo, ['monthly']);
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('hourly'));
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('daily'));
  assert.ok(record.rule.doesNotAutomaticallyApplyTo.includes('weekly'));
});

test('salary due and delayed-salary timing are represented separately', () => {
  const record = getRecord();

  assert.match(record.rule.salaryDue, /due at the end of that month/i);
  assert.match(record.rule.delayedAfter, /ninth day after the payment date/i);
  assert.notEqual(record.rule.salaryDue, record.rule.delayedAfter);
});

test('official source metadata exists and is verified', () => {
  const record = getRecord();

  assert.equal(record.source.title, 'Wage Protection Law, 5718-1958');
  assert.equal(record.source.authority, 'State of Israel');
  assert.equal(record.source.verified, true);
});

test('verified salary-payment selector accepts only the supported record shape', () => {
  const accepted = knowledgeBaseService.findVerifiedSalaryPaymentTimingRule([getRecord()]);

  assert.equal(accepted.id, RECORD_ID);
  assert.equal(knowledgeBaseService.findVerifiedSalaryPaymentTimingRule([{ ...getRecord(), source: { verified: false } }]), null);
  assert.equal(knowledgeBaseService.findVerifiedSalaryPaymentTimingRule([{ ...getRecord(), jurisdiction: 'US' }]), null);
  assert.equal(knowledgeBaseService.findVerifiedSalaryPaymentTimingRule([{ ...getRecord(), workerType: 'hourly' }]), null);
  assert.equal(knowledgeBaseService.findVerifiedSalaryPaymentTimingRule([{ ...getRecord(), rule: null }]), null);
});

test('salary-payment record avoids always until the ninth simplification', () => {
  const record = getRecord();
  const serialized = JSON.stringify(record).toLowerCase();

  assert.equal(serialized.includes('always have until the 9th'), false);
  assert.equal(serialized.includes('always have until the ninth'), false);
});

test('salary payment timing handler uses verified monthly knowledge record', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask('When should I receive my salary?'));

  assert.equal(result.status, 'success');
  assert.match(result.output.message, /due at the end of that month/i);
  assert.match(result.output.message, /ninth day after the payment date/i);
  assert.match(result.output.message, /Wage Protection Law, 5718-1958/i);
  assert.equal(result.output.needsVerifiedRule, false);
});

test('salary payment timing handler protects unknown payment frequency', async () => {
  const result = await employmentSalaryAgent.execute({
    ...createSalaryTask('When should I receive my salary?'),
    input: { question: 'When should I receive my salary?' },
  });

  assert.equal(result.status, 'blocked');
  assert.match(result.followUpQuestions[0], /paid monthly, hourly, daily, or another way/i);
});

test('existing Employment classification remains unchanged', () => {
  assert.equal(classifyEmploymentIntent('When should I receive my salary?').intent, 'salary_payment_timing');
  assert.equal(classifyEmploymentIntent('My employer has not paid me.').intent, 'missing_salary');
  assert.equal(classifyEmploymentIntent('Find me a construction job.').intent, 'job_search');
});
