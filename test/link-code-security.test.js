const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const app = require('../src/app');
const { env } = require('../src/config/env');
const { crmAgentService } = require('../src/modules/crm-agent');
const crmAgentRepository = require('../src/modules/crm-agent/crm-agent.repository');
const telegramLinkService = require('../src/modules/telegram/telegram-link.service');
const lineLinkService = require('../src/modules/line/line-link.service');
const linkCode = require('../src/shared/linkCode');
const { COOKIE_NAME, openWebSession } = require('../src/shared/webIdentity');

function listen() {
  const server = app.listen(0);
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function cookieValue(response) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${COOKIE_NAME}=`));
  assert.ok(header);
  return decodeURIComponent(header.split(';')[0].slice(COOKIE_NAME.length + 1));
}

async function readBody(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return text;
  }
}

function captureConsole() {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const lines = [];
  for (const method of Object.keys(original)) {
    console[method] = (...args) => {
      lines.push(args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(' '));
    };
  }
  return {
    lines,
    restore() {
      Object.assign(console, original);
    },
  };
}

test('link codes are 12 unbiased characters with at least 60 bits and an HMAC', () => {
  assert.ok(linkCode.ENTROPY_BITS >= 60);
  assert.equal(linkCode.CODE_LENGTH, 12);
  assert.equal(linkCode.ALPHABET.length, 32);
  const seen = new Set();
  const alphabet = new Set();
  for (let index = 0; index < 300; index += 1) {
    const code = linkCode.generatePlainCode();
    assert.equal(code.length, 12);
    assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);
    seen.add(code);
    for (const character of code) alphabet.add(character);
    const keyed = linkCode.hashCode(code);
    const unkeyed = crypto.createHash('sha256').update(code).digest('hex');
    assert.notEqual(keyed, unkeyed);
    assert.equal(linkCode.hashesEqual(keyed, linkCode.hashCode(code)), true);
  }
  assert.equal(seen.size, 300);
  assert.equal(alphabet.size, linkCode.ALPHABET.length);
});

test('telegram and line codes expire, cannot be reused, and are not written to logs', async () => {
  linkCode.resetLinkCodeSecurityForTests();
  const logs = captureConsole();
  const previousTtl = env.telegram.linkCodeTtlMinutes;
  try {
    const owner = await crmAgentService.findOrCreateUser({
      channel: 'web',
      channelUserId: `link-owner-${crypto.randomBytes(3).toString('hex')}`,
      fullName: 'Link Owner',
    });
    const created = await telegramLinkService.createLinkCode(owner.userId);
    assert.equal(logs.lines.some((line) => line.includes(created.code)), false);
    const history = await telegramLinkService.getLinkHistory(owner.userId);
    assert.equal(JSON.stringify(history).includes(created.code), false);

    const found = await telegramLinkService.findValidCode(created.code, 'tg-owner');
    assert.equal(found.error, undefined);
    const linked = await telegramLinkService.linkTelegramToProfile(found.code.linkCodeId, {
      telegramUserId: 'tg-owner',
      telegramChatId: 'chat-owner',
    });
    assert.equal(linked.error, undefined);
    assert.equal(linked.profile.telegramUserId, 'tg-owner');
    const reused = await telegramLinkService.findValidCode(created.code, 'tg-owner');
    assert.match(reused.error, /no longer active|not valid/);

    env.telegram.linkCodeTtlMinutes = -1;
    const expired = await lineLinkService.createLinkCode(owner.userId);
    const expiredResult = await lineLinkService.linkLineToProfile(expired.code, { lineUserId: 'U-expired' });
    assert.match(expiredResult.error, /expired/);
    env.telegram.linkCodeTtlMinutes = previousTtl;

    const lineCode = await lineLinkService.createLinkCode(owner.userId);
    const lineLinked = await lineLinkService.linkLineToProfile(lineCode.code, { lineUserId: 'U-owner' });
    assert.equal(lineLinked.error, undefined);
    const lineReuse = await lineLinkService.linkLineToProfile(lineCode.code, { lineUserId: 'U-other' });
    assert.match(lineReuse.error, /no longer active|not valid|cannot/);
    assert.equal(logs.lines.some((line) => line.includes(lineCode.code) || line.includes(expired.code)), false);
  } finally {
    env.telegram.linkCodeTtlMinutes = previousTtl;
    logs.restore();
    linkCode.resetLinkCodeSecurityForTests();
  }
});

test('redeem attempts lock per account, per code, and globally', async () => {
  linkCode.resetLinkCodeSecurityForTests();
  try {
    const owner = await crmAgentService.findOrCreateUser({
      channel: 'web',
      channelUserId: `limit-owner-${crypto.randomBytes(3).toString('hex')}`,
    });
    const created = await telegramLinkService.createLinkCode(owner.userId);

    for (let index = 0; index < linkCode.ACCOUNT_ATTEMPT_LIMIT; index += 1) {
      const result = await telegramLinkService.findValidCode(`WRONGCODE${index}AA`, 'tg-limited');
      assert.match(result.error, /not valid/);
    }
    const blocked = await telegramLinkService.findValidCode('WRONGCODEEXTRA', 'tg-limited');
    assert.match(blocked.error, /Too many link attempts/);

    linkCode.resetLinkCodeSecurityForTests();
    const repeatedGuess = 'SAMEWRONGCODE';
    for (let index = 0; index < linkCode.CODE_FAILURE_LIMIT; index += 1) {
      const result = await telegramLinkService.findValidCode(repeatedGuess, `tg-other-${index}`);
      assert.match(result.error, /not valid/);
    }
    const codeLocked = await telegramLinkService.findValidCode(repeatedGuess, 'tg-fresh-account');
    assert.match(codeLocked.error, /Too many link attempts/);

    linkCode.resetLinkCodeSecurityForTests();
    for (let index = 0; index < linkCode.GLOBAL_FAILURE_LIMIT; index += 1) {
      const result = await lineLinkService.linkLineToProfile(`BADLINECODE${index}`, { lineUserId: `U-global-${index}` });
      assert.match(result.error, /not valid/);
    }
    const globalLock = await lineLinkService.linkLineToProfile('BADLINECODEFINAL', { lineUserId: 'U-global-final' });
    assert.match(globalLock.error, /Too many link attempts/);
  } finally {
    linkCode.resetLinkCodeSecurityForTests();
  }
});

test('disconnect requires confirmation and the owning web session', async () => {
  linkCode.resetLinkCodeSecurityForTests();
  const server = listen();
  try {
    const started = await fetch(`${server.base}/api/chat/profile`);
    const ownerCookie = cookieValue(started);
    await readBody(started);
    const saved = await fetch(`${server.base}/api/chat/profile`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(ownerCookie)}`,
      },
      body: JSON.stringify({ fullName: 'Channel Owner' }),
    });
    const savedBody = await readBody(saved);
    assert.equal(saved.status, 200);
    const record = await crmAgentRepository.findUserProfileRecordByUserId(savedBody.profile.userId);
    await crmAgentRepository.updateUserProfile(record.rowNumber, {
      ...record.profile,
      telegramUserId: 'tg-victim',
      telegramChatId: 'chat-victim',
      lineUserId: 'U-victim',
      lineLinkStatus: 'Connected',
    });

    const ownerId = openWebSession(ownerCookie, env.webSessionSecret).webId;
    const unconfirmed = await fetch(`${server.base}/api/telegram/disconnect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(ownerCookie)}`,
      },
      body: JSON.stringify({ channelUserId: ownerId }),
    });
    const unconfirmedBody = await readBody(unconfirmed);
    assert.equal(unconfirmed.status, 409);
    assert.equal(unconfirmedBody.error.code, 'CONFIRMATION_REQUIRED');

    const intruderStart = await fetch(`${server.base}/api/chat/profile`);
    const intruderCookie = cookieValue(intruderStart);
    await readBody(intruderStart);
    const intruder = await fetch(`${server.base}/api/telegram/disconnect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(intruderCookie)}`,
      },
      body: JSON.stringify({ confirm: true, channel: 'telegram', channelUserId: 'tg-victim' }),
    });
    assert.equal(intruder.status, 400);
    await readBody(intruder);

    const intruderWeb = await fetch(`${server.base}/api/line/disconnect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(intruderCookie)}`,
      },
      body: JSON.stringify({ confirm: true, channel: 'web', channelUserId: ownerId }),
    });
    const intruderWebBody = await readBody(intruderWeb);
    assert.equal(intruderWeb.status, 409);
    assert.equal(intruderWebBody.error.code, 'CHANNEL_NOT_CONNECTED');

    const stillLinked = await crmAgentRepository.findUserProfileRecordByUserId(savedBody.profile.userId);
    assert.equal(stillLinked.profile.telegramUserId, 'tg-victim');
    assert.equal(stillLinked.profile.lineUserId, 'U-victim');

    const removed = await fetch(`${server.base}/api/telegram/disconnect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(ownerCookie)}`,
      },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(removed.status, 200);
    await readBody(removed);
    const after = await crmAgentRepository.findUserProfileRecordByUserId(savedBody.profile.userId);
    assert.equal(after.profile.telegramUserId, '');
    assert.equal(after.profile.lineUserId, 'U-victim');
  } finally {
    await server.close();
    linkCode.resetLinkCodeSecurityForTests();
  }
});

test('a link code is bound to the signed session, not a client-supplied user id', async () => {
  linkCode.resetLinkCodeSecurityForTests();
  const server = listen();
  try {
    const victim = await crmAgentService.findOrCreateUser({
      channel: 'web',
      channelUserId: `victim-${crypto.randomBytes(3).toString('hex')}`,
      fullName: 'Victim Profile',
    });
    const started = await fetch(`${server.base}/api/chat/profile`);
    const cookie = cookieValue(started);
    await readBody(started);
    const created = await fetch(`${server.base}/api/telegram/link-code`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${COOKIE_NAME}=${encodeURIComponent(cookie)}`,
      },
      body: JSON.stringify({ channel: 'web', channelUserId: victim.channelUserId }),
    });
    const body = await readBody(created);
    assert.equal(created.status, 201, JSON.stringify(body));
    const found = await telegramLinkService.findValidCode(body.linkCode.code, 'tg-attacker');
    assert.equal(found.error, undefined);
    assert.notEqual(found.code.userId, victim.userId);
  } finally {
    await server.close();
    linkCode.resetLinkCodeSecurityForTests();
  }
});
