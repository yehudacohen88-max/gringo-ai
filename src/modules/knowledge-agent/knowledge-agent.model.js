function createQuestionContext({ question, userContext = {}, source = 'internal' } = {}) {
  return {
    question: question || '',
    userContext,
    source,
    receivedAt: new Date().toISOString(),
  };
}

function createKnowledgeResult({ status, category, answer = '', sources = [], event = null, handoff = null } = {}) {
  return {
    status,
    category,
    answer,
    sources,
    event,
    handoff,
  };
}

function createMissingKnowledgeEvent({ questionContext, category } = {}) {
  return {
    type: 'missing_knowledge',
    category,
    question: questionContext?.question || '',
    source: questionContext?.source || 'internal',
    createdAt: new Date().toISOString(),
  };
}

function createHumanHandoff({ questionContext, category } = {}) {
  return {
    type: 'human_handoff',
    category,
    message: 'This question needs a human review.',
    question: questionContext?.question || '',
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  createHumanHandoff,
  createKnowledgeResult,
  createMissingKnowledgeEvent,
  createQuestionContext,
};
