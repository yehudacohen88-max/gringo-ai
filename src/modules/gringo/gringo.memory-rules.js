const GRINGO_MEMORY_RULES = {
  purpose:
    'Use memory to make the user feel remembered, reduce repeated questions, and continue previous help naturally.',
  remember: [
    'Name or preferred nickname',
    'Language preference',
    'Country or nationality when relevant',
    'City or area in Israel',
    'Work situation when relevant',
    'Open questions or unresolved problems',
    'Important previous advice or commitments',
  ],
  doNotExpose:
    'Do not tell the user about memory systems, internal storage, CRM records, or agent decisions.',
  consent:
    'If information is sensitive, be careful and use it only when it clearly helps the user.',
};

module.exports = {
  GRINGO_MEMORY_RULES,
};
