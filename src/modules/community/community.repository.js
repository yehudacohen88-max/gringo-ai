const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { COMMUNITY_COMMENT_FIELDS } = require('./community-comment.model');
const { COMMUNITY_POST_FIELDS } = require('./community-post.model');

function rowToObject(fields, row) {
  return fields.reduce((record, field, index) => {
    record[field] = row[index] ?? '';
    return record;
  }, {});
}

function objectToRow(fields, record) {
  return fields.map((field) => record[field] ?? '');
}

function hasValues(record) {
  return Object.values(record).some((value) => String(value).trim() !== '');
}

async function findAllPosts() {
  const rows = await readSheetRows(env.googleSheets.sheets.communityPosts);
  return rows
    .slice(1)
    .map((row) => rowToObject(COMMUNITY_POST_FIELDS, row))
    .filter(hasValues);
}

async function createPost(post) {
  await appendSheetRow(env.googleSheets.sheets.communityPosts, objectToRow(COMMUNITY_POST_FIELDS, post));
  return post;
}

async function updatePost(postId, post) {
  const rows = await readSheetRows(env.googleSheets.sheets.communityPosts);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === postId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.communityPosts, rowIndex + 1, objectToRow(COMMUNITY_POST_FIELDS, post));
  return post;
}

async function findAllComments() {
  const rows = await readSheetRows(env.googleSheets.sheets.communityComments);
  return rows
    .slice(1)
    .map((row) => rowToObject(COMMUNITY_COMMENT_FIELDS, row))
    .filter(hasValues);
}

async function addComment(comment) {
  await appendSheetRow(env.googleSheets.sheets.communityComments, objectToRow(COMMUNITY_COMMENT_FIELDS, comment));
  return comment;
}

async function updateComment(commentId, comment) {
  const rows = await readSheetRows(env.googleSheets.sheets.communityComments);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === commentId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.communityComments, rowIndex + 1, objectToRow(COMMUNITY_COMMENT_FIELDS, comment));
  return comment;
}

module.exports = {
  addComment,
  createPost,
  findAllComments,
  findAllPosts,
  updateComment,
  updatePost,
};
