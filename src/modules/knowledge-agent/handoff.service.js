const { createHumanHandoff } = require('./knowledge-agent.model');

async function createHandoffResponse(questionContext, category) {
  return {
    status: 'placeholder',
    handoff: createHumanHandoff({
      questionContext,
      category,
    }),
  };
}

module.exports = {
  createHandoffResponse,
};
