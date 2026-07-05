const { createMissingKnowledgeEvent } = require('./knowledge-agent.model');

async function recordMissingKnowledge(questionContext, category) {
  return {
    status: 'placeholder',
    event: createMissingKnowledgeEvent({
      questionContext,
      category,
    }),
  };
}

module.exports = {
  recordMissingKnowledge,
};
