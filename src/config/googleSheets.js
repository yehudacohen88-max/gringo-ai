const { env } = require('./env');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const READ_CACHE_TTL_MS = 45 * 1000;
let googleClient;
const readCache = new Map();

function getGoogleClient() {
  if (googleClient !== undefined) {
    return googleClient;
  }

  try {
    googleClient = require('googleapis').google;
  } catch (error) {
    googleClient = null;
  }

  return googleClient;
}

function assertGoogleSheetsEnv() {
  const missing = [];

  if (!env.googleSheets.spreadsheetId) missing.push('GOOGLE_SHEETS_SPREADSHEET_ID');
  if (!env.googleSheets.clientEmail) missing.push('GOOGLE_SHEETS_CLIENT_EMAIL');
  if (!env.googleSheets.privateKey) missing.push('GOOGLE_SHEETS_PRIVATE_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing Google Sheets environment variables: ${missing.join(', ')}`);
  }
}

function createGoogleSheetsClient() {
  assertGoogleSheetsEnv();

  const google = getGoogleClient();

  if (!google) {
    throw new Error('Google Sheets client library is not installed.');
  }

  const auth = new google.auth.JWT({
    email: env.googleSheets.clientEmail,
    key: env.googleSheets.privateKey,
    scopes: SCOPES,
  });

  return google.sheets({ version: 'v4', auth });
}

function numberToColumnName(number) {
  let columnName = '';
  let current = number;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    current = Math.floor((current - 1) / 26);
  }

  return columnName;
}

function cloneRows(rows = []) {
  return rows.map((row) => [...row]);
}

function cacheKey(range) {
  return `${env.googleSheets.spreadsheetId}::${range}`;
}

function getCachedRows(key, now = Date.now()) {
  const cached = readCache.get(key);

  if (!cached) return null;

  if (cached.expiresAt <= now) {
    readCache.delete(key);
    return null;
  }

  return cloneRows(cached.rows);
}

function setCachedRows(key, rows, now = Date.now()) {
  readCache.set(key, {
    rows: cloneRows(rows),
    expiresAt: now + READ_CACHE_TTL_MS,
  });
}

function invalidateReadCacheForSheet(sheetName) {
  const prefix = `${env.googleSheets.spreadsheetId}::${sheetName}!`;

  for (const key of readCache.keys()) {
    if (key.startsWith(prefix)) {
      readCache.delete(key);
    }
  }
}

function clearReadCache() {
  readCache.clear();
}

async function readSheetRows(sheetName) {
  const range = `${sheetName}!A:ZZ`;
  const key = cacheKey(range);
  const cachedRows = getCachedRows(key);

  if (cachedRows) {
    return cachedRows;
  }

  const sheets = createGoogleSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheets.spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  setCachedRows(key, rows);
  return cloneRows(rows);
}

async function appendSheetRow(sheetName, row) {
  const sheets = createGoogleSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.googleSheets.spreadsheetId,
    range: `${sheetName}!A:ZZ`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  });

  invalidateReadCacheForSheet(sheetName);
}

async function updateSheetRow(sheetName, rowNumber, row) {
  const sheets = createGoogleSheetsClient();
  const lastColumn = numberToColumnName(row.length);

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheets.spreadsheetId,
    range: `${sheetName}!A${rowNumber}:${lastColumn}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row],
    },
  });

  invalidateReadCacheForSheet(sheetName);
}

async function ensureSheetWithHeader(sheetName, headerRow) {
  const sheets = createGoogleSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: env.googleSheets.spreadsheetId,
  });
  const existingSheets = spreadsheet.data.sheets || [];
  const exists = existingSheets.some((sheet) => sheet.properties?.title === sheetName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.googleSheets.spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      },
    });
    invalidateReadCacheForSheet(sheetName);
  }

  const lastColumn = numberToColumnName(headerRow.length);

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheets.spreadsheetId,
    range: `${sheetName}!A1:${lastColumn}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [headerRow],
    },
  });

  invalidateReadCacheForSheet(sheetName);
}

async function readContactRows() {
  return readSheetRows(env.googleSheets.sheets.contacts);
}

module.exports = {
  appendSheetRow,
  clearReadCache,
  createGoogleSheetsClient,
  ensureSheetWithHeader,
  invalidateReadCacheForSheet,
  readContactRows,
  readSheetRows,
  updateSheetRow,
};
