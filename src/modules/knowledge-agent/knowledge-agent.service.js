const { KNOWLEDGE_RESULT_STATUS } = require('./knowledge-agent.constants');
const { classifyQuestion } = require('./knowledge-classifier.service');
const { findRelevantKnowledge, searchKnowledgeBase } = require('./knowledge-base.service');
const { knowledgeSafeForAi } = require('./legal-verification');
const { recordMissingKnowledge } = require('./missing-knowledge.service');
const { createHandoffResponse } = require('./handoff.service');

async function answerQuestion(questionContext) {
  const classification = await classifyQuestion(questionContext);
  const searchResult = await searchKnowledgeBase(classification);
  const relevantKnowledge = knowledgeSafeForAi(searchResult.relevantKnowledge || []);
  const legalFallback = Boolean(searchResult.legalFallback);

  if (legalFallback) {
    return {
      status: KNOWLEDGE_RESULT_STATUS.NOT_FOUND,
      legalFallback: true,
      category: searchResult.category || classification.category,
      answer: '',
      relevantKnowledge: [],
      withheldUnverifiedIds: searchResult.withheldUnverifiedIds || [],
      event: await recordMissingKnowledge(questionContext, classification.category),
    };
  }

  if (searchResult.status === KNOWLEDGE_RESULT_STATUS.FOUND) {
    return {
      status: KNOWLEDGE_RESULT_STATUS.FOUND,
      legalFallback: false,
      category: searchResult.category || classification.category,
      answer: searchResult.answer,
      sources: searchResult.matches,
      relevantKnowledge,
      withheldUnverifiedIds: searchResult.withheldUnverifiedIds || [],
    };
  }

  if (searchResult.status === KNOWLEDGE_RESULT_STATUS.NEEDS_HUMAN) {
    return {
      status: KNOWLEDGE_RESULT_STATUS.NEEDS_HUMAN,
      legalFallback: false,
      category: classification.category,
      answer: '',
      relevantKnowledge,
      handoff: await createHandoffResponse(questionContext, classification.category),
    };
  }

  return {
    status: KNOWLEDGE_RESULT_STATUS.NOT_FOUND,
    legalFallback: false,
    category: classification.category,
    answer: '',
    relevantKnowledge,
    withheldUnverifiedIds: searchResult.withheldUnverifiedIds || [],
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
