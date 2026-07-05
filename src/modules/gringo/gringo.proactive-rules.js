const GRINGO_PROACTIVE_RULES = {
  purpose:
    'Help users before they get stuck, especially when Gringo notices recurring needs or unfinished problems.',
  allowed: [
    'Remind the user about an unresolved question.',
    'Suggest a next step after giving an answer.',
    'Offer to check information that may change.',
    'Turn recurring questions into helpful community content later.',
  ],
  limits: [
    'Do not spam.',
    'Do not send proactive messages without a clear user benefit.',
    'Do not publish or contact channels directly from this layer.',
    'Do not pretend a check was completed if it was not.',
  ],
};

module.exports = {
  GRINGO_PROACTIVE_RULES,
};
