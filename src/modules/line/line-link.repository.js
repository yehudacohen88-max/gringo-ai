const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { CHANNEL_LINK_CODE_FIELDS, CHANNEL_LINK_HISTORY_FIELDS } = require('./line-link.model');

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
  const rows = await readSheetRows(env.googleSheets.sheets.channelLinkCodes);
  return rows
    .slice(1)
    .map((row, index) => ({
      code: rowToObject(CHANNEL_LINK_CODE_FIELDS, row),
      rowNumber: index + 2,
    }))
    .filter((record) => hasValues(record.code));
}

async function createLinkCode(code) {
  await appendSheetRow(env.googleSheets.sheets.channelLinkCodes, objectToRow(CHANNEL_LINK_CODE_FIELDS, code));
  return code;
}

async function updateLinkCode(rowNumber, code) {
  await updateSheetRow(env.googleSheets.sheets.channelLinkCodes, rowNumber, objectToRow(CHANNEL_LINK_CODE_FIELDS, code));
  return code;
}

async function createLinkHistory(history) {
  await appendSheetRow(env.googleSheets.sheets.channelLinkHistory, objectToRow(CHANNEL_LINK_HISTORY_FIELDS, history));
  return history;
}

async function findAllLinkHistoryRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.channelLinkHistory);
  return rows
    .slice(1)
    .map((row, index) => ({
      history: rowToObject(CHANNEL_LINK_HISTORY_FIELDS, row),
      rowNumber: index + 2,
    }))
    .filter((record) => hasValues(record.history));
}

module.exports = {
  createLinkCode,
  createLinkHistory,
  findAllLinkCodeRecords,
  findAllLinkHistoryRecords,
  updateLinkCode,
};
