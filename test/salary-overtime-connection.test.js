const test = require('node:test');
const assert = require('node:assert/strict');

const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');
const { financeConsumerAgent } = require('../src/modules/agents/domains/finance-consumer.agent');
const { healthLifeCommunityAgent } = require('../src/modules/agents/domains/health-life-community.agent');
const { supervisorService } = require('../src/modules/agents');

function createTask(input = {}) {
  return {
    taskId: 'task_salary_overtime_connection',
    conversationId: 'web:user',
    requestId: 'req_salary_overtime_connection',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input,
    metadata: {},
    createdAt: '2026-09-13T08:00:00.000Z',
  };
}

async function executeSalary(question, input = {}) {
  return employmentSalaryAgent.execute(createTask({ question, ...input }));
}

function assertStatutoryPayWithheld(result) {
  assert.equal(result.status, 'success');
  assert.equal(result.output.needsVerifiedRule, true);
  assert.equal(result.output.calculation, undefined);
  assert.match(result.output.message, /does not yet have verified salary-calculation rules/i);
  assert.doesNotMatch(result.output.message, /125%|150%|42 hours|410 ILS|370 ILS|330 ILS|460 ILS|520 ILS/i);
}

test('statutory overtime pay is withheld until the multiplier records pass review', async () => {
  for (const [question, input] of [
    ['I earn 40 ILS per hour. I work 5 days a week. I worked 10 hours today.', {}],
    ['I earn 40 ILS per hour. I work 5 days a week. I worked 11 hours today.', {}],
    ['I earn 40 ILS per hour. I work 5 days a week. I worked 12 hours today.', {}],
    ['I earn 40 ILS per hour. I work 6 days a week. I worked 9 hours today.', {}],
    ['I earn 40 ILS per hour. I worked 8 hours today.', { isNightWork: true }],
    ['I earn 40 ILS per hour. I work 6 days a week. I worked 8 hours today.', { shortenedWorkdayRuleApplicable: true }],
  ]) {
    assertStatutoryPayWithheld(await executeSalary(question, input));
  }
});

test('missing hourly rate asks only for hourly rate', async () => {
  const result = await executeSalary('I work 5 days a week. I worked 10 hours today. How much should I receive?');

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['salary_rate']);
  assert.match(result.followUpQuestions[0], /pay rate/i);
});

test('missing workweekDays asks only for applicable 5-day or 6-day structure', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I worked 10 hours today.');

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['workweek_days']);
  assert.match(result.followUpQuestions[0], /5 days or 6 days/i);
});

test('missing daily hours asks for daily hours', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I work 5 days a week.');

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['daily_hours_worked']);
  assert.match(result.followUpQuestions[0], /how many hours/i);
});

test('workweekDays is not inferred from time-entry count', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I worked 10 hours today.', {
    timeEntries: [{}, {}, {}, {}, {}],
  });

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['workweek_days']);
});

test('daily and weekly overlap does not state a combined statutory amount', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I work 5 days a week. I worked 10 hours today and 45 hours this week.');

  assertStatutoryPayWithheld(result);
  assert.doesNotMatch(result.output.message, /cannot safely add daily and weekly overtime together/i);
});

test('weekly overtime above 42 hours is not stated while the classification record is unreviewed', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I worked 10 hours today and 45 hours this week.');

  assertStatutoryPayWithheld(result);
  assert.doesNotMatch(result.output.message, /42 hours/i);
});

test('weekly-rest and overtime unsafe arithmetic avoids universal 175 or 200 percent', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I worked 10 hours today and 45 hours this week.', {
    isNightWork: true,
    workOccurredDuringWeeklyRest: true,
  });

  assert.equal(result.status, 'partial');
  assert.doesNotMatch(result.output.message, /175|200/i);
});

test('holiday work remains safely unresolved and unknown special context blocks calculation', async () => {
  const holiday = await executeSalary('I earn 40 ILS per hour. I worked 10 hours today on a holiday.');
  const unknown = await executeSalary('I earn 40 ILS per hour. I worked 10 hours today in a special context.');

  assert.equal(holiday.status, 'partial');
  assert.equal(unknown.status, 'partial');
  assert.match(holiday.output.message, /special workday context/i);
  assert.match(unknown.output.message, /special workday context/i);
});

test('withheld overtime pay does not become a payslip', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I work 5 days a week. I worked 10 hours today.');

  assertStatutoryPayWithheld(result);
  assert.doesNotMatch(result.output.message, /net salary is|tax is|pension is|accommodation deduction is/i);
});

test('monthly shortcut is avoided and existing basic gross calculation still works', async () => {
  const shortcut = await executeSalary('I earn 40 ILS per hour and worked 182 hours this month. How much should I receive?');
  const basic = await executeSalary('I earn 40 ILS per hour and worked 100 regular hours.');

  assert.equal(shortcut.status, 'blocked');
  assert.equal(shortcut.output.knownFacts.regularHours, null);
  assert.equal(basic.status, 'success');
  assert.equal(basic.output.calculation.basicGrossPay, 4000);
});

test('salary payment timing and missing salary remain unchanged', async () => {
  const timing = await employmentSalaryAgent.execute(createTask({
    question: 'When should I receive my salary?',
    paymentFrequency: 'monthly',
  }));
  const missing = await employmentSalaryAgent.execute(createTask({
    question: "I didn't receive my August salary. I am paid monthly.",
    currentDate: '2026-09-13',
  }));

  assert.equal(timing.output.employmentIntent, 'salary_payment_timing');
  assert.equal(missing.output.employmentIntent, 'missing_salary');
});

test('Supervisor multi-intent Finance Health profile and sourceMessage behavior remain isolated', async () => {
  const context = {
    requestId: 'req_salary_overtime_supervisor_guard',
    conversationId: 'conv_salary_overtime_supervisor_guard',
    message: 'How much salary should I receive and how can I send money to Thailand?',
    metadata: {},
  };
  const intents = supervisorService.detectIntents(context);
  const financeTask = {
    taskId: 'task_finance_guard',
    conversationId: 'web:user',
    requestId: 'req_finance_guard',
    domain: 'finance_consumer',
    capability: 'finance.transfer',
    priority: 'normal',
    input: { amount: 2000, sourceCurrency: 'ILS', targetCurrency: 'THB' },
    metadata: {},
    createdAt: '2026-09-13T08:00:00.000Z',
  };
  const healthTask = {
    ...financeTask,
    taskId: 'task_health_guard',
    domain: 'health_life_community',
    capability: 'health.support',
    input: { question: 'I need a doctor in Tel Aviv.' },
  };
  const finance = await financeConsumerAgent.execute(financeTask);
  const health = await healthLifeCommunityAgent.execute(healthTask);
  const sourceMessage = await employmentSalaryAgent.execute(createTask({
    question: 'how much should i receive',
    sourceMessage: 'I earn 40 ILS per hour. I work 5 days a week. I worked 10 hours today. How much should I receive, and how can I send 2,000 ILS to Thailand?',
  }));

  assert.equal(intents.isMultiIntent, true);
  assert.equal(finance.status, 'partial');
  assert.match(finance.output.message, /not currently have enough real reported observations/i);
  assert.equal(health.status, 'success');
  assertStatutoryPayWithheld(sourceMessage);
});
