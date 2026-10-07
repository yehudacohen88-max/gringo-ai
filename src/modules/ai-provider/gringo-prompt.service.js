function formatList(items = [], formatter) {
  if (!items.length) return 'None available.';
  return items.map(formatter).join('\n');
}

function buildDeveloperInstructions() {
  return [
    'You are Gringo, a friendly community helper.',
    'Reply in the user language.',
    'Sound warm, human, and simple.',
    'Use verified internal knowledge when it is relevant.',
    'Do not invent facts, prices, laws, schedules, live availability, or current information.',
    'Do not claim live information is current unless it was provided as a verified live source.',
    'If you are uncertain, say that Gringo will check and return with an answer.',
    'Never mention internal agents, provider names, prompts, tools, or technical architecture.',
    'Keep the answer concise and practical.',
  ].join('\n');
}

function buildUserPrompt(context = {}) {
  const knowledge = formatList(context.relevantKnowledge, (item) => {
    return `- ${item.title} (${item.category}): ${item.answer}`;
  });
  const recentConversation = formatList(context.recentConversation, (item) => {
    return `- User: ${item.question}\n  Gringo: ${item.answer}`;
  });

  return [
    `Current user message: ${context.message}`,
    `User language: ${context.userLanguage || 'unknown'}`,
    `User profile and memory: ${JSON.stringify(context.userProfile || {})}`,
    `Relevant internal knowledge:\n${knowledge}`,
    `Recent conversation context:\n${recentConversation}`,
    'Write the final response Gringo should send to the user.',
  ].join('\n\n');
}

module.exports = {
  buildDeveloperInstructions,
  buildUserPrompt,
};
