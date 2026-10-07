const HUMAN_FOLLOW_UP_FIELDS = [
  'followUpId',
  'conversationId',
  'userId',
  'userName',
  'question',
  'language',
  'category',
  'context',
  'humanAnswer',
  'status',
  'createdAt',
  'updatedAt',
];

const ADMIN_NOTE_FIELDS = ['noteId', 'reportId', 'body', 'createdAt', 'updatedAt'];

const KNOWLEDGE_DRAFT_FIELDS = [
  'knowledgeDraftId',
  'sourceType',
  'sourceId',
  'question',
  'answer',
  'category',
  'language',
  'status',
  'createdAt',
  'updatedAt',
];

const HUMAN_FOLLOW_UP_STATUSES = ['New', 'In Review', 'Answered', 'Closed'];
const KNOWLEDGE_DRAFT_STATUSES = ['Draft', 'In Review', 'Approved', 'Published', 'Ignored'];

module.exports = {
  ADMIN_NOTE_FIELDS,
  HUMAN_FOLLOW_UP_FIELDS,
  HUMAN_FOLLOW_UP_STATUSES,
  KNOWLEDGE_DRAFT_FIELDS,
  KNOWLEDGE_DRAFT_STATUSES,
};
