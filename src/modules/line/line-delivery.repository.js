const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { LINE_DELIVERY_FIELDS, LINE_DELIVERY_HISTORY_FIELDS } = require('./line-delivery.model');

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

async function findAllDeliveryRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.lineDeliveries);
  return rows
    .slice(1)
    .map((row, index) => ({
      delivery: rowToObject(LINE_DELIVERY_FIELDS, row),
      rowNumber: index + 2,
    }))
    .filter((record) => hasValues(record.delivery));
}

async function createDelivery(delivery) {
  await appendSheetRow(env.googleSheets.sheets.lineDeliveries, objectToRow(LINE_DELIVERY_FIELDS, delivery));
  return delivery;
}

async function updateDelivery(deliveryId, delivery) {
  const rows = await readSheetRows(env.googleSheets.sheets.lineDeliveries);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === deliveryId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.lineDeliveries, rowIndex + 1, objectToRow(LINE_DELIVERY_FIELDS, delivery));
  return delivery;
}

async function findAllDeliveryHistoryRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.lineDeliveryHistory);
  return rows
    .slice(1)
    .map((row, index) => ({
      history: rowToObject(LINE_DELIVERY_HISTORY_FIELDS, row),
      rowNumber: index + 2,
    }))
    .filter((record) => hasValues(record.history));
}

async function createDeliveryHistory(history) {
  await appendSheetRow(env.googleSheets.sheets.lineDeliveryHistory, objectToRow(LINE_DELIVERY_HISTORY_FIELDS, history));
  return history;
}

module.exports = {
  createDelivery,
  createDeliveryHistory,
  findAllDeliveryHistoryRecords,
  findAllDeliveryRecords,
  updateDelivery,
};
