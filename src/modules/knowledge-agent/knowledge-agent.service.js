const { KNOWLEDGE_RESULT_STATUS } = require('./knowledge-agent.constants');
const { classifyQuestion } = require('./knowledge-classifier.service');
const { findRelevantKnowledge, searchKnowledgeBase } = require('./knowledge-base.service');
const { recordMissingKnowledge } = require('./missing-knowledge.service');
const { createHandoffResponse } = require('./handoff.service');

async function answerQuestion(questionContext) {
  const classification = await classifyQuestion(questionContext);
  const searchResult = await searchKnowledgeBase(classification);

  if (searchResult.status === KNOWLEDGE_RESULT_STATUS.FOUND) {
    return {
      status: KNOWLEDGE_RESULT_STATUS.FOUND,
      category: searchResult.category || classification.category,
      answer: searchResult.answer,
      sources: searchResult.matches,
      relevantKnowledge: searchResult.relevantKnowledge || [],
    };
  }

  if (searchResult.status === KNOWLEDGE_RESULT_STATUS.NEEDS_HUMAN) {
    return {
      status: KNOWLEDGE_RESULT_STATUS.NEEDS_HUMAN,
      category: classification.category,
      answer: '',
      relevantKnowledge: searchResult.relevantKnowledge || [],
      handoff: await createHandoffResponse(questionContext, classification.category),
    };
  }

  return {
    status: KNOWLEDGE_RESULT_STATUS.NOT_FOUND,
    category: classification.category,
    answer: '',
    relevantKnowledge: searchResult.relevantKnowledge || [],
    event: await recordMissingKnowledge(questionContext, classification.category),
  };
}

module.exports = {
  answerQuestion,
  classifyQuestion,
  createHandoffResponse,
  findRelevantKnowledge,
  recordMissingKnowledge,
  searchKnowledgeBase,
};
