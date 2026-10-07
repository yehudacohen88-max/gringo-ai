const contentRepository = require('./content-agent.repository');
const { CONTENT_DRAFT_STATUS, CONTENT_TYPES } = require('./content-draft.model');
const communityService = require('../community/community.service');

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeTopic(value) {
  return cleanText(value).toLowerCase();
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    if (!key) return counts;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function toTopicList(counts, minimumCount = 2) {
  return Object.entries(counts)
    .filter(([, count]) => count >= minimumCount)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({
      topic,
      count,
    }));
}

function detectCategoryTopic(event) {
  const category = cleanText(event.category);
  if (category) return category;

  const question = normalizeTopic(event.question);
  if (question.includes('job') || question.includes('work')) return 'Jobs';
  if (question.includes('rent') || question.includes('apartment') || question.includes('house')) return 'Housing';
  if (question.includes('money') || question.includes('transfer')) return 'Money Transfer';
  if (question.includes('exchange') || question.includes('rate')) return 'Exchange Rates';
  if (question.includes('visa') || question.includes('document')) return 'Documents';
  return 'Other';
}

function recommendationToTopic(recommendation) {
  return {
    topic: cleanText(recommendation.title),
    category: cleanText(recommendation.type) || 'Community',
    source: 'recommendation',
    count: 1,
  };
}

async function readManagerRecommendations() {
  return contentRepository.readManagerRecommendations();
}

async function readConversationHistory() {
  return contentRepository.readConversationHistory();
}

async function detectRecurringTopics(options = {}) {
  const conversations = options.conversations || (await readConversationHistory());
  const recommendations = options.recommendations || (await readManagerRecommendations());
  const categoryCounts = countBy(conversations, detectCategoryTopic);
  const questionCounts = countBy(conversations, (event) => cleanText(event.question));
  const recurringCategories = toTopicList(categoryCounts, options.minimumCount || 2).map((item) => ({
    ...item,
    category: item.topic,
    source: 'conversation-category',
  }));
  const recurringQuestions = toTopicList(questionCounts, options.minimumCount || 2).map((item) => ({
    ...item,
    category: detectCategoryTopic({ question: item.topic }),
    source: 'conversation-question',
  }));
  const recommendationTopics = recommendations.map(recommendationToTopic);

  return [...recommendationTopics, ...recurringCategories, ...recurringQuestions].filter((item) => item.topic);
}

function chooseContentType(topic) {
  const normalized = normalizeTopic(`${topic.topic} ${topic.category}`);

  if (normalized.includes('news')) return 'News Summary';
  if (normalized.includes('tip') || normalized.includes('advice')) return 'Tips';
  if (normalized.includes('daily')) return 'Daily Advice';
  if (normalized.includes('question') || normalized.includes('knowledge')) return 'FAQ';
  return 'Community Post';
}

function createTemplateBody(topic, contentType) {
  const label = topic.topic;

  if (contentType === 'FAQ') {
    return `Question: ${label}\n\nShort answer: We are preparing a clear answer for the community.\n\nWhat to do next: Save this topic, check reliable information, and publish a simple explanation.`;
  }

  if (contentType === 'Tips') {
    return `Here are practical tips about ${label}:\n\n1. Check the details before making a decision.\n2. Ask for help if something is unclear.\n3. Keep documents and messages organized.`;
  }

  if (contentType === 'Daily Advice') {
    return `Today's advice: ${label} is coming up often in the community. Take it step by step, check the facts, and do not rush important decisions.`;
  }

  if (contentType === 'News Summary') {
    return `Community news summary about ${label}:\n\nPeople are asking about this topic. Gringo should prepare a simple update when verified information is available.`;
  }

  return `Many people in the community are asking about ${label}.\n\nGringo should prepare a simple post that explains the issue, what people should check, and what the next step should be.`;
}

function generateDraftFromTemplate(topic, contentType = '') {
  const selectedType = CONTENT_TYPES.includes(contentType) ? contentType : chooseContentType(topic);
  const category = cleanText(topic.category) || 'Community';
  const title = `${selectedType}: ${topic.topic}`;
  const createdAt = new Date().toISOString();

  return {
    draftId: generateId('draft'),
    contentType: selectedType,
    title,
    category,
    language: 'English',
    audience: 'Gringo Community',
    summary: `Template draft based on recurring topic: ${topic.topic}.`,
    body: createTemplateBody(topic, selectedType),
    sourceTopics: topic.topic,
    createdAt,
    status: CONTENT_DRAFT_STATUS.DRAFT,
  };
}

async function generateContentDrafts(options = {}) {
  const topics = options.topics || (await detectRecurringTopics(options));
  const limit = options.limit || 10;
  const drafts = topics.slice(0, limit).map((topic) => generateDraftFromTemplate(topic, options.contentType));
  const savedDrafts = [];

  for (const draft of drafts) {
    savedDrafts.push(await contentRepository.saveContentDraft(draft));
  }

  return savedDrafts;
}

async function publishApprovedDraftToCommunity(draftId) {
  const drafts = await contentRepository.readContentDrafts();
  const draft = drafts.find((item) => item.draftId === draftId);
  return communityService.publishApprovedDraft(draft);
}

module.exports = {
  detectRecurringTopics,
  generateContentDrafts,
  generateDraftFromTemplate,
  publishApprovedDraftToCommunity,
  readConversationHistory,
  readManagerRecommendations,
};
