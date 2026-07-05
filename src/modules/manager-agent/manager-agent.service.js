const managerRepository = require('./manager-agent.repository');

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function toDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isWithinDateRange(value, startDate, endDate) {
  const dateKey = toDateKey(value);
  if (!dateKey) return false;
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    if (!key) return counts;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function topCounts(counts, limit = 5) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label} (${count})`)
    .join(', ');
}

function includesAny(value, terms) {
  const normalized = String(value || '').toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function getDailyRange(options = {}) {
  const reportDate = options.reportDate || new Date().toISOString().slice(0, 10);
  return {
    reportDate,
    startDate: reportDate,
    endDate: reportDate,
  };
}

function getWeeklyRange(options = {}) {
  if (options.weekStart && options.weekEnd) {
    return {
      weekStart: options.weekStart,
      weekEnd: options.weekEnd,
    };
  }

  const today = new Date();
  const day = today.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

function summarizeQuestions(conversations) {
  return topCounts(countBy(conversations, (event) => event.question), 5);
}

function summarizeCategories(conversations) {
  return topCounts(countBy(conversations, (event) => event.category || 'Other'), 5);
}

function summarizeJobs(conversations) {
  const jobQuestions = conversations.filter((event) =>
    includesAny(`${event.question} ${event.category}`, ['job', 'work', 'worker', 'profession'])
  );
  return summarizeQuestions(jobQuestions);
}

function summarizeLocations(userProfiles, conversations) {
  const profileLocations = countBy(userProfiles, (profile) => profile.city);
  const locationMentions = countBy(conversations, (event) => {
    const question = String(event.question || '').toLowerCase();
    if (question.includes('tel aviv')) return 'Tel Aviv';
    if (question.includes('jerusalem')) return 'Jerusalem';
    if (question.includes('haifa')) return 'Haifa';
    if (question.includes('eilat')) return 'Eilat';
    return '';
  });

  return topCounts({ ...profileLocations, ...locationMentions }, 5);
}

function getMissingKnowledgeTopics(conversations) {
  const missing = conversations.filter((event) => String(event.status).toUpperCase() === 'NOT_FOUND');
  return topCounts(countBy(missing, (event) => event.category || event.question), 5);
}

function getNeedsHumanCount(conversations) {
  return conversations.filter(
    (event) =>
      String(event.status).toUpperCase() === 'NEEDS_HUMAN' ||
      String(event.needsHumanFollowUp).toLowerCase() === 'true'
  ).length;
}

function createDailyReport({ reportDate, conversations, userProfiles }) {
  const unansweredQuestions = conversations.filter((event) => String(event.status).toUpperCase() === 'NOT_FOUND');
  const newUsers = userProfiles.filter((profile) => toDateKey(profile.createdAt) === reportDate);
  const activeUserIds = new Set(conversations.map((event) => event.userId).filter(Boolean));

  return {
    reportId: generateId('daily'),
    reportDate,
    totalConversations: conversations.length,
    newUsers: newUsers.length,
    activeUsers: activeUserIds.size,
    mostCommonQuestions: summarizeQuestions(conversations),
    topCategories: summarizeCategories(conversations),
    unansweredQuestions: unansweredQuestions.length,
    needsHumanQuestions: getNeedsHumanCount(conversations),
    missingKnowledgeTopics: getMissingKnowledgeTopics(conversations),
    mostRequestedJobs: summarizeJobs(conversations),
    mostRequestedLocations: summarizeLocations(userProfiles, conversations),
    moneyTransferRequests: conversations.filter((event) =>
      includesAny(`${event.question} ${event.category}`, ['money', 'transfer'])
    ).length,
    exchangeRateRequests: conversations.filter((event) =>
      includesAny(`${event.question} ${event.category}`, ['exchange', 'rate'])
    ).length,
    createdAt: new Date().toISOString(),
  };
}

async function generateDailySummary(options = {}) {
  const { reportDate, startDate, endDate } = getDailyRange(options);
  const [allConversations, allUserProfiles] = await Promise.all([
    managerRepository.readConversationHistory(),
    managerRepository.readUserProfiles(),
  ]);
  const conversations = allConversations.filter((event) => isWithinDateRange(event.createdAt, startDate, endDate));
  const userProfiles = allUserProfiles.filter((profile) =>
    isWithinDateRange(profile.lastInteractionAt || profile.createdAt, startDate, endDate)
  );
  const report = createDailyReport({ reportDate, conversations, userProfiles });

  return managerRepository.saveDailyReport(report);
}

async function generateWeeklySummary(options = {}) {
  const { weekStart, weekEnd } = getWeeklyRange(options);
  const [allConversations, allUserProfiles] = await Promise.all([
    managerRepository.readConversationHistory(),
    managerRepository.readUserProfiles(),
  ]);
  const conversations = allConversations.filter((event) => isWithinDateRange(event.createdAt, weekStart, weekEnd));
  const users = allUserProfiles.filter((profile) => isWithinDateRange(profile.createdAt, weekStart, weekEnd));
  const report = {
    reportId: generateId('weekly'),
    weekStart,
    weekEnd,
    growth: `${users.length} new users, ${conversations.length} conversations`,
    trends: summarizeCategories(conversations) || 'No trends yet',
    recurringProblems: getMissingKnowledgeTopics(conversations) || 'No recurring problems yet',
    communityOpportunities: summarizeJobs(conversations) || 'No clear opportunities yet',
    createdAt: new Date().toISOString(),
  };

  return managerRepository.saveWeeklyReport(report);
}

async function generateRecommendations(options = {}) {
  const dailyReport = options.dailyReport || (await generateDailySummary(options));
  const recommendations = [];

  if (dailyReport.missingKnowledgeTopics) {
    recommendations.push({
      recommendationId: generateId('rec'),
      type: 'knowledge',
      title: `Need new knowledge for ${dailyReport.missingKnowledgeTopics}`,
      reason: 'Users asked questions that were not answered.',
      priority: 'high',
      sourceReportId: dailyReport.reportId,
      createdAt: new Date().toISOString(),
    });
  }

  if (Number(dailyReport.moneyTransferRequests) > 0) {
    recommendations.push({
      recommendationId: generateId('rec'),
      type: 'content',
      title: 'Create article about money transfer options',
      reason: 'Users asked about money transfer.',
      priority: 'normal',
      sourceReportId: dailyReport.reportId,
      createdAt: new Date().toISOString(),
    });
  }

  if (dailyReport.mostRequestedJobs) {
    recommendations.push({
      recommendationId: generateId('rec'),
      type: 'community',
      title: `High demand for ${dailyReport.mostRequestedJobs}`,
      reason: 'Job-related questions appeared in conversations.',
      priority: 'normal',
      sourceReportId: dailyReport.reportId,
      createdAt: new Date().toISOString(),
    });
  }

  const saved = [];
  for (const recommendation of recommendations) {
    saved.push(await managerRepository.saveRecommendation(recommendation));
  }

  return saved;
}

module.exports = {
  generateDailySummary,
  generateRecommendations,
  generateWeeklySummary,
};
