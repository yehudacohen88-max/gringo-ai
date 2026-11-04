// PRV-02 reports, PRV-03/04 retries, SEC-04 read-only GET.
const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const managerAgent = require('../src/modules/manager-agent/manager-agent.service');
const privacyService = require('../src/modules/privacy/privacy.service');
const privacyStore = require('../src/modules/privacy/privacy-store');
const erasure = require('../src/modules/privacy/privacy-erasure.service');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const notificationService = require('../src/modules/notifications/notification.service');
const notificationRepository = require('../src/modules/notifications/notification.repository');

afterEach(() => {
  mock.restoreAll();
  erasure.setSheetsAdapterForTests(null);
  privacyStore.resetLocalForTests();
});

test('report lists only questions asked by at least 2 conversations, redacted', () => {
  const rows = [
    { question: 'where is my visa office' },
    { question: 'where is my visa office' },
    { question: 'my phone is 052-123-4567 call me' },
  ];
  const summary = managerAgent.summarizeQuestions(rows);
  assert.match(summary, /where is my visa office \(2\)/);
  assert.ok(!summary.includes('052'));
  const repeatedPhone = managerAgent.summarizeQuestions([{ question: 'call 0521234567' }, { question: 'call 0521234567' }]);
  assert.ok(!repeatedPhone.includes('0521234567'));
  assert.match(repeatedPhone, /\[number\]/);
});

test('report counts only users who allow processing, fail closed on error', async () => {
  mock.method(crmAgentRepository, 'findUserProfileRecordByUserId', async () => null);
  const original = privacyService.allowsProcessingForUser;
  mock.method(privacyService, 'allowsProcessingForUser', async (userId) => {
    if (userId === 'usr_err') throw new Error('sheets down');
    return userId === 'usr_ok';
  });
  const kept = await managerAgent.filterByConsent([
    { userId: 'usr_ok' }, { userId: 'usr_no' }, { userId: 'usr_err' }, { userId: '' }, { userId: 'usr_ok' },
  ]);
  assert.deepEqual(kept.map((r) => r.userId), ['usr_ok', 'usr_ok']);
  assert.ok(original);
});

function fakeSheets(sheets) {
  const writes = [];
  erasure.setSheetsAdapterForTests({
    configured: () => true,
    sheetNames: () => Object.keys(sheets),
    readSheetRows: async (name) => sheets[name],
    updateSheetRow: async (name, rowNumber, row) => {
      writes.push([name, rowNumber]);
      sheets[name][rowNumber - 1] = row;
    },
  });
  return writes;
}

test('retry finds a raw-id user without profile by keyed hash and completes deletion', async () => {
  mock.method(crmAgentRepository, 'findAllUserProfileRecords', async () => []);
  mock.method(crmAgentRepository, 'findUserProfileRecordByUserId', async () => null);
  for (const m of ['findUserProfileRecordByTelegramUserId', 'findUserProfileRecordByLineUserId', 'findUserProfileRecordByChannel']) mock.method(crmAgentRepository, m, async () => null);
  const sheets = {
    ConversationHistory: [
      ['userId', 'channel', 'question'],
      ['998877', 'telegram', 'secret question'],
      ['usr_other', 'web', 'other user'],
    ],
  };
  const writes = fakeSheets(sheets);
  await privacyStore.saveConsent({ subjectKey: privacyStore.subjectKey('telegram', '998877'), channel: 'telegram', status: 'deletion_pending', consentVersion: 'v', language: '', acceptedAt: '', updatedAt: 'now' });
  const result = await privacyService.retryPendingDeletions();
  assert.equal(result.attempted, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.stillPending, 0);
  assert.deepEqual(writes, [['ConversationHistory', 2]]);
  assert.equal(sheets.ConversationHistory[2][2], 'other user');
});

test('pending key with no data anywhere stays pending and is reported unresolved', async () => {
  mock.method(crmAgentRepository, 'findAllUserProfileRecords', async () => []);
  fakeSheets({ ConversationHistory: [['userId', 'channel'], ['usr_x', 'web']] });
  await privacyStore.saveConsent({ subjectKey: privacyStore.subjectKey('line', 'Uabc'), channel: 'line', status: 'deletion_pending', consentVersion: 'v', language: '', acceptedAt: '', updatedAt: 'now' });
  const result = await privacyService.retryPendingDeletions();
  assert.equal(result.unresolved, 1);
  assert.equal(result.stillPending, 1);
});

test('GET notifications shows expiry without writing (SEC-04)', async () => {
  const spy = mock.method(notificationRepository, 'updateNotification', async () => { throw new Error('must not write'); });
  mock.method(notificationRepository, 'findAllNotifications', async () => [
    { notificationId: 'n1', userId: 'usr_a', status: 'New', expiresAt: '2000-01-01T00:00:00Z', createdAt: '2000-01-01T00:00:00Z', title: 't', message: 'm', type: 'General' },
  ]);
  const list = await notificationService.getUserNotifications('usr_a', { includeScheduled: true });
  assert.equal(spy.mock.callCount(), 0);
  assert.equal(list[0].status, 'Expired');
});
