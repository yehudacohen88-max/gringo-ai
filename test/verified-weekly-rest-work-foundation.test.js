const test = require('node:test');
const assert = require('node:assert/strict');

const workersRightsKnowledge = require('../src/modules/knowledge-agent/knowledge-base/workers-rights.json');
const knowledgeBaseService = require('../src/modules/knowledge-agent/knowledge-base.service');
const { employmentSalaryAgent } = require('../src/modules/agents/domains/employment-salary.agent');

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
    taskId: 'task_weekly_rest_foundation',
    conversationId: 'web:user',
    requestId: 'req_weekly_rest_foundation',
    domain: 'employment_salary',
    capability: 'jobs.salary',
    priority: 'normal',
    input: { question },
    metadata: {},
    createdAt: '2026-09-09T08:00:00.000Z',
  };
}

test('weekly-rest foundation knowledge exists', () => {
  assert.ok(getRecord(WEEKLY_REST_RECORD_ID));
  assert.ok(knowledgeBaseService.loadKnowledgeItems().find((item) => item.id === WEEKLY_REST_RECORD_ID));
});

test('official Israeli legal source metadata exists and Section 7 is represented', () => {
  const record = getRecord(WEEKLY_REST_RECORD_ID);

  assert.equal(record.source.title, 'Hours of Work and Rest Law, 5711-1951');
  assert.equal(record.source.hebrewTitle, 'חוק שעות עבודה ומנוחה, התשי"א-1951');
  assert.equal(record.source.authority, 'State of Israel');
  assert.equal(record.source.provision, 'Section 7');
  assert.match(record.source.url, /main\.knesset\.gov\.il\/apps\/legislation\/main\/laws\/2000019/);
  assert.equal(record.source.verified, true);
  assert.equal(record.rule.legalProvision, 'Section 7');
});

test('general 36 continuous-hour weekly-rest foundation has exception guard', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;

  assert.equal(rule.minimumWeeklyRestContinuousHours, 36);
  assert.equal(rule.minimumWeeklyRestContinuousHoursUnit, 'hours');
  assert.equal(rule.minimumWeeklyRestExceptionGuard, true);
  assert.equal(rule.doesNotTreatThirtySixHoursAsUniversalExactRestForAllWorkers, true);
});

test('Jewish-worker weekly rest includes Shabbat and requires worker status', () => {
  const jewishRule = getRecord(WEEKLY_REST_RECORD_ID).rule.weeklyRestDayIdentity.jewishWorker;

  assert.ok(jewishRule.weeklyRestIncludes.includes('Shabbat'));
  assert.equal(jewishRule.requiresWorkerStatusKnown, true);
});

test('non-Jewish worker rule supports Friday Saturday or Sunday by applicable choice or status', () => {
  const nonJewishRule = getRecord(WEEKLY_REST_RECORD_ID).rule.weeklyRestDayIdentity.nonJewishWorker;

  assert.deepEqual(nonJewishRule.possibleWeeklyRestDays, ['Friday', 'Saturday', 'Sunday']);
  assert.equal(nonJewishRule.requiresApplicableWorkerChoiceOrStatus, true);
});

test('Saturday Friday and Sunday are not universalized', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;

  assert.equal(rule.doesNotUniversalizeSaturdayForEveryWorker, true);
  assert.equal(rule.doesNotUniversalizeFridayForEveryNonJewishWorker, true);
  assert.equal(rule.doesNotUniversalizeSundayForEveryNonJewishWorker, true);
});

test('nationality country language and religion inferences are avoided', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;

  assert.equal(rule.doesNotInferReligionFromNationality, true);
  assert.equal(rule.doesNotInferReligionFromCountryOfOrigin, true);
  assert.equal(rule.doesNotInferReligionFromLanguage, true);
  assert.equal(rule.doesNotInferWeeklyRestDayFromNationality, true);
  assert.equal(rule.doesNotInferWeeklyRestDayFromCountryOfOrigin, true);
  assert.equal(rule.doesNotInferWeeklyRestDayFromLanguage, true);
});

test('unknown weekly-rest period remains missing information', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;

  assert.equal(rule.unknownWeeklyRestPeriodIsMissingInformation, true);
  assert.equal(rule.weeklyRestDayIdentity.unknownWorkerStatus.weeklyRestPeriodStatus, 'missing_information');
  assert.equal(rule.weeklyRestDayIdentity.unknownWorkerStatus.doNotGuess, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('unknown_weekly_rest_period'));
});

test('weekly-rest base multiplier is 1.50 and requires verified rest work', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;

  assert.equal(rule.weeklyRestBaseMultiplier, 1.5);
  assert.equal(rule.weeklyRestBaseMultiplierAppliesOnlyAfterRestWorkVerified, true);
  assert.deepEqual(rule.requiredFactsBeforeBaseCompensation, [
    'workOccurredDuringWeeklyRest',
    'regularWage',
    'weeklyRestBaseMultiplier',
  ]);
});

test('worked Saturday alone is insufficient for weekly-rest compensation classification', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;

  assert.equal(rule.workedSaturdayAloneInsufficient, true);
  assert.equal(rule.workedFridayAloneInsufficient, true);
  assert.equal(rule.workedSundayAloneInsufficient, true);
  assert.ok(rule.doesNotAutomaticallyApplyTo.includes('worked_saturday'));
});

test('weekly-rest overtime combined formula is not added', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;
  const serialized = JSON.stringify(getRecord(WEEKLY_REST_RECORD_ID));

  assert.equal(rule.weeklyRestOvertimeInteraction, 'separate_rule_required');
  assert.equal(rule.doesNotCombineWithOvertimeMultipliers, true);
  assert.ok(rule.doesNotDetermine.includes('combined_weekly_rest_overtime_formula'));
  assert.equal(serialized.includes('175%'), false);
  assert.equal(serialized.includes('200%'), false);
  assert.equal(serialized.includes('1.75'), false);
  assert.equal(serialized.includes('2.0'), false);
});

test('permit status and compensation remain separate with no violation conclusion', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;

  assert.equal(rule.employmentDuringWeeklyRestPermission.employmentDuringWeeklyRestGenerallyRequiresApplicablePermission, true);
  assert.equal(rule.employmentDuringWeeklyRestPermission.permitStatusSeparateFromCompensation, true);
  assert.equal(rule.employmentDuringWeeklyRestPermission.permitStatusDoesNotDetermineBaseCompensationEligibility, true);
  assert.equal(rule.employmentDuringWeeklyRestPermission.noPermitDoesNotMeanNoPay, true);
  assert.ok(rule.doesNotDetermine.includes('employer_violation'));
  assert.ok(rule.doesNotDetermine.includes('no_permit_no_pay'));
});

test('live-in caregiving and special weekly-rest scopes remain separate', () => {
  const rule = getRecord(WEEKLY_REST_RECORD_ID).rule;

  assert.ok(rule.doesNotDetermine.includes('live_in_caregiving_exception'));
  assert.ok(rule.separateKnowledgeRequiredFor.includes('live_in_caregiving_exception'));
  assert.equal(JSON.stringify(getRecord(WEEKLY_REST_RECORD_ID)).includes('25-hour'), false);
});

test('holiday holiday-eve night work and sector rules remain separate', () => {
  const separate = getRecord(WEEKLY_REST_RECORD_ID).rule.separateKnowledgeRequiredFor;

  assert.ok(separate.includes('holiday_work'));
  assert.ok(separate.includes('holiday_eve_work'));
  assert.ok(separate.includes('night_work_rules'));
  assert.ok(separate.includes('sector_specific_rules'));
  assert.ok(separate.includes('collective_agreement_rules'));
});

test('weekly-rest foundation can be selected by existing knowledge layer', () => {
  const record = getRecord(WEEKLY_REST_RECORD_ID);
  const selected = knowledgeBaseService.findWeeklyRestWorkFoundationRule([record]);

  assert.equal(selected.id, WEEKLY_REST_RECORD_ID);
  assert.equal(knowledgeBaseService.findWeeklyRestWorkFoundationRule([{ ...record, source: { ...record.source, verified: false } }]), null);
  assert.equal(knowledgeBaseService.findWeeklyRestWorkFoundationRule([{ ...record, rule: { ...record.rule, weeklyRestBaseMultiplier: 1.25 } }]), null);
  assert.equal(knowledgeBaseService.findWeeklyRestWorkFoundationRule([{ ...record, rule: { ...record.rule, workedSaturdayAloneInsufficient: false } }]), null);
});

test('5-day daily overtime rule remains unchanged', () => {
  const rule = getRecord(FIVE_DAY_DAILY_RECORD_ID).rule;

  assert.equal(rule.applicableWorkweekDays, 5);
  assert.equal(rule.regularDailyHoursBoundary, 9);
  assert.equal(rule.requiresVerifiedFiveDayWorkweek, true);
});

test('6-day daily overtime rule remains unchanged', () => {
  const rule = getRecord(SIX_DAY_DAILY_RECORD_ID).rule;

  assert.equal(rule.applicableWorkweekDays, 6);
  assert.equal(rule.regularDailyHoursBoundary, 8);
  assert.equal(rule.requiresVerifiedSixDayWorkweek, true);
});

test('weekly 42-hour rule remains unchanged', () => {
  const rule = getRecord(WEEKLY_OVERTIME_RECORD_ID).rule;

  assert.equal(rule.regularWeeklyHours, 42);
  assert.equal(rule.weeklyOvertimeCandidateFormula.candidateOnly, true);
  assert.equal(rule.doesNotCalculateOvertimePay, true);
});

test('ordinary overtime multiplier knowledge remains unchanged', () => {
  const rule = getRecord(OVERTIME_MULTIPLIER_RECORD_ID).rule;

  assert.equal(rule.multipliers.firstOvertimeHourMultiplier, 1.25);
  assert.equal(rule.multipliers.secondOvertimeHourMultiplier, 1.25);
  assert.equal(rule.multipliers.thirdAndLaterOvertimeHourMultiplier, 1.5);
  assert.equal(rule.appliesOnlyAfterOvertimeStatusEstablished, true);
});

test('basic hourly salary knowledge remains unchanged', () => {
  const record = getRecord(BASIC_HOURLY_RECORD_ID);

  assert.equal(record.rule.calculation, 'basicGrossPay = hourlyRate * regularHours');
  assert.deepEqual(record.rule.requiredFactsBeforeApplication, ['hourlyRate', 'regularHours']);
  assert.equal(record.rule.doesNotTreatTotalHoursAsRegularHours, true);
});

test('salary calculation handler remains unchanged and does not use weekly-rest rule', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I earn 40 ILS per hour and worked 100 regular hours.'
  ));

  assert.equal(result.status, 'success');
  assert.equal(result.output.knowledgeId, BASIC_HOURLY_RECORD_ID);
  assert.equal(result.output.calculation.basicGrossPay, 4000);
  assert.doesNotMatch(result.output.message, /weekly rest|Shabbat|150%|1\.5/i);
});

test('weekly-rest work message is still not connected to salary calculation handler', async () => {
  const result = await employmentSalaryAgent.execute(createSalaryTask(
    'I worked Saturday during my weekly rest.'
  ));

  assert.notEqual(result.output.knowledgeId, WEEKLY_REST_RECORD_ID);
  assert.equal(result.output.calculation, undefined);
  assert.doesNotMatch(result.output.message || '', /weekly-rest compensation is|150%|1\.5/i);
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
