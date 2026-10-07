const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { NOTIFICATION_FIELDS } = require('./notification.model');

function rowToNotification(row) {
  return NOTIFICATION_FIELDS.reduce((notification, field, index) => {
    notification[field] = row[index] ?? '';
    return notification;
  }, {});
}

function notificationToRow(notification) {
  return NOTIFICATION_FIELDS.map((field) => notification[field] ?? '');
}

function hasValues(notification) {
  return Object.values(notification).some((value) => String(value).trim() !== '');
}

async function findAllNotifications() {
  const rows = await readSheetRows(env.googleSheets.sheets.userNotifications);
  return rows.slice(1).map(rowToNotification).filter(hasValues);
}

async function createNotification(notification) {
  await appendSheetRow(env.googleSheets.sheets.userNotifications, notificationToRow(notification));
  return notification;
}

async function updateNotification(notificationId, notification) {
  const rows = await readSheetRows(env.googleSheets.sheets.userNotifications);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === notificationId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.userNotifications, rowIndex + 1, notificationToRow(notification));
  return notification;
}

module.exports = {
  createNotification,
  findAllNotifications,
  updateNotification,
};
