const { crmAgentService } = require('../crm-agent');
const { knowledgeAgentService } = require('../knowledge-agent');

async function receiveMessage(messageContext) {
  return {
    status: 'placeholder',
    agent: 'core-agent',
    nextStep: 'knowledge-agent',
    messageContext,
  };
}

async function routeMessage(messageContext) {
  return {
    status: 'placeholder',
    agent: 'core-agent',
    route: 'knowledge-agent',
    messageContext,
  };
}

async function coordinateAgents(agentContext) {
  const user = await crmAgentService.findOrCreateUser(agentContext.userContext || {});
  await crmAgentService.saveConversation({
    userId: user.userId,
    channel: user.channel,
    question: agentContext.question,
    answer: agentContext.answer,
    category: agentContext.category,
    status: agentContext.status,
    needsHumanFollowUp: agentContext.needsHumanFollowUp,
  });
  await crmAgentService.extractAndUpdateMemory(user.userId, agentContext.question || '');

  return {
    status: 'placeholder',
    agent: 'core-agent',
    crmAgent: {
      userId: user.userId,
      conversationSaved: true,
      memoryUpdated: true,
    },
    agentContext,
  };
}

async function processWebMessage(messageContext = {}) {
  const question = String(messageContext.message || '').trim();
  const channel = messageContext.channel || 'web';
  const channelUserId = messageContext.channelUserId || 'local-web-user';
  const userContext = {
    channel,
    channelUserId,
    fullName: messageContext.fullName || '',
    language: messageContext.language || '',
  };
  const knowledgeResult = await knowledgeAgentService.answerQuestion({
    question,
    userContext,
    source: channel,
  });
  let reply = knowledgeResult.answer;

  if (knowledgeResult.status === 'NOT_FOUND') {
    reply = "I don’t know yet, but I’ll check and come back with an answer.";
  }

  if (knowledgeResult.status === 'NEEDS_HUMAN') {
    reply = 'I’ll ask someone from the Gringo team to help with this.';
  }

  const crm = {
    attempted: true,
    saved: false,
    memoryUpdated: false,
    error: '',
  };

  try {
    const user = await crmAgentService.findOrCreateUser(userContext);
    await crmAgentService.saveConversation({
      userId: user.userId,
      channel,
      question,
      answer: reply,
      category: knowledgeResult.category,
      status: knowledgeResult.status,
      needsHumanFollowUp: knowledgeResult.status === 'NEEDS_HUMAN',
    });
    await crmAgentService.extractAndUpdateMemory(user.userId, question);
    crm.saved = true;
    crm.memoryUpdated = true;
    crm.userId = user.userId;
  } catch (error) {
    crm.error = error.message;
  }

  return {
    reply,
    category: knowledgeResult.category,
    status: knowledgeResult.status,
    crm,
  };
}

module.exports = {
  coordinateAgents,
  processWebMessage,
  receiveMessage,
  routeMessage,
};
