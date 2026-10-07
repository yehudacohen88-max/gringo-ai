const test = require('node:test');
const assert = require('node:assert/strict');

const { employmentSalaryAgent, resultContract } = require('../src/modules/agents');
const {
  classifyEmploymentIntent,
  MISSING_SALARY_PERIOD_AND_FREQUENCY_QUESTION,
  MISSING_SALARY_PERIOD_QUESTION,
  MISSING_SALARY_TIMING_CONTEXT_QUESTION,
  MISSING_SALARY_UNSUPPORTED_FREQUENCY_RESPONSE,
  SALARY_CALCULATION_FACT_QUESTION,
  SALARY_CALCULATION_RATE_QUESTION,
  SALARY_CALCULATION_REGULAR_HOURS_FROM_TOTAL_QUESTION,
  SALARY_CALCULATION_REGULAR_HOURS_QUESTION,
  SALARY_CALCULATION_CURRENCY_QUESTION,
  SALARY_CALCULATION_UNVERIFIED_RULE_RESPONSE,
  SALARY_CALCULATION_WORK_QUANTITY_QUESTION,
} = require('../src/modules/agents/domains/employment-salary.agent');
const jobService = require('../src/modules/jobs/job.service');
const knowledgeAgentService = require('../src/modules/knowledge-agent/knowledge-agent.service');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const documentService = require('../src/modules/documents/document.service');
const crmAgentService = require('../src/modules/crm-agent/crm-agent.service');

function createTask(overrides = {}) {
  return {
    taskId: 'task_employment_1',
    conversationId: 'web:user',
    requestId: 'req_employment_1',
    domain: 'employment_salary',
    capability: 'jobs.search',
    priority: 'normal',
    input: {},
    metadata: {},
    createdAt: '2026-08-02T08:00:00.000Z',
    ...overrides,
  };
}

async function withPatchedServices(patches, callback) {
  const originals = [];

  for (const [service, methods] of patches) {
    for (const [name, replacement] of Object.entries(methods)) {
      originals.push([service, name, service[name]]);
      service[name] = replacement;
    }
  }

  try {
    return await callback();
  } finally {
    originals.reverse().forEach(([service, name, original]) => {
      service[name] = original;
    });
  }
}

function assertSupportedResultContract(result, taskId = 'task_employment_1') {
  assert.deepEqual(Object.keys(result), ['taskId', 'status', 'output', 'warnings', 'followUpQuestions', 'completedAt']);
  assert.equal(result.taskId, taskId);
  assert.equal(Array.isArray(result.warnings), true);
  assert.equal(Array.isArray(result.followUpQuestions), true);
  assert.equal(typeof result.output, 'object');
  assert.equal(resultContract.validateResultContract(result), true);
}

test('classifies salary payment timing intent', () => {
  assert.equal(classifyEmploymentIntent('When should I receive my salary?').intent, 'salary_payment_timing');
  assert.equal(classifyEmploymentIntent('When does my employer have to pay me?').intent, 'salary_payment_timing');
  assert.equal(classifyEmploymentIntent('What day should salary be paid?').intent, 'salary_payment_timing');
});

test('classifies missing or late salary intent', () => {
  assert.equal(classifyEmploymentIntent('My salary is late.').intent, 'missing_salary');
  assert.equal(classifyEmploymentIntent('I did not get paid.').intent, 'missing_salary');
  assert.equal(classifyEmploymentIntent('My employer has not paid me.').intent, 'missing_salary');
  assert.equal(classifyEmploymentIntent("I didn't receive my salary.").intent, 'missing_salary');
});

test('classifies salary amount or calculation intent', () => {
  assert.equal(classifyEmploymentIntent('How much salary should I receive?').intent, 'salary_amount_or_calculation');
  assert.equal(classifyEmploymentIntent('Can you calculate my salary?').intent, 'salary_amount_or_calculation');
  assert.equal(classifyEmploymentIntent('Is this salary amount correct?').intent, 'salary_amount_or_calculation');
  assert.equal(classifyEmploymentIntent('My employer paid me 6,500 ILS. Is that correct?').intent, 'salary_amount_or_calculation');
  assert.equal(classifyEmploymentIntent('I earn 40 ILS per hour and worked 100 regular hours.').intent, 'salary_amount_or_calculation');
});

test('classifies payslip intent', () => {
  assert.equal(classifyEmploymentIntent('I did not get a payslip.').intent, 'payslip');
  assert.equal(classifyEmploymentIntent('Can you explain my payslip?').intent, 'payslip');
  assert.equal(classifyEmploymentIntent('What should appear on my payslip?').intent, 'payslip');
});

test('classifies working hours intent', () => {
  assert.equal(classifyEmploymentIntent('How many hours can I work?').intent, 'working_hours');
  assert.equal(classifyEmploymentIntent('What are normal working hours?').intent, 'working_hours');
  assert.equal(classifyEmploymentIntent('How many hours did I work?').intent, 'working_hours');
});

test('classifies overtime intent', () => {
  assert.equal(classifyEmploymentIntent('How is overtime calculated?').intent, 'overtime');
  assert.equal(classifyEmploymentIntent('Should I get extra pay for overtime?').intent, 'overtime');
});

test('classifies rest days intent', () => {
  assert.equal(classifyEmploymentIntent('Do I get a weekly rest day?').intent, 'rest_days');
  assert.equal(classifyEmploymentIntent('Am I entitled to a rest day?').intent, 'rest_days');
  assert.equal(classifyEmploymentIntent('Can my employer make me work every day?').intent, 'rest_days');
});

test('classifies employer issue intent', () => {
  assert.equal(classifyEmploymentIntent('I have a problem with my employer.').intent, 'employer_issue');
  assert.equal(classifyEmploymentIntent('My employer is treating me unfairly.').intent, 'employer_issue');
});

test('classifies job search intent without classifying profile statements', () => {
  assert.equal(classifyEmploymentIntent('Find me a construction job.').intent, 'job_search');
  assert.equal(classifyEmploymentIntent('I am looking for work.').intent, 'job_search');
  assert.equal(classifyEmploymentIntent('Are there construction jobs in Haifa?').intent, 'job_search');
  assert.equal(classifyEmploymentIntent('I work in construction.').intent, 'unknown_employment');
});

test('classifies employment contract intent', () => {
  assert.equal(classifyEmploymentIntent('Can you explain my work contract?').intent, 'employment_contract');
  assert.equal(classifyEmploymentIntent('Do I need a contract?').intent, 'employment_contract');
});

test('classifies employer housing intent', () => {
  assert.equal(classifyEmploymentIntent("My employer's apartment has no hot water.").intent, 'employer_housing');
  assert.equal(classifyEmploymentIntent('The housing provided by my employer is bad.').intent, 'employer_housing');
});

test('classifies employment documents intent', () => {
  assert.equal(classifyEmploymentIntent('What work documents do I need?').intent, 'employment_documents');
  assert.equal(classifyEmploymentIntent('My work document is missing.').intent, 'employment_documents');
});

test('classifies workplace safety intent', () => {
  assert.equal(classifyEmploymentIntent('My employer did not give me safety equipment.').intent, 'workplace_safety');
  assert.equal(classifyEmploymentIntent('Is this work safe?').intent, 'workplace_safety');
});

test('classifies unknown employment fallback conservatively', () => {
  assert.equal(classifyEmploymentIntent('I work in construction.').intent, 'unknown_employment');
  assert.equal(classifyEmploymentIntent('How can I send my salary money to Thailand?').intent, 'unknown_employment');
  assert.equal(classifyEmploymentIntent('').intent, 'unknown_employment');
});

test('salary payment timing with unknown frequency asks for scope before using monthly rule', async () => {
  let knowledgeCalled = false;
  let ruleLookupCalled = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async () => {
        knowledgeCalled = true;
        return { status: 'FOUND', category: 'Workers Rights', answer: 'Generic employment rights answer.' };
      },
    }],
    [knowledgeBaseService, {
      findVerifiedSalaryPaymentTimingRule: () => {
        ruleLookupCalled = true;
        return null;
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question: 'When should I receive my salary?' },
    }));

    assert.equal(knowledgeCalled, false);
    assert.equal(ruleLookupCalled, false);
    assert.equal(result.status, 'blocked');
    assert.equal(result.followUpQuestions[0], 'If you are paid monthly, I can explain the monthly salary-payment rule. Are you paid monthly, hourly, daily, or another way?');
    assertSupportedResultContract(result);
  });
});

test('salary payment timing with monthly scope reads verified rule and avoids generic fallback', async () => {
  let knowledgeCalled = false;
  let ruleLookupCalled = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async () => {
        knowledgeCalled = true;
        return { status: 'FOUND', category: 'Workers Rights', answer: 'Generic employment rights answer.' };
      },
    }],
    [knowledgeBaseService, {
      findVerifiedSalaryPaymentTimingRule: () => {
        ruleLookupCalled = true;
        return {
          id: 'israel_salary_payment_timing_monthly',
          rule: {
            salaryDue: 'Salary for a month is due at the end of that month for a monthly-paid employee.',
            delayedAfter: 'Unpaid monthly salary becomes delayed salary if it has not been paid by the ninth day after the payment date.',
          },
          source: {
            title: 'Wage Protection Law, 5718-1958',
            authority: 'State of Israel',
            verified: true,
          },
        };
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: {
        question: 'When should I receive my salary?',
        profile: { paymentFrequency: 'monthly' },
      },
    }));

    assert.equal(knowledgeCalled, false);
    assert.equal(ruleLookupCalled, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'jobs.salary');
    assert.equal(result.output.employmentIntent, 'salary_payment_timing');
    assert.match(result.output.message, /due at the end of that month/i);
    assert.match(result.output.message, /delayed salary/i);
    assert.match(result.output.message, /ninth day after the payment date/i);
    assert.match(result.output.message, /Wage Protection Law, 5718-1958/i);
    assert.doesNotMatch(result.output.message, /has until the 9th to pay/i);
    assert.doesNotMatch(result.output.message, /Workers in Israel generally have rights around payment/i);
    assert.equal(result.output.needsVerifiedRule, false);
    assertSupportedResultContract(result);
  });
});

test('salary payment timing variants use focused handler with monthly scope', async () => {
  const variants = [
    'When does my employer have to pay me?',
    'What day should salary be paid?',
  ];

  for (const question of variants) {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question, paymentFrequency: 'monthly' },
    }));

    assert.equal(result.status, 'success');
    assert.equal(result.output.employmentIntent, 'salary_payment_timing');
    assert.match(result.output.message, /Wage Protection Law, 5718-1958/i);
    assertSupportedResultContract(result);
  }
});

test('salary payment timing falls back safely when verified rule lookup fails', async () => {
  await withPatchedServices([
    [knowledgeBaseService, {
      findVerifiedSalaryPaymentTimingRule: () => null,
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question: 'When should I receive my salary?', paymentFrequency: 'monthly' },
    }));

    assert.equal(result.status, 'success');
    assert.match(result.output.message, /should not guess/i);
    assert.equal(result.output.needsVerifiedRule, true);
    assertSupportedResultContract(result);
  });
});

test('missing salary uses dedicated handler without generic Knowledge fallback', async () => {
  let knowledgeCalled = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async () => {
        knowledgeCalled = true;
        return { status: 'FOUND', category: 'Workers Rights', answer: 'Generic fallback should not be used.', sources: [] };
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question: "I didn't receive my salary." },
    }));

    assert.equal(knowledgeCalled, false);
    assert.equal(result.status, 'blocked');
    assert.equal(result.output.capability, 'jobs.salary');
    assert.equal(result.output.employmentIntent, 'missing_salary');
    assert.equal(result.output.needsMissingSalaryFacts, true);
    assert.equal(result.output.knownPaymentFrequency, '');
    assert.equal(result.followUpQuestions[0], MISSING_SALARY_PERIOD_AND_FREQUENCY_QUESTION);
    assert.match(result.followUpQuestions[0], /which month's salary or payment period is missing/i);
    assert.match(result.followUpQuestions[0], /monthly, hourly, daily, or another way/i);
    assert.doesNotMatch(result.followUpQuestions[0], /end of that month/i);
    assert.doesNotMatch(result.followUpQuestions[0], /ninth day/i);
    assert.doesNotMatch(result.followUpQuestions[0], /violat/i);
    assert.doesNotMatch(result.followUpQuestions[0], /compensation/i);
    assertSupportedResultContract(result);
  });
});

test('missing salary variants reach dedicated handler safely', async () => {
  const variants = [
    "I didn't receive my salary.",
    'My salary is missing.',
    "My employer didn't pay me.",
  ];

  for (const question of variants) {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question },
    }));

    assert.equal(result.status, 'blocked');
    assert.equal(result.output.employmentIntent, 'missing_salary');
    assert.equal(result.followUpQuestions[0], MISSING_SALARY_PERIOD_AND_FREQUENCY_QUESTION);
    assertSupportedResultContract(result);
  }
});

test('missing salary reuses known payment frequency and asks only for missing period', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: {
      question: 'My employer has not paid me.',
      profile: { paymentFrequency: 'monthly' },
    },
  }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.output.employmentIntent, 'missing_salary');
  assert.equal(result.output.knownPaymentFrequency, 'monthly');
  assert.equal(result.followUpQuestions[0], MISSING_SALARY_PERIOD_QUESTION);
  assert.doesNotMatch(result.followUpQuestions[0], /hourly|daily|another way/i);
  assertSupportedResultContract(result);
});

test('missing salary with complete monthly facts retrieves verified knowledge and evaluates safely', async () => {
  let missingRuleCalled = false;

  await withPatchedServices([
    [knowledgeBaseService, {
      findVerifiedMissingSalaryRule: () => {
        missingRuleCalled = true;
        return {
          id: 'israel_missing_salary_monthly_foundation',
          rule: {
            salaryDueReference: 'israel_salary_payment_timing_monthly',
            delayedSalaryStatusReference: 'israel_salary_payment_timing_monthly',
          },
          source: {
            title: 'Wage Protection Law, 5718-1958',
            authority: 'State of Israel',
            verified: true,
          },
        };
      },
      findVerifiedSalaryPaymentTimingRule: () => ({
        id: 'israel_salary_payment_timing_monthly',
        rule: {
          salaryDue: 'Salary for a month is due at the end of that month for a monthly-paid employee.',
          delayedAfter: 'Unpaid monthly salary becomes delayed salary if it has not been paid by the ninth day after the payment date.',
        },
        source: {
          title: 'Wage Protection Law, 5718-1958',
          authority: 'State of Israel',
          verified: true,
        },
      }),
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: {
        question: "I didn't receive my August salary. I am paid monthly.",
        currentDate: '2026-09-10',
      },
    }));

    assert.equal(missingRuleCalled, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.employmentIntent, 'missing_salary');
    assert.match(result.output.message, /Salary for a month is due at the end of that month/i);
    assert.match(result.output.message, /Delayed-salary timing/i);
    assert.match(result.output.message, /reached the verified delayed-salary timing/i);
    assert.match(result.output.message, /Wage Protection Law, 5718-1958/i);
    assert.doesNotMatch(result.output.message, /compensation/i);
    assert.doesNotMatch(result.output.message, /broke the law|violated/i);
    assert.equal(result.output.knownFacts.paymentFrequency, 'monthly');
    assert.equal(result.output.knownFacts.paymentPeriod, 'august');
    assert.equal(result.output.knownFacts.paymentReceivedStatus, 'not_received');
    assert.equal(result.output.knownFacts.salaryDueDate, '2026-08-31');
    assert.equal(result.output.knownFacts.delayedSalaryDate, '2026-09-09');
    assertSupportedResultContract(result);
  });
});

test('missing salary does not re-ask known facts and asks only for missing timing context', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: {
      question: "I didn't receive my August salary. I am paid monthly.",
      currentDate: 'not-a-date',
    },
  }));

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['timing_date_context']);
  assert.equal(result.followUpQuestions[0], MISSING_SALARY_TIMING_CONTEXT_QUESTION);
  assert.doesNotMatch(result.followUpQuestions[0], /monthly, hourly, daily/i);
  assert.doesNotMatch(result.followUpQuestions[0], /which month/i);
  assertSupportedResultContract(result);
});

test('missing salary with known period and received status asks only for payment frequency', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: {
      question: "I didn't receive my August salary.",
      currentDate: '2026-09-10',
    },
  }));

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['payment_frequency']);
  assert.equal(result.followUpQuestions[0], 'Are you paid monthly, hourly, daily, or another way?');
  assertSupportedResultContract(result);
});

test('missing salary with hourly or daily pay does not apply the monthly rule', async () => {
  for (const paymentFrequency of ['hourly', 'daily']) {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: {
        question: `I didn't receive my August salary. I am paid ${paymentFrequency}.`,
        currentDate: '2026-09-10',
      },
    }));

    assert.equal(result.status, 'blocked');
    assert.equal(result.output.employmentIntent, 'missing_salary');
    assert.equal(result.output.knownPaymentFrequency, paymentFrequency);
    assert.equal(result.output.message, MISSING_SALARY_UNSUPPORTED_FREQUENCY_RESPONSE);
    assert.doesNotMatch(result.output.message, /Salary for a month is due/i);
    assertSupportedResultContract(result);
  }
});

test('missing salary falls back safely when verified knowledge is unavailable', async () => {
  await withPatchedServices([
    [knowledgeBaseService, {
      findVerifiedMissingSalaryRule: () => null,
      findVerifiedSalaryPaymentTimingRule: () => ({
        id: 'israel_salary_payment_timing_monthly',
        rule: {
          salaryDue: 'Salary for a month is due at the end of that month for a monthly-paid employee.',
          delayedAfter: 'Unpaid monthly salary becomes delayed salary if it has not been paid by the ninth day after the payment date.',
        },
        source: {
          title: 'Wage Protection Law, 5718-1958',
          authority: 'State of Israel',
          verified: true,
        },
      }),
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: {
        question: "I didn't receive my August salary. I am paid monthly.",
        currentDate: '2026-09-10',
      },
    }));

    assert.equal(result.status, 'success');
    assert.equal(result.output.needsVerifiedRule, true);
    assert.match(result.output.message, /should not guess/i);
    assert.doesNotMatch(result.output.message, /broke the law|violated|compensation/i);
    assertSupportedResultContract(result);
  });
});

test('salary amount calculation uses dedicated handler without generic Knowledge fallback', async () => {
  let knowledgeCalled = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async () => {
        knowledgeCalled = true;
        return { status: 'FOUND', category: 'Workers Rights', answer: 'Generic fallback should not be used.', sources: [] };
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question: 'How much salary should I receive?' },
    }));

    assert.equal(knowledgeCalled, false);
    assert.equal(result.status, 'blocked');
    assert.equal(result.output.capability, 'jobs.salary');
    assert.equal(result.output.employmentIntent, 'salary_amount_or_calculation');
    assert.equal(result.output.needsSalaryCalculationFacts, true);
    assert.deepEqual(result.output.missingFacts, ['salary_rate', 'regular_hours']);
    assert.equal(result.followUpQuestions[0], SALARY_CALCULATION_FACT_QUESTION);
    assert.doesNotMatch(result.output.message, /\b\d{3,}\s*ILS\b/i);
    assert.doesNotMatch(result.output.message, /overtime|tax|deduction|pension|severance/i);
    assertSupportedResultContract(result);
  });
});

test('salary amount calculation asks only for missing pay rate when work quantity is known', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: { question: 'I worked 180 regular hours this month. How much should I receive?' },
  }));

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['salary_rate']);
  assert.equal(result.output.knownFacts.regularHours, 180);
  assert.equal(result.followUpQuestions[0], SALARY_CALCULATION_RATE_QUESTION);
  assert.doesNotMatch(result.followUpQuestions[0], /how many hours/i);
  assertSupportedResultContract(result);
});

test('salary amount calculation asks only for missing work quantity when pay rate is known', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: { question: 'I earn 40 ILS per hour. How much salary should I receive?' },
  }));

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['regular_hours']);
  assert.equal(result.output.knownFacts.salaryRate, 40);
  assert.equal(result.output.knownFacts.salaryRateType, 'hourly');
  assert.equal(result.output.knownFacts.currency, 'ILS');
  assert.equal(result.followUpQuestions[0], SALARY_CALCULATION_REGULAR_HOURS_QUESTION);
  assert.doesNotMatch(result.followUpQuestions[0], /what is your pay rate|need your pay rate before/i);
  assertSupportedResultContract(result);
});

test('salary amount calculation protects generic hours from regular hours conversion', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: { question: 'I earn 40 ILS per hour and worked 180 hours this month. How much should I receive?' },
  }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.output.employmentIntent, 'salary_amount_or_calculation');
  assert.equal(result.output.knownFacts.salaryRate, 40);
  assert.equal(result.output.knownFacts.salaryRateType, 'hourly');
  assert.equal(result.output.knownFacts.workQuantity, 180);
  assert.equal(result.output.knownFacts.workQuantityType, 'hours');
  assert.equal(result.output.knownFacts.regularHours, null);
  assert.equal(result.output.knownFacts.workPeriod, 'this month');
  assert.equal(result.output.knownFacts.currency, 'ILS');
  assert.deepEqual(result.output.missingFacts, ['regular_hours']);
  assert.equal(result.followUpQuestions[0], SALARY_CALCULATION_REGULAR_HOURS_FROM_TOTAL_QUESTION);
  assert.doesNotMatch(result.output.message, /7200|7,200|overtime|tax|deduction/i);
  assertSupportedResultContract(result);
});

test('salary amount calculation reads regular-hours facts from original sourceMessage after clause splitting', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: { question: 'how much should i receive' },
    metadata: {
      sourceMessage: 'I earn 40 ILS per hour and worked 100 regular hours this month. How much should I receive, and how can I send 2,000 ILS to Thailand?',
    },
  }));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knownFacts.salaryRate, 40);
  assert.equal(result.output.knownFacts.salaryRateType, 'hourly');
  assert.equal(result.output.knownFacts.regularHours, 100);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.match(result.output.message, /basic gross pay for those regular hours is 4,000 ILS/i);
  assertSupportedResultContract(result);
});

test('salary amount calculation uses basic hourly knowledge for 40 ILS and 100 regular hours', async () => {
  let ruleCalled = false;

  await withPatchedServices([
    [knowledgeBaseService, {
      findBasicHourlySalaryCalculationRule: () => {
        ruleCalled = true;
        return {
          id: 'basic_hourly_salary_calculation_gross_pay',
          rule: {
            calculation: 'basicGrossPay = hourlyRate * regularHours',
            resultType: 'basic_gross_pay',
          },
        };
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question: 'I earn 40 ILS per hour and worked 100 regular hours.' },
    }));

    assert.equal(ruleCalled, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.needsVerifiedRule, false);
    assert.equal(result.output.knowledgeId, 'basic_hourly_salary_calculation_gross_pay');
    assert.equal(result.output.calculation.formula, 'basicGrossPay = hourlyRate * regularHours');
    assert.equal(result.output.calculation.resultType, 'basic_gross_pay');
    assert.equal(result.output.calculation.hourlyRate, 40);
    assert.equal(result.output.calculation.regularHours, 100);
    assert.equal(result.output.calculation.basicGrossPay, 4000);
    assert.equal(result.output.calculation.currency, 'ILS');
    assert.match(result.output.message, /basic gross pay for those regular hours is 4,000 ILS/i);
    assert.doesNotMatch(result.output.message, /final salary is|net salary is|complete payslip amount is/i);
    assert.doesNotMatch(result.output.message, /125%|150%|175%|200%/i);
    assert.doesNotMatch(result.output.message, /tax calculation|deduction calculation|pension calculation/i);
    assertSupportedResultContract(result);
  });
});

test('salary amount calculation uses basic hourly knowledge for 50 ILS and 80 regular hours', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: { question: 'My hourly rate is 50 ILS and I had 80 regular hours. How much should I receive?' },
  }));

  assert.equal(result.status, 'success');
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.equal(result.output.calculation.currency, 'ILS');
  assert.match(result.output.message, /80 regular hours at 50 ILS per hour/i);
  assert.match(result.output.message, /4,000 ILS/i);
  assert.doesNotMatch(result.output.message, /final salary is|net salary is/i);
  assertSupportedResultContract(result);
});

test('salary amount calculation asks for currency when hourly rate currency is unknown', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: { question: 'I earn 40 per hour and worked 100 regular hours. How much should I receive?' },
  }));

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.output.missingFacts, ['hourly_rate_currency']);
  assert.equal(result.output.knownFacts.salaryRate, 40);
  assert.equal(result.output.knownFacts.regularHours, 100);
  assert.equal(result.output.knownFacts.currency, '');
  assert.equal(result.followUpQuestions[0], SALARY_CALCULATION_CURRENCY_QUESTION);
  assert.doesNotMatch(result.output.message, /4,000 ILS|4000 ILS/i);
  assertSupportedResultContract(result);
});

test('salary amount correctness request asks for facts and avoids unsupported yes or no conclusion', async () => {
  const result = await employmentSalaryAgent.execute(createTask({
    capability: 'jobs.salary',
    input: { question: 'My employer paid me 6,500 ILS. Is that correct?' },
  }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.output.employmentIntent, 'salary_amount_or_calculation');
  assert.equal(result.output.knownFacts.amountAlreadyPaid, 6500);
  assert.deepEqual(result.output.missingFacts, ['salary_rate', 'regular_hours']);
  assert.doesNotMatch(result.output.message, /\byes\b|\bno\b|correct amount|incorrect amount/i);
  assert.doesNotMatch(result.output.message, /tax|deduction|overtime formula|pension/i);
  assertSupportedResultContract(result);
});

test('non-missing salary employment intents keep existing Knowledge service behavior', async () => {
  let called = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async (context) => {
        called = true;
        assert.equal(context.question, 'What is legal minimum salary?');
        return { status: 'FOUND', category: 'Workers Rights', answer: 'Keep records and ask for help.', sources: [] };
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question: 'What is legal minimum salary?' },
    }));

    assert.equal(called, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'jobs.salary');
    assert.equal(result.output.knowledge.answer, 'Keep records and ask for help.');
    assert.equal(result.output.employmentIntent, undefined);
    assertSupportedResultContract(result);
  });
});

test('jobs.search executes through existing Jobs service', async () => {
  let called = false;

  await withPatchedServices([
    [jobService, {
      getActiveJobs: async () => {
        called = true;
        return [{ jobId: 'job_1', title: 'Cook', status: 'Active' }];
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({ capability: 'jobs.search' }));

    assert.equal(called, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'jobs.search');
    assert.equal(result.output.count, 1);
    assertSupportedResultContract(result);
  });
});

test('jobs.match executes through existing Jobs matching service', async () => {
  let matched = false;
  let formatted = false;

  await withPatchedServices([
    [jobService, {
      findMatchingJobs: async (profile, searchContext) => {
        matched = true;
        assert.equal(profile.profession, 'Cook');
        assert.equal(searchContext.city, 'Tel Aviv');
        return [{ jobId: 'job_2', match: { score: 100, reason: 'Same profession and same city' } }];
      },
      formatJobsForChat: (jobs) => {
        formatted = true;
        return `Found ${jobs.length}`;
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.match',
      input: {
        profile: { userId: 'usr_1', profession: 'Cook' },
        searchContext: { city: 'Tel Aviv' },
      },
    }));

    assert.equal(matched, true);
    assert.equal(formatted, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'jobs.match');
    assert.equal(result.output.message, 'Found 1');
    assertSupportedResultContract(result);
  });
});

test('jobs.salary executes through existing Knowledge service', async () => {
  let called = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async (context) => {
        called = true;
        assert.equal(context.question, 'What is legal minimum salary?');
        return { status: 'FOUND', category: 'Workers Rights', answer: 'Known salary answer', sources: [] };
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.salary',
      input: { question: 'What is legal minimum salary?' },
    }));

    assert.equal(called, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'jobs.salary');
    assert.equal(result.output.knowledge.answer, 'Known salary answer');
    assertSupportedResultContract(result);
  });
});

test('employment.documents executes through existing Documents and Profile services', async () => {
  let readProfile = false;
  let readDocuments = false;
  let summarized = false;

  await withPatchedServices([
    [crmAgentService, {
      getUserMemory: async (userId) => {
        readProfile = true;
        assert.equal(userId, 'usr_1');
        return { userId, workSector: 'Construction' };
      },
      updateUserProfile: async () => {
        throw new Error('profile write should not be called');
      },
    }],
    [documentService, {
      getUserDocuments: async (userId) => {
        readDocuments = true;
        assert.equal(userId, 'usr_1');
        return [{ documentId: 'doc_1', userId, documentType: 'Passport', documentNumber: '1234', status: 'Valid' }];
      },
      summarizeDocuments: (profile, documents) => {
        summarized = true;
        assert.equal(profile.workSector, 'Construction');
        assert.equal(documents.length, 1);
        return { checklist: [], documentsComplete: 'Yes' };
      },
      toSafeDocument: (document) => ({ ...document, documentNumber: '***1234' }),
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'employment.documents',
      input: { userId: 'usr_1' },
    }));

    assert.equal(readProfile, true);
    assert.equal(readDocuments, true);
    assert.equal(summarized, true);
    assert.equal(result.status, 'success');
    assert.equal(result.output.capability, 'employment.documents');
    assert.equal(result.output.documents[0].documentNumber, '***1234');
    assertSupportedResultContract(result);
  });
});

test('employment.support executes through existing Knowledge service', async () => {
  let called = false;

  await withPatchedServices([
    [knowledgeAgentService, {
      answerQuestion: async (context) => {
        called = true;
        assert.equal(context.question, 'I need help with my employer');
        return { status: 'NEEDS_HUMAN', category: 'Workers Rights', answer: '', handoff: { status: 'queued' } };
      },
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'employment.support',
      input: { query: 'I need help with my employer' },
    }));

    assert.equal(called, true);
    assert.equal(result.status, 'partial');
    assert.equal(result.output.capability, 'employment.support');
    assert.equal(result.output.knowledge.handoff.status, 'queued');
    assertSupportedResultContract(result);
  });
});

test('unsupported capability returns blocked result without throwing', async () => {
  const result = await employmentSalaryAgent.execute(createTask({ capability: 'jobs.apply' }));

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.warnings, ['unsupported_capability']);
  assertSupportedResultContract(result);
});

test('missing required input returns blocked result with follow-up question', async () => {
  const result = await employmentSalaryAgent.execute(createTask({ capability: 'jobs.match', input: {} }));

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.warnings, ['missing_required_input']);
  assert.equal(result.followUpQuestions.length, 1);
  assertSupportedResultContract(result);
});

test('employment execution is read-only and does not call profile writes or external actions', async () => {
  let profileWriteCalled = false;
  let notificationCalled = false;

  await withPatchedServices([
    [crmAgentService, {
      getUserMemory: async () => ({ userId: 'usr_1', profession: 'Cook' }),
      updateUserProfile: async () => {
        profileWriteCalled = true;
      },
    }],
    [jobService, {
      findMatchingJobs: async () => [{ jobId: 'job_1', match: { score: 40, reason: 'Same sector' } }],
      formatJobsForChat: () => 'Found jobs',
    }],
  ], async () => {
    const result = await employmentSalaryAgent.execute(createTask({
      capability: 'jobs.match',
      input: { userId: 'usr_1', searchContext: { profession: 'Cook' } },
      metadata: {
        notify: () => {
          notificationCalled = true;
        },
      },
    }));

    assert.equal(result.status, 'success');
    assert.equal(profileWriteCalled, false);
    assert.equal(notificationCalled, false);
    assertSupportedResultContract(result);
  });
});
