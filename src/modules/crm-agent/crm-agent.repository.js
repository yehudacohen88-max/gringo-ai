const { env } = require('../../config/env');
const {
  appendSheetRow,
  createGoogleSheetsClient,
  ensureSheetWithHeader,
  readSheetRows,
  updateSheetRow,
} = require('../../config/googleSheets');
const { USER_PROFILE_FIELDS } = require('./user-profile.model');
const { CONVERSATION_HISTORY_FIELDS } = require('./conversation-history.model');

const localUserProfileRecords = [];
const localConversationHistory = [];
let warnedAboutLocalFallback = false;

function isProduction() {
  return String(env.nodeEnv || '').toLowerCase() === 'production';
}

function hasGoogleSheetsConfig() {
  return Boolean(env.googleSheets.spreadsheetId && env.googleSheets.clientEmail && env.googleSheets.privateKey);
}

function shouldUseLocalFallback() {
  return !isProduction() && !hasGoogleSheetsConfig();
}

function warnLocalFallback() {
  if (warnedAboutLocalFallback) return;
  warnedAboutLocalFallback = true;
  console.warn('[crm-agent] Google Sheets is not configured. Using local in-memory CRM fallback for this development run.');
}

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

async function ensureSheetExistsWithHeader(sheetName, headerRow) {
  const sheets = createGoogleSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: env.googleSheets.spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const exists = (spreadsheet.data.sheets || []).some(
    (sheet) => sheet.properties?.title === sheetName
  );

  if (!exists) {
    await ensureSheetWithHeader(sheetName, headerRow);
  }
}

async function initializeMvpCrmSheets() {
  if (shouldUseLocalFallback()) {
    warnLocalFallback();
    return {
      initialized: false,
      fallback: true,
      sheets: [],
    };
  }

  await ensureSheetExistsWithHeader(env.googleSheets.sheets.userProfiles, USER_PROFILE_FIELDS);
  await ensureSheetExistsWithHeader(
    env.googleSheets.sheets.conversationHistory,
    CONVERSATION_HISTORY_FIELDS
  );

  return {
    initialized: true,
    fallback: false,
    sheets: [
      env.googleSheets.sheets.userProfiles,
      env.googleSheets.sheets.conversationHistory,
    ],
  };
}

async function findAllUserProfileRecords() {
  if (shouldUseLocalFallback()) {
    warnLocalFallback();
    return localUserProfileRecords.map((record) => ({
      profile: { ...record.profile },
      rowNumber: record.rowNumber,
    }));
  }

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

async function findUserProfileRecordByTelegramUserId(telegramUserId) {
  const records = await findAllUserProfileRecords();
  return records.find((record) => record.profile.telegramUserId === telegramUserId) || null;
}

async function findUserProfileRecordByLineUserId(lineUserId) {
  const records = await findAllUserProfileRecords();
  return records.find((record) => record.profile.lineUserId === lineUserId) || null;
}

async function createUserProfile(profile) {
  if (shouldUseLocalFallback()) {
    warnLocalFallback();
    const record = {
      profile: { ...profile },
      rowNumber: localUserProfileRecords.length + 2,
    };
    localUserProfileRecords.push(record);
    return { ...record.profile };
  }

  await appendSheetRow(env.googleSheets.sheets.userProfiles, objectToRow(USER_PROFILE_FIELDS, profile));
  return profile;
}

async function updateUserProfile(rowNumber, profile) {
  if (shouldUseLocalFallback()) {
    warnLocalFallback();
    const record = localUserProfileRecords.find((item) => item.rowNumber === rowNumber);
    if (record) {
      record.profile = { ...profile };
    } else {
      localUserProfileRecords.push({
        profile: { ...profile },
        rowNumber,
      });
    }
    return { ...profile };
  }

  await updateSheetRow(env.googleSheets.sheets.userProfiles, rowNumber, objectToRow(USER_PROFILE_FIELDS, profile));
  return profile;
}

async function createConversationHistory(event) {
  if (shouldUseLocalFallback()) {
    warnLocalFallback();
    localConversationHistory.push({ ...event });
    return { ...event };
  }

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
  findUserProfileRecordByLineUserId,
  findUserProfileRecordByTelegramUserId,
  findUserProfileRecordByUserId,
  initializeMvpCrmSheets,
  updateUserProfile,
};
