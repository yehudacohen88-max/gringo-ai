const COMMUNITY_COMMENT_FIELDS = [
  'commentId',
  'postId',
  'userId',
  'userName',
  'body',
  'language',
  'status',
  'createdAt',
];

const COMMUNITY_COMMENT_STATUSES = ['Published', 'Hidden', 'Flagged'];

module.exports = {
  COMMUNITY_COMMENT_FIELDS,
  COMMUNITY_COMMENT_STATUSES,
};
