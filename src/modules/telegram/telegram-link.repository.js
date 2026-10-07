const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { TELEGRAM_LINK_CODE_FIELDS, TELEGRAM_LINK_HISTORY_FIELDS } = require('./telegram-link.model');

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

async function findAllLinkCodeRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.telegramLinkCodes);
  return rows
    .slice(1)
    .map((row, index) => ({
      code: rowToObject(TELEGRAM_LINK_CODE_FIELDS, row),
      rowNumber: index + 2,
    }))
    .filter((record) => hasValues(record.code));
}

async function createLinkCode(code) {
  await appendSheetRow(env.googleSheets.sheets.telegramLinkCodes, objectToRow(TELEGRAM_LINK_CODE_FIELDS, code));
  return code;
}

async function updateLinkCode(rowNumber, code) {
  await updateSheetRow(env.googleSheets.sheets.telegramLinkCodes, rowNumber, objectToRow(TELEGRAM_LINK_CODE_FIELDS, code));
  return code;
}

async function createLinkHistory(history) {
  await appendSheetRow(env.googleSheets.sheets.telegramLinkHistory, objectToRow(TELEGRAM_LINK_HISTORY_FIELDS, history));
  return history;
}

async function findAllLinkHistoryRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.telegramLinkHistory);
  return rows
    .slice(1)
    .map((row, index) => ({
      history: rowToObject(TELEGRAM_LINK_HISTORY_FIELDS, row),
      rowNumber: index + 2,
    }))
    .filter((record) => hasValues(record.history));
}

module.exports = {
  createLinkCode,
  createLinkHistory,
  findAllLinkHistoryRecords,
  findAllLinkCodeRecords,
  updateLinkCode,
};
