const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { ADMIN_NOTE_FIELDS, HUMAN_FOLLOW_UP_FIELDS, KNOWLEDGE_DRAFT_FIELDS } = require('./admin.model');

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

async function readRecords(sheetName, fields) {
  const rows = await readSheetRows(sheetName);
  return rows
    .slice(1)
    .map((row) => rowToObject(fields, row))
    .filter(hasValues);
}

async function appendRecord(sheetName, fields, record) {
  await appendSheetRow(sheetName, objectToRow(fields, record));
  return record;
}

async function updateRecord(sheetName, fields, idField, id, record) {
  const rows = await readSheetRows(sheetName);
  const idIndex = fields.indexOf(idField);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[idIndex] === id);
  if (rowIndex < 1) return null;
  await updateSheetRow(sheetName, rowIndex + 1, objectToRow(fields, record));
  return record;
}

async function readHumanFollowUps() {
  return readRecords(env.googleSheets.sheets.humanFollowUps, HUMAN_FOLLOW_UP_FIELDS);
}

async function saveHumanFollowUp(record) {
  return appendRecord(env.googleSheets.sheets.humanFollowUps, HUMAN_FOLLOW_UP_FIELDS, record);
}

async function updateHumanFollowUp(followUpId, record) {
  return updateRecord(env.googleSheets.sheets.humanFollowUps, HUMAN_FOLLOW_UP_FIELDS, 'followUpId', followUpId, record);
}

async function readAdminNotes() {
  return readRecords(env.googleSheets.sheets.adminNotes, ADMIN_NOTE_FIELDS);
}

async function saveAdminNote(record) {
  return appendRecord(env.googleSheets.sheets.adminNotes, ADMIN_NOTE_FIELDS, record);
}

async function readKnowledgeDrafts() {
  return readRecords(env.googleSheets.sheets.knowledgeDrafts, KNOWLEDGE_DRAFT_FIELDS);
}

async function saveKnowledgeDraft(record) {
  return appendRecord(env.googleSheets.sheets.knowledgeDrafts, KNOWLEDGE_DRAFT_FIELDS, record);
}

async function updateKnowledgeDraft(knowledgeDraftId, record) {
  return updateRecord(
    env.googleSheets.sheets.knowledgeDrafts,
    KNOWLEDGE_DRAFT_FIELDS,
    'knowledgeDraftId',
    knowledgeDraftId,
    record
  );
}

module.exports = {
  readAdminNotes,
  readHumanFollowUps,
  readKnowledgeDrafts,
  saveAdminNote,
  saveHumanFollowUp,
  saveKnowledgeDraft,
  updateHumanFollowUp,
  updateKnowledgeDraft,
};
