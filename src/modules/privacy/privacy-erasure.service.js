const { env } = require('../../config/env');
const googleSheets = require('../../config/googleSheets');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');

// Sheets that hold the privacy audit trail. They contain keyed hashes only and
// stay after deletion so the deletion itself can be proven.
const EXCLUDED_SHEET_KEYS = new Set(['privacyAudit', 'privacyConsents']);

// Columns that point at one person. A row matches when any of them holds one
// of the verified identifiers of the subject.
const USER_ID_COLUMNS = ['userId', 'ownerUserId'];
const CHANNEL_COLUMNS = {
  telegramUserId: 'telegram',
  telegramChatId: 'telegramChat',
  lineUserId: 'line',
  whatsappPhone: 'whatsapp',
};

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function defaultSheetsAdapter() {
  return {
    configured() {
      return Boolean(env.googleSheets.spreadsheetId && env.googleSheets.clientEmail && env.googleSheets.privateKey);
    },
    sheetNames() {
      return Object.entries(env.googleSheets.sheets)
        .filter(([key, name]) => !EXCLUDED_SHEET_KEYS.has(key) && cleanText(name))
        .map(([, name]) => name);
    },
    readSheetRows: (name) => googleSheets.readSheetRows(name),
    updateSheetRow: (name, rowNumber, row) => googleSheets.updateSheetRow(name, rowNumber, row),
  };
}

let sheetsAdapter = defaultSheetsAdapter();

function setSheetsAdapterForTests(adapter) {
  sheetsAdapter = adapter || defaultSheetsAdapter();
}

// Builds the identifier sets from a verified profile plus the verified channel
// identity of the request. Nothing here comes from a client-supplied field.
function buildSubject(profile, verifiedIdentity = {}) {
  const ids = {
    userId: new Set(),
    telegram: new Set(),
    telegramChat: new Set(),
    line: new Set(),
    whatsapp: new Set(),
    web: new Set(),
  };
  const pairs = [];
  function addPair(channel, id) {
    const ch = cleanText(channel).toLowerCase();
    const value = cleanText(id);
    if (!ch || !value) return;
    if (!pairs.some((pair) => pair.channel === ch && pair.channelUserId === value)) pairs.push({ channel: ch, channelUserId: value });
    if (ids[ch]) ids[ch].add(value);
  }

  addPair(verifiedIdentity.channel, verifiedIdentity.channelUserId);
  if (profile) {
    if (cleanText(profile.userId)) ids.userId.add(cleanText(profile.userId));
    addPair(profile.channel, profile.channelUserId);
    addPair('telegram', profile.telegramUserId);
    addPair('line', profile.lineUserId);
    addPair('whatsapp', profile.whatsappPhone);
    if (cleanText(profile.telegramChatId)) ids.telegramChat.add(cleanText(profile.telegramChatId));
  }
  return { ids, pairs };
}

function rowMatches(header, row, subject) {
  const value = (column) => {
    const index = header.indexOf(column);
    return index >= 0 ? cleanText(row[index]) : '';
  };
  for (const column of USER_ID_COLUMNS) {
    const v = value(column);
    if (v && subject.ids.userId.has(v)) return true;
    // Older channel error paths stored the raw channel id as userId.
    if (v && subject.pairs.some((pair) => pair.channelUserId === v)) return true;
  }
  for (const [column, kind] of Object.entries(CHANNEL_COLUMNS)) {
    const v = value(column);
    if (v && subject.ids[kind].has(v)) return true;
  }
  const channelUserId = value('channelUserId');
  if (channelUserId) {
    const rowChannel = value('channel').toLowerCase();
    return subject.pairs.some(
      (pair) => pair.channelUserId === channelUserId && (!rowChannel || rowChannel === pair.channel)
    );
  }
  return false;
}

function rowToObject(header, row) {
  return header.reduce((record, field, index) => {
    if (field) record[field] = row[index] ?? '';
    return record;
  }, {});
}

async function scanSheets(subject, { erase }) {
  const result = { sheets: {}, failedSheets: [] };
  if (!sheetsAdapter.configured()) return result;
  for (const sheetName of sheetsAdapter.sheetNames()) {
    let rows;
    try {
      rows = await sheetsAdapter.readSheetRows(sheetName);
    } catch (error) {
      result.failedSheets.push(sheetName);
      continue;
    }
    if (!rows || rows.length < 2) continue;
    const header = rows[0].map((cell) => cleanText(cell));
    const matched = [];
    for (let index = 1; index < rows.length; index += 1) {
      if (!rowMatches(header, rows[index], subject)) continue;
      matched.push(erase ? index + 1 : rowToObject(header, rows[index]));
    }
    if (!matched.length) continue;
    if (!erase) {
      result.sheets[sheetName] = matched;
      continue;
    }
    let erased = 0;
    for (const rowNumber of matched) {
      const width = Math.max(header.length, (rows[rowNumber - 1] || []).length);
      try {
        await sheetsAdapter.updateSheetRow(sheetName, rowNumber, new Array(width).fill(''));
        erased += 1;
      } catch (error) {
        if (!result.failedSheets.includes(sheetName)) result.failedSheets.push(sheetName);
      }
    }
    result.sheets[sheetName] = erased;
  }
  return result;
}

function forgetInProcessState(subject) {
  // Lazy requires avoid load-order cycles with the channel modules.
  const { coreAgentService } = require('../core-agent');
  const notificationService = require('../notifications/notification.service');
  const lineLinkService = require('../line/line-link.service');
  const quoteRepository = require('../money/user-submitted-transfer-quote.repository');
  const { translationCacheService } = require('../translation');

  const memory = { conversations: 0, notifications: 0, quotes: 0, profiles: 0, conversationHistory: 0 };
  for (const pair of subject.pairs) {
    if (coreAgentService.forgetConversation(pair)) memory.conversations += 1;
    if (pair.channel === 'line') lineLinkService.forgetPendingUnlink(pair.channelUserId);
  }
  for (const userId of subject.ids.userId) {
    memory.notifications += notificationService.forgetUserNotifications(userId);
    memory.quotes += quoteRepository.purgeLocalQuotesForUser(userId);
    const local = crmAgentRepository.purgeLocalUser(userId);
    memory.profiles += local.profiles;
    memory.conversationHistory += local.conversations;
  }
  // Cached sheet reads and translated text may hold copies of the rows above.
  googleSheets.clearReadCache();
  translationCacheService.clear();
  return memory;
}

async function exportSubject(subject) {
  const sheets = await scanSheets(subject, { erase: false });
  const local = { profiles: [], conversations: [], quotes: [] };
  const quoteRepository = require('../money/user-submitted-transfer-quote.repository');
  for (const userId of subject.ids.userId) {
    const records = crmAgentRepository.localRecordsForUser(userId);
    local.profiles.push(...records.profiles);
    local.conversations.push(...records.conversations);
    local.quotes.push(...quoteRepository.localQuotesForUser(userId));
  }
  return { ...sheets, local };
}

async function eraseSubject(subject) {
  const sheets = await scanSheets(subject, { erase: true });
  const memory = forgetInProcessState(subject);
  return { ...sheets, memory };
}

module.exports = {
  CHANNEL_COLUMNS,
  USER_ID_COLUMNS,
  buildSubject,
  eraseSubject,
  exportSubject,
  rowMatches,
  setSheetsAdapterForTests,
};
