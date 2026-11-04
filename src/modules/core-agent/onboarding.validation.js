// Validation and normalization for onboarding answers. Every value that
// onboarding writes to the profile (and so to Google Sheets) passes through
// here first. Free text that looks like a question, a sentence, a number or
// a link is rejected so it cannot be saved as a name, country or city.

const SKIPPED = 'Skipped';

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).normalize('NFC').replace(/\s+/g, ' ').trim();
}

function keyOf(value) {
  return cleanText(value).toLowerCase().replace(/[.!,;:'"()\-_/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildAliasMap(entries) {
  const map = new Map();
  for (const [canonical, aliases] of entries) {
    map.set(keyOf(canonical), canonical);
    for (const alias of aliases) map.set(keyOf(alias), canonical);
  }
  return map;
}

// Countries most relevant to the pilot (migrant workers in Israel) with
// English, Hebrew and Thai names. "Other" lets anyone continue.
const COUNTRY_ALIASES = buildAliasMap([
  ['Thailand', ['thai land', 'th', 'tha', 'ประเทศไทย', 'ไทย', 'เมืองไทย', 'תאילנד']],
  ['Philippines', ['philippine', 'the philippines', 'ph', 'ฟิลิปปินส์', 'פיליפינים']],
  ['Sri Lanka', ['srilanka', 'lk', 'ศรีลังกา', 'סרי לנקה']],
  ['India', ['in', 'อินเดีย', 'הודו']],
  ['Nepal', ['np', 'เนปาล', 'נפאל']],
  ['China', ['cn', 'จีน', 'סין']],
  ['Vietnam', ['viet nam', 'vn', 'เวียดนาม', 'וייטנאם', 'ויאטנם']],
  ['Moldova', ['md', 'มอลโดวา', 'מולדובה']],
  ['Ukraine', ['ua', 'ยูเครน', 'אוקראינה']],
  ['Russia', ['ru', 'russian federation', 'รัสเซีย', 'רוסיה']],
  ['Uzbekistan', ['uz', 'อุซเบกิสถาน', 'אוזבקיסטן']],
  ['Georgia', ['ge', 'จอร์เจีย', 'גאורגיה', 'גרוזיה']],
  ['Romania', ['ro', 'โรมาเนีย', 'רומניה']],
  ['Bulgaria', ['bg', 'บัลแกเรีย', 'בולגריה']],
  ['Turkey', ['turkiye', 'türkiye', 'tr', 'ตุรกี', 'טורקיה']],
  ['Eritrea', ['er', 'เอริเทรีย', 'אריתריאה']],
  ['Sudan', ['sd', 'ซูดาน', 'סודן']],
  ['Ethiopia', ['et', 'เอธิโอเปีย', 'אתיופיה']],
  ['Kenya', ['ke', 'เคนยา', 'קניה', 'קנייה']],
  ['Malawi', ['mw', 'มาลาวี', 'מלאווי']],
  ['Indonesia', ['id', 'อินโดนีเซีย', 'אינדונזיה']],
  ['Malaysia', ['my', 'มาเลเซีย', 'מלזיה']],
  ['Myanmar', ['burma', 'mm', 'พม่า', 'เมียนมา', 'מיאנמר', 'בורמה']],
  ['Laos', ['lao', 'la', 'ลาว', 'לאוס']],
  ['Cambodia', ['kh', 'กัมพูชา', 'กัมพูชา', 'קמבודיה']],
  ['Bangladesh', ['bd', 'บังกลาเทศ', 'בנגלדש']],
  ['Pakistan', ['pk', 'ปากีสถาน', 'פקיסטן']],
  ['Ghana', ['gh', 'กานา', 'גאנה']],
  ['Nigeria', ['ng', 'ไนจีเรีย', 'ניגריה']],
  ['Israel', ['il', 'อิสราเอล', 'ישראל']],
  ['United States', ['usa', 'us', 'united states of america', 'america', 'สหรัฐอเมริกา', 'อเมริกา', 'ארצות הברית', 'ארה"ב', 'ארהב']],
  ['Other', ['other country', 'อื่นๆ', 'อื่น ๆ', 'อื่น', 'אחר', 'אחרת']],
]);

const WORK_SECTOR_ALIASES = buildAliasMap([
  ['Construction', ['1', 'building', 'ก่อสร้าง', 'งานก่อสร้าง', 'בניין', 'בנייה', 'בניה']],
  ['Agriculture', ['2', 'farming', 'farm', 'เกษตร', 'เกษตรกรรม', 'การเกษตร', 'חקלאות']],
  ['Caregiving', ['3', 'care', 'caregiver', 'ดูแลผู้สูงอายุ', 'ผู้ดูแล', 'การดูแล', 'סיעוד', 'מטפל', 'מטפלת']],
  ['Other', ['4', 'อื่นๆ', 'อื่น ๆ', 'อื่น', 'אחר', 'אחרת']],
]);

const BOOLEAN_ALIASES = buildAliasMap([
  ['Yes', ['y', 'true', 'כן', 'ใช่', 'ค่ะ', 'ครับ', 'เอา', 'ต้องการ']],
  ['No', ['n', 'false', 'לא', 'ไม่', 'ไม่ใช่', 'ไม่เอา', 'ไม่ต้องการ']],
]);

const CURRENCY_ALIASES = buildAliasMap([
  ['THB', ['baht', 'บาท', 'เงินบาท', 'באט', 'בהט']],
  ['ILS', ['nis', 'shekel', 'shekels', 'เชเกล', 'שקל', 'שקלים', 'ש"ח', 'שח']],
  ['USD', ['dollar', 'dollars', 'us dollar', 'ดอลลาร์', 'דולר', 'דולרים']],
  ['EUR', ['euro', 'euros', 'ยูโร', 'יורו']],
  ['PHP', ['peso', 'philippine peso', 'เปโซ', 'פסו']],
  ['LKR', ['sri lankan rupee']],
  ['INR', ['indian rupee', 'rupee', 'rupees']],
  ['NPR', ['nepalese rupee']],
  ['CNY', ['yuan', 'rmb', 'หยวน']],
  ['VND', ['dong']],
]);
const KNOWN_CURRENCY_CODES = new Set(['THB', 'ILS', 'USD', 'EUR', 'PHP', 'LKR', 'INR', 'NPR', 'CNY', 'VND', 'MDL', 'UAH', 'GBP', 'MMK', 'LAK', 'KHR', 'IDR', 'MYR', 'BDT', 'PKR', 'ETB', 'KES', 'GHS', 'NGN', 'UZS', 'GEL', 'RON', 'BGN', 'TRY', 'RUB']);

const SKIP_WORDS = new Set(['skip', 'דלג', 'ข้าม'].map(keyOf));

// Messages that look like a question or a request rather than an answer.
const QUESTION_MARKERS = /[?？؟]|\b(can you|could you|what|why|how|where|when|who|do you|are you|please help)\b|(האם|אתה יכול|את יכולה|אפשר|מה |למה|איך|איפה|מתי|מי |תוכל)|(ไหม|มั้ย|หรือเปล่า|อะไร|ทำไม|อย่างไร|ยังไง|ที่ไหน|เมื่อไร|ได้ไหม|ช่วย)/i;
const LINK_OR_CONTACT = /(https?:|www\.|@|\.com\b|\.co\b)/i;
const DIGIT = /\d/;
// Letters from any script, spaces, apostrophes, hyphens, dots and Thai/Hebrew marks.
const NAME_CHARS = /^[\p{L}\p{M}\s'’.\-]+$/u;

function isSkipAnswer(value) {
  return SKIP_WORDS.has(keyOf(value));
}

function looksLikeQuestion(value) {
  return QUESTION_MARKERS.test(cleanText(value));
}

function wordCount(value) {
  return cleanText(value).split(' ').filter(Boolean).length;
}

function validateFreeText(value, { maxLength, maxWords, allowDigits = false }) {
  const text = cleanText(value);
  if (!text) return '';
  if (text.length < 2 || text.length > maxLength) return '';
  if (wordCount(text) > maxWords) return '';
  if (looksLikeQuestion(text) || LINK_OR_CONTACT.test(text)) return '';
  if (!allowDigits && DIGIT.test(text)) return '';
  if (!NAME_CHARS.test(text.replace(/\d/g, ''))) return '';
  return text;
}

function normalizeCountry(value) {
  const text = cleanText(value);
  if (!text || looksLikeQuestion(text)) return '';
  return COUNTRY_ALIASES.get(keyOf(text)) || '';
}

function normalizeWorkSector(value) {
  return WORK_SECTOR_ALIASES.get(keyOf(value)) || '';
}

function normalizeBoolean(value) {
  return BOOLEAN_ALIASES.get(keyOf(value)) || '';
}

function normalizeCurrency(value) {
  const text = cleanText(value);
  if (!text) return '';
  const alias = CURRENCY_ALIASES.get(keyOf(text));
  if (alias) return alias;
  const upper = text.toUpperCase();
  return KNOWN_CURRENCY_CODES.has(upper) ? upper : '';
}

function normalizeFullName(value) {
  return validateFreeText(value, { maxLength: 60, maxWords: 5 });
}

function normalizeCity(value) {
  return validateFreeText(value, { maxLength: 40, maxWords: 4 });
}

function normalizeProfession(value) {
  return validateFreeText(value, { maxLength: 40, maxWords: 4 });
}

const NORMALIZERS = Object.freeze({
  fullName: normalizeFullName,
  country: normalizeCountry,
  workSector: normalizeWorkSector,
  profession: normalizeProfession,
  city: normalizeCity,
  wantsJobAlerts: normalizeBoolean,
  preferredCurrency: normalizeCurrency,
  wantsExchangeRateAlerts: normalizeBoolean,
});

// Returns the canonical stored value for an onboarding field, or '' when the
// value is not acceptable. 'Skipped' is kept only for optional fields.
// Free-text fields saved by other paths (web profile form, earlier data) are
// checked with a looser rule: no questions, no links, bounded length.
const RELAXED_FREE_TEXT = Object.freeze({ fullName: 80, city: 60, profession: 60 });

function normalizeRelaxedFreeText(fieldKey, text) {
  if (text.length > RELAXED_FREE_TEXT[fieldKey]) return '';
  if (looksLikeQuestion(text) || LINK_OR_CONTACT.test(text)) return '';
  return text;
}

// strict: true is used for a new onboarding answer typed in chat.
function normalizeFieldValue(fieldKey, value, { optional = false, strict = true } = {}) {
  const text = cleanText(value);
  if (!text) return '';
  if (text === SKIPPED) return optional ? SKIPPED : '';
  if (!strict && RELAXED_FREE_TEXT[fieldKey]) return normalizeRelaxedFreeText(fieldKey, text);
  const normalizer = NORMALIZERS[fieldKey];
  return normalizer ? normalizer(text) : text;
}

module.exports = {
  SKIPPED,
  cleanText,
  isSkipAnswer,
  looksLikeQuestion,
  normalizeBoolean,
  normalizeCity,
  normalizeCountry,
  normalizeCurrency,
  normalizeFieldValue,
  normalizeFullName,
  normalizeProfession,
  normalizeWorkSector,
};
