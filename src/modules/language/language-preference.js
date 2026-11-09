const { SUPPORTED_LANGUAGES } = require('./language.constants');
const { normalizeLanguageCode } = require('./language-detection.service');

// Whole-message language switches. A sentence that merely contains one of
// these words is not a switch.
const SWITCH_WORDS = Object.freeze({
  'עברית': 'he',
  hebrew: 'he',
  'ฮีบรู': 'he',
  'ภาษาฮีบรู': 'he',
  'ไทย': 'th',
  'ภาษาไทย': 'th',
  thai: 'th',
  'תאית': 'th',
  english: 'en',
  'אנגלית': 'en',
  'อังกฤษ': 'en',
  'ภาษาอังกฤษ': 'en',
});

const SWITCH_CODES = new Set(['he', 'th', 'en']);

const SWITCH_COMMAND = Object.freeze({
  he: 'עברית',
  th: 'ไทย',
  en: 'English',
});

const SAVED_LANGUAGE_NAMES = Object.freeze({
  he: Object.freeze({
    he: 'עברית', th: 'תאית', en: 'אנגלית', ar: 'ערבית', ru: 'רוסית', hi: 'הינדי', si: 'סינהלית', tl: 'טגלוג',
  }),
  th: Object.freeze({
    he: 'ฮีบรู', th: 'ไทย', en: 'อังกฤษ', ar: 'อาหรับ', ru: 'รัสเซีย', hi: 'ฮินดี', si: 'สิงหล', tl: 'ตากาล็อก',
  }),
  en: Object.freeze({
    he: 'Hebrew', th: 'Thai', en: 'English', ar: 'Arabic', ru: 'Russian', hi: 'Hindi', si: 'Sinhala', tl: 'Tagalog',
  }),
});

const CONFLICT_NOTICES = Object.freeze({
  he: (savedName) => `התשובה ב${savedName} כי זו השפה השמורה בפרופיל שלך. כדי לקבל תשובות בעברית, שלח: עברית`,
  th: (savedName) => `คำตอบเป็นภาษา${savedName} เพราะนี่คือภาษาที่บันทึกไว้ในโปรไฟล์ของคุณ หากต้องการคำตอบเป็นภาษาไทย ส่ง: ไทย`,
  en: (savedName) => `The answer is in ${savedName} because that is the language saved in your profile. To get answers in English, send: English`,
});

const SWITCH_DONE = Object.freeze({
  he: 'מעכשיו אענה לך בעברית.',
  th: 'ต่อจากนี้ฉันจะตอบเป็นภาษาไทย',
  en: 'From now on I will reply in English.',
});

const SWITCH_FAILED = Object.freeze({
  he: 'לא הצלחתי לשמור את השפה כרגע. נסה שוב מאוחר יותר.',
  th: 'ตอนนี้ยังบันทึกภาษาไม่ได้ โปรดลองอีกครั้งภายหลัง',
  en: 'I could not save the language right now. Please try again later.',
});

function parseLanguageSwitch(text = '') {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (!value) return '';
  const command = /^\/language(?:@\w+)?(?:\s+(\S+))?$/i.exec(value);
  if (command) {
    if (!command[1]) return '';
    const code = normalizeLanguageCode(command[1]);
    return SWITCH_CODES.has(code) ? code : '';
  }
  const word = SWITCH_WORDS[value] || SWITCH_WORDS[value.toLowerCase()];
  return SWITCH_CODES.has(word) ? word : '';
}

function savedLanguageName(code, inLanguage) {
  const names = SAVED_LANGUAGE_NAMES[inLanguage] || SAVED_LANGUAGE_NAMES.en;
  return names[code] || SUPPORTED_LANGUAGES[code] || code;
}

function languageConflictNotice(resolution = {}) {
  if (!resolution.conflict) return '';
  const messageLanguage = SWITCH_CODES.has(resolution.messageLanguage) ? resolution.messageLanguage : '';
  const saved = normalizeLanguageCode(resolution.language);
  if (!messageLanguage || !saved || saved === messageLanguage) return '';
  const build = CONFLICT_NOTICES[messageLanguage];
  return build ? build(savedLanguageName(saved, messageLanguage)) : '';
}

function appendLanguageConflictNotice(text = '', resolution = {}) {
  const notice = languageConflictNotice(resolution);
  const reply = String(text || '');
  if (!notice || !reply.trim() || reply.includes(notice)) return reply;
  return `${reply}\n\n${notice}`;
}

function languageSwitchReply(code, saved) {
  const language = SWITCH_CODES.has(code) ? code : 'en';
  return saved ? SWITCH_DONE[language] : SWITCH_FAILED[language];
}

module.exports = {
  SWITCH_COMMAND,
  SWITCH_DONE,
  SWITCH_FAILED,
  appendLanguageConflictNotice,
  languageConflictNotice,
  languageSwitchReply,
  parseLanguageSwitch,
};
