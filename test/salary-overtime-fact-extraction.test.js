const test = require('node:test');
const assert = require('node:assert/strict');

const { SupervisorService } = require('../src/modules/agents');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');
const { financeConsumerAgent } = require('../src/modules/agents/domains/finance-consumer.agent');
const { healthLifeCommunityAgent } = require('../src/modules/agents/domains/health-life-community.agent');

function createTask(question, input = {}, metadata = {}) {
  return {
    taskId: 'task_salary_fact_extraction',
    conversationId: 'web:salary_fact_extraction',
    requestId: 'req_salary_fact_extraction',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: {
      question,
      ...input,
    },
    metadata,
    createdAt: '2026-09-13T08:00:00.000Z',
  };
}

async function executeSalary(question, input = {}, metadata = {}) {
  return employmentSalaryAgent.execute(createTask(question, input, metadata));
}

function facts(result) {
  return result.output.knownFacts;
}

function createRequestContext(message) {
  return {
    requestId: 'req_salary_fact_extraction_supervisor',
    conversationId: 'web:salary_fact_extraction_supervisor',
    userId: 'usr_salary_fact_extraction',
    message,
    profile: {
      userId: 'usr_salary_fact_extraction',
      fullName: 'David Levi',
    },
  };
}

test('40 ILS per hour extracts hourly rate and currency', async () => {
  const result = await executeSalary('I earn 40 ILS per hour and worked 10 hours today.');

  assert.equal(facts(result).salaryRate, 40);
  assert.equal(facts(result).salaryRateType, 'hourly');
  assert.equal(facts(result).currency, 'ILS');
});

test('40 shekels an hour extracts hourly rate and ILS currency', async () => {
  const result = await executeSalary('I get 40 shekels an hour and worked 10 hours today.');

  assert.equal(facts(result).salaryRate, 40);
  assert.equal(facts(result).salaryRateType, 'hourly');
  assert.equal(facts(result).currency, 'ILS');
});

test('40 hours does not become hourly rate', async () => {
  const result = await executeSalary('How much should I receive? I worked 40 hours.');

  assert.equal(facts(result).salaryRate, null);
  assert.equal(facts(result).hoursWorked, 40);
});

test('worked 10 hours today extracts daily hours', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I worked 10 hours today.');

  assert.equal(facts(result).dailyHoursWorked, 10);
});

test('worked 10 hours that day and shift was 10 hours extract daily hours', async () => {
  const thatDay = await executeSalary('I earn 40 ILS per hour. I worked 10 hours that day.');
  const shift = await executeSalary('I earn 40 ILS per hour. My shift was 10 hours.');

  assert.equal(facts(thatDay).dailyHoursWorked, 10);
  assert.equal(facts(shift).dailyHoursWorked, 10);
});

test('45 hours this week extracts weekly hours without daily conversion', async () => {
  const result = await executeSalary('I earn 40 ILS per hour and worked 45 hours this week.');

  assert.equal(facts(result).weeklyHoursWorked, 45);
  assert.equal(facts(result).dailyHoursWorked, null);
});

test('weekly total phrasing extracts weekly hours', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. My total this week was 45 hours.');

  assert.equal(facts(result).weeklyHoursWorked, 45);
  assert.equal(facts(result).dailyHoursWorked, null);
});

test('explicit 5-day and 6-day workweek structures extract workweekDays', async () => {
  const five = await executeSalary('I earn 40 ILS per hour. I normally work five days per week. I worked 10 hours today.');
  const six = await executeSalary('I earn 40 ILS per hour. I work 6 days a week. I worked 9 hours today.');

  assert.equal(facts(five).workweekDays, 5);
  assert.equal(facts(six).workweekDays, 6);
});

test('supplied workday count and time entries do not infer workweekDays', async () => {
  const suppliedDays = await executeSalary('I earn 40 ILS per hour. I worked 10 hours a day for 5 days.');
  const timeEntries = await executeSalary('I earn 40 ILS per hour. I worked 10 hours today.', {
    timeEntries: [{}, {}, {}, {}, {}, {}],
  });

  assert.equal(facts(suppliedDays).repeatedWorkdaysCount, 5);
  assert.equal(facts(suppliedDays).workweekDays, null);
  assert.equal(facts(timeEntries).workweekDays, null);
});

test('repeated same-day pattern extracts daily hours and repeated day facts', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I worked 10 hours each day for five days.');

  assert.equal(facts(result).dailyHoursWorked, 10);
  assert.equal(facts(result).repeatedWorkdaysCount, 5);
  assert.equal(facts(result).sameHoursEachDay, true);
  assert.equal(facts(result).workweekDays, null);
});

test('combined common message reaches safe calculation and returns 410 ILS', async () => {
  const result = await executeSalary('I earn 40 ILS per hour, work 5 days a week, and worked 10 hours today.');

  assert.equal(result.status, 'success');
  assert.equal(facts(result).salaryRate, 40);
  assert.equal(facts(result).currency, 'ILS');
  assert.equal(facts(result).workweekDays, 5);
  assert.equal(facts(result).dailyHoursWorked, 10);
  assert.equal(result.output.calculation.grossPay, 410);
});

test('6-day common message reaches safe 370 ILS calculation', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I work 6 days a week. I worked 9 hours today.');

  assert.equal(result.status, 'success');
  assert.equal(result.output.calculation.grossPay, 370);
});

test('weekly-only message stays safe and partial', async () => {
  const result = await executeSalary('I earn 40 ILS/hour and worked 45 hours this week.');

  assert.equal(result.status, 'partial');
  assert.equal(facts(result).salaryRate, 40);
  assert.equal(facts(result).salaryRateType, 'hourly');
  assert.equal(facts(result).weeklyHoursWorked, 45);
  assert.equal(facts(result).dailyHoursWorked, null);
  assert.equal(result.output.overtimeClassification.weeklyClassification.weeklyOvertimeCandidateHours, 3);
  assert.equal(result.output.calculation, undefined);
  assert.match(result.output.message, /weekly total alone/i);
});

test('transfer amount in multi-intent source message is not mistaken for salary or hours', async () => {
  const message = 'I earn 40 ILS/hour, worked 10 hours today, and want to send 2,000 ILS to Thailand.';
  const result = await executeSalary('I earn 40 ILS/hour, worked 10 hours today', {}, {
    sourceMessage: message,
  });

  assert.equal(facts(result).salaryRate, 40);
  assert.equal(facts(result).dailyHoursWorked, 10);
  assert.notEqual(facts(result).salaryRate, 2000);
  assert.notEqual(facts(result).dailyHoursWorked, 2000);
});

test('finance task remains isolated while sourceMessage preserves salary facts for employment', async () => {
  const message = 'I earn 40 ILS per hour and worked 10 hours today. Also I want to send 2,000 ILS to Thailand.';
  const service = new SupervisorService();
  const context = createRequestContext(message);
  const detectedIntents = service.detectIntents(context);
  const tasks = service.createTasksFromIntents(context, detectedIntents);
  const employmentTask = tasks.find((task) => task.domain === 'employment_salary');
  const financeTask = tasks.find((task) => task.domain === 'finance_consumer');

  assert.ok(employmentTask);
  assert.ok(financeTask);
  assert.doesNotMatch(employmentTask.input.question, /send 2 000 ils to thailand/i);
  assert.match(financeTask.input.question, /send 2,000 ils to thailand/i);
  assert.equal(financeTask.input.amount, 2000);
  assert.equal(employmentTask.metadata.sourceMessage, message);

  const result = await employmentSalaryAgent.execute(employmentTask);
  assert.equal(result.output.knownFacts.salaryRate, 40);
  assert.equal(result.output.knownFacts.dailyHoursWorked, 10);
});

test('night shift label alone does not set isNightWork true', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I worked night shift for 8 hours.');

  assert.notEqual(facts(result).isNightWork, true);
});

test('Saturday alone does not set weekly-rest work true', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I worked 8 hours on Saturday.');

  assert.notEqual(facts(result).workOccurredDuringWeeklyRest, true);
});

test('holiday-eve text alone stays safely unresolved', async () => {
  const result = await executeSalary('How much should I receive? I earn 40 ILS per hour. I worked 8 hours on holiday eve.');

  assert.notEqual(result.status, 'success');
  assert.equal(result.output.calculation, undefined);
});

test('missing workweekDays still asks only the minimal workweek question', async () => {
  const result = await executeSalary('I earn 40 ILS/hour and worked 10 hours today.');

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['workweek_days']);
  assert.match(result.followUpQuestions[0], /5 days or 6 days/i);
});

test('missing hourly rate still asks only the minimal rate question', async () => {
  const result = await executeSalary('How much should I receive? I work 5 days a week and worked 10 hours today.');

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['salary_rate']);
  assert.match(result.followUpQuestions[0], /pay rate/i);
  assert.doesNotMatch(result.followUpQuestions[0], /5 days or 6 days/i);
});

test('existing overtime calculations remain unchanged', async () => {
  const five = await executeSalary('I earn 40 ILS per hour. I work 5 days a week. I worked 10 hours today.');
  const six = await executeSalary('I earn 40 ILS per hour. I work 6 days a week. I worked 9 hours today.');
  const night = await executeSalary('I earn 40 ILS per hour. I worked 8 hours today.', { isNightWork: true });
  const shortened = await executeSalary('I earn 40 ILS per hour. I worked 8 hours today.', {
    shortenedWorkdayRuleApplicable: true,
  });

  assert.equal(five.output.calculation.grossPay, 410);
  assert.equal(six.output.calculation.grossPay, 370);
  assert.equal(night.output.calculation.grossPay, 330);
  assert.equal(shortened.output.calculation.grossPay, 330);
});

test('salary payment timing remains unchanged', async () => {
  const result = await employmentSalaryAgent.execute({
    ...createTask('When should I receive my salary?', { paymentFrequency: 'monthly' }),
    intent: 'salary_payment_timing',
  });

  assert.equal(result.output.employmentIntent, 'salary_payment_timing');
  assert.match(result.output.message, /Salary for a month is due at the end of that month/i);
});

test('missing salary remains unchanged', async () => {
  const result = await employmentSalaryAgent.execute({
    ...createTask("I didn't receive my August salary. I am paid monthly.", {
      currentDate: '2026-09-13',
    }),
    intent: 'missing_salary',
  });

  assert.equal(result.output.employmentIntent, 'missing_salary');
  assert.match(result.output.message, /August/i);
});

test('Supervisor, Finance, Health, and profile-memory detection remain available', async () => {
  const service = new SupervisorService();
  const detected = service.detectIntents(createRequestContext(
    'What is my profession? I earn 40 ILS per hour and worked 10 hours today. How can I send money to Thailand and find a clinic?'
  ));

  assert.ok(detected.intents.some((intent) => intent.domain === 'profile_memory'));
  assert.ok(detected.intents.some((intent) => intent.domain === 'employment_salary'));
  assert.ok(detected.intents.some((intent) => intent.domain === 'finance_consumer'));
  assert.ok(detected.intents.some((intent) => intent.domain === 'health_life_community'));

  const financeResult = await financeConsumerAgent.execute({
    taskId: 'finance_salary_fact_guard',
    conversationId: 'web:salary_fact_extraction',
    requestId: 'req_salary_fact_extraction',
    domain: 'finance_consumer',
    capability: 'finance.transfer',
    priority: 'normal',
    input: { question: 'How can I send 2,000 ILS to Thailand?', amount: 2000, sourceCurrency: 'ILS', targetCurrency: 'THB' },
    metadata: {},
    createdAt: '2026-09-13T08:00:00.000Z',
  });
  const healthResult = await healthLifeCommunityAgent.execute({
    taskId: 'health_salary_fact_guard',
    conversationId: 'web:salary_fact_extraction',
    requestId: 'req_salary_fact_extraction',
    domain: 'health_life_community',
    capability: 'health.support',
    priority: 'normal',
    input: { question: 'How can I find a clinic near me?' },
    metadata: {},
    createdAt: '2026-09-13T08:00:00.000Z',
  });

  assert.equal(financeResult.status, 'partial');
  assert.match(financeResult.output.message, /not currently have enough real reported observations/i);
  assert.equal(healthResult.status, 'success');
});

test('no new legal rules or payroll engine behavior appears in salary extraction responses', async () => {
  const result = await executeSalary('I earn 40 ILS per hour. I work 5 days a week. I worked 10 hours today.');

  assert.doesNotMatch(result.output.message, /net salary is|tax is|pension is|holiday pay is|accommodation deduction is/i);
  assert.match(result.output.message, /not a full payslip calculation/i);
});
