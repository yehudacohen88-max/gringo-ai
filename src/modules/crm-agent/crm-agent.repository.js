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

// Privacy erasure for the development fallback. Rows keep their slot so
// rowNumber stays stable; the blank profile matches no lookup.
function purgeLocalUser(userId) {
  const id = String(userId || '').trim();
  if (!id) return { profiles: 0, conversations: 0 };
  let profiles = 0;
  for (const record of localUserProfileRecords) {
    if (record.profile && record.profile.userId === id) {
      record.profile = USER_PROFILE_FIELDS.reduce((blank, field) => ({ ...blank, [field]: '' }), {});
      profiles += 1;
    }
  }
  let conversations = 0;
  for (let index = localConversationHistory.length - 1; index >= 0; index -= 1) {
    if (localConversationHistory[index].userId === id) {
      localConversationHistory.splice(index, 1);
      conversations += 1;
    }
  }
  return { profiles, conversations };
}

function localRecordsForUser(userId) {
  const id = String(userId || '').trim();
  return {
    profiles: localUserProfileRecords.filter((record) => record.profile && record.profile.userId === id).map((record) => ({ ...record.profile })),
    conversations: localConversationHistory.filter((event) => event.userId === id).map((event) => ({ ...event })),
  };
}

module.exports = {
  localRecordsForUser,
  purgeLocalUser,
  createConversationHistory,
  createUserProfile,
  findAllUserProfileRecords,
  findUserProfileRecordByChannel,
  findUserProfileRecordByLineUserId,
  findUserProfileRecordByTelegramUserId,
  findUserProfileRecordByUserId,
  initializeMvpCrmSheets,
  updateUserProfile,
};
