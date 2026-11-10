const { knowledgeSafeForAi } = require('../knowledge-agent/legal-verification');

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
    'If you are uncertain, say clearly that you cannot confirm the answer. Never promise to check, follow up, get back, or send an answer later: no follow-up is sent.',
    'For legal rights (leave, wages, visas, dismissal), give only careful general guidance without exact figures unless they were provided as verified knowledge, say it is not legal advice, and point to official sources: Kav LaOved (kavlaoved.org.il), the Population and Immigration Authority or the Ministry of Labor (gov.il).',
    'Never mention internal agents, provider names, prompts, tools, or technical architecture.',
    'Keep the answer concise and practical.',
  ].join('\n');
}

// Only the profile fields an answer needs are sent to the AI provider (an
// allowlist, so a new profile column is not sent by default). Names, channel
// ids, phone numbers, employer, exact area, budgets and transfer amounts are
// left out. The city, sector and goals stay: answers about jobs, housing,
// documents and money depend on them.
const PROMPT_PROFILE_FIELDS = [
  'language',
  'preferredLanguage',
  'country',
  'city',
  'profession',
  'workSector',
  'interests',
  'activeGoals',
  'lookingForJob',
  'preferredJobCity',
  'preferredJobProfession',
  'lookingForHousing',
  'preferredHousingCity',
  'preferredHousingType',
  'preferredCurrency',
  'interestedInMoneyTransfers',
  'moneyTransferCountry',
  'documentsComplete',
  'missingDocumentTypes',
  'expiringDocumentCount',
  'expiredDocumentCount',
];

// Kept for tests and documentation: fields that must never reach the prompt.
const PROMPT_OMITTED_PROFILE_FIELDS = [
  'userId',
  'channelUserId',
  'fullName',
  'telegramUserId',
  'telegramChatId',
  'telegramUsername',
  'whatsappPhone',
  'lineUserId',
  'lineDisplayName',
  'webId',
  'ownerKey',
  'currentEmployer',
  'preferredHousingArea',
  'maximumHousingBudget',
  'maximumMonthlyBudget',
  'lastMoneyTransferAmount',
  'lastQuestion',
  'nextDocumentExpiryDate',
];

const PROMPT_HISTORY_TURNS = 3;
const PROMPT_HISTORY_CHARS = 300;

function promptSafeProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return {};
  const safe = {};
  for (const field of PROMPT_PROFILE_FIELDS) {
    const value = profile[field];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    safe[field] = typeof value === 'string' ? redactContactDetails(value) : value;
  }
  return safe;
}

// Phone numbers, emails and long id numbers typed into a message are not
// needed for an answer. Amounts like 1500 or 25,000 stay.
function redactContactDetails(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (match) => (match.replace(/\D/g, '').length >= 9 ? '[number]' : match));
}

function clip(text, limit) {
  const value = redactContactDetails(text);
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function buildUserPrompt(context = {}) {
  const knowledge = formatList(knowledgeSafeForAi(context.relevantKnowledge), (item) => {
    return `- ${item.title} (${item.category}): ${item.answer}`;
  });
  const history = Array.isArray(context.recentConversation) ? context.recentConversation.slice(-PROMPT_HISTORY_TURNS) : [];
  const recentConversation = formatList(history, (item) => {
    return `- User: ${clip(item.question, PROMPT_HISTORY_CHARS)}\n  Gringo: ${clip(item.answer, PROMPT_HISTORY_CHARS)}`;
  });

  return [
    `Current user message: ${redactContactDetails(context.message)}`,
    `User language: ${context.userLanguage || 'unknown'}`,
    `User profile and memory: ${JSON.stringify(promptSafeProfile(context.userProfile))}`,
    `Relevant internal knowledge:\n${knowledge}`,
    `Recent conversation context:\n${recentConversation}`,
    'Write the final response Gringo should send to the user.',
  ].join('\n\n');
}

module.exports = {
  PROMPT_HISTORY_TURNS,
  PROMPT_OMITTED_PROFILE_FIELDS,
  PROMPT_PROFILE_FIELDS,
  redactContactDetails,
  promptSafeProfile,
  buildDeveloperInstructions,
  buildUserPrompt,
};
