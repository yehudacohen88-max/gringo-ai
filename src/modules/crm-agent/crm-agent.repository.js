const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { USER_PROFILE_FIELDS } = require('./user-profile.model');
const { CONVERSATION_HISTORY_FIELDS } = require('./conversation-history.model');

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

async function findAllUserProfileRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.userProfiles);
  return rows
    .slice(1)
    .map((row, index) => ({
      profile: rowToObject(USER_PROFILE_FIELDS, row),
      rowNumber: index + 2,
    }))
    .filter((record) => hasValues(record.profile));
}

async function findUserProfileRecordByUserId(userId) {
  const records = await findAllUserProfileRecords();
  return records.find((record) => record.profile.userId === userId) || null;
}

async function findUserProfileRecordByChannel(channel, channelUserId) {
  const records = await findAllUserProfileRecords();
  return (
    records.find(
      (record) => record.profile.channel === channel && record.profile.channelUserId === channelUserId
    ) || null
  );
}

async function createUserProfile(profile) {
  await appendSheetRow(env.googleSheets.sheets.userProfiles, objectToRow(USER_PROFILE_FIELDS, profile));
  return profile;
}

async function updateUserProfile(rowNumber, profile) {
  await updateSheetRow(env.googleSheets.sheets.userProfiles, rowNumber, objectToRow(USER_PROFILE_FIELDS, profile));
  return profile;
}

async function createConversationHistory(event) {
  await appendSheetRow(
    env.googleSheets.sheets.conversationHistory,
    objectToRow(CONVERSATION_HISTORY_FIELDS, event)
  );
  return event;
}

module.exports = {
  createConversationHistory,
  createUserProfile,
  findUserProfileRecordByChannel,
  findUserProfileRecordByUserId,
  updateUserProfile,
};
