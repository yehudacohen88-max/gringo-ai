// Static onboarding copy in Hebrew, English and Thai. Onboarding never
// depends on the AI or the translation provider for its own text.
// NOTE: the Thai strings still need a native-speaker review before workers join.

const { languageDetectionService } = require('../language');

const ONBOARDING_LANGUAGES = Object.freeze(['he', 'en', 'th']);

const STRINGS = Object.freeze({
  en: {
    questions: {
      preferredLanguage: 'Which language do you prefer? Reply: English, עברית (Hebrew) or ไทย (Thai).',
      fullName: 'What is your full name?',
      country: 'Which country are you from? For example: Thailand, Philippines, Sri Lanka. If it is not listed, type Other.',
      workSector: 'What work sector are you in? Reply: Construction, Agriculture, Caregiving or Other (or 1-4).',
      profession: 'What is your profession? You can type skip.',
      city: 'Which city in Israel do you live in now? You can type skip.',
      wantsJobAlerts: 'Would you like job alerts? Reply Yes or No. You can type skip.',
      preferredCurrency: 'Which currency do you prefer for money help? For example: THB, USD, ILS. You can type skip.',
      wantsExchangeRateAlerts: 'Would you like exchange-rate alerts? Reply Yes or No. You can type skip.',
    },
    invalid: {
      preferredLanguage: 'Sorry, I did not recognize that language. Please reply English, עברית or ไทย.',
      fullName: 'That does not look like a name. Please write only your name (letters, up to 5 words).',
      country: 'Sorry, I did not recognize that country. Please write only the country name, for example Thailand, or type Other.',
      workSector: 'Please choose one: Construction, Agriculture, Caregiving or Other (or 1-4).',
      profession: 'Please write only your profession in a few words, or type skip.',
      city: 'Please write only the city name, or type skip.',
      wantsJobAlerts: 'Please reply Yes or No, or type skip.',
      preferredCurrency: 'Please write a currency code like THB, USD or ILS, or type skip.',
      wantsExchangeRateAlerts: 'Please reply Yes or No, or type skip.',
    },
    questionDuringOnboarding: 'I will answer your questions right after the profile setup. For now, please answer the question above.',
    required: 'This one is needed so Gringo can personalize your help.',
    progress: (done, total) => `Profile setup: ${done} of ${total}`,
    correct: "No problem, let's correct that.",
    done: 'Thank you. I now know you better and can give you more relevant help.',
    summaryTitle: 'Your profile:',
    labels: {
      fullName: 'Name', country: 'Country', preferredLanguage: 'Language', workSector: 'Work sector',
      profession: 'Profession', city: 'City', wantsJobAlerts: 'Job alerts',
      preferredCurrency: 'Preferred currency', wantsExchangeRateAlerts: 'Exchange-rate alerts',
    },
    values: {},
  },
  he: {
    questions: {
      preferredLanguage: 'באיזו שפה נוח לך? ענה: עברית, English (אנגלית) או ไทย (תאית).',
      fullName: 'מה השם המלא שלך?',
      country: 'מאיזו מדינה אתה? למשל: תאילנד, פיליפינים, סרי לנקה. אם היא לא ברשימה, כתוב אחר.',
      workSector: 'באיזה תחום אתה עובד? ענה: בניין, חקלאות, סיעוד או אחר (או 1-4).',
      profession: 'מה המקצוע שלך? אפשר לכתוב דלג.',
      city: 'באיזו עיר בישראל אתה גר עכשיו? אפשר לכתוב דלג.',
      wantsJobAlerts: 'האם תרצה התראות על משרות? ענה כן או לא. אפשר לכתוב דלג.',
      preferredCurrency: 'באיזה מטבע נוח לך לקבל עזרה בכסף? למשל: THB, USD, ILS. אפשר לכתוב דלג.',
      wantsExchangeRateAlerts: 'האם תרצה התראות על שערי מטבע? ענה כן או לא. אפשר לכתוב דלג.',
    },
    invalid: {
      preferredLanguage: 'לא זיהיתי את השפה. ענה עברית, English או ไทย.',
      fullName: 'זה לא נראה כמו שם. כתוב רק את השם שלך (אותיות, עד 5 מילים).',
      country: 'לא זיהיתי את המדינה. כתוב רק את שם המדינה, למשל תאילנד, או כתוב אחר.',
      workSector: 'בחר אחד: בניין, חקלאות, סיעוד או אחר (או 1-4).',
      profession: 'כתוב רק את המקצוע במילים ספורות, או כתוב דלג.',
      city: 'כתוב רק את שם העיר, או כתוב דלג.',
      wantsJobAlerts: 'ענה כן או לא, או כתוב דלג.',
      preferredCurrency: 'כתוב קוד מטבע כמו THB, USD או ILS, או כתוב דלג.',
      wantsExchangeRateAlerts: 'ענה כן או לא, או כתוב דלג.',
    },
    questionDuringOnboarding: 'אענה על השאלות שלך מיד אחרי הגדרת הפרופיל. בינתיים, ענה בבקשה על השאלה שלמעלה.',
    required: 'השאלה הזו נחוצה כדי שגרינגו יוכל להתאים לך את העזרה.',
    progress: (done, total) => `הגדרת פרופיל: ${done} מתוך ${total}`,
    correct: 'אין בעיה, בוא נתקן.',
    done: 'תודה. עכשיו אני מכיר אותך טוב יותר ואוכל לעזור לך בצורה מדויקת יותר.',
    summaryTitle: 'הפרופיל שלך:',
    labels: {
      fullName: 'שם', country: 'מדינה', preferredLanguage: 'שפה', workSector: 'תחום עבודה',
      profession: 'מקצוע', city: 'עיר', wantsJobAlerts: 'התראות משרות',
      preferredCurrency: 'מטבע מועדף', wantsExchangeRateAlerts: 'התראות שער מטבע',
    },
    values: {
      Yes: 'כן', No: 'לא', Skipped: 'דילגת', Other: 'אחר',
      Construction: 'בניין', Agriculture: 'חקלאות', Caregiving: 'סיעוד',
      Thailand: 'תאילנד', Philippines: 'פיליפינים', 'Sri Lanka': 'סרי לנקה', India: 'הודו',
      he: 'עברית', en: 'English', th: 'ไทย',
    },
  },
  th: {
    questions: {
      preferredLanguage: 'คุณต้องการใช้ภาษาอะไร? ตอบ: ไทย, English (อังกฤษ) หรือ עברית (ฮีบรู)',
      fullName: 'ชื่อ-นามสกุลของคุณคืออะไร?',
      country: 'คุณมาจากประเทศอะไร? เช่น ไทย ฟิลิปปินส์ ศรีลังกา ถ้าไม่มีในรายการ พิมพ์ อื่นๆ',
      workSector: 'คุณทำงานในสายงานไหน? ตอบ: ก่อสร้าง, เกษตร, ดูแลผู้สูงอายุ หรือ อื่นๆ (หรือ 1-4)',
      profession: 'อาชีพของคุณคืออะไร? พิมพ์ ข้าม ได้',
      city: 'ตอนนี้คุณอยู่เมืองอะไรในอิสราเอล? พิมพ์ ข้าม ได้',
      wantsJobAlerts: 'คุณต้องการรับแจ้งเตือนงานไหม? ตอบ ใช่ หรือ ไม่ พิมพ์ ข้าม ได้',
      preferredCurrency: 'คุณต้องการใช้สกุลเงินอะไรสำหรับเรื่องเงิน? เช่น THB, USD, ILS พิมพ์ ข้าม ได้',
      wantsExchangeRateAlerts: 'คุณต้องการรับแจ้งเตือนอัตราแลกเปลี่ยนไหม? ตอบ ใช่ หรือ ไม่ พิมพ์ ข้าม ได้',
    },
    invalid: {
      preferredLanguage: 'ขอโทษ ไม่รู้จักภาษานี้ กรุณาตอบ ไทย, English หรือ עברית',
      fullName: 'ดูเหมือนไม่ใช่ชื่อ กรุณาพิมพ์เฉพาะชื่อของคุณ (ตัวอักษร ไม่เกิน 5 คำ)',
      country: 'ขอโทษ ไม่รู้จักประเทศนี้ กรุณาพิมพ์เฉพาะชื่อประเทศ เช่น ไทย หรือพิมพ์ อื่นๆ',
      workSector: 'กรุณาเลือก: ก่อสร้าง, เกษตร, ดูแลผู้สูงอายุ หรือ อื่นๆ (หรือ 1-4)',
      profession: 'กรุณาพิมพ์เฉพาะอาชีพสั้นๆ หรือพิมพ์ ข้าม',
      city: 'กรุณาพิมพ์เฉพาะชื่อเมือง หรือพิมพ์ ข้าม',
      wantsJobAlerts: 'กรุณาตอบ ใช่ หรือ ไม่ หรือพิมพ์ ข้าม',
      preferredCurrency: 'กรุณาพิมพ์รหัสสกุลเงิน เช่น THB, USD หรือ ILS หรือพิมพ์ ข้าม',
      wantsExchangeRateAlerts: 'กรุณาตอบ ใช่ หรือ ไม่ หรือพิมพ์ ข้าม',
    },
    questionDuringOnboarding: 'ฉันจะตอบคำถามของคุณหลังตั้งค่าโปรไฟล์เสร็จ ตอนนี้กรุณาตอบคำถามด้านบนก่อน',
    required: 'ข้อนี้จำเป็น เพื่อให้ Gringo ช่วยคุณได้ตรงกับความต้องการ',
    progress: (done, total) => `ตั้งค่าโปรไฟล์: ${done} จาก ${total}`,
    correct: 'ไม่เป็นไร มาแก้ไขกัน',
    done: 'ขอบคุณ ตอนนี้ฉันรู้จักคุณมากขึ้นและช่วยคุณได้ตรงขึ้น',
    summaryTitle: 'โปรไฟล์ของคุณ:',
    labels: {
      fullName: 'ชื่อ', country: 'ประเทศ', preferredLanguage: 'ภาษา', workSector: 'สายงาน',
      profession: 'อาชีพ', city: 'เมือง', wantsJobAlerts: 'แจ้งเตือนงาน',
      preferredCurrency: 'สกุลเงินที่ใช้', wantsExchangeRateAlerts: 'แจ้งเตือนอัตราแลกเปลี่ยน',
    },
    values: {
      Yes: 'ใช่', No: 'ไม่', Skipped: 'ข้าม', Other: 'อื่นๆ',
      Construction: 'ก่อสร้าง', Agriculture: 'เกษตร', Caregiving: 'ดูแลผู้สูงอายุ',
      Thailand: 'ไทย', Philippines: 'ฟิลิปปินส์', 'Sri Lanka': 'ศรีลังกา', India: 'อินเดีย',
      he: 'עברית', en: 'English', th: 'ไทย',
    },
  },
});

const NATIVE_LANGUAGE_NAMES = Object.freeze({
  'עברית': 'he', 'עבר': 'he', 'ฮีบรู': 'he', 'ภาษาฮีบรู': 'he',
  'אנגלית': 'en', 'อังกฤษ': 'en', 'ภาษาอังกฤษ': 'en',
  'ไทย': 'th', 'ภาษาไทย': 'th', 'תאית': 'th', 'תאילנדית': 'th', 'תאי': 'th',
  '1': 'he', '2': 'en', '3': 'th',
});

// Only he/en/th are offered and stored during onboarding.
function normalizeOnboardingLanguage(value) {
  const text = String(value || '').normalize('NFC').trim().toLowerCase().replace(/[.!]/g, '');
  if (!text) return '';
  const code = NATIVE_LANGUAGE_NAMES[text] || languageDetectionService.normalizeLanguageCode(text);
  return ONBOARDING_LANGUAGES.includes(code) ? code : '';
}

function onboardingLanguage(value) {
  const code = normalizeOnboardingLanguage(value);
  return code || 'en';
}

function copyFor(language) {
  return STRINGS[onboardingLanguage(language)];
}

module.exports = {
  ONBOARDING_LANGUAGES,
  STRINGS,
  copyFor,
  normalizeOnboardingLanguage,
  onboardingLanguage,
};
