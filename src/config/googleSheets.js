const { google } = require('googleapis');
const { env } = require('./env');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

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

async function readSheetRows(sheetName) {
  const sheets = createGoogleSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheets.spreadsheetId,
    range: `${sheetName}!A:ZZ`,
  });

  return response.data.values || [];
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
}

async function readContactRows() {
  return readSheetRows(env.googleSheets.sheets.contacts);
}

module.exports = {
  appendSheetRow,
  createGoogleSheetsClient,
  ensureSheetWithHeader,
  readContactRows,
  readSheetRows,
  updateSheetRow,
};
