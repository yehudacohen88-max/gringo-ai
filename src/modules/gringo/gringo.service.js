const { GRINGO_PERSONALITY } = require('./gringo.personality');
const { GRINGO_TONE } = require('./gringo.tone');
const { GRINGO_CONVERSATION_RULES } = require('./gringo.conversation-rules');
const { GRINGO_GREETING_RULES } = require('./gringo.greeting-rules');
const { GRINGO_MEMORY_RULES } = require('./gringo.memory-rules');
const { GRINGO_FOLLOW_UP_RULES } = require('./gringo.follow-up-rules');
const { GRINGO_PROACTIVE_RULES } = require('./gringo.proactive-rules');

function getPersonalityProfile() {
  return GRINGO_PERSONALITY;
}

function getConversationPolicy() {
  return {
    tone: GRINGO_TONE,
    conversationRules: GRINGO_CONVERSATION_RULES,
    greetingRules: GRINGO_GREETING_RULES,
    memoryRules: GRINGO_MEMORY_RULES,
    followUpRules: GRINGO_FOLLOW_UP_RULES,
    proactiveRules: GRINGO_PROACTIVE_RULES,
  };
}

function getPublicResponseRules() {
  return {
    publicName: GRINGO_PERSONALITY.publicName,
    neverExposeInternalArchitecture: true,
    neverUseInternalLabelsWithUsers: ['AI', 'Assistant', 'Bot', 'Agent'],
    defaultTone: GRINGO_TONE.style,
  };
}

module.exports = {
  getConversationPolicy,
  getPersonalityProfile,
  getPublicResponseRules,
};
