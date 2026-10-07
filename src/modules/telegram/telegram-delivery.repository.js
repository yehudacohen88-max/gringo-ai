const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { TELEGRAM_DELIVERY_FIELDS } = require('./telegram-delivery.model');

function rowToDelivery(row) {
  return TELEGRAM_DELIVERY_FIELDS.reduce((delivery, field, index) => {
    delivery[field] = row[index] ?? '';
    return delivery;
  }, {});
}

function deliveryToRow(delivery) {
  return TELEGRAM_DELIVERY_FIELDS.map((field) => delivery[field] ?? '');
}

function hasValues(delivery) {
  return Object.values(delivery).some((value) => String(value).trim() !== '');
}

async function findAllDeliveryRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.telegramDeliveries);
  return rows
    .slice(1)
    .map((row, index) => ({
      delivery: rowToDelivery(row),
      rowNumber: index + 2,
    }))
    .filter((record) => hasValues(record.delivery));
}

async function createDelivery(delivery) {
  await appendSheetRow(env.googleSheets.sheets.telegramDeliveries, deliveryToRow(delivery));
  return delivery;
}

async function updateDelivery(deliveryId, delivery) {
  const rows = await readSheetRows(env.googleSheets.sheets.telegramDeliveries);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === deliveryId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.telegramDeliveries, rowIndex + 1, deliveryToRow(delivery));
  return delivery;
}

module.exports = {
  createDelivery,
  findAllDeliveryRecords,
  updateDelivery,
};
