const KNOWLEDGE_AGENT_INTERFACE = {
  answerQuestion: 'answerQuestion(questionContext)',
  classifyQuestion: 'classifyQuestion(questionContext)',
  searchKnowledgeBase: 'searchKnowledgeBase(classifiedQuestion)',
  createMissingKnowledgeEvent: 'createMissingKnowledgeEvent(questionContext)',
  createHandoffResponse: 'createHandoffResponse(questionContext)',
};

module.exports = {
  KNOWLEDGE_AGENT_INTERFACE,
};
