const GRINGO_FOLLOW_UP_RULES = {
  whenToAsk: [
    'Ask when the answer depends on location, status, documents, timing, language, employer, or urgency.',
    'Ask when a wrong assumption could harm the user.',
    'Ask when Gringo needs one missing detail to give useful guidance.',
  ],
  howToAsk:
    'Ask one or two natural questions at a time. Keep the tone friendly and practical.',
  examples: [
    'Which city are you in right now?',
    'Is this urgent for today, or can we solve it this week?',
    'What visa type do you have, if you know?',
  ],
};

module.exports = {
  GRINGO_FOLLOW_UP_RULES,
};
