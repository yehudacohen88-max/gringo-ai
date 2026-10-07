const { randomUUID } = require('node:crypto');
const { env } = require('../../config/env');
const {
  appendSheetRow,
  createGoogleSheetsClient,
  ensureSheetWithHeader,
  readSheetRows,
} = require('../../config/googleSheets');
const { isUserSubmittedQuote } = require('./user-submitted-transfer-quote-comparison');

const USER_SUBMITTED_TRANSFER_QUOTE_FIELDS = Object.freeze([
  'storedQuoteId',
  'userId',
  'savedAt',
  'providerId',
  'providerName',
  'sourceCurrency',
  'targetCurrency',
  'sendAmount',
  'transferFee',
  'totalCustomerCost',
  'customerExchangeRate',
  'recipientAmount',
  'deliveryMethod',
  'estimatedDelivery',
  'quoteRetrievedAt',
  'providerQuoteTimestamp',
  'providerQuoteExpiresAt',
  'reporterType',
  'evidenceStatus',
  'evidenceType',
  'evidenceReference',
  'observedAt',
  'sourceTrustJson',
  'availabilityStatus',
  'notesJson',
  'quoteJson',
]);

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const localQuoteRows = [];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCurrency(value) {
  return cleanText(value).toUpperCase();
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(number), MAX_LIMIT);
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function parseStoredNumber(value) {
  const text = cleanText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function hasGoogleSheetsConfig() {
  return Boolean(env.googleSheets.spreadsheetId && env.googleSheets.clientEmail && env.googleSheets.privateKey);
}

function isProduction() {
  return String(env.nodeEnv || '').toLowerCase() === 'production';
}

function shouldUseLocalFallback() {
  return !isProduction() && !hasGoogleSheetsConfig();
}

function getSheetName() {
  return env.googleSheets.sheets.userSubmittedTransferQuotes || 'UserSubmittedTransferQuotes';
}

function createStoredQuoteId() {
  return `usr_quote_${randomUUID()}`;
}

async function sheetExists(sheetName) {
  const sheets = createGoogleSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: env.googleSheets.spreadsheetId,
    fields: 'sheets.properties.title',
  });

  return (spreadsheet.data.sheets || []).some(
    (sheet) => sheet.properties?.title === sheetName
  );
}

function assertAuthorizedUserScope(userId, requesterUserId) {
  const normalizedUserId = cleanText(userId);
  const normalizedRequesterUserId = cleanText(requesterUserId);

  if (!normalizedUserId) {
    throw new Error('userId is required.');
  }

  if (!normalizedRequesterUserId) {
    throw new Error('requesterUserId is required.');
  }

  if (normalizedUserId !== normalizedRequesterUserId) {
    throw new Error('requester is not authorized to access this user quote scope.');
  }
}

function assertUserSubmittedQuote(quote = {}) {
  if (!isObject(quote) || !isUserSubmittedQuote(quote)) {
    throw new Error('Only normalized user-submitted quotes with user-reported verification can be stored.');
  }
}

function quoteToStoredRecord({ quote, userId, savedAt, storedQuoteId }) {
  return {
    storedQuoteId,
    userId,
    savedAt,
    providerId: cleanText(quote.providerId),
    providerName: cleanText(quote.providerName),
    sourceCurrency: normalizeCurrency(quote.sourceCurrency),
    targetCurrency: normalizeCurrency(quote.targetCurrency),
    sendAmount: quote.sendAmount ?? null,
    transferFee: quote.transferFee ?? null,
    totalCustomerCost: quote.totalCustomerCost ?? null,
    customerExchangeRate: quote.customerExchangeRate ?? null,
    recipientAmount: quote.recipientAmount ?? null,
    deliveryMethod: cleanText(quote.deliveryMethod) || 'unknown',
    estimatedDelivery: quote.estimatedDelivery ?? null,
    quoteRetrievedAt: quote.quoteRetrievedAt ?? null,
    providerQuoteTimestamp: quote.providerQuoteTimestamp ?? null,
    providerQuoteExpiresAt: quote.providerQuoteExpiresAt ?? null,
    reporterType: cleanText(quote.reporterType) || 'user',
    evidenceStatus: cleanText(quote.evidenceStatus) || 'none',
    evidenceType: quote.evidenceType ?? null,
    evidenceReference: quote.evidenceReference ?? null,
    observedAt: quote.observedAt ?? null,
    sourceTrust: { ...(quote.sourceTrust || {}) },
    availabilityStatus: cleanText(quote.availabilityStatus) || 'unknown',
    notes: Array.isArray(quote.notes) ? [...quote.notes] : [],
    quote: {
      ...quote,
      sourceTrust: { ...(quote.sourceTrust || {}) },
      notes: Array.isArray(quote.notes) ? [...quote.notes] : [],
    },
  };
}

function recordToRow(record = {}) {
  return USER_SUBMITTED_TRANSFER_QUOTE_FIELDS.map((field) => {
    if (field === 'sourceTrustJson') return stringifyJson(record.sourceTrust || {});
    if (field === 'notesJson') return stringifyJson(record.notes || []);
    if (field === 'quoteJson') return stringifyJson(record.quote || {});
    return record[field] ?? '';
  });
}

function rowToRecord(row = [], headers = USER_SUBMITTED_TRANSFER_QUOTE_FIELDS) {
  const fields = Array.isArray(headers) && headers.length ? headers : USER_SUBMITTED_TRANSFER_QUOTE_FIELDS;
  const raw = fields.reduce((record, field, index) => {
    record[field] = row[index] ?? '';
    return record;
  }, {});
  const quote = safeJsonParse(raw.quoteJson, {});
  const hydratedQuote = {
    ...quote,
    sendAmount: quote.sendAmount ?? parseStoredNumber(raw.sendAmount),
    transferFee: quote.transferFee ?? parseStoredNumber(raw.transferFee),
    totalCustomerCost: quote.totalCustomerCost ?? parseStoredNumber(raw.totalCustomerCost),
    customerExchangeRate: quote.customerExchangeRate ?? parseStoredNumber(raw.customerExchangeRate),
    recipientAmount: quote.recipientAmount ?? parseStoredNumber(raw.recipientAmount),
    reporterType: cleanText(quote.reporterType || raw.reporterType) || 'user',
    evidenceStatus: cleanText(quote.evidenceStatus || raw.evidenceStatus) || 'none',
    evidenceType: quote.evidenceType ?? (cleanText(raw.evidenceType) || null),
    evidenceReference: quote.evidenceReference ?? (cleanText(raw.evidenceReference) || null),
    observedAt: quote.observedAt ?? (cleanText(raw.observedAt) || null),
  };

  return {
    storedQuoteId: cleanText(raw.storedQuoteId),
    userId: cleanText(raw.userId),
    savedAt: cleanText(raw.savedAt),
    providerId: cleanText(raw.providerId),
    providerName: cleanText(raw.providerName),
    sourceCurrency: normalizeCurrency(raw.sourceCurrency),
    targetCurrency: normalizeCurrency(raw.targetCurrency),
    sendAmount: hydratedQuote.sendAmount,
    transferFee: hydratedQuote.transferFee,
    totalCustomerCost: hydratedQuote.totalCustomerCost,
    customerExchangeRate: hydratedQuote.customerExchangeRate,
    recipientAmount: hydratedQuote.recipientAmount,
    deliveryMethod: cleanText(raw.deliveryMethod) || 'unknown',
    estimatedDelivery: hydratedQuote.estimatedDelivery ?? null,
    quoteRetrievedAt: hydratedQuote.quoteRetrievedAt ?? null,
    providerQuoteTimestamp: hydratedQuote.providerQuoteTimestamp ?? null,
    providerQuoteExpiresAt: hydratedQuote.providerQuoteExpiresAt ?? null,
    reporterType: hydratedQuote.reporterType,
    evidenceStatus: hydratedQuote.evidenceStatus,
    evidenceType: hydratedQuote.evidenceType,
    evidenceReference: hydratedQuote.evidenceReference,
    observedAt: hydratedQuote.observedAt,
    sourceTrust: safeJsonParse(raw.sourceTrustJson, hydratedQuote.sourceTrust || {}),
    availabilityStatus: cleanText(raw.availabilityStatus) || hydratedQuote.availabilityStatus || 'unknown',
    notes: safeJsonParse(raw.notesJson, hydratedQuote.notes || []),
    quote: hydratedQuote,
  };
}

function compareNewestFirst(left, right) {
  const savedAtCompare = cleanText(right.savedAt).localeCompare(cleanText(left.savedAt));
  if (savedAtCompare !== 0) return savedAtCompare;
  return cleanText(right.storedQuoteId).localeCompare(cleanText(left.storedQuoteId));
}

function filterRecords(records = [], options = {}) {
  const providerId = cleanText(options.providerId);
  const sourceCurrency = normalizeCurrency(options.sourceCurrency);
  const targetCurrency = normalizeCurrency(options.targetCurrency);
  const limit = normalizeLimit(options.limit);

  return records
    .filter((record) => !providerId || cleanText(record.providerId) === providerId)
    .filter((record) => !sourceCurrency || normalizeCurrency(record.sourceCurrency) === sourceCurrency)
    .filter((record) => !targetCurrency || normalizeCurrency(record.targetCurrency) === targetCurrency)
    .sort(compareNewestFirst)
    .slice(0, limit)
    .map((record) => ({
      ...record,
      sourceTrust: { ...(record.sourceTrust || {}) },
      notes: Array.isArray(record.notes) ? [...record.notes] : [],
      quote: {
        ...(record.quote || {}),
        sourceTrust: { ...(record.quote?.sourceTrust || record.sourceTrust || {}) },
        notes: Array.isArray(record.quote?.notes) ? [...record.quote.notes] : [],
      },
    }));
}

function createUserSubmittedTransferQuoteRepository(dependencies = {}) {
  const rows = Array.isArray(dependencies.localRows) ? dependencies.localRows : localQuoteRows;
  const appendRow = dependencies.appendRow || appendSheetRow;
  const readRows = dependencies.readRows || readSheetRows;
  const ensureSheet = dependencies.ensureSheet || ensureSheetWithHeader;
  const sheetExistsCheck = dependencies.sheetExists || sheetExists;
  const now = dependencies.now || (() => new Date().toISOString());
  const idGenerator = dependencies.idGenerator || createStoredQuoteId;
  const useLocalFallback = dependencies.useLocalFallback || shouldUseLocalFallback;
  const sheetName = dependencies.sheetName || getSheetName;
  const initializedSheets = new Set();

  async function ensureQuoteSheetInitialized() {
    const currentSheetName = sheetName();
    if (initializedSheets.has(currentSheetName)) return currentSheetName;

    if (!(await sheetExistsCheck(currentSheetName))) {
      await ensureSheet(currentSheetName, USER_SUBMITTED_TRANSFER_QUOTE_FIELDS);
    }

    initializedSheets.add(currentSheetName);
    return currentSheetName;
  }

  async function saveUserSubmittedTransferQuote({ userId, requesterUserId, quote } = {}) {
    assertAuthorizedUserScope(userId, requesterUserId);
    assertUserSubmittedQuote(quote);

    const record = quoteToStoredRecord({
      quote,
      userId: cleanText(userId),
      savedAt: now(),
      storedQuoteId: idGenerator(),
    });

    try {
      if (useLocalFallback()) {
        rows.push(record);
      } else {
        const currentSheetName = await ensureQuoteSheetInitialized();
        await appendRow(currentSheetName, recordToRow(record));
      }

      return {
        saved: true,
        quote: { ...record },
      };
    } catch (error) {
      return {
        saved: false,
        error: error.message,
      };
    }
  }

  async function findRecentUserSubmittedTransferQuotes({
    userId,
    requesterUserId,
    providerId,
    sourceCurrency,
    targetCurrency,
    limit,
  } = {}) {
    assertAuthorizedUserScope(userId, requesterUserId);

    try {
      let records;
      if (useLocalFallback()) {
        records = rows.map((record) => ({ ...record }));
      } else {
        const sheetRows = await readRows(await ensureQuoteSheetInitialized());
        const [headers = USER_SUBMITTED_TRANSFER_QUOTE_FIELDS, ...dataRows] = sheetRows;
        records = dataRows.map((row) => rowToRecord(row, headers));
      }
      const userRecords = records.filter((record) => cleanText(record.userId) === cleanText(userId));

      return {
        ok: true,
        quotes: filterRecords(userRecords, { providerId, sourceCurrency, targetCurrency, limit }),
      };
    } catch (error) {
      return {
        ok: false,
        error: error.message,
        quotes: [],
      };
    }
  }

  return {
    findRecentUserSubmittedTransferQuotes,
    saveUserSubmittedTransferQuote,
  };
}

const userSubmittedTransferQuoteRepository = createUserSubmittedTransferQuoteRepository();

module.exports = {
  USER_SUBMITTED_TRANSFER_QUOTE_FIELDS,
  createUserSubmittedTransferQuoteRepository,
  userSubmittedTransferQuoteRepository,
};
