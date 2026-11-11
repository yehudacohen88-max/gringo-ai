// Fixed reply when a rights question has no record that passes the legal
// verification gate. No statutory amounts beyond the handbook edition and
// retrieval date, and no phone numbers or email addresses.
//
// The handbook link is the official PIBA 2026 PDF for the user's language.
// Thai, Sinhala, and Hindi lines that are not copied from a reliable
// extraction are pending native-speaker review.

const { HANDBOOK_EDITION, HANDBOOK_RETRIEVED_AT, handbookPdfUrl } = require('./handbook-links');
const { legalDisclaimerText } = require('./legal-disclaimer');

const PENDING_NATIVE_SPEAKER_REVIEW = Object.freeze(['th', 'si', 'hi']);

const RIGHTS_UNVERIFIED_FALLBACK_LEAD = Object.freeze({
  en: 'I do not have verified information on this yet, and I will not guess. For official information, use the official websites of the government bodies responsible for labor and for population and immigration. Keep your contract, payslips, and a record of your hours. This is not legal advice.',
  he: 'אין לי מידע מאומת על השאלה הזו, ואני לא רוצה לנחש. למידע רשמי יש לפנות לאתרים הרשמיים של הגופים הממשלתיים שאחראים על עבודה ועל אוכלוסין והגירה. כדאי לשמור את החוזה, את תלושי השכר ורישום של שעות העבודה. זה לא ייעוץ משפטי.',
  th: 'ตอนนี้ฉันยังไม่มีข้อมูลที่ยืนยันแล้วสำหรับเรื่องนี้ และฉันจะไม่เดา สำหรับข้อมูลทางการ ให้ดูเว็บไซต์ทางการของหน่วยงานรัฐที่ดูแลเรื่องแรงงาน และเรื่องประชากรและการเข้าเมือง ควรเก็บสัญญา สลิปเงินเดือน และบันทึกชั่วโมงทำงานไว้ ข้อความนี้ไม่ใช่คำแนะนำทางกฎหมาย',
  si: 'මේ ප්‍රශ්නය ගැන තහවුරු කළ තොරතුරු මට තවම නැත. මම අනුමාන නොකරමි. නිල තොරතුරු සඳහා කම්කරු සහ ජනගහන හා ආගමන කටයුතු භාර රජයේ ආයතනවල නිල වෙබ් අඩවි බලන්න. ඔබේ ගිවිසුම, වැටුප් පත් සහ වැඩ කළ පැයවල වාර්තාව තබා ගන්න. මෙය නීති උපදෙස් නොවේ.',
  hi: 'इस प्रश्न पर मेरे पास अभी कोई सत्यापित जानकारी नहीं है, और मैं अनुमान नहीं लगाऊँगा। आधिकारिक जानकारी के लिए श्रम तथा जनसंख्या और आप्रवासन के सरकारी निकायों की आधिकारिक वेबसाइट देखें। अपना अनुबंध, पेस्लिप और काम के घंटों का रिकॉर्ड रखें। यह कानूनी सलाह नहीं है।',
});

// Pending native-speaker review for th, si, and hi.
const SOURCE_LINE = Object.freeze({
  en: `Official source: Population and Immigration Authority, Foreign Workers' Rights Handbook ${HANDBOOK_EDITION}.`,
  he: `מקור רשמי: רשות האוכלוסין וההגירה, זכותון לעובדים זרים ${HANDBOOK_EDITION}.`,
  th: `แหล่งข้อมูลทางการ: คู่มือสิทธิแรงงานต่างชาติของสำนักประชากรและการเข้าเมือง ปี ${HANDBOOK_EDITION}`,
  si: `නිල මූලාශ්‍රය: ජනගහන හා ආගමන අධිකාරිය, විදේශ ශ්‍රමිකයන්ගේ හිමිකම් අත්පොත ${HANDBOOK_EDITION}.`,
  hi: `आधिकारिक स्रोत: जनसंख्या और आप्रवासन प्राधिकरण, विदेशी कामगारों के अधिकारों की पुस्तिका ${HANDBOOK_EDITION}.`,
});

const DATE_LINE = Object.freeze({
  en: `Information date: ${HANDBOOK_RETRIEVED_AT} (handbook edition ${HANDBOOK_EDITION}).`,
  he: `תאריך המידע: ${HANDBOOK_RETRIEVED_AT} (מהדורת הזכותון ${HANDBOOK_EDITION}).`,
  th: `วันที่ของข้อมูล: ${HANDBOOK_RETRIEVED_AT} (คู่มือฉบับปี ${HANDBOOK_EDITION})`,
  si: `තොරතුරු දිනය: ${HANDBOOK_RETRIEVED_AT} (අත්පොතේ සංස්කරණය ${HANDBOOK_EDITION}).`,
  hi: `जानकारी की तारीख: ${HANDBOOK_RETRIEVED_AT} (पुस्तिका संस्करण ${HANDBOOK_EDITION}).`,
});

const SECTION_LINE = Object.freeze({
  en: (section) => `Official handbook section ${section}. The handbook names the office. Phone numbers and email addresses are not shown here.`,
  he: (section) => `סעיף ${section} בזכותון הרשמי. שם הגורם מופיע בזכותון. מספרי טלפון וכתובות דוא"ל לא מוצגים כאן.`,
  th: (section) => `ดูหัวข้อ ${section} ในคู่มือทางการ คู่มือระบุชื่อหน่วยงาน ข้อความนี้ไม่แสดงเบอร์โทรหรืออีเมล`,
  si: (section) => `නිල අත්පොතේ ${section} වගන්තිය බලන්න. කාර්යාලයේ නම අත්පොතේ ඇත. දුරකථන අංක හෝ ඊමේල් මෙහි නැත.`,
  hi: (section) => `आधिकारिक पुस्तिका की धारा ${section} देखें। कार्यालय का नाम पुस्तिका में है। यहाँ फोन नंबर या ईमेल नहीं दिखाया जाता।`,
});

const TRAFFICKING_NOTICE = Object.freeze({
  en: 'If you cannot leave, or your passport is being held, treat this as urgent. Contact the Israel Police and the office named in handbook section 15. This chat does not show phone numbers or email addresses.',
  he: 'אם לא נותנים לצאת, או שדרכון מוחזק, יש להתייחס לזה כדחוף. פנו למשטרת ישראל ולגורם שמופיע בסעיף 15 בזכותון. כאן לא מוצגים מספרי טלפון או כתובות דוא"ל.',
  th: 'ถ้าคุณออกจากที่พักไม่ได้ หรือหนังสือเดินทางถูกยึดไว้ ให้ถือว่าเรื่องนี้เร่งด่วน ติดต่อตำรวจอิสราเอลและหน่วยงานที่ระบุในหัวข้อ 15 ของคู่มือ ข้อความนี้ไม่แสดงเบอร์โทรหรืออีเมล',
  si: 'ඔබට පිටව යා නොහැකි නම්, හෝ ගමන් බලපත්‍රය තබා ගෙන ඇත්නම්, මෙය හදිසි ය. ඊශ්‍රායල පොලිසිය සහ අත්පොතේ 15 වගන්තියේ සඳහන් කාර්යාලය අමතන්න. දුරකථන අංක හෝ ඊමේල් මෙහි නැත.',
  hi: 'अगर आप बाहर नहीं जा सकते, या पासपोर्ट रोका गया है, तो इसे तत्काल मानें। इज़राइल पुलिस और पुस्तिका की धारा 15 में लिखे कार्यालय से संपर्क करें। यहाँ फोन नंबर या ईमेल नहीं दिखाया जाता।',
});

const CLARIFICATION = Object.freeze({
  en: 'I am not sure this is a legal-rights question. If it is about pay, an employer, documents, or dismissal, tell me a bit more. I will not guess a legal rule.',
  he: 'אני לא בטוח שזו שאלה על זכות בעבודה. אם זה על שכר, מעסיק, מסמכים או פיטורים, כתבו לי עוד קצת. אני לא אמציא כלל.',
  th: 'ฉันยังไม่แน่ใจว่านี่เป็นคำถามเรื่องสิทธิทางกฎหมาย หากเป็นเรื่องค่าจ้าง นายจ้าง เอกสาร หรือการเลิกจ้าง บอกเพิ่มอีกนิด ฉันจะไม่เดากฎหมาย',
  si: 'මෙය නීතිමය අයිතියක් ගැන දැයි මට විශ්වාස නැත. වැටුප, සේවා යෝජකයා, ලේඛන හෝ රැකියාව අහිමි වීම ගැන නම් තව ටිකක් කියන්න. මම නීතියක් අනුමාන නොකරමි.',
  hi: 'मुझे पक्का नहीं है कि यह कानूनी अधिकार का सवाल है। अगर यह वेतन, नियोक्ता, दस्तावेज़ या नौकरी से निकालने के बारे में है, तो थोड़ा और बताएँ। मैं कानूनी नियम नहीं गढ़ूँगा।',
});

function rightsFallbackLanguage(language) {
  const code = String(language || '').toLowerCase();
  if (code.startsWith('he') || code.startsWith('iw')) return 'he';
  if (code.startsWith('th')) return 'th';
  if (code.startsWith('si')) return 'si';
  if (code.startsWith('hi')) return 'hi';
  return 'en';
}

function createRightsUnverifiedFallback(language) {
  const lang = rightsFallbackLanguage(language);
  return [
    RIGHTS_UNVERIFIED_FALLBACK_LEAD[lang],
    SOURCE_LINE[lang],
    handbookPdfUrl(lang),
    DATE_LINE[lang],
    legalDisclaimerText(lang),
  ].join('\n\n');
}

const RIGHTS_UNVERIFIED_FALLBACK = Object.freeze({
  en: createRightsUnverifiedFallback('en'),
  he: createRightsUnverifiedFallback('he'),
  th: createRightsUnverifiedFallback('th'),
  si: createRightsUnverifiedFallback('si'),
  hi: createRightsUnverifiedFallback('hi'),
});

function formatRightsFallback(language, details = {}) {
  const lang = rightsFallbackLanguage(language);
  const parts = [];
  if (details.trafficking) parts.push(TRAFFICKING_NOTICE[lang]);
  if (details.uncertain) parts.push(CLARIFICATION[lang]);
  parts.push(createRightsUnverifiedFallback(lang));
  if (details.section) parts.push(SECTION_LINE[lang](details.section));
  return parts.join('\n\n');
}

module.exports = {
  CLARIFICATION,
  DATE_LINE,
  PENDING_NATIVE_SPEAKER_REVIEW,
  RIGHTS_UNVERIFIED_FALLBACK,
  RIGHTS_UNVERIFIED_FALLBACK_LEAD,
  SECTION_LINE,
  SOURCE_LINE,
  TRAFFICKING_NOTICE,
  createRightsUnverifiedFallback,
  formatRightsFallback,
  rightsFallbackLanguage,
};
