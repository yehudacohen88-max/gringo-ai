const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { classifyUserQuestion } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { containsUnapprovedLegalClaim } = require('../src/modules/knowledge-agent/legal-question-guard');
const {
  CLARIFICATION,
  RIGHTS_UNVERIFIED_FALLBACK_LEAD,
  createRightsUnverifiedFallback,
} = require('../src/modules/knowledge-agent/rights-unverified-fallback');
const { coreAgentService } = require('../src/modules/core-agent');
const { aiProviderService } = require('../src/modules/ai-provider');
const { crmAgentService } = require('../src/modules/crm-agent');
const telegramMessageService = require('../src/modules/telegram/telegram-message.service');

const DRAFTS = path.join(__dirname, '../knowledge/drafts');

function readDraft(topic, language) {
  return JSON.parse(fs.readFileSync(path.join(DRAFTS, `${topic}.${language}.json`), 'utf8'));
}

function answerLead(record) {
  return String(record.answer || '').trim().split(/\n{2,}/)[0].trim();
}

const profile = {
  userId: 'usr_sinhala_legal_safety',
  fullName: 'Test Worker',
  country: 'Sri Lanka',
  preferredLanguage: 'si',
  languageSource: 'explicit',
  detectedLanguage: 'si',
  language: 'si',
  workSector: 'Construction',
  profession: 'Worker',
  city: 'Tel Aviv',
  wantsJobAlerts: 'No',
  preferredCurrency: 'ILS',
  wantsExchangeRateAlerts: 'No',
};

const aiCalls = [];
let aiReply = 'ORDINARY_REPLY The amount you asked about is 1000 shekels.';

crmAgentService.findOrCreateUser = async () => ({
  userId: profile.userId,
  channel: 'telegram',
  channelUserId: 'sinhala-legal-safety',
});
crmAgentService.getUserMemory = async () => profile;
crmAgentService.getUserLanguage = async () => ({
  preferredLanguage: profile.preferredLanguage,
  languageSource: profile.languageSource,
  detectedLanguage: profile.detectedLanguage,
  language: profile.language,
});
crmAgentService.updateDetectedLanguage = async () => profile;
crmAgentService.updateUserProfile = async () => profile;
crmAgentService.saveConversation = async (event) => event;
crmAgentService.extractAndUpdateMemory = async () => ({ signals: { interests: [] } });
crmAgentService.setPreferredLanguage = async () => profile;
aiProviderService.generateReply = async () => {
  aiCalls.push(aiReply);
  return { provider: 'mock', model: 'stub', text: aiReply };
};

function useProfile(language) {
  profile.preferredLanguage = language;
  profile.detectedLanguage = language;
  profile.language = language;
  profile.languageSource = 'explicit';
}

async function askTelegram(message, language, channelUserId = 'sinhala-legal-safety') {
  useProfile(language);
  const before = aiCalls.length;
  const result = await telegramMessageService.processTelegramMessage({
    messageText: message,
    channelUserId,
    channelChatId: `${channelUserId}-chat`,
    languageCode: language,
  });
  return {
    reply: String(result.reply || ''),
    status: result.status,
    calledModel: aiCalls.length > before,
  };
}

const SINHALA_LEGAL = [
  ['passport', 'පාස්පෝට් එක යෝජකයා ලග තියාගන්න පුළුවන්ද?'],
  ['minimum_wage', 'විදේශ සේවකයෙක්ගේ අවම වැටුප කීයද?'],
  ['medical_insurance', 'වෛද්‍ය රක්ෂණය සේවා යෝජකයා දෙනවද?'],
  ['housing', 'එක කාමරයක කම්කරුවන් කී දෙනෙක් ඉන්න පුළුවන්ද?'],
  ['severance', 'මාව වැඩෙන් ඉවත් කළා. වන්දි තියෙනවද?'],
  ['rights', 'විදේශ සේවකයෙක්ගේ හිමිකම් මොනවද?'],
  ['unlisted', 'කොන්ත්‍රාත්තුවේ කාලය ගැන කියන්න'],
];

const CLAIMS = {
  en: 'FAKE_CLAIM Under section 4 you are entitled to 2,000 shekels.',
  he: 'FAKE_CLAIM לפי סעיף 4 מגיע לך 2,000 שקלים.',
  th: 'FAKE_CLAIM ตามมาตรา ๔ คุณมีสิทธิได้รับ ๒,๐๐๐ บาท',
  hi: 'FAKE_CLAIM धारा 4 के अनुसार आप 2,000 शेकेल के हकदार हैं।',
  si: 'FAKE_CLAIM 4 වගන්තිය අනුව ඔබට ෂෙකල් 2,000 ක් හිමි වේ.',
};

const GREETINGS = {
  en: 'hello',
  he: 'שלום',
  th: 'สวัสดี',
  hi: 'नमस्ते',
  si: 'ආයුබෝවන්',
};

test('unlisted Sinhala legal questions are blocked before the model', async () => {
  aiReply = CLAIMS.en;
  const wageLead = answerLead(readDraft('minimum_wage', 'en'));
  for (const [topic, message] of SINHALA_LEGAL) {
    const classified = classifyUserQuestion(message);
    assert.notEqual(classified.disposition, 'practical', topic);
    assert.notEqual(classified.disposition, 'none', topic);
    assert.equal(classified.topic || 'unspecified', 'unspecified', topic);
    const result = await askTelegram(message, 'si', `si-legal-${topic}`);
    assert.equal(result.calledModel, false, topic);
    assert.equal(result.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.si), true, topic);
    assert.equal(result.reply.includes('FAKE_CLAIM'), false, topic);
    assert.equal(result.reply.includes('section 4'), false, topic);
    assert.equal(result.reply.includes('2,000'), false, topic);
    assert.equal(result.reply.includes(wageLead.slice(0, 40)), false, topic);
  }
});

test('a mixed Sinhala job and wage question uses the fallback', async () => {
  aiReply = CLAIMS.en;
  const message = 'තෙල් අවිව් එකේ රැකියාවක් සොයන්න. අවම වැටුප කීයද?';
  const classified = classifyUserQuestion(message);
  assert.equal(classified.practical.job, true);
  assert.equal(classified.disposition, 'uncertain');
  const result = await askTelegram(message, 'si', 'si-mixed');
  assert.equal(result.calledModel, false);
  assert.equal(result.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.si), true);
  assert.equal(result.reply.includes('FAKE_CLAIM'), false);
  assert.equal(result.reply.includes('6,443.85'), false);
});

test('ordinary Sinhala questions still get the model reply', async () => {
  aiReply = 'ORDINARY_REPLY The amount you asked about is 1000 shekels.';
  const ordinary = [
    'තෙල් අවිව් එකේ ඉදිකිරීම් රැකියාවක් සොයන්න',
    'ෂෙකල් බාත් විනිමය අනුපාතය කීයද? මුදල් යවන්නේ කොහොමද?',
    'ආයුබෝවන්',
    'පාස්පෝට් එක අලුත් කරන්නේ කොහෙද?',
  ];
  for (const message of ordinary) {
    const classified = classifyUserQuestion(message);
    assert.equal(classified.disposition, 'practical', message);
    const result = await askTelegram(message, 'si', `si-ordinary-${ordinary.indexOf(message)}`);
    assert.equal(result.calledModel, true, message);
    assert.equal(result.reply.includes('ORDINARY_REPLY'), true, message);
    assert.equal(result.reply.includes('1000 shekels'), true, message);
    assert.equal(result.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.si), false, message);
    assert.equal(result.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.en), false, message);
  }
});

test('a Sinhala wage hint does not display the English handbook record', async () => {
  aiReply = CLAIMS.en;
  const result = await askTelegram('අවම වැටුප කීයද?', 'en', 'si-wage-on-english');
  assert.equal(result.calledModel, false);
  assert.equal(result.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.en), true);
  assert.equal(result.reply.includes('6,443.85'), false);
  assert.equal(result.reply.includes('FAKE_CLAIM'), false);
  assert.match(result.reply, /සිංහල/);
});

test('Hindi on an English profile still shows the approved English record and a note', async () => {
  aiReply = CLAIMS.en;
  const lead = answerLead(readDraft('passport', 'en'));
  const result = await askTelegram('क्या मेरा नियोक्ता मेरा पासपोर्ट अपने पास रख सकता है?', 'en', 'hi-passport-en-profile');
  assert.equal(result.calledModel, false);
  assert.equal(result.reply.includes(lead), true);
  assert.equal(result.reply.includes('section 4'), true);
  assert.match(result.reply, /अंग्रेज़ी/);
  assert.equal(result.reply.includes('FAKE_CLAIM'), false);
});

test('Hebrew and English approved answers and a blocked topic stay on the old path', async () => {
  aiReply = CLAIMS.en;
  const passport = await askTelegram('Is my employer allowed to take my passport?', 'en', 'en-passport');
  assert.equal(passport.calledModel, false);
  assert.equal(passport.reply.includes(answerLead(readDraft('passport', 'en'))), true);
  assert.equal(passport.reply.includes('section 4'), true);
  assert.equal(passport.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.en), false);

  const wage = await askTelegram('מה שכר המינימום', 'he', 'he-wage');
  assert.equal(wage.calledModel, false);
  assert.equal(wage.reply.includes('6,443.85'), true);
  assert.equal(wage.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.he), false);

  const blocked = await askTelegram('What is my employer allowed to deduct from my salary?', 'en', 'en-blocked');
  assert.equal(blocked.calledModel, false);
  assert.equal(blocked.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD.en), true);
  const deduction = String(readDraft('deductions', 'en').answer || '').slice(0, 80);
  if (deduction) assert.equal(blocked.reply.includes(deduction), false);
});

test('detection bypass: a stubbed legal claim is filtered in every language', async () => {
  const markers = ['FAKE_CLAIM', '2,000', '๒,๐๐๐', 'section 4', 'סעיף 4', 'มาตรา ๔', 'धारा 4', 'වගන්තිය'];
  for (const language of ['en', 'he', 'th', 'hi', 'si']) {
    aiReply = CLAIMS[language];
    assert.equal(containsUnapprovedLegalClaim(aiReply), true, language);
    const classified = classifyUserQuestion(GREETINGS[language]);
    assert.equal(classified.disposition, 'practical', language);
    const result = await askTelegram(GREETINGS[language], language, `bypass-${language}`);
    assert.equal(result.calledModel, true, language);
    assert.equal(result.reply.includes(RIGHTS_UNVERIFIED_FALLBACK_LEAD[language]), true, language);
    for (const marker of markers) {
      assert.equal(result.reply.includes(marker), false, `${language} ${marker}`);
    }
  }
});

test('the claim filter ignores ordinary amounts and the existing fallback text', () => {
  assert.equal(containsUnapprovedLegalClaim('The amount you asked about is 1000 shekels.'), false);
  assert.equal(containsUnapprovedLegalClaim('Hello from the assistant.'), false);
  assert.equal(containsUnapprovedLegalClaim('AI should not invent a statute.'), false);
  assert.equal(containsUnapprovedLegalClaim('For 10 regular hours at 40 ILS per hour, basic gross pay is 400 ILS.'), false);
  for (const language of ['en', 'he', 'th', 'hi', 'si']) {
    assert.equal(containsUnapprovedLegalClaim(createRightsUnverifiedFallback(language)), false, language);
    assert.equal(containsUnapprovedLegalClaim(CLARIFICATION[language]), false, language);
  }
});
