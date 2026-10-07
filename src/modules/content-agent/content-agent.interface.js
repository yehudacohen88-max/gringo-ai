const CONTENT_AGENT_INTERFACE = {
  readManagerRecommendations: 'readManagerRecommendations()',
  readConversationHistory: 'readConversationHistory()',
  detectRecurringTopics: 'detectRecurringTopics(options)',
  generateContentDrafts: 'generateContentDrafts(options)',
  generateDraftFromTemplate: 'generateDraftFromTemplate(topic, contentType)',
  publishApprovedDraftToCommunity: 'publishApprovedDraftToCommunity(draftId)',
};

module.exports = {
  CONTENT_AGENT_INTERFACE,
};
