// Disk files, sheet gaps, and the deletion reply. Consent gate on, no live APIs.
process.env.GRINGO_PRIVACY_CONSENT_GATE = 'on';

const { describe, test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { env } = require('../src/config/env');
const aiBudget = require('../src/modules/ai-provider/ai-budget.service');
const erasure = require('../src/modules/privacy/privacy-erasure.service');
const privacyNotice = require('../src/modules/privacy/privacy-notice');
const privacyService = require('../src/modules/privacy/privacy.service');
const privacyStore = require('../src/modules/privacy/privacy-store');
const { handleChannelPrivacy } = require('../src/modules/privacy/privacy-channel');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const telegramUpdate = require('../src/modules/telegram/telegram-update.service');
const telegramMessageService = require('../src/modules/telegram/telegram-message.service');

const USER_A = '111222333';
const USER_B = '444555666';
const PHONE_A = '972500000001';
const PHONE_B = '972500000002';

function legacyKey(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex').slice(0, 24);
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gringo-erase-'));
}

function subjectFor(userId, channelUserId, phone) {
  return erasure.buildSubject(
    {
      userId,
      channel: 'telegram',
      channelUserId,
      telegramUserId: channelUserId,
      telegramChatId: channelUserId,
      whatsappPhone: phone,
      fullName: userId === 'usr_disk_a' ? 'Ada Disk' : 'Bo Disk',
    },
    { channel: 'telegram', channelUserId }
  );
}

describe('privacy erasure of disk files and sheet gaps', { concurrency: false }, () => {
  let dir;
  let budgetFile;
  let telegramFile;
  let lockFile;
  let previousEnv;
  let sheets;

  beforeEach(() => {
    dir = tempDir();
    budgetFile = path.join(dir, 'ai-budget.json');
    telegramFile = path.join(dir, 'telegram-state.json');
    lockFile = path.join(dir, 'gringo.lock');
    previousEnv = {
      budget: process.env.AI_BUDGET_STATE_FILE,
      telegram: process.env.TELEGRAM_STATE_FILE,
      lock: process.env.GRINGO_PROCESS_LOCK_FILE,
      userLimit: process.env.AI_DAILY_USER_LIMIT,
    };
    process.env.AI_BUDGET_STATE_FILE = budgetFile;
    process.env.TELEGRAM_STATE_FILE = telegramFile;
    process.env.GRINGO_PROCESS_LOCK_FILE = lockFile;
    process.env.AI_DAILY_USER_LIMIT = '2';
    fs.writeFileSync(lockFile, '4242', { mode: 0o600 });
    const day = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(budgetFile, JSON.stringify({
      day,
      global: 4,
      tokens: 80,
      denied: 1,
      perUser: [
        [legacyKey(`telegram:${USER_A}`), 2],
        [legacyKey(`telegram:${USER_B}`), 1],
      ],
    }));
    fs.writeFileSync(telegramFile, JSON.stringify({
      lastProcessedUpdateId: 50,
      processedUpdateIds: [49, 50],
      processedCallbackKeys: [
        `9001:${USER_A}:open:${USER_A}`,
        `9002:${USER_B}:open`,
      ],
    }, null, 2));
    aiBudget.reset({ reload: true });
    telegramUpdate.forgetMemoryForTests();
    privacyStore.resetLocalForTests();
    privacyService.resetForTests();
    sheets = {
      UserProfiles: [
        ['userId', 'channel', 'channelUserId', 'fullName', 'telegramUserId', 'whatsappPhone'],
        ['usr_disk_a', 'telegram', USER_A, 'Ada Disk', USER_A, PHONE_A],
        ['usr_disk_b', 'telegram', USER_B, 'Bo Disk', USER_B, PHONE_B],
      ],
      UserTasks: [
        ['taskId', 'userId', 'title'],
        ['t1', 'usr_disk_a', 'Ada task'],
        ['t2', 'usr_disk_b', 'Bo task'],
      ],
      DailyReports: [
        ['reportId', 'mostCommonQuestions'],
        ['daily_1', `jobs ${PHONE_A} and also ${PHONE_B}`],
      ],
      Jobs: [
        ['jobId', 'title'],
        ['j1', 'Farm work'],
      ],
    };
  });

  afterEach(() => {
    erasure.setSheetsAdapterForTests(null);
    if (previousEnv.budget === undefined) delete process.env.AI_BUDGET_STATE_FILE;
    else process.env.AI_BUDGET_STATE_FILE = previousEnv.budget;
    if (previousEnv.telegram === undefined) delete process.env.TELEGRAM_STATE_FILE;
    else process.env.TELEGRAM_STATE_FILE = previousEnv.telegram;
    if (previousEnv.lock === undefined) delete process.env.GRINGO_PROCESS_LOCK_FILE;
    else process.env.GRINGO_PROCESS_LOCK_FILE = previousEnv.lock;
    if (previousEnv.userLimit === undefined) delete process.env.AI_DAILY_USER_LIMIT;
    else process.env.AI_DAILY_USER_LIMIT = previousEnv.userLimit;
    aiBudget.reset();
    telegramUpdate.forgetMemoryForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function useSheets(extra = {}) {
    erasure.setSheetsAdapterForTests({
      configured: () => true,
      sheetNames: () => Object.keys(sheets),
      readSheetRows: async (name) => (sheets[name] || []).map((row) => [...row]),
      updateSheetRow: async (name, rowNumber, row) => { sheets[name][rowNumber - 1] = row; },
      ...extra,
    });
  }

  function budgetText() {
    return fs.readFileSync(budgetFile, 'utf8');
  }

  function telegramBody() {
    return JSON.parse(fs.readFileSync(telegramFile, 'utf8'));
  }

  test('deletion rekeys disk identifiers, keeps caps and replay, and leaves the other user and the lock', async () => {
    useSheets();
    const lockBefore = fs.readFileSync(lockFile);
    const subject = subjectFor('usr_disk_a', USER_A, PHONE_A);
    const result = await erasure.eraseSubject(subject);

    assert.deepEqual(result.failedSheets, []);
    assert.equal(result.retained.budgetCountersRemoved, 0);
    assert.equal(result.retained.processLockTouched, false);
    assert.ok(result.retained.budgetRekeyed >= 1);
    assert.ok(result.retained.telegramCallbackKeysRekeyed >= 1);
    assert.equal(fs.readFileSync(lockFile).equals(lockBefore), true);

    const savedBudget = budgetText();
    assert.equal(savedBudget.includes(USER_A), false);
    assert.equal(savedBudget.includes(legacyKey(`telegram:${USER_A}`)), false);
    assert.equal(savedBudget.includes(PHONE_A), false);
    const parsedBudget = JSON.parse(savedBudget);
    assert.equal(parsedBudget.global, 4);
    assert.equal(parsedBudget.tokens, 80);
    assert.ok(parsedBudget.perUser.some((entry) => entry[0] === legacyKey(`telegram:${USER_B}`) && entry[1] === 1));
    const adaCounter = parsedBudget.perUser.find((entry) => entry[1] === 2 && entry[0] !== legacyKey(`telegram:${USER_B}`));
    assert.ok(adaCounter, 'Ada counter kept under a non-legacy key');

    const savedTelegram = telegramBody();
    assert.equal(savedTelegram.lastProcessedUpdateId, 50);
    assert.deepEqual(savedTelegram.processedUpdateIds, [49, 50]);
    assert.deepEqual(savedTelegram.processedCallbackKeys, ['cq:9001', 'cq:9002']);
    assert.equal(JSON.stringify(savedTelegram).includes(USER_A), false);
    assert.equal(JSON.stringify(savedTelegram).includes(USER_B), false);
    assert.equal(sheets.UserTasks[2][1], 'usr_disk_b');
    assert.equal(sheets.Jobs[1][1], 'Farm work');
    assert.equal(JSON.stringify(sheets.UserProfiles).includes(USER_A), false);
    assert.equal(JSON.stringify(sheets.UserProfiles).includes('Bo Disk'), true);
    assert.equal(sheets.DailyReports[1][0], 'daily_1');
    assert.equal(sheets.DailyReports[1][1].includes(PHONE_A), false);
    assert.equal(sheets.DailyReports[1][1].includes(PHONE_B), true);
    assert.equal(sheets.DailyReports[1][1].includes('[erased]'), true);

    aiBudget.reset({ reload: true });
    assert.throws(() => aiBudget.reserve(`telegram:${USER_A}`), { reason: 'user_daily_limit' });
    aiBudget.reserve(`telegram:${USER_B}`);
    telegramUpdate.forgetMemoryForTests();
    assert.equal(telegramUpdate.wasCallbackProcessed({
      callbackQueryId: '9001',
      channelUserId: USER_A,
      callbackData: `open:${USER_A}`,
    }), true);
    assert.equal(telegramUpdate.wasCallbackProcessed({
      callbackQueryId: '9002',
      channelUserId: USER_B,
      callbackData: 'open',
    }), true);
    assert.equal(telegramUpdate.readState().lastProcessedUpdateId, 50);

    const again = await erasure.eraseSubject(subject);
    assert.equal(again.failedSheets.length, 0);
    assert.equal(again.retained.budgetRekeyed, 0);
    aiBudget.reset({ reload: true });
    assert.throws(() => aiBudget.reserve(`telegram:${USER_A}`), { reason: 'user_daily_limit' });
    assert.equal(fs.readFileSync(lockFile).equals(lockBefore), true);
    assert.equal(JSON.stringify(sheets).includes(USER_B), true);
  });

  test('an unconfigured tab is erased for this user only, and a failed tab list stays partial', async () => {
    sheets.ScratchPad = [
      ['noteId', 'userId', 'body'],
      ['s1', 'usr_disk_a', 'only Ada'],
      ['s2', 'usr_disk_b', 'only Bo'],
    ];
    useSheets({
      sheetNames: () => Object.keys(sheets).filter((name) => name !== 'ScratchPad'),
      listExtraSheetNames: async () => ['ScratchPad'],
    });
    const result = await erasure.eraseSubject(subjectFor('usr_disk_a', USER_A, PHONE_A));
    assert.deepEqual(result.failedSheets, []);
    assert.equal(sheets.ScratchPad[1].every((cell) => cell === ''), true);
    assert.equal(sheets.ScratchPad[2][1], 'usr_disk_b');

    sheets.UserProfiles[1] = ['usr_disk_a', 'telegram', USER_A, 'Ada Disk', USER_A, PHONE_A];
    useSheets({
      listExtraSheetNames: async () => { throw new Error('list failed'); },
    });
    const partial = await erasure.eraseSubject(subjectFor('usr_disk_a', USER_A, PHONE_A));
    assert.ok(partial.failedSheets.includes(erasure.UNLISTED_TABS));
    assert.ok(partial.deferredSheets.includes('UserProfiles'));
    assert.equal(sheets.UserProfiles[1][3], 'Ada Disk');
  });

  test('a sheet write failure and a disk write failure both keep the profile and recover on retry', async () => {
    const calls = { tasks: 0 };
    useSheets({
      updateSheetRow: async (name, rowNumber, row) => {
        if (name === 'UserTasks' && calls.tasks < 1) {
          calls.tasks += 1;
          throw new Error('quota');
        }
        sheets[name][rowNumber - 1] = row;
      },
    });
    aiBudget.snapshot();
    const blocker = path.join(dir, 'not-a-directory');
    fs.writeFileSync(blocker, 'x');
    process.env.AI_BUDGET_STATE_FILE = path.join(blocker, 'ai-budget.json');
    const failed = await erasure.eraseSubject(subjectFor('usr_disk_a', USER_A, PHONE_A));
    assert.ok(failed.failedSheets.includes('UserTasks'));
    assert.ok(failed.failedSheets.includes('ai-budget-state'));
    assert.ok(failed.deferredSheets.includes('UserProfiles'));
    assert.equal(sheets.UserProfiles[1][3], 'Ada Disk');
    assert.equal(budgetText().includes(legacyKey(`telegram:${USER_A}`)), true, 'failed rekey does not rewrite the budget file');
    assert.equal(fs.readFileSync(lockFile, 'utf8'), '4242');

    process.env.AI_BUDGET_STATE_FILE = budgetFile;
    calls.tasks = 1;
    const recovered = await erasure.eraseSubject(subjectFor('usr_disk_a', USER_A, PHONE_A));
    assert.deepEqual(recovered.failedSheets, []);
    assert.equal(JSON.stringify(sheets.UserProfiles).includes('Ada Disk'), false);
    assert.equal(JSON.stringify(sheets.UserTasks).includes('Ada task'), false);
    assert.equal(sheets.UserTasks[2][2], 'Bo task');
    assert.equal(budgetText().includes(legacyKey(`telegram:${USER_A}`)), false);
    aiBudget.reset({ reload: true });
    assert.throws(() => aiBudget.reserve(`telegram:${USER_A}`), { reason: 'user_daily_limit' });
  });

  test('telegram state that cannot be saved does not drop replay keys or claim success', async () => {
    telegramUpdate.readState();
    const blocker = path.join(dir, 'telegram-blocked');
    fs.writeFileSync(blocker, 'x');
    process.env.TELEGRAM_STATE_FILE = path.join(blocker, 'nested', 'telegram-state.json');
    useSheets();
    const result = await erasure.eraseSubject(subjectFor('usr_disk_a', USER_A, PHONE_A));
    assert.ok(result.failedSheets.includes('telegram-state'));
    assert.equal(sheets.UserProfiles[1][3], 'Ada Disk');
    process.env.TELEGRAM_STATE_FILE = telegramFile;
    telegramUpdate.forgetMemoryForTests();
    const body = telegramBody();
    assert.equal(body.processedCallbackKeys.includes(`9001:${USER_A}:open:${USER_A}`), true);
    assert.equal(body.lastProcessedUpdateId, 50);
    assert.equal(telegramUpdate.wasCallbackProcessed({
      callbackQueryId: '9001',
      channelUserId: USER_A,
      callbackData: `open:${USER_A}`,
    }), true);
  });

  test('privacy audit stores the HMAC subject key and the deletion reply discloses retained copies', async () => {
    useSheets();
    await crmAgentRepository.createUserProfile({
      userId: 'usr_disk_a',
      channel: 'telegram',
      channelUserId: USER_A,
      telegramUserId: USER_A,
      fullName: 'Ada Disk',
    });
    const identity = { channel: 'telegram', channelUserId: USER_A };
    await privacyService.acceptConsent(identity, 'en');
    const pending = privacyService.requestDeletion(identity);
    const outcome = await privacyService.confirmDeletion(identity, pending.confirmationCode);
    assert.equal(outcome.complete, true);
    const audit = privacyStore.localAuditEntries().find((entry) => entry.event === 'delete' && entry.outcome === 'ok');
    assert.ok(audit);
    assert.equal(audit.subjectKey, privacyStore.subjectKey('telegram', USER_A));
    assert.equal(JSON.stringify(audit).includes(USER_A), false);
    assert.equal(audit.subjectKey.includes('gringo-local-privacy-key'), false);

    for (const lang of ['en', 'he', 'th']) {
      const id = lang === 'en' ? '555666111' : lang === 'he' ? '555666222' : '555666333';
      await crmAgentRepository.createUserProfile({
        userId: `usr_${id}`,
        channel: 'telegram',
        channelUserId: id,
        telegramUserId: id,
        fullName: `Person ${lang}`,
      });
      const asked = await handleChannelPrivacy('telegram', {
        channelUserId: id,
        messageText: lang === 'he' ? 'מחק את המידע שלי' : lang === 'th' ? 'ลบข้อมูล' : 'delete my data',
        languageCode: lang,
      });
      const code = (asked.reply.match(/\b\d{6}\b/) || [])[0];
      assert.ok(code, `${lang} confirmation code`);
      const prefix = lang === 'he' ? 'מחק את המידע שלי' : lang === 'th' ? 'ลบข้อมูล' : 'delete my data';
      const done = await handleChannelPrivacy('telegram', {
        channelUserId: id,
        messageText: `${prefix} ${code}`,
        languageCode: lang,
      });
      assert.equal(done.status, 'PRIVACY_DELETED');
      assert.ok(done.reply.startsWith(privacyNotice.reply(lang, 'deleteDone')));
      const limits = privacyNotice.getNotice(lang).limits;
      assert.ok(done.reply.includes(limits));
      assert.match(limits, /Telegram/);
      assert.match(limits, /OpenAI/);
      assert.match(limits, /Google/);
      assert.match(limits, /Render/);
      assert.match(limits, /7/);
      assert.match(limits, /30/);
      assert.equal(/immediately/i.test(done.reply), false);
    }
  });

  test('a missing secret records callback dedup without a raw telegram id', async () => {
    const previous = env.webSessionSecret;
    env.webSessionSecret = '';
    const seen = [];
    const privacy = mock.method(privacyService, 'allowsPersonalProcessing', async () => true);
    const handler = mock.method(telegramMessageService, 'processCallback', async (_callback, options) => {
      seen.push(Boolean(options.duplicate));
      return { duplicate: Boolean(options.duplicate) };
    });
    const userId = '111222333';
    const chatId = '444555666';
    const queryId = '7777';
    const update = (updateId) => ({
      update_id: updateId,
      callback_query: {
        id: queryId,
        data: `open:${userId}`,
        from: { id: Number(userId), language_code: 'en' },
        message: { message_id: 7, chat: { id: Number(chatId), type: 'private' } },
      },
    });
    try {
      const first = await telegramUpdate.processUpdate(update(80));
      const second = await telegramUpdate.processUpdate(update(81));
      assert.equal(first.processed, true);
      assert.equal(first.duplicate, false);
      assert.equal(second.duplicate, true);
      assert.deepEqual(seen, [false, true]);
      const saved = fs.readFileSync(telegramFile, 'utf8');
      assert.equal(saved.includes(userId), false);
      assert.equal(saved.includes(chatId), false);
      assert.equal(saved.includes(`open:${userId}`), false);
      assert.equal(saved.includes(`cq:${queryId}`), true);
      telegramUpdate.forgetMemoryForTests();
      assert.equal(telegramUpdate.wasCallbackProcessed({
        callbackQueryId: queryId,
        channelUserId: userId,
        callbackData: `open:${userId}`,
      }), true);
    } finally {
      privacy.mock.restore();
      handler.mock.restore();
      env.webSessionSecret = previous;
    }
  });

  test('free-text redaction does not change another user\'s cells', async () => {
    const prefix = '111222';
    const longer = '111222333';
    const phoneA = '972500000001';
    const phoneB = '972500000002';
    sheets.UserProfiles = [
      ['userId', 'channel', 'channelUserId', 'fullName', 'telegramUserId', 'whatsappPhone'],
      ['usr_prefix_owner', 'telegram', prefix, 'Prefix Person', prefix, phoneA],
      [longer, 'telegram', longer, 'Longer Person', longer, phoneB],
    ];
    sheets.UserTasks = [
      ['taskId', 'userId', 'title', 'notes'],
      ['t-prefix', 'usr_prefix_owner', 'mine', `call ${phoneA}`],
      ['t-longer', longer, `task ${longer}`, `mentioned ${phoneA} and ${longer}`],
      ['t-numeric', longer, '1234567', '123456'],
    ];
    sheets.DailyReports = [
      ['reportId', 'mostCommonQuestions', 'other'],
      ['daily_shared', `see ${prefix}999 and ${longer} and ${phoneA} / ${phoneB}`, 'leave-this'],
    ];
    const beforeLongerProfile = sheets.UserProfiles[2].slice();
    const beforeLongerTask = sheets.UserTasks[2].slice();
    const beforeNumericTask = sheets.UserTasks[3].slice();
    const beforeSharedOther = sheets.DailyReports[1][2];
    useSheets();
    await erasure.eraseSubject(erasure.buildSubject(
      {
        userId: 'usr_prefix_owner',
        channel: 'telegram',
        channelUserId: prefix,
        telegramUserId: prefix,
        whatsappPhone: phoneA,
      },
      { channel: 'telegram', channelUserId: prefix }
    ));
    assert.deepEqual(sheets.UserProfiles[2], beforeLongerProfile);
    assert.deepEqual(sheets.UserTasks[2], beforeLongerTask);
    assert.deepEqual(sheets.UserTasks[3], beforeNumericTask);
    assert.equal(sheets.DailyReports[1][2], beforeSharedOther);
    const shared = sheets.DailyReports[1][1];
    assert.equal(shared.includes(longer), true);
    assert.equal(shared.includes(`${prefix}999`), true);
    assert.equal(shared.includes(phoneB), true);
    assert.equal(shared.includes(phoneA), false);
    assert.equal(shared.includes('[erased]'), true);
    assert.equal(JSON.stringify(sheets.UserProfiles).includes('Prefix Person'), false);
  });

  test('a missing budget secret does not write a raw user id or an unsalted key', () => {
    const previous = env.webSessionSecret;
    env.webSessionSecret = '';
    const before = fs.readFileSync(budgetFile, 'utf8');
    try {
      assert.throws(() => aiBudget.reserve(`telegram:${USER_A}`), (error) => error.code === 'PRIVACY_KEY_UNAVAILABLE');
      assert.equal(fs.readFileSync(budgetFile, 'utf8'), before);
      assert.equal(before.includes(USER_A), false);
    } finally {
      env.webSessionSecret = previous;
    }
  });

  test('a missing WEB_SESSION_SECRET refuses subject keys instead of a known fallback', () => {
    const previous = env.webSessionSecret;
    const logs = [];
    const original = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    env.webSessionSecret = '';
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => privacyStore.subjectKey('telegram', USER_A),
        (error) => error.code === 'PRIVACY_KEY_UNAVAILABLE'
      );
      const known = crypto.createHmac('sha256', 'gringo-local-privacy-key').update(`telegram:${USER_A}`).digest('hex').slice(0, 40);
      const text = logs.join('\n');
      assert.equal(text.includes(known), false);
      assert.equal(text.includes(previous), false);
      assert.match(text, /REFUSING subject keys/);
      assert.match(text, /production/);
      assert.match(text, /known fallback key is not used/);
    } finally {
      console.error = original;
      env.webSessionSecret = previous;
      process.env.NODE_ENV = nodeEnv;
    }
  });
});
