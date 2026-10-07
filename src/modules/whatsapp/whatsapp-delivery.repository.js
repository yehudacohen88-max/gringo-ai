const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { WHATSAPP_DELIVERY_FIELDS, WHATSAPP_DELIVERY_HISTORY_FIELDS } = require('./whatsapp-delivery.model');
const { WHATSAPP_TEMPLATE_FIELDS } = require('./whatsapp-template.model');

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
  const rows = await readSheetRows(env.googleSheets.sheets.whatsappDeliveries);
  return rows
    .slice(1)
    .map((row, index) => ({ delivery: rowToObject(WHATSAPP_DELIVERY_FIELDS, row), rowNumber: index + 2 }))
    .filter((record) => hasValues(record.delivery));
}

async function createDelivery(delivery) {
  await appendSheetRow(env.googleSheets.sheets.whatsappDeliveries, objectToRow(WHATSAPP_DELIVERY_FIELDS, delivery));
  return delivery;
}

async function updateDelivery(deliveryId, delivery) {
  const rows = await readSheetRows(env.googleSheets.sheets.whatsappDeliveries);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === deliveryId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.whatsappDeliveries, rowIndex + 1, objectToRow(WHATSAPP_DELIVERY_FIELDS, delivery));
  return delivery;
}

async function findAllTemplateRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.whatsappTemplates);
  return rows
    .slice(1)
    .map((row, index) => ({ template: rowToObject(WHATSAPP_TEMPLATE_FIELDS, row), rowNumber: index + 2 }))
    .filter((record) => hasValues(record.template));
}

async function findAllDeliveryHistoryRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.whatsappDeliveryHistory);
  return rows
    .slice(1)
    .map((row, index) => ({ history: rowToObject(WHATSAPP_DELIVERY_HISTORY_FIELDS, row), rowNumber: index + 2 }))
    .filter((record) => hasValues(record.history));
}

async function createDeliveryHistory(history) {
  await appendSheetRow(env.googleSheets.sheets.whatsappDeliveryHistory, objectToRow(WHATSAPP_DELIVERY_HISTORY_FIELDS, history));
  return history;
}

module.exports = {
  createDelivery,
  createDeliveryHistory,
  findAllDeliveryHistoryRecords,
  findAllDeliveryRecords,
  findAllTemplateRecords,
  updateDelivery,
};
