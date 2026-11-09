// The consent gate is on for this file. A language switch must not be saved
// before the user consents, and privacy copy follows the same language rules.
process.env.GRINGO_PRIVACY_CONSENT_GATE = 'on';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { crmAgentService } = require('../src/modules/crm-agent');
const { handleChannelPrivacy } = require('../src/modules/privacy/privacy-channel');
const privacyNotice = require('../src/modules/privacy/privacy-notice');

const HE_Q = 'מה הזכויות שלי כעובד בניין בישראל';

function id() {
  return `tg-lang-${crypto.randomBytes(4).toString('hex')}`;
}

test('a language switch is blocked before privacy consent', async () => {
  const channelUserId = id();
  for (const messageText of ['/language he', 'עברית', 'ไทย', 'English']) {
    const result = await handleChannelPrivacy('telegram', { channelUserId, messageText, languageCode: 'en' });
    assert.equal(result.status, 'PRIVACY_CONSENT_REQUIRED', messageText);
    assert.notEqual(result.status, 'LANGUAGE_UPDATED');
  }
  assert.equal(await crmAgentService.findUserByChannel('telegram', channelUserId), null);
});

test('privacy consent follows the message script before the Telegram app language', async () => {
  const hebrewOnEnglishPhone = await handleChannelPrivacy('telegram', {
    channelUserId: id(),
    messageText: HE_Q,
    languageCode: 'en',
  });
  assert.equal(hebrewOnEnglishPhone.status, 'PRIVACY_CONSENT_REQUIRED');
  assert.ok(hebrewOnEnglishPhone.reply.includes(privacyNotice.reply('he', 'consentRequired')));

  const hebrewOnThaiPhone = await handleChannelPrivacy('telegram', {
    channelUserId: id(),
    messageText: HE_Q,
    languageCode: 'th',
  });
  assert.ok(hebrewOnThaiPhone.reply.includes(privacyNotice.reply('he', 'consentRequired')));
  assert.equal(hebrewOnThaiPhone.reply.includes(privacyNotice.reply('th', 'consentRequired')), false);

  const emojiOnThaiPhone = await handleChannelPrivacy('telegram', {
    channelUserId: id(),
    messageText: '👍',
    languageCode: 'th',
  });
  assert.ok(emojiOnThaiPhone.reply.includes(privacyNotice.reply('th', 'consentRequired')));
});

test('an explicit saved language wins on privacy screens and adds the switch notice', async () => {
  const channelUserId = id();
  const accepted = await handleChannelPrivacy('telegram', {
    channelUserId,
    messageText: 'מסכים',
    languageCode: 'he',
  });
  assert.equal(accepted.status, 'PRIVACY_CONSENT_ACCEPTED');
  const user = await crmAgentService.findOrCreateUser({ channel: 'telegram', channelUserId });
  await crmAgentService.setPreferredLanguage(user.userId, 'th');

  const privacy = await handleChannelPrivacy('telegram', {
    channelUserId,
    messageText: 'פרטיות',
    languageCode: 'en',
  });
  assert.equal(privacy.status, 'PRIVACY_NOTICE');
  assert.ok(privacy.reply.includes(privacyNotice.getNotice('th').title));
  assert.match(privacy.reply, /התשובה בתאית/);
  assert.match(privacy.reply, /שלח: עברית/);

  const sameLanguage = await handleChannelPrivacy('telegram', {
    channelUserId,
    messageText: 'ความเป็นส่วนตัว',
    languageCode: 'en',
  });
  assert.ok(sameLanguage.reply.includes(privacyNotice.getNotice('th').title));
  assert.equal(sameLanguage.reply.includes('התשובה'), false);
});
