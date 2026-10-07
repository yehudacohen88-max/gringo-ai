const knowledgeBaseService = require('../../knowledge-agent/knowledge-base.service');

const OVERTIME_CLASSIFICATION_STATUS = Object.freeze({
  CLASSIFIED: 'classified',
  PARTIALLY_CLASSIFIED: 'partially_classified',
  INSUFFICIENT_FACTS: 'insufficient_facts',
  SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE: 'special_context_requires_separate_rule',
});

const PATH_STATUS = Object.freeze({
  CLASSIFIED: 'classified',
  NOT_APPLICABLE: 'not_applicable',
  BLOCKED: 'blocked',
  SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE: 'special_context_requires_separate_rule',
  VERIFIED: 'verified',
});

const DAILY_SPECIAL_CONTEXTS = new Set([
  'weekly_rest',
  'holiday',
  'holiday_eve',
  'night_work',
  'shortened_workday',
  'special_permit_context',
  'unknown_special_context',
]);

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;

  const normalized = normalizeToken(value);
  if (['true', 'yes', 'verified'].includes(normalized)) return true;
  if (['false', 'no', 'not_applicable'].includes(normalized)) return false;
  return null;
}

function normalizeSpecialDayContext(context = {}) {
  const rawContexts = [];

  if (Array.isArray(context.specialDayContext)) {
    rawContexts.push(...context.specialDayContext);
  } else if (context.specialDayContext) {
    rawContexts.push(context.specialDayContext);
  }

  if (context.workDayType && normalizeToken(context.workDayType) !== 'regular') {
    rawContexts.push(context.workDayType);
  }

  if (toBoolean(context.workOccurredDuringWeeklyRest) === true) {
    rawContexts.push('weekly_rest');
  }

  if (resolveNightWorkStatus(context).verified === true) {
    rawContexts.push('night_work');
  }

  if (resolveShortenedWorkdayStatus(context).verified === true) {
    rawContexts.push('shortened_workday');
  }

  return unique(rawContexts.map(normalizeToken))
    .filter((item) => DAILY_SPECIAL_CONTEXTS.has(item));
}

function createBlockedPath(path, missingFacts, blockers = []) {
  return {
    path,
    status: PATH_STATUS.BLOCKED,
    missingFacts: unique(missingFacts),
    blockers: unique(blockers),
    sourceKnowledgeId: null,
  };
}

function resolveNightWorkStatus(context = {}) {
  const explicitNightWork = toBoolean(context.isNightWork);
  const nightWindowHours = toNumber(context.hoursWithinNightWindow);

  if (explicitNightWork === true) {
    return { verified: true, basis: 'isNightWork' };
  }

  if (explicitNightWork === false) {
    return { verified: false, basis: 'isNightWork' };
  }

  if (nightWindowHours !== null && nightWindowHours >= 2) {
    return { verified: true, basis: 'hoursWithinNightWindow' };
  }

  if (nightWindowHours !== null) {
    return { verified: false, basis: 'hoursWithinNightWindow' };
  }

  return { verified: null, basis: null };
}

function resolveShortenedWorkdayStatus(context = {}) {
  const isDayBeforeWeeklyRest = toBoolean(context.isDayBeforeWeeklyRest);
  const isDayBeforeApplicableHoliday = toBoolean(context.isDayBeforeApplicableHoliday);
  const shortenedWorkdayRuleApplicable = toBoolean(context.shortenedWorkdayRuleApplicable);

  if (shortenedWorkdayRuleApplicable === true) {
    return { verified: true, basis: 'shortenedWorkdayRuleApplicable', contexts: ['shortened_workday'] };
  }

  const contexts = [];
  if (isDayBeforeWeeklyRest === true) contexts.push('day_before_weekly_rest');
  if (isDayBeforeApplicableHoliday === true) contexts.push('day_before_applicable_holiday');

  if (contexts.length > 0) {
    return { verified: true, basis: contexts.join('+'), contexts };
  }

  if (
    shortenedWorkdayRuleApplicable === false
    || isDayBeforeWeeklyRest === false
    || isDayBeforeApplicableHoliday === false
  ) {
    return { verified: false, basis: 'explicit_false', contexts: [] };
  }

  return { verified: null, basis: null, contexts: [] };
}

function resolveSpecialSevenHourDailyClassification(context, unresolvedSpecialContexts) {
  const dailyHoursWorked = toNumber(context.dailyHoursWorked);
  const nightWorkStatus = resolveNightWorkStatus(context);
  const shortenedWorkdayStatus = resolveShortenedWorkdayStatus(context);
  const nightRule = nightWorkStatus.verified === true
    ? knowledgeBaseService.findNightWorkDailyOvertimeClassificationRule()
    : null;
  const shortenedRule = shortenedWorkdayStatus.verified === true
    ? knowledgeBaseService.findShortenedWorkdayClassificationRule()
    : null;
  const sourceKnowledgeIds = unique([nightRule?.id, shortenedRule?.id]);
  const isNightAndShortened = nightWorkStatus.verified === true && shortenedWorkdayStatus.verified === true;
  const classificationType = isNightAndShortened
    ? 'night_work_and_shortened_workday_daily_overtime'
    : nightWorkStatus.verified === true
      ? 'night_work_daily_overtime'
      : 'shortened_workday_daily_overtime';

  if (unresolvedSpecialContexts.length > 0) {
    return {
      path: 'daily_overtime_classification',
      status: PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE,
      classificationType,
      isNightWork: nightWorkStatus.verified,
      nightWorkVerificationBasis: nightWorkStatus.basis,
      shortenedWorkdayRuleApplicable: shortenedWorkdayStatus.verified,
      shortenedWorkdayVerificationBasis: shortenedWorkdayStatus.basis,
      shortenedWorkdayContexts: shortenedWorkdayStatus.contexts,
      dailyHoursWorked,
      regularDailyHoursBoundary: null,
      regularNightWorkdayHoursBoundary: null,
      shortenedWorkdayBoundaryHours: null,
      nightWorkDailyOvertimeCandidateHours: null,
      shortenedDayOvertimeCandidateHours: null,
      dailyOvertimeCandidateHours: null,
      candidateExists: false,
      missingFacts: dailyHoursWorked === null ? ['dailyHoursWorked'] : [],
      blockers: unresolvedSpecialContexts.map((item) => `special_context:${item}`),
      sourceKnowledgeId: sourceKnowledgeIds[0] || null,
      sourceKnowledgeIds,
      doesNotProveNoOtherOvertime: true,
      doesNotUseFiveDayNineHourBoundaryForNightWork: true,
      doesNotUseSixDayEightHourBoundaryForNightWork: true,
      doesNotUseFiveDayNineHourBoundaryForShortenedDay: true,
      doesNotUseSixDayEightHourBoundaryForShortenedDay: true,
      doesNotCreateSixHourBoundaryWhenNightAndShortened: true,
    };
  }

  if (nightWorkStatus.verified !== true && shortenedWorkdayStatus.verified !== true) {
    return {
      path: 'daily_overtime_classification',
      status: PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE,
      classificationType: 'special_daily_overtime',
      isNightWork: nightWorkStatus.verified,
      nightWorkVerificationBasis: nightWorkStatus.basis,
      shortenedWorkdayRuleApplicable: shortenedWorkdayStatus.verified,
      shortenedWorkdayVerificationBasis: shortenedWorkdayStatus.basis,
      shortenedWorkdayContexts: shortenedWorkdayStatus.contexts,
      dailyHoursWorked,
      regularDailyHoursBoundary: null,
      regularNightWorkdayHoursBoundary: null,
      shortenedWorkdayBoundaryHours: null,
      nightWorkDailyOvertimeCandidateHours: null,
      shortenedDayOvertimeCandidateHours: null,
      dailyOvertimeCandidateHours: null,
      candidateExists: false,
      missingFacts: ['isNightWork', ...(dailyHoursWorked === null ? ['dailyHoursWorked'] : [])],
      blockers: ['night_work_verification_required'],
      sourceKnowledgeId: null,
      sourceKnowledgeIds: [],
      doesNotProveNoOtherOvertime: true,
      doesNotUseFiveDayNineHourBoundaryForNightWork: true,
      doesNotUseSixDayEightHourBoundaryForNightWork: true,
      doesNotUseFiveDayNineHourBoundaryForShortenedDay: true,
      doesNotUseSixDayEightHourBoundaryForShortenedDay: true,
      doesNotCreateSixHourBoundaryWhenNightAndShortened: true,
    };
  }

  if (dailyHoursWorked === null) {
    return {
      ...createBlockedPath('daily_overtime_classification', ['dailyHoursWorked']),
      classificationType: 'night_work_daily_overtime',
      isNightWork: nightWorkStatus.verified,
      nightWorkVerificationBasis: nightWorkStatus.basis,
      shortenedWorkdayRuleApplicable: shortenedWorkdayStatus.verified,
      shortenedWorkdayVerificationBasis: shortenedWorkdayStatus.basis,
      shortenedWorkdayContexts: shortenedWorkdayStatus.contexts,
      regularDailyHoursBoundary: null,
      regularNightWorkdayHoursBoundary: null,
      shortenedWorkdayBoundaryHours: null,
      nightWorkDailyOvertimeCandidateHours: null,
      shortenedDayOvertimeCandidateHours: null,
      dailyOvertimeCandidateHours: null,
      candidateExists: false,
      sourceKnowledgeId: sourceKnowledgeIds[0] || null,
      sourceKnowledgeIds,
      doesNotProveNoOtherOvertime: true,
      doesNotUseFiveDayNineHourBoundaryForNightWork: true,
      doesNotUseSixDayEightHourBoundaryForNightWork: true,
      doesNotUseFiveDayNineHourBoundaryForShortenedDay: true,
      doesNotUseSixDayEightHourBoundaryForShortenedDay: true,
      doesNotCreateSixHourBoundaryWhenNightAndShortened: true,
    };
  }

  const applicableDailyBoundary = 7;
  const candidateHours = Math.max(0, dailyHoursWorked - applicableDailyBoundary);

  return {
    path: 'daily_overtime_classification',
    status: PATH_STATUS.CLASSIFIED,
    classificationType,
    isNightWork: nightWorkStatus.verified,
    nightWorkVerificationBasis: nightWorkStatus.basis,
    shortenedWorkdayRuleApplicable: shortenedWorkdayStatus.verified,
    shortenedWorkdayVerificationBasis: shortenedWorkdayStatus.basis,
    shortenedWorkdayContexts: shortenedWorkdayStatus.contexts,
    dailyHoursWorked,
    regularDailyHoursBoundary: applicableDailyBoundary,
    applicableDailyBoundary,
    regularNightWorkdayHoursBoundary: nightWorkStatus.verified === true ? applicableDailyBoundary : null,
    shortenedWorkdayBoundaryHours: shortenedWorkdayStatus.verified === true ? applicableDailyBoundary : null,
    nightWorkDailyOvertimeCandidateHours: nightWorkStatus.verified === true ? candidateHours : null,
    shortenedDayOvertimeCandidateHours: shortenedWorkdayStatus.verified === true ? candidateHours : null,
    dailyOvertimeCandidateHours: candidateHours,
    candidateExists: candidateHours > 0,
    missingFacts: [],
    blockers: [],
    sourceKnowledgeId: sourceKnowledgeIds[0] || null,
    sourceKnowledgeIds,
    candidateOnly: true,
    doesNotProveNoOtherOvertime: true,
    belowWeekly42DoesNotProveNoNightWorkDailyOvertime: true,
    belowWeekly42DoesNotProveNoShortenedDayOvertime: true,
    weeklyRuleIndependent: true,
    doesNotUseFiveDayNineHourBoundaryForNightWork: true,
    doesNotUseSixDayEightHourBoundaryForNightWork: true,
    doesNotUseFiveDayNineHourBoundaryForShortenedDay: true,
    doesNotUseSixDayEightHourBoundaryForShortenedDay: true,
    doesNotCreateSixHourBoundaryWhenNightAndShortened: true,
  };
}

function resolveDailyClassification(context, specialContextDetected) {
  const workweekDays = toNumber(context.workweekDays);
  const dailyHoursWorked = toNumber(context.dailyHoursWorked);
  const workDayType = normalizeToken(context.workDayType || '');
  const nightWorkStatus = resolveNightWorkStatus(context);
  const shortenedWorkdayStatus = resolveShortenedWorkdayStatus(context);
  const hasNightWorkContext = specialContextDetected.includes('night_work');
  const hasShortenedWorkdayContext = (
    specialContextDetected.includes('shortened_workday')
    || specialContextDetected.includes('holiday_eve')
  );
  const unresolvedSpecialContexts = specialContextDetected
    .filter((item) => {
      if (item === 'night_work' && nightWorkStatus.verified === true) return false;
      if (['shortened_workday', 'holiday_eve'].includes(item) && shortenedWorkdayStatus.verified === true) return false;
      return true;
    });
  const missingFacts = [];

  if (workweekDays === null) missingFacts.push('workweekDays');
  if (dailyHoursWorked === null) missingFacts.push('dailyHoursWorked');
  if (!workDayType) missingFacts.push('workDayType');

  if (
    hasNightWorkContext
    || hasShortenedWorkdayContext
    || nightWorkStatus.verified === true
    || shortenedWorkdayStatus.verified === true
  ) {
    return resolveSpecialSevenHourDailyClassification(context, unresolvedSpecialContexts);
  }

  if (unresolvedSpecialContexts.length > 0) {
    return {
      path: 'daily_overtime_classification',
      status: PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE,
      workweekDays,
      dailyHoursWorked,
      workDayType: workDayType || null,
      regularDailyHoursBoundary: null,
      dailyOvertimeCandidateHours: null,
      candidateExists: false,
      missingFacts: unique(missingFacts),
      blockers: unresolvedSpecialContexts.map((item) => `special_context:${item}`),
      sourceKnowledgeId: null,
      doesNotProveNoOtherOvertime: true,
    };
  }

  if (missingFacts.length > 0) {
    return {
      ...createBlockedPath('daily_overtime_classification', missingFacts),
      workweekDays,
      dailyHoursWorked,
      workDayType: workDayType || null,
      regularDailyHoursBoundary: null,
      dailyOvertimeCandidateHours: null,
      candidateExists: false,
      doesNotProveNoOtherOvertime: true,
    };
  }

  if (workDayType !== 'regular') {
    return {
      ...createBlockedPath('daily_overtime_classification', [], [`unsupported_work_day_type:${workDayType}`]),
      workweekDays,
      dailyHoursWorked,
      workDayType,
      regularDailyHoursBoundary: null,
      dailyOvertimeCandidateHours: null,
      candidateExists: false,
      doesNotProveNoOtherOvertime: true,
    };
  }

  const rule = workweekDays === 5
    ? knowledgeBaseService.findFiveDayDailyOvertimeClassificationRule()
    : workweekDays === 6
      ? knowledgeBaseService.findSixDayDailyOvertimeClassificationRule()
      : null;

  if (!rule) {
    return {
      ...createBlockedPath('daily_overtime_classification', ['workweekDays'], [`unsupported_workweek_days:${workweekDays}`]),
      workweekDays,
      dailyHoursWorked,
      workDayType,
      regularDailyHoursBoundary: null,
      dailyOvertimeCandidateHours: null,
      candidateExists: false,
      doesNotProveNoOtherOvertime: true,
    };
  }

  const regularDailyHoursBoundary = rule.rule.regularDailyHoursBoundary;
  const dailyOvertimeCandidateHours = Math.max(0, dailyHoursWorked - regularDailyHoursBoundary);

  return {
    path: 'daily_overtime_classification',
    status: PATH_STATUS.CLASSIFIED,
    workweekDays,
    dailyHoursWorked,
    workDayType,
    regularDailyHoursBoundary,
    dailyOvertimeCandidateHours,
    candidateExists: dailyOvertimeCandidateHours > 0,
    missingFacts: [],
    blockers: [],
    sourceKnowledgeId: rule.id,
    candidateOnly: true,
    doesNotProveNoOtherOvertime: true,
    weeklyRuleIndependent: true,
  };
}

function resolveWeeklyClassification(context) {
  const weeklyHoursWorked = toNumber(context.weeklyHoursWorked);

  if (weeklyHoursWorked === null) {
    return {
      ...createBlockedPath('weekly_overtime_classification', ['weeklyHoursWorked']),
      weeklyHoursWorked: null,
      regularWeeklyHours: null,
      weeklyOvertimeCandidateHours: null,
      candidateExists: false,
      belowRegularWeeklyHoursDoesNotProveNoDailyOvertime: true,
    };
  }

  const rule = knowledgeBaseService.findWeeklyOvertimeClassificationRule();
  const regularWeeklyHours = rule.rule.regularWeeklyHours;
  const weeklyOvertimeCandidateHours = Math.max(0, weeklyHoursWorked - regularWeeklyHours);

  return {
    path: 'weekly_overtime_classification',
    status: PATH_STATUS.CLASSIFIED,
    weeklyHoursWorked,
    regularWeeklyHours,
    weeklyOvertimeCandidateHours,
    candidateExists: weeklyOvertimeCandidateHours > 0,
    missingFacts: [],
    blockers: [],
    sourceKnowledgeId: rule.id,
    candidateOnly: true,
    belowRegularWeeklyHoursDoesNotProveNoDailyOvertime: true,
    dailyRuleIndependent: true,
  };
}

function resolveWeeklyRestClassification(context) {
  const workOccurredDuringWeeklyRest = toBoolean(context.workOccurredDuringWeeklyRest);

  if (workOccurredDuringWeeklyRest === true) {
    const rule = knowledgeBaseService.findWeeklyRestWorkFoundationRule();
    return {
      path: 'weekly_rest_classification',
      status: PATH_STATUS.VERIFIED,
      workOccurredDuringWeeklyRest: true,
      missingFacts: [],
      blockers: [],
      sourceKnowledgeId: rule.id,
      classification: 'weekly_rest_work_verified',
      weeklyRestPayCalculated: false,
      doesNotInferFromSaturdayNationalityCountryOrLanguage: true,
    };
  }

  if (workOccurredDuringWeeklyRest === false) {
    return {
      path: 'weekly_rest_classification',
      status: PATH_STATUS.NOT_APPLICABLE,
      workOccurredDuringWeeklyRest: false,
      missingFacts: [],
      blockers: [],
      sourceKnowledgeId: null,
      classification: 'weekly_rest_work_not_applicable',
      weeklyRestPayCalculated: false,
      doesNotInferFromSaturdayNationalityCountryOrLanguage: true,
    };
  }

  return {
    ...createBlockedPath('weekly_rest_classification', ['workOccurredDuringWeeklyRest']),
    workOccurredDuringWeeklyRest: null,
    classification: 'weekly_rest_status_unknown',
    weeklyRestPayCalculated: false,
    doesNotInferFromSaturdayNationalityCountryOrLanguage: true,
  };
}

function collectSourceKnowledgeIds(paths) {
  return unique(paths.flatMap((path) => path.sourceKnowledgeIds || path.sourceKnowledgeId));
}

function classifyOverallStatus(paths, specialContextDetected) {
  const hasSpecialContextBlocker = paths.some((path) => (
    path.status === PATH_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE
  ));

  if (specialContextDetected.length > 0 && hasSpecialContextBlocker) {
    return OVERTIME_CLASSIFICATION_STATUS.SPECIAL_CONTEXT_REQUIRES_SEPARATE_RULE;
  }

  const hasClassifiedPath = paths.some((path) => [
    PATH_STATUS.CLASSIFIED,
    PATH_STATUS.VERIFIED,
    PATH_STATUS.NOT_APPLICABLE,
  ].includes(path.status));

  const hasBlockedPath = paths.some((path) => path.status === PATH_STATUS.BLOCKED);

  if (!hasClassifiedPath) return OVERTIME_CLASSIFICATION_STATUS.INSUFFICIENT_FACTS;
  if (hasBlockedPath) return OVERTIME_CLASSIFICATION_STATUS.PARTIALLY_CLASSIFIED;
  return OVERTIME_CLASSIFICATION_STATUS.CLASSIFIED;
}

function resolveOvertimeClassification(context = {}) {
  const specialContextDetected = normalizeSpecialDayContext(context);
  const dailyClassification = resolveDailyClassification(context, specialContextDetected);
  const weeklyClassification = resolveWeeklyClassification(context);
  const weeklyRestClassification = resolveWeeklyRestClassification(context);
  const paths = [dailyClassification, weeklyClassification, weeklyRestClassification];
  const dailyCandidate = dailyClassification.dailyOvertimeCandidateHours > 0;
  const weeklyCandidate = weeklyClassification.weeklyOvertimeCandidateHours > 0;
  const weeklyRestVerified = weeklyRestClassification.status === PATH_STATUS.VERIFIED;
  const aggregationRequired = dailyCandidate && weeklyCandidate;
  const weeklyRestOvertimeInteractionDetected = weeklyRestVerified && (dailyCandidate || weeklyCandidate);
  const interactionRule = weeklyRestOvertimeInteractionDetected
    ? knowledgeBaseService.findWeeklyRestOvertimeInteractionRule()
    : null;

  return {
    status: classifyOverallStatus(paths, specialContextDetected),
    dailyClassification,
    weeklyClassification,
    weeklyRestClassification,
    blockers: unique(paths.flatMap((path) => path.blockers || [])),
    missingFacts: unique(paths.flatMap((path) => path.missingFacts || [])),
    specialContextDetected,
    aggregationRequired,
    candidateHoursAggregated: false,
    doubleCountingResolutionPerformed: false,
    weeklyRestOvertimeInteractionDetected,
    weeklyRestOvertimeInteractionKnowledgeId: interactionRule?.id || null,
    overtimeSequenceWithinWorkday: context.overtimeSequenceWithinWorkday || null,
    overtimeSequenceInvented: false,
    compensation: {
      overtimePayCalculated: false,
      overtimeMultipliersInvoked: false,
      weeklyRestPayCalculated: false,
      weeklyRestMultiplierInvoked: false,
      combinedCompensationCalculated: false,
    },
    sourceKnowledgeIds: collectSourceKnowledgeIds([
      ...paths,
      { sourceKnowledgeId: interactionRule?.id || null },
    ]),
  };
}

module.exports = {
  OVERTIME_CLASSIFICATION_STATUS,
  PATH_STATUS,
  resolveOvertimeClassification,
};
