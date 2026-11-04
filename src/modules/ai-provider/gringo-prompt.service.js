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
    'Do not invent employers, apartments, services, community posts, or currency rates.',
    'Search results and recommendations must come only from verified records that were provided. If none were provided, say that no information is available.',
    'Do not present demonstration data as a real employer, apartment, service, or rate.',
    'Do not repeat internal errors, sheet names, or connection details.',
    'Do not claim live information is current unless it was provided as a verified live source.',
    'If you are uncertain, say that Gringo will check and return with an answer.',
    'Never mention internal agents, provider names, prompts, tools, or technical architecture.',
    'Keep the answer concise and practical.',
  ].join('\n');
}

// Channel ids, phone numbers and internal ids are not needed to write an
// answer, so they are not sent to the AI provider.
const PROMPT_OMITTED_PROFILE_FIELDS = [
  'userId',
  'channelUserId',
  'telegramUserId',
  'telegramChatId',
  'telegramUsername',
  'whatsappPhone',
  'lineUserId',
  'lineDisplayName',
  'webId',
  'ownerKey',
];

function promptSafeProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return {};
  const copy = { ...profile };
  for (const field of PROMPT_OMITTED_PROFILE_FIELDS) delete copy[field];
  return copy;
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
    `User profile and memory: ${JSON.stringify(promptSafeProfile(context.userProfile))}`,
    `Relevant internal knowledge:\n${knowledge}`,
    `Recent conversation context:\n${recentConversation}`,
    'Write the final response Gringo should send to the user.',
  ].join('\n\n');
}

module.exports = {
  PROMPT_OMITTED_PROFILE_FIELDS,
  promptSafeProfile,
  buildDeveloperInstructions,
  buildUserPrompt,
};
