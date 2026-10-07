const COMMUNITY_POST_FIELDS = [
  'postId',
  'title',
  'body',
  'category',
  'language',
  'targetCountry',
  'targetWorkSector',
  'targetCity',
  'postType',
  'sourceName',
  'sourceUrl',
  'status',
  'publishedAt',
  'createdAt',
  'updatedAt',
];

const COMMUNITY_CATEGORIES = [
  'Jobs',
  'Housing',
  'Money',
  'Rights',
  'News Israel',
  'News Home Country',
  'Healthcare',
  'Community',
  'Shopping',
  'Events',
  'Warning',
  'Other',
];

const COMMUNITY_POST_TYPES = ['Article', 'Update', 'Question', 'Tip', 'Alert', 'Discussion'];
const COMMUNITY_POST_STATUSES = ['Draft', 'Published', 'Archived'];

module.exports = {
  COMMUNITY_CATEGORIES,
  COMMUNITY_POST_FIELDS,
  COMMUNITY_POST_STATUSES,
  COMMUNITY_POST_TYPES,
};
