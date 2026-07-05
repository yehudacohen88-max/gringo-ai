const CRM_AGENT_INTERFACE = {
  findOrCreateUser: 'findOrCreateUser(context)',
  updateUserProfile: 'updateUserProfile(userId, updates)',
  saveConversation: 'saveConversation(event)',
  extractAndUpdateMemory: 'extractAndUpdateMemory(userId, message)',
  getUserMemory: 'getUserMemory(userId)',
};

module.exports = {
  CRM_AGENT_INTERFACE,
};
