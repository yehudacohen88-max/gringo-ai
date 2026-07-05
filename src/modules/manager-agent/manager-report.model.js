const DAILY_REPORT_FIELDS = [
  'reportId',
  'reportDate',
  'totalConversations',
  'newUsers',
  'activeUsers',
  'mostCommonQuestions',
  'topCategories',
  'unansweredQuestions',
  'needsHumanQuestions',
  'missingKnowledgeTopics',
  'mostRequestedJobs',
  'mostRequestedLocations',
  'moneyTransferRequests',
  'exchangeRateRequests',
  'createdAt',
];

const WEEKLY_REPORT_FIELDS = [
  'reportId',
  'weekStart',
  'weekEnd',
  'growth',
  'trends',
  'recurringProblems',
  'communityOpportunities',
  'createdAt',
];

const RECOMMENDATION_FIELDS = [
  'recommendationId',
  'type',
  'title',
  'reason',
  'priority',
  'sourceReportId',
  'createdAt',
];

module.exports = {
  DAILY_REPORT_FIELDS,
  RECOMMENDATION_FIELDS,
  WEEKLY_REPORT_FIELDS,
};
