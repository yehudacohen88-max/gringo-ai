const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OVERTIME_CLASSIFICATION_STATUS,
  PATH_STATUS,
  resolveOvertimeClassification,
} = require('../src/modules/agents/domains/overtime-classification.resolver');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

const FIVE_DAY_DAILY_RECORD_ID = 'israel_daily_overtime_classification_5_day_workweek_9_hours';
const SIX_DAY_DAILY_RECORD_ID = 'israel_daily_overtime_classification_6_day_workweek_8_hours';
const WEEKLY_OVERTIME_RECORD_ID = 'israel_weekly_overtime_classification_foundation_42_hours';
const WEEKLY_REST_RECORD_ID = 'israel_weekly_rest_work_foundation_section_7_base_150';
const WEEKLY_REST_INTERACTION_RECORD_ID = 'israel_weekly_rest_overtime_interaction_foundation';
const BASIC_HOURLY_RECORD_ID = 'basic_hourly_salary_calculation_gross_pay';
const SALARY_TIMING_RECORD_ID = 'israel_salary_payment_timing_monthly';
const MISSING_SALARY_RECORD_ID = 'israel_missing_salary_monthly_foundation';

function createSalaryTask(question) {
  return {
    taskId: 'task_overtime_resolver_guard',
    conversationId: 'web:user',
    requestId: 'req_overtime_resolver_guard',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-09T08:00:00.000Z',
  };
}

test('resolver exists and returns the structured classification contract', () => {
  const result = resolveOvertimeClassification({});

  assert.equal(typeof resolveOvertimeClassification, 'function');
  assert.equal(result.status, OVERTIME_CLASSIFICATION_STATUS.INSUFFICIENT_FACTS);
  assert.ok(result.dailyClassification);
  assert.ok(result.weeklyClassification);
  assert.ok(result.weeklyRestClassification);
  assert.ok(Array.isArray(result.blockers));
  assert.ok(Array.isArray(result.missingFacts));
  assert.ok(Array.isArray(result.specialContextDetected));
  assert.equal(result.candidateHoursAggregated, false);
  assert.equal(result.doubleCountingResolutionPerformed, false);
});

test('5-day regular workday classifies 10 hours as 1 daily candidate hour', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    workDayType: 'regular',
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.CLASSIFIED);
  assert.equal(result.dailyClassification.regularDailyHoursBoundary, 9);
  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.candidateExists, true);
  assert.equal(result.dailyClassification.sourceKnowledgeId, FIVE_DAY_DAILY_RECORD_ID);
});

test('5-day regular workday exact 9-hour boundary creates zero candidate hours only', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 9,
    workDayType: 'regular',
  });

  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, 0);
  assert.equal(result.dailyClassification.candidateExists, false);
  assert.equal(result.dailyClassification.doesNotProveNoOtherOvertime, true);
});

test('6-day regular workday classifies 9 hours as 1 daily candidate hour', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 6,
    dailyHoursWorked: 9,
    workDayType: 'regular',
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.CLASSIFIED);
  assert.equal(result.dailyClassification.regularDailyHoursBoundary, 8);
  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, 1);
  assert.equal(result.dailyClassification.sourceKnowledgeId, SIX_DAY_DAILY_RECORD_ID);
});

test('6-day regular workday exact 8-hour boundary creates zero candidate hours only', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 6,
    dailyHoursWorked: 8,
    workDayType: 'regular',
  });

  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, 0);
  assert.equal(result.dailyClassification.candidateExists, false);
  assert.equal(result.dailyClassification.doesNotProveNoOtherOvertime, true);
});

test('unknown workweekDays blocks daily classification instead of inferring scope', () => {
  const result = resolveOvertimeClassification({
    dailyHoursWorked: 10,
    workDayType: 'regular',
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.BLOCKED);
  assert.ok(result.dailyClassification.missingFacts.includes('workweekDays'));
  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, null);
});

test('time entries and monthly hours do not infer workweekDays', () => {
  const result = resolveOvertimeClassification({
    dailyHoursWorked: 10,
    workDayType: 'regular',
    timeEntries: [{}, {}, {}, {}, {}, {}],
    monthlyHours: 186,
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.BLOCKED);
  assert.ok(result.missingFacts.includes('workweekDays'));
});

test('weekly classification marks 45 weekly hours as 3 candidate hours', () => {
  const result = resolveOvertimeClassification({ weeklyHoursWorked: 45 });

  assert.equal(result.weeklyClassification.status, PATH_STATUS.CLASSIFIED);
  assert.equal(result.weeklyClassification.regularWeeklyHours, 42);
  assert.equal(result.weeklyClassification.weeklyOvertimeCandidateHours, 3);
  assert.equal(result.weeklyClassification.sourceKnowledgeId, WEEKLY_OVERTIME_RECORD_ID);
});

test('weekly classification exact 42-hour boundary creates zero candidate hours only', () => {
  const result = resolveOvertimeClassification({ weeklyHoursWorked: 42 });

  assert.equal(result.weeklyClassification.weeklyOvertimeCandidateHours, 0);
  assert.equal(result.weeklyClassification.candidateExists, false);
  assert.equal(result.weeklyClassification.belowRegularWeeklyHoursDoesNotProveNoDailyOvertime, true);
});

test('below weekly 42 hours does not prove no daily overtime', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    weeklyHoursWorked: 40,
    workDayType: 'regular',
  });

  assert.equal(result.weeklyClassification.weeklyOvertimeCandidateHours, 0);
  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, 1);
  assert.equal(result.weeklyClassification.belowRegularWeeklyHoursDoesNotProveNoDailyOvertime, true);
});

test('daily and weekly candidates remain independent and are not aggregated', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    weeklyHoursWorked: 45,
    workDayType: 'regular',
  });

  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, 1);
  assert.equal(result.weeklyClassification.weeklyOvertimeCandidateHours, 3);
  assert.equal(result.aggregationRequired, true);
  assert.equal(result.candidateHoursAggregated, false);
  assert.equal(result.doubleCountingResolutionPerformed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'totalOvertimeHours'), false);
});

test('weekly-rest work is classified independently when verified', () => {
  const result = resolveOvertimeClassification({
    workOccurredDuringWeeklyRest: true,
  });

  assert.equal(result.weeklyRestClassification.status, PATH_STATUS.VERIFIED);
  assert.equal(result.weeklyRestClassification.sourceKnowledgeId, WEEKLY_REST_RECORD_ID);
  assert.equal(result.weeklyRestClassification.weeklyRestPayCalculated, false);
});

test('weekly-rest false is safely not applicable', () => {
  const result = resolveOvertimeClassification({
    workOccurredDuringWeeklyRest: false,
  });

  assert.equal(result.weeklyRestClassification.status, PATH_STATUS.NOT_APPLICABLE);
  assert.equal(result.weeklyRestClassification.classification, 'weekly_rest_work_not_applicable');
});

test('weekly-rest status is not inferred from Saturday nationality country or language', () => {
  const result = resolveOvertimeClassification({
    workDayName: 'Saturday',
    workerNationality: 'Thai',
    countryOfOrigin: 'Thailand',
    language: 'Thai',
  });

  assert.equal(result.weeklyRestClassification.status, PATH_STATUS.BLOCKED);
  assert.ok(result.weeklyRestClassification.missingFacts.includes('workOccurredDuringWeeklyRest'));
  assert.equal(result.weeklyRestClassification.doesNotInferFromSaturdayNationalityCountryOrLanguage, true);
});

test('weekly-rest plus independently classified weekly overtime detects interaction without pay math', () => {
  const result = resolveOvertimeClassification({
    weeklyHoursWorked: 45,
    workOccurredDuringWeeklyRest: true,
  });

  assert.equal(result.weeklyRestOvertimeInteractionDetected, true);
  assert.equal(result.weeklyRestOvertimeInteractionKnowledgeId, WEEKLY_REST_INTERACTION_RECORD_ID);
  assert.equal(result.compensation.combinedCompensationCalculated, false);
  assert.equal(result.compensation.weeklyRestPayCalculated, false);
  assert.equal(result.compensation.overtimePayCalculated, false);
});

test('holiday context gates general daily classification', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    workDayType: 'regular',
    specialDayContext: 'holiday',
  });

  assert.equal(result.status, OVERTIME_CLASSIFICATION_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.equal(result.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.ok(result.specialContextDetected.includes('holiday'));
});

test('holiday-eve context gates general daily classification', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    workDayType: 'regular',
    specialDayContext: 'holiday eve',
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.ok(result.specialContextDetected.includes('holiday_eve'));
});

test('night-work context gates general daily classification', () => {
  const result = resolveOvertimeClassification({
    workweekDays: 6,
    dailyHoursWorked: 9,
    workDayType: 'regular',
    specialDayContext: 'night work',
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.ok(result.specialContextDetected.includes('night_work'));
});

test('shortened-workday and unknown special contexts gate general daily classification', () => {
  const shortened = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    workDayType: 'regular',
    specialDayContext: 'shortened-workday',
  });
  const unknown = resolveOvertimeClassification({
    workweekDays: 5,
    dailyHoursWorked: 10,
    workDayType: 'regular',
    specialDayContext: 'unknown_special_context',
  });

  assert.ok(shortened.specialContextDetected.includes('shortened_workday'));
  assert.equal(shortened.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
  assert.ok(unknown.specialContextDetected.includes('unknown_special_context'));
  assert.equal(unknown.dailyClassification.status, PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE);
});

test('overtime sequence is preserved when supplied and never invented', () => {
  const supplied = resolveOvertimeClassification({
    weeklyHoursWorked: 45,
    overtimeSequenceWithinWorkday: ['first_overtime_hour', 'second_overtime_hour'],
  });
  const missing = resolveOvertimeClassification({ weeklyHoursWorked: 45 });

  assert.deepEqual(supplied.overtimeSequenceWithinWorkday, ['first_overtime_hour', 'second_overtime_hour']);
  assert.equal(supplied.overtimeSequenceInvented, false);
  assert.equal(missing.overtimeSequenceWithinWorkday, null);
  assert.equal(missing.overtimeSequenceInvented, false);
});

test('overtime multipliers and weekly-rest pay are not calculated or invoked', () => {
  const result = resolveOvertimeClassification({
    weeklyHoursWorked: 45,
    workOccurredDuringWeeklyRest: true,
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.compensation.overtimeMultipliersInvoked, false);
  assert.equal(result.compensation.weeklyRestMultiplierInvoked, false);
  assert.equal(result.compensation.weeklyRestPayCalculated, false);
  assert.equal(serialized.includes('1.25'), false);
  assert.equal(serialized.includes('1.5'), false);
  assert.equal(serialized.includes('175'), false);
  assert.equal(serialized.includes('200'), false);
});

test('missing facts are explicit and are not treated as zero', () => {
  const result = resolveOvertimeClassification({});

  assert.ok(result.missingFacts.includes('workweekDays'));
  assert.ok(result.missingFacts.includes('dailyHoursWorked'));
  assert.ok(result.missingFacts.includes('workDayType'));
  assert.ok(result.missingFacts.includes('weeklyHoursWorked'));
  assert.ok(result.missingFacts.includes('workOccurredDuringWeeklyRest'));
  assert.equal(result.dailyClassification.dailyOvertimeCandidateHours, null);
  assert.equal(result.weeklyClassification.weeklyOvertimeCandidateHours, null);
});

test('basic hourly salary calculation handler remains unchanged', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
});

test('salary handler is not connected to overtime classification resolver', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I worked 10 hours today in a verified 5-day workweek.'
  ));

  assert.notEqual(result.output.knowledgeId, FIVE_DAY_DAILY_RECORD_ID);
  assert.equal(result.output.calculation, undefined);
});

test('salary payment timing and missing salary knowledge are not changed by resolver', () => {
  const payment = resolveOvertimeClassification({ weeklyHoursWorked: 45 });

  assert.ok(payment.sourceKnowledgeIds.includes(WEEKLY_OVERTIME_RECORD_ID));
  assert.equal(payment.sourceKnowledgeIds.includes(SALARY_TIMING_RECORD_ID), false);
  assert.equal(payment.sourceKnowledgeIds.includes(MISSING_SALARY_RECORD_ID), false);
});

test('sourceMessage is accepted as metadata but not parsed for facts', () => {
  const result = resolveOvertimeClassification({
    sourceMessage: 'I worked 10 hours and 45 weekly hours on Saturday.',
  });

  assert.equal(result.dailyClassification.status, PATH_STATUS.BLOCKED);
  assert.equal(result.weeklyClassification.status, PATH_STATUS.BLOCKED);
  assert.equal(result.weeklyRestClassification.status, PATH_STATUS.BLOCKED);
});
