const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { CONVERSATION_HISTORY_FIELDS } = require('../crm-agent/conversation-history.model');
const { RECOMMENDATION_FIELDS } = require('../manager-agent/manager-report.model');
const { CONTENT_DRAFT_FIELDS } = require('./content-draft.model');

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

async function readManagerRecommendations() {
  const rows = await readSheetRows(env.googleSheets.sheets.recommendations);
  return rows
    .slice(1)
    .map((row) => rowToObject(RECOMMENDATION_FIELDS, row))
    .filter(hasValues);
}

async function readConversationHistory() {
  const rows = await readSheetRows(env.googleSheets.sheets.conversationHistory);
  return rows
    .slice(1)
    .map((row) => rowToObject(CONVERSATION_HISTORY_FIELDS, row))
    .filter(hasValues);
}

async function saveContentDraft(draft) {
  await appendSheetRow(env.googleSheets.sheets.contentDrafts, objectToRow(CONTENT_DRAFT_FIELDS, draft));
  return draft;
}

async function readContentDrafts() {
  const rows = await readSheetRows(env.googleSheets.sheets.contentDrafts);
  return rows
    .slice(1)
    .map((row) => rowToObject(CONTENT_DRAFT_FIELDS, row))
    .filter(hasValues);
}

async function updateContentDraft(draftId, draft) {
  const rows = await readSheetRows(env.googleSheets.sheets.contentDrafts);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === draftId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.contentDrafts, rowIndex + 1, objectToRow(CONTENT_DRAFT_FIELDS, draft));
  return draft;
}

module.exports = {
  readContentDrafts,
  readConversationHistory,
  readManagerRecommendations,
  saveContentDraft,
  updateContentDraft,
};
