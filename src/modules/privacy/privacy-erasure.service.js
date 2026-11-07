const { env } = require('../../config/env');
const googleSheets = require('../../config/googleSheets');
const crmAgentRepository = require('../crm-agent/crm-agent.repository');
const aiBudget = require('../ai-provider/ai-budget.service');

// Sheets that hold the privacy audit trail. They contain keyed hashes only and
// stay after deletion so the deletion itself can be proven.
const EXCLUDED_SHEET_KEYS = new Set(['privacyAudit', 'privacyConsents']);
const UNLISTED_TABS = '__unlisted_spreadsheet_tabs__';

// Columns that point at one person. A row matches when any of them holds one
// of the verified identifiers of the subject. actor_id and ownerKey are the
// same kind of pointer when a sheet uses those names.
const USER_ID_COLUMNS = ['userId', 'ownerUserId', 'ownerKey', 'actor_id'];
const CHANNEL_COLUMNS = {
  telegramUserId: 'telegram',
  telegramChatId: 'telegramChat',
  lineUserId: 'line',
  whatsappPhone: 'whatsapp',
  webId: 'web',
};

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function configuredSheetNames() {
  return Object.entries(env.googleSheets.sheets)
    .filter(([key, name]) => !EXCLUDED_SHEET_KEYS.has(key) && cleanText(name))
    .map(([, name]) => name);
}

function defaultSheetsAdapter() {
  return {
    configured() {
      return Boolean(env.googleSheets.spreadsheetId && env.googleSheets.clientEmail && env.googleSheets.privateKey);
    },
    sheetNames() {
      return configuredSheetNames();
    },
    // Tabs that exist in the spreadsheet but are not in env config. Privacy
    // audit and consent tabs are already in the configured set and stay excluded.
    async listExtraSheetNames() {
      const known = new Set(Object.values(env.googleSheets.sheets).map((name) => cleanText(name)).filter(Boolean));
      const titles = await googleSheets.listSheetTitles();
      return titles.filter((title) => !known.has(title));
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
    telegramUsername: new Set(),
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
    const username = cleanText(profile.telegramUsername).replace(/^@/, '');
    if (username) ids.telegramUsername.add(username);
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
  const username = value('telegramUsername').replace(/^@/, '');
  if (username && subject.ids.telegramUsername.has(username)) return true;
  const channelUserId = value('channelUserId');
  if (channelUserId) {
    const rowChannel = value('channel').toLowerCase();
    return subject.pairs.some(
      (pair) => pair.channelUserId === channelUserId && (!rowChannel || rowChannel === pair.channel)
    );
  }
  return false;
}

// Unambiguous identifiers only. A short name is not redacted out of a shared
// report, because that row also describes other people. The match must be a
// whole token so one user's id is not cut out of a longer id.
function freeTextTokens(subject) {
  const tokens = [];
  const add = (value) => {
    const text = cleanText(value);
    if (text.length >= 6) tokens.push(text);
  };
  subject.ids.userId.forEach(add);
  for (const kind of ['telegram', 'telegramChat', 'line', 'whatsapp', 'web']) subject.ids[kind].forEach(add);
  subject.ids.telegramUsername.forEach(add);
  return [...new Set(tokens)].sort((left, right) => right.length - left.length);
}

// Digits, letters, and the characters that show up inside ids (underscore,
// plus, at, dot, hyphen). A shorter id must not match inside a longer one.
const ID_CHAR = 'A-Za-z0-9_+@.-';

function replaceToken(text, token) {
  const value = String(text);
  if (!token || token.length < 6 || !value.includes(token)) return value;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`(^|[^${ID_CHAR}])${escaped}(?=$|[^${ID_CHAR}])`, 'g'), '$1[erased]');
}

const FOREIGN_OWNER_COLUMNS = [...USER_ID_COLUMNS, ...Object.keys(CHANNEL_COLUMNS), 'channelUserId', 'telegramUsername'];

function rowHasForeignOwner(header, row) {
  const value = (column) => {
    const index = header.indexOf(column);
    const cell = index >= 0 ? cleanText(row[index]) : '';
    return column === 'telegramUsername' ? cell.replace(/^@/, '') : cell;
  };
  return FOREIGN_OWNER_COLUMNS.some((column) => value(column));
}

function redactCells(row, tokens) {
  let changed = false;
  const next = row.map((cell) => {
    let text = cell === undefined || cell === null ? '' : String(cell);
    for (const token of tokens) {
      if (!text.includes(token)) continue;
      const replaced = replaceToken(text, token);
      if (replaced !== text) {
        text = replaced;
        changed = true;
      }
    }
    return text;
  });
  return changed ? next : null;
}

function excerptMatches(header, row, tokens) {
  const excerpt = {};
  header.forEach((field, index) => {
    const text = cleanText(row[index]);
    if (!field || !text) return;
    if (tokens.some((token) => replaceToken(text, token) !== text)) excerpt[field] = row[index];
  });
  return Object.keys(excerpt).length ? { freeTextExcerpt: excerpt } : null;
}

function rowToObject(header, row) {
  return header.reduce((record, field, index) => {
    if (field) record[field] = row[index] ?? '';
    return record;
  }, {});
}

async function resolveSheetNames(result, { onlySheet, skipExtras }) {
  if (onlySheet) return [onlySheet];
  const names = sheetsAdapter.sheetNames().slice();
  if (!skipExtras && typeof sheetsAdapter.listExtraSheetNames === 'function') {
    try {
      const extras = await sheetsAdapter.listExtraSheetNames();
      for (const name of extras || []) {
        const title = cleanText(name);
        if (title && !names.includes(title)) names.push(title);
      }
    } catch (error) {
      // A tab we could not list may still hold this person. Do not report
      // the deletion as complete.
      if (!result.failedSheets.includes(UNLISTED_TABS)) result.failedSheets.push(UNLISTED_TABS);
    }
  }
  return names;
}

async function scanSheets(subject, { erase, skipProfile = false, onlySheet = '' } = {}) {
  const result = { sheets: {}, failedSheets: [], deferredSheets: [] };
  if (!sheetsAdapter.configured()) return result;
  // The profile row is erased last, and only when every other sheet worked.
  // It holds the channel ids a retry needs to find the remaining rows.
  const profileSheet = env.googleSheets.sheets.userProfiles;
  const tokens = freeTextTokens(subject);
  const names = await resolveSheetNames(result, { onlySheet, skipExtras: Boolean(onlySheet) });
  const ordered = onlySheet
    ? names
    : [...names.filter((name) => name !== profileSheet), ...names.filter((name) => name === profileSheet)];
  for (const sheetName of ordered) {
    if (skipProfile && sheetName === profileSheet) continue;
    if (erase && sheetName === profileSheet && result.failedSheets.length) {
      result.deferredSheets.push(sheetName);
      continue;
    }
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
    const redactions = [];
    for (let index = 1; index < rows.length; index += 1) {
      if (rowMatches(header, rows[index], subject)) {
        matched.push(erase ? index + 1 : rowToObject(header, rows[index]));
        continue;
      }
      // A row owned by someone else is left byte-for-byte, even when its
      // text contains this person's id as a prefix or a mention.
      if (rowHasForeignOwner(header, rows[index])) continue;
      // A shared row (no owner column) stays, but this person's whole
      // identifier token is removed from its text.
      if (erase) {
        const redacted = redactCells(rows[index], tokens);
        if (redacted) redactions.push({ rowNumber: index + 1, row: redacted });
      } else {
        const excerpt = excerptMatches(header, rows[index], tokens);
        if (excerpt) matched.push(excerpt);
      }
    }
    if (!erase) {
      if (matched.length) result.sheets[sheetName] = matched;
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
    for (const item of redactions) {
      try {
        await sheetsAdapter.updateSheetRow(sheetName, item.rowNumber, item.row);
        erased += 1;
      } catch (error) {
        if (!result.failedSheets.includes(sheetName)) result.failedSheets.push(sheetName);
      }
    }
    if (erased) result.sheets[sheetName] = erased;
  }
  return result;
}

function budgetRawKeys(subject) {
  const keys = new Set();
  for (const pair of subject.pairs) {
    keys.add(`${pair.channel}:${pair.channelUserId}`);
    if (pair.channelUserId) keys.add(pair.channelUserId);
  }
  for (const userId of subject.ids.userId) keys.add(userId);
  return [...keys];
}

function telegramIds(subject) {
  const ids = new Set();
  for (const pair of subject.pairs) if (pair.channelUserId) ids.add(pair.channelUserId);
  subject.ids.telegram.forEach((id) => ids.add(id));
  subject.ids.telegramChat.forEach((id) => ids.add(id));
  return [...ids];
}

// Disk files configured in render.yaml. The process lock holds a pid only and
// is not opened. Budget counters are rekeyed, never deleted. Telegram callback
// keys are rekeyed, never dropped. Update ids are left untouched.
function anonymizePersistentState(subject) {
  const failed = [];
  const budget = aiBudget.rekeyUserCounters(budgetRawKeys(subject));
  if (!budget.ok) failed.push('ai-budget-state');
  const telegramUpdate = require('../telegram/telegram-update.service');
  const telegram = telegramUpdate.anonymizeCallbackKeysForUsers(telegramIds(subject));
  if (!telegram.ok) failed.push('telegram-state');
  return {
    failed,
    retained: {
      budgetRekeyed: budget.rekeyed || 0,
      budgetCountersRemoved: 0,
      telegramCallbackKeysRekeyed: telegram.rekeyed || 0,
      processLockTouched: false,
    },
  };
}

function forgetInProcessState(subject, options = {}) {
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
    const local = options.keepLocalProfile ? { profiles: 0, conversations: 0 } : crmAgentRepository.purgeLocalUser(userId);
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
  // Blank every sheet except the profile first. Disk rekey runs before the
  // profile is removed, and a disk failure keeps the profile so a retry can
  // still find this person.
  const sheets = await scanSheets(subject, { erase: true, skipProfile: true });
  const disk = anonymizePersistentState(subject);
  for (const name of disk.failed) {
    if (!sheets.failedSheets.includes(name)) sheets.failedSheets.push(name);
  }
  const profileSheet = cleanText(env.googleSheets.sheets.userProfiles);
  const configuredNames = sheetsAdapter.configured() ? sheetsAdapter.sheetNames() : [];
  if (profileSheet && configuredNames.includes(profileSheet)) {
    if (sheets.failedSheets.length) {
      if (!sheets.deferredSheets.includes(profileSheet)) sheets.deferredSheets.push(profileSheet);
    } else {
      const profile = await scanSheets(subject, { erase: true, onlySheet: profileSheet });
      if (profile.sheets[profileSheet]) sheets.sheets[profileSheet] = profile.sheets[profileSheet];
      for (const name of profile.failedSheets) {
        if (!sheets.failedSheets.includes(name)) sheets.failedSheets.push(name);
      }
    }
  }
  const memory = forgetInProcessState(subject, { keepLocalProfile: sheets.failedSheets.length > 0 });
  return { ...sheets, memory, retained: disk.retained };
}

// For retries of identities that no longer have a profile row (deleted
// profile, or a user known only by a raw channel id): list every
// (channel, id) pair found in the data sheets so the caller can match them
// against the keyed hashes of pending deletions. Read-only.
async function collectCandidatePairs() {
  const pairs = new Map();
  if (!sheetsAdapter.configured()) return [];
  const add = (channel, id) => {
    const ch = cleanText(channel).toLowerCase();
    const value = cleanText(id);
    if (ch && value) pairs.set(`${ch}:${value}`, { channel: ch, channelUserId: value });
  };
  const names = sheetsAdapter.sheetNames().slice();
  if (typeof sheetsAdapter.listExtraSheetNames === 'function') {
    const extras = await sheetsAdapter.listExtraSheetNames();
    for (const name of extras || []) {
      const title = cleanText(name);
      if (title && !names.includes(title)) names.push(title);
    }
  }
  for (const sheetName of names) {
    const rows = await sheetsAdapter.readSheetRows(sheetName);
    if (!rows || rows.length < 2) continue;
    const header = rows[0].map((cell) => cleanText(cell));
    const at = (row, column) => {
      const index = header.indexOf(column);
      return index >= 0 ? cleanText(row[index]) : '';
    };
    for (const row of rows.slice(1)) {
      add('telegram', at(row, 'telegramUserId'));
      add('line', at(row, 'lineUserId'));
      add('whatsapp', at(row, 'whatsappPhone'));
      const channelUserId = at(row, 'channelUserId');
      const rowChannel = at(row, 'channel').toLowerCase();
      if (channelUserId) {
        for (const ch of rowChannel ? [rowChannel] : ['telegram', 'line', 'whatsapp', 'web']) add(ch, channelUserId);
      }
      // Legacy rows stored the raw channel id as userId.
      const userId = at(row, 'userId');
      if (userId && !userId.startsWith('usr_')) for (const ch of ['telegram', 'line', 'whatsapp']) add(ch, userId);
    }
  }
  return [...pairs.values()];
}

module.exports = {
  UNLISTED_TABS,
  collectCandidatePairs,
  CHANNEL_COLUMNS,
  USER_ID_COLUMNS,
  buildSubject,
  eraseSubject,
  exportSubject,
  rowMatches,
  setSheetsAdapterForTests,
};
