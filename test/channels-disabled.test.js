// Pilot: Telegram only. LINE and WhatsApp must be inert when their flags are off.
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const { env } = require('../src/config/env');

test('LINE and WhatsApp are off by default', () => {
  assert.equal(env.line.enabled, false);
  assert.equal(env.whatsapp.enabled, false);
});

test('disabled LINE webhook acknowledges without processing', async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/line/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [{ type: 'message' }] }) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).disabled, true);
  } finally {
    server.close();
  }
});

test('disabled channels start no background work', async () => {
  const intervals = [];
  mock.method(global, 'setInterval', (fn, ms) => { intervals.push(ms); return { unref() {} }; });
  const telegram = require('../src/modules/telegram');
  const line = require('../src/modules/line');
  const whatsapp = require('../src/modules/whatsapp');
  mock.method(telegram.telegramUpdateService, 'startPolling', async () => {});
  const lineCodes = mock.method(line.lineLinkService, 'expireOldCodes', async () => {});
  const lineDeliver = mock.method(line.lineDeliveryService, 'processPendingLineDeliveries', async () => []);
  const waDeliver = mock.method(whatsapp.whatsappDeliveryService, 'processPendingWhatsAppDeliveries', async () => []);
  const { startBackgroundWork } = require('../src/server');
  startBackgroundWork();
  await new Promise((r) => setImmediate(r));
  mock.restoreAll();
  assert.equal(lineCodes.mock.callCount(), 0);
  assert.equal(lineDeliver.mock.callCount(), 0);
  assert.equal(waDeliver.mock.callCount(), 0);
  assert.equal(intervals.length, 3); // telegram deliveries, privacy retry, notification expiry
});
