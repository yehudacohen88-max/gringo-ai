const { languageDetectionService } = require('../modules/language');

// Same language codes as the web client's copy maps (en, he, ar, th, si, hi, ru, tl).
const COPY = Object.freeze({
  rateLimited: Object.freeze({
    en: 'Too many requests. Please wait a moment and try again.',
    he: 'יש יותר מדי בקשות. נא להמתין רגע ולנסות שוב.',
    ar: 'هناك طلبات كثيرة جدًا. يُرجى الانتظار لحظة ثم المحاولة مرة أخرى.',
    th: 'มีคำขอมากเกินไป โปรดรอสักครู่แล้วลองอีกครั้ง',
    si: 'ඉල්ලීම් වැඩියි. කරුණාකර මොහොතක් රැඳී නැවත උත්සාහ කරන්න.',
    hi: 'अनुरोध बहुत अधिक हैं। कृपया थोड़ी देर रुककर फिर से कोशिश करें।',
    ru: 'Слишком много запросов. Подождите немного и попробуйте снова.',
    tl: 'Masyadong maraming kahilingan. Maghintay sandali at subukan ulit.',
  }),
  internal: Object.freeze({
    en: 'Something went wrong. Please try again.',
    he: 'משהו השתבש. נא לנסות שוב.',
    ar: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
    th: 'มีบางอย่างผิดพลาด โปรดลองอีกครั้ง',
    si: 'යමක් වැරදී ඇත. කරුණාකර නැවත උත්සාහ කරන්න.',
    hi: 'कुछ गलत हो गया। कृपया फिर से कोशिश करें।',
    ru: 'Что-то пошло не так. Попробуйте ещё раз.',
    tl: 'May nangyaring mali. Subukan ulit.',
  }),
  catalogEmpty: Object.freeze({
    en: 'No results right now.',
    he: 'אין תוצאות כרגע.',
    ar: 'لا توجد نتائج الآن.',
    th: 'ยังไม่มีผลลัพธ์ในตอนนี้',
    si: 'දැනට ප්‍රතිඵල නැත.',
    hi: 'अभी कोई परिणाम नहीं है।',
    ru: 'Сейчас нет результатов.',
    tl: 'Walang resulta sa ngayon.',
  }),
  catalogUnavailable: Object.freeze({
    en: 'This service is unavailable right now.',
    he: 'השירות הזה לא זמין כרגע.',
    ar: 'هذه الخدمة غير متاحة الآن.',
    th: 'บริการนี้ไม่พร้อมใช้งานในตอนนี้',
    si: 'මෙම සේවාව දැනට ලබා ගත නොහැක.',
    hi: 'यह सेवा अभी उपलब्ध नहीं है।',
    ru: 'Эта услуга сейчас недоступна.',
    tl: 'Hindi available ang serbisyong ito sa ngayon.',
  }),
  catalogDisabled: Object.freeze({
    en: 'This is not available yet.',
    he: 'זה עדיין לא זמין.',
    ar: 'هذا غير متاح بعد.',
    th: 'ยังไม่พร้อมให้ใช้',
    si: 'මෙය තවම ලබා ගත නොහැක.',
    hi: 'यह अभी तक उपलब्ध नहीं है।',
    ru: 'Это пока недоступно.',
    tl: 'Hindi pa ito available.',
  }),
  catalogNoInformation: Object.freeze({
    en: 'I do not have information available right now.',
    he: 'אין לי מידע זמין כרגע.',
    ar: 'لا تتوفر لدي معلومات الآن.',
    th: 'ตอนนี้ฉันไม่มีข้อมูลให้',
    si: 'දැනට මට තොරතුරු නැත.',
    hi: 'अभी मेरे पास जानकारी उपलब्ध नहीं है।',
    ru: 'Сейчас у меня нет доступной информации.',
    tl: 'Wala akong impormasyon na available sa ngayon.',
  }),
  catalogDemo: Object.freeze({
    en: 'Demo data only. This is not a live listing, rate, or confirmed offer.',
    he: 'נתוני הדגמה בלבד. זו לא רשימה חיה, לא שער חי, ולא הצעה מאושרת.',
    ar: 'بيانات تجريبية فقط. هذه ليست قائمة حقيقية أو سعرًا مباشرًا أو عرضًا مؤكدًا.',
    th: 'นี่เป็นข้อมูลสาธิตเท่านั้น ไม่ใช่รายการจริง อัตราจริง หรือข้อเสนอที่ยืนยันแล้ว',
    si: 'මෙය ආදර්ශ දත්ත පමණි. මෙය සජීවී ලැයිස්තුවක්, අනුපාතයක් හෝ තහවුරු කළ දීමනාවක් නොවේ.',
    hi: 'यह केवल डेमो डेटा है। यह वास्तविक सूची, लाइव दर या पुष्ट प्रस्ताव नहीं है।',
    ru: 'Только демонстрационные данные. Это не настоящий список, живой курс или подтверждённое предложение.',
    tl: 'Demo data lang ito. Hindi ito tunay na listahan, live na rate, o kumpirmadong alok.',
  }),
});

function languageFromRequest(req) {
  const header = req && req.headers ? req.headers['accept-language'] : '';
  const parts = String(header || '').split(',');
  for (const part of parts) {
    const tag = part.split(';')[0].trim();
    if (!tag || tag === '*') continue;
    const code = languageDetectionService.normalizeLanguageCode(tag);
    if (code) return code;
  }
  return 'en';
}

function messageFor(language, key) {
  const table = COPY[key] || COPY.internal;
  const code = languageDetectionService.normalizeLanguageCode(language) || language;
  return table[code] || table.en;
}

function languageFromProfile(profile) {
  return languageDetectionService.normalizeLanguageCode(
    profile && (profile.preferredLanguage || profile.language || profile.detectedLanguage)
  ) || 'en';
}

function responseLanguage(req, profile) {
  const fromProfile = profile
    ? languageDetectionService.normalizeLanguageCode(profile.preferredLanguage || profile.language)
    : '';
  return fromProfile || languageFromRequest(req);
}

module.exports = {
  COPY,
  languageFromProfile,
  languageFromRequest,
  messageFor,
  responseLanguage,
};
