const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { DOCUMENT_FIELDS, DOCUMENT_HISTORY_FIELDS } = require('./document.model');

function rowToDocument(row) {
  return DOCUMENT_FIELDS.reduce((document, field, index) => {
    document[field] = row[index] ?? '';
    return document;
  }, {});
}

function documentToRow(document) {
  return DOCUMENT_FIELDS.map((field) => document[field] ?? '');
}

function rowToHistory(row) {
  return DOCUMENT_HISTORY_FIELDS.reduce((history, field, index) => {
    history[field] = row[index] ?? '';
    return history;
  }, {});
}

function historyToRow(history) {
  return DOCUMENT_HISTORY_FIELDS.map((field) => history[field] ?? '');
}

function hasValues(document) {
  return Object.values(document).some((value) => String(value).trim() !== '');
}

async function findAllDocuments() {
  const rows = await readSheetRows(env.googleSheets.sheets.userDocuments);
  return rows.slice(1).map(rowToDocument).filter(hasValues);
}

async function createDocument(document) {
  await appendSheetRow(env.googleSheets.sheets.userDocuments, documentToRow(document));
  return document;
}

async function updateDocument(documentId, document) {
  const rows = await readSheetRows(env.googleSheets.sheets.userDocuments);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === documentId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.userDocuments, rowIndex + 1, documentToRow(document));
  return document;
}

async function findAllHistory() {
  const rows = await readSheetRows(env.googleSheets.sheets.userDocumentHistory);
  return rows.slice(1).map(rowToHistory).filter(hasValues);
}

async function appendHistory(history) {
  await appendSheetRow(env.googleSheets.sheets.userDocumentHistory, historyToRow(history));
  return history;
}

module.exports = {
  appendHistory,
  createDocument,
  findAllDocuments,
  findAllHistory,
  updateDocument,
};
