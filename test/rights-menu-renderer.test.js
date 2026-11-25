const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { classifyUserQuestion } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { legalDisclaimerText } = require('../src/modules/knowledge-agent/legal-disclaimer');
const { guardGeneratedLegalOutput } = require('../src/modules/knowledge-agent/legal-question-guard');
const { passesLegalVerification } = require('../src/modules/knowledge-agent/legal-verification');
const { handbookPdfUrl } = require('../src/modules/knowledge-agent/handbook-links');
const {
  PENDING_NATIVE_SPEAKER_REVIEW,
  RIGHTS_UNVERIFIED_FALLBACK_LEAD,
  SOURCE_LINE,
  createRightsUnverifiedFallback,
} = require('../src/modules/knowledge-agent/rights-unverified-fallback');
const {
  PENDING_FOUNDER_APPROVAL,
  RIGHTS_MENU_TOPIC_ORDER,
  RIGHTS_TOPIC_LABELS,
} = require('../src/modules/knowledge-agent/rights-menu.labels');
const {
  ENGLISH_MENU_LABEL,
  approvedRightsTopics,
  createRightsReplyMarkup,
  handbookButtonLabel,
  renderApprovedRecord,
  replyForRightsCallback,
  rightsCallbackAllowed,
} = require('../src/modules/knowledge-agent/rights-renderer');
const {
  inlineKeyboard,
  parseCallbackData,
  processCallback,
  urlButton,
} = require('../src/modules/telegram/telegram-message.service');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');

const DRAFTS = path.join(__dirname, '../knowledge/drafts');
const BLOCKED_TOPICS = ['deductions', 'annual_leave', 'deposit', 'complaints'];
const PHRASINGS = {
  passport: {
    he: 'האם המעסיק יכול לקחת את הדרכון?',
    en: 'Is my employer allowed to take my passport?',
  },
  construction_transfer: {
    he: 'אני עובד בניין. מתי מותר לי לעבור לתאגיד אחר?',
    en: 'I work in construction. When can I move to another manpower company?',
  },
  minimum_wage: {
    he: 'מה שכר המינימום',
    en: 'what is the minimum wage',
  },
  housing: {
    he: 'אנחנו 10 עובדים בחדר אחד. זה מותר?',
    en: 'We are 10 workers in one room. Is that allowed?',
  },
  medical_insurance: {
    he: 'המעסיק חייב לעשות לי ביטוח רפואי?',
    en: 'Does my employer have to give me health insurance?',
  },
  weekly_rest: {
    he: 'כמה מנוחה שבועית מגיעה לי?',
    en: 'weekly rest of 36 hours',
  },
  sick_leave: {
    he: 'כמה ימי מחלה',
    en: 'how many sick leave days',
  },
  severance: {
    he: 'מתי מגיעים פיצויי פיטורים?',
    en: 'am I entitled to severance',
  },
};

function readDraft(topic, language) {
  return JSON.parse(fs.readFileSync(path.join(DRAFTS, `${topic}.${language}.json`), 'utf8'));
}

function lead(record) {
  return String(record.answer || '').trim().split(/\n{2,}/)[0].trim();
}

function flatButtons(markup) {
  return (markup && markup.inline_keyboard ? markup.inline_keyboard : []).flat();
}

function englishLeads() {
  return RIGHTS_MENU_TOPIC_ORDER.map((topic) => lead(readDraft(topic, 'en')));
}

const profile = {
  userId: 'usr_rights_menu',
  fullName: 'Test Worker',
  country: 'Thailand',
  preferredLanguage: 'en',
  languageSource: 'explicit',
  detectedLanguage: 'en',
  language: 'en',
  workSector: 'Construction',
  profession: 'Worker',
  city: 'Tel Aviv',
  wantsJobAlerts: 'No',
  preferredCurrency: 'ILS',
  wantsExchangeRateAlerts: 'No',
};

function installStubs() {
  const saved = {
    findOrCreateUser: crmAgentService.findOrCreateUser,
    getUserMemory: crmAgentService.getUserMemory,
    getUserLanguage: crmAgentService.getUserLanguage,
    updateDetectedLanguage: crmAgentService.updateDetectedLanguage,
    updateUserProfile: crmAgentService.updateUserProfile,
    saveConversation: crmAgentService.saveConversation,
    extractAndUpdateMemory: crmAgentService.extractAndUpdateMemory,
    generateReply: aiProviderService.generateReply,
    fetch: global.fetch,
  };
  const aiCalls = [];
  crmAgentService.findOrCreateUser = async () => ({ userId: profile.userId, channel: 'web', channelUserId: 'rights-menu' });
  crmAgentService.getUserMemory = async () => profile;
  crmAgentService.getUserLanguage = async () => profile;
  crmAgentService.updateDetectedLanguage = async () => profile;
  crmAgentService.updateUserProfile = async () => profile;
  crmAgentService.saveConversation = async (event) => event;
  crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
  aiProviderService.generateReply = async () => {
    aiCalls.push('ai');
    return { provider: 'mock', model: 'm', text: 'MODEL TEXT that must not be shown' };
  };
  global.fetch = async () => {
    throw new Error('rights menu tests must not use the network');
  };
  return {
    aiCalls,
    restore() {
      Object.assign(crmAgentService, {
        findOrCreateUser: saved.findOrCreateUser,
        getUserMemory: saved.getUserMemory,
        getUserLanguage: saved.getUserLanguage,
        updateDetectedLanguage: saved.updateDetectedLanguage,
        updateUserProfile: saved.updateUserProfile,
        saveConversation: saved.saveConversation,
        extractAndUpdateMemory: saved.extractAndUpdateMemory,
      });
      aiProviderService.generateReply = saved.generateReply;
      global.fetch = saved.fetch;
    },
  };
}

async function ask(message, language) {
  profile.preferredLanguage = language;
  profile.language = language;
  profile.detectedLanguage = language;
  return coreAgentService.processWebMessage({
    message,
    channel: 'web',
    channelUserId: 'rights-menu',
    explicitLanguage: language,
  });
}

test('founder labels are new he/en UI text only and stay pending approval', () => {
  assert.equal(PENDING_FOUNDER_APPROVAL, 'PENDING_FOUNDER_APPROVAL');
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/knowledge-agent/rights-menu.labels.js'), 'utf8');
  assert.match(source, /PENDING_FOUNDER_APPROVAL/);
  assert.equal(/[\u0E00-\u0E7F\u0D80-\u0DFF\u0900-\u097F]/.test(source), false);
  assert.deepEqual(Object.keys(RIGHTS_TOPIC_LABELS).sort(), ['en', 'he']);
  assert.equal(RIGHTS_TOPIC_LABELS.en.construction_transfer, 'Changing employer in construction');
  assert.equal(RIGHTS_TOPIC_LABELS.he.construction_transfer, 'מעבר מעסיק בענף הבנייה');
  for (const language of ['he', 'en']) {
    for (const topic of [...RIGHTS_MENU_TOPIC_ORDER, 'other']) {
      const label = RIGHTS_TOPIC_LABELS[language][topic];
      assert.equal(typeof label, 'string', `${language}:${topic}`);
      assert.ok(label.length > 0 && label.length <= 40, label);
    }
  }
});

test('every topic button renders the approved record, source block, and disclaimer', () => {
  for (const language of ['he', 'en']) {
    const menu = createRightsReplyMarkup(language);
    const buttons = flatButtons(menu);
    const topics = approvedRightsTopics()[language];
    assert.deepEqual(topics, [...RIGHTS_MENU_TOPIC_ORDER]);
    assert.equal(buttons.length, topics.length + 1);
    for (const topic of topics) {
      const record = readDraft(topic, language);
      assert.equal(passesLegalVerification(record), true, record.id);
      const phrasing = PHRASINGS[topic][language];
      const classified = classifyUserQuestion(phrasing);
      assert.equal(classified.disposition, 'legal', phrasing);
      assert.deepEqual(classified.topics, [topic], phrasing);
      const today = guardGeneratedLegalOutput('', {
        question: phrasing,
        language,
        legalSegment: true,
        verifiedRecords: [record],
      });
      const rendered = renderApprovedRecord(record.id, language);
      assert.equal(rendered, today, record.id);
      assert.equal(rendered.startsWith(lead(record)), true, record.id);
      assert.equal(rendered.includes(legalDisclaimerText(language)), true, record.id);
      assert.equal((rendered.match(language === 'he' ? /^מקור:/gm : /^Source:/gm) || []).length, 1, record.id);
      const button = buttons.find((item) => item.callback_data === `show:rights:${topic}`);
      assert.equal(button.text, RIGHTS_TOPIC_LABELS[language][topic], record.id);
      assert.ok(button.callback_data.length <= 64, button.callback_data);
      const shown = replyForRightsCallback(parseCallbackData(button.callback_data), language);
      assert.equal(shown.reply, rendered, record.id);
      const otherLanguage = language === 'he' ? 'en' : 'he';
      assert.equal(rendered.includes(lead(readDraft(topic, otherLanguage))), false, record.id);
    }
    const other = buttons[buttons.length - 1];
    assert.equal(other.text, RIGHTS_TOPIC_LABELS[language].other);
    assert.equal(other.callback_data, 'show:rights:other');
    const otherReply = replyForRightsCallback(parseCallbackData(other.callback_data), language);
    assert.equal(otherReply.reply, createRightsUnverifiedFallback(language));
  }
});

test('an unknown or forged callback is rejected and a forged record id falls back', async () => {
  const forged = [
    'show:rights:deductions',
    'show:rights:annual_leave',
    'show:rights:deposit',
    'show:rights:complaints',
    'show:rights:not-a-topic',
    'show:rights:draft-piba2026-passport-en',
    'show:rights:en:deductions',
    'show:rights:en:passport:extra',
    'show:rights:th:passport',
    'show:rights:he:passport',
    'hack:rights:passport',
    'view:rights:passport',
    'lang:rights:he',
    'lang:rights:th',
    'lang:rights:hi',
    'lang:rights:si',
    'lang:rights:handbook:extra',
    'lang:rights:',
    'show:jobs:passport',
    'show:rights:',
    '',
  ];
  for (const data of forged) {
    assert.equal(rightsCallbackAllowed(parseCallbackData(data)), false, data);
    const result = await processCallback({
      callbackData: data,
      chatType: 'private',
      channelUserId: 'rights-forged',
      channelChatId: 'rights-forged',
      callbackQueryId: `q-${data.length}`,
    });
    assert.equal(result.rejected, true, data);
  }
  assert.equal(rightsCallbackAllowed(parseCallbackData('lang:rights:handbook')), true);
  assert.equal(rightsCallbackAllowed(parseCallbackData('lang:rights:en')), true);
  const passport = readDraft('passport', 'en');
  const forgedRender = renderApprovedRecord('draft-piba2026-passport-en-forged', 'en');
  assert.equal(forgedRender, createRightsUnverifiedFallback('en'));
  assert.equal(forgedRender.includes(lead(passport)), false);
  const mismatched = renderApprovedRecord(passport.id, 'he');
  assert.equal(mismatched, createRightsUnverifiedFallback('he'));
  assert.equal(mismatched.includes(lead(passport)), false);
  for (const topic of BLOCKED_TOPICS) {
    for (const language of ['he', 'en', 'th', 'hi', 'si']) {
      const record = readDraft(topic, language);
      assert.equal(passesLegalVerification(record), false, record.id);
      const rendered = renderApprovedRecord(record.id, language === 'th' || language === 'hi' || language === 'si' ? language : language);
      assert.equal(rendered.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language === 'he' || language === 'en' ? language : language]), true, record.id);
      if (record.answer) assert.equal(rendered.includes(lead(record)), false, record.id);
    }
  }
});

test('thai, hindi, and sinhala users do not receive English legal text before lang:en', async () => {
  const stubs = installStubs();
  try {
    const questions = [
      ['th', 'นายจ้างยึดหนังสือเดินทางของฉันได้ไหม'],
      ['hi', 'क्या मेरा नियोक्ता मेरा पासपोर्ट अपने पास रख सकता है?'],
      ['si', 'මගේ සේවා යෝජකයාට මගේ විදේශ ගමන් බලපත්‍රය තබා ගන්න පුළුවන්ද?'],
    ];
    for (const [language, question] of questions) {
      const result = await ask(question, language);
      assert.equal(stubs.aiCalls.length, 0, language);
      assert.equal(result.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), true, language);
      assert.equal(result.reply.includes('MODEL TEXT'), false, language);
      for (const text of englishLeads()) {
        assert.equal(result.reply.includes(text), false, language);
        assert.equal(JSON.stringify(result.replyMarkup).includes(text), false, language);
      }
      const buttons = flatButtons(result.replyMarkup);
      assert.equal(buttons.length, 2, language);
      assert.equal(buttons[0].url, handbookPdfUrl(language), language);
      assert.equal(buttons[0].callback_data, undefined, language);
      assert.equal(buttons[0].text, handbookButtonLabel(language), language);
      assert.equal(SOURCE_LINE[language].includes(buttons[0].text), true, language);
      assert.ok(PENDING_NATIVE_SPEAKER_REVIEW.includes(language), language);
      assert.equal(buttons[1].text, ENGLISH_MENU_LABEL);
      assert.equal(buttons[1].text, 'English');
      assert.equal(buttons[1].callback_data, 'lang:rights:en');
      assert.equal(buttons.some((item) => String(item.callback_data || '').startsWith('show:')), false, language);

      const opened = replyForRightsCallback(parseCallbackData('lang:rights:en'), language);
      assert.equal(opened.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), true, language);
      for (const text of englishLeads()) assert.equal(opened.reply.includes(text), false, language);
      const passportButton = flatButtons(opened.replyMarkup).find((item) => item.callback_data === 'show:rights:en:passport');
      assert.equal(passportButton.text, RIGHTS_TOPIC_LABELS.en.passport);
      const beforeTap = replyForRightsCallback(parseCallbackData('show:rights:passport'), language);
      assert.equal(beforeTap.reply, createRightsUnverifiedFallback(language));
      for (const text of englishLeads()) assert.equal(beforeTap.reply.includes(text), false, language);
      const handbook = replyForRightsCallback(parseCallbackData('lang:rights:handbook'), language);
      assert.equal(handbook.reply, createRightsUnverifiedFallback(language));
      assert.equal(flatButtons(handbook.replyMarkup)[0].url, handbookPdfUrl(language));
      const shown = replyForRightsCallback(parseCallbackData(passportButton.callback_data), language);
      assert.equal(shown.reply, renderApprovedRecord(readDraft('passport', 'en').id, 'en'));
      assert.equal(shown.reply.startsWith(lead(readDraft('passport', 'en'))), true);
    }
  } finally {
    stubs.restore();
  }
});

test('hebrew and english legal questions keep the answer and add the topic menu', async () => {
  const stubs = installStubs();
  try {
    for (const language of ['he', 'en']) {
      const record = readDraft('minimum_wage', language);
      const result = await ask(PHRASINGS.minimum_wage[language], language);
      assert.equal(stubs.aiCalls.length, 0, language);
      assert.equal(result.reply.includes(lead(record)), true, language);
      assert.equal(result.reply.includes('MODEL TEXT'), false, language);
      assert.equal(result.status, 'LEGAL_VERIFIED', language);
      const buttons = flatButtons(result.replyMarkup);
      assert.deepEqual(
        buttons.map((item) => item.callback_data),
        [...RIGHTS_MENU_TOPIC_ORDER.map((topic) => `show:rights:${topic}`), 'show:rights:other']
      );
      const blocked = await ask(language === 'he' ? 'מה מותר למעסיק לנכות לי מהמשכורת?' : 'What is my employer allowed to deduct from my salary?', language);
      assert.equal(blocked.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), true, language);
      assert.equal(blocked.reply.includes(lead(readDraft('deductions', language))), false, language);
      assert.equal(flatButtons(blocked.replyMarkup).some((item) => String(item.callback_data).includes('deductions')), false);
    }
    const job = await ask('find me a construction job in Tel Aviv', 'en');
    assert.equal(JSON.stringify(job.replyMarkup || {}).includes('rights'), false);
    assert.equal(job.reply.includes(lead(readDraft('construction_transfer', 'en'))), false);
  } finally {
    stubs.restore();
  }
});

test('inline keyboards keep callback buttons and can add a handbook url button', () => {
  const markup = inlineKeyboard([
    [urlButton(handbookButtonLabel('th'), handbookPdfUrl('th'))],
    [{ text: 'Passport', data: 'show:rights:passport' }],
  ]);
  assert.deepEqual(markup.inline_keyboard[0][0], {
    text: handbookButtonLabel('th'),
    url: handbookPdfUrl('th'),
  });
  assert.deepEqual(markup.inline_keyboard[1][0], {
    text: 'Passport',
    callback_data: 'show:rights:passport',
  });
  assert.equal(Object.hasOwn(markup.inline_keyboard[0][0], 'callback_data'), false);
  assert.equal(Object.hasOwn(markup.inline_keyboard[1][0], 'url'), false);
});

test('approved answers stay approved and blocked drafts stay blocked', () => {
  const topics = approvedRightsTopics();
  assert.equal(topics.he.length, 8);
  assert.equal(topics.en.length, 8);
  for (const topic of RIGHTS_MENU_TOPIC_ORDER) {
    for (const language of ['he', 'en']) {
      const record = readDraft(topic, language);
      assert.equal(passesLegalVerification(record), true, record.id);
      assert.equal(renderApprovedRecord(record.id, language).startsWith(lead(record)), true, record.id);
    }
    for (const language of ['th', 'hi', 'si']) {
      const record = readDraft(topic, language);
      assert.equal(record.answer, '', record.id);
      assert.equal(passesLegalVerification(record), false, record.id);
      const rendered = renderApprovedRecord(record.id, language);
      assert.equal(rendered, createRightsUnverifiedFallback(language), record.id);
      for (const text of englishLeads()) assert.equal(rendered.includes(text), false, record.id);
    }
  }
});
