const CONTENT_TYPES = ['FAQ', 'Community Post', 'News Summary', 'Tips', 'Daily Advice'];

const CONTENT_DRAFT_STATUS = {
  DRAFT: 'Draft',
};

const CONTENT_DRAFT_FIELDS = [
  'draftId',
  'contentType',
  'title',
  'category',
  'language',
  'audience',
  'summary',
  'body',
  'sourceTopics',
  'createdAt',
  'status',
];

module.exports = {
  CONTENT_DRAFT_FIELDS,
  CONTENT_DRAFT_STATUS,
  CONTENT_TYPES,
};
