// Context-aware detector for employment, documents, and worker-rights questions.
// A match is not a legal conclusion. Thai, Sinhala, and Hindi patterns are
// pending native-speaker review.
//
// Practical help (job search, housing listings, money transfer, exchange
// rates, hospital location, passport-renewal logistics, transport, shopping)
// is classified first so those words do not become a rights answer.
// Employment wording that is still not a clear topic does not go to free AI.
//
// Scripts other than Hebrew and Latin have no verified legal wording. A
// message in one of those scripts that is not confidently practical, or that
// carries any rights signal, is disposition "uncertain" so the caller uses
// the existing unverified-rights fallback instead of a free model answer.
// Sinhala strings added below are unverified machine-derived detection hints.
// They are used only to BLOCK. They are never shown and never select a record.

const PENDING_NATIVE_SPEAKER_REVIEW = Object.freeze(['th', 'si', 'hi']);

const MENU_LABEL = /^(employment\s*(&|and)\s*salary|jobs?|housing|money|documents?)$/i;

function normalized(text) {
  return String(text || '').normalize('NFC');
}

function practicalFlags(text) {
  const value = normalized(text);
  const job = /find me (a )?job|looking for (a )?(job|work)|job in |construction job|new construction job|מחפש עבודה|יש משרה|משרה חדשה|หางาน|งานก่อสร้างใหม่|नौकरी खोज|රැකියාවක් සොය|රැකියා සොය|වැඩක් සොය|වැඩ හොය/i.test(value);
  const housingSearch = /looking for (a )?(room|apartment|housing)|place to live|מחפש (דירה|חדר)|หาห้อง|หาที่พัก/i.test(value)
    && !/deduct|ניכוי|לנכות|מוריד|หัก|workers in one room|עובדים בחדר/i.test(value);
  const money = /exchange rate|rate to send|send money|money transfer|transfer cost|cheapest way to send|send money home|להעביר|שולח את המשכורת|לשלוח את המשכורת|לשלוח כסף|כסף הביתה|ส่งเงิน|ส่งค่าจ้างกลับ|पैसे कैसे निकाल|कैसे निकाल|पैसे भेज|මුදල් යව|මුදල් යැව|විනිමය|හුවමාරු අනුපාත|අනුපාතය/i.test(value);
  const healthLocation = /where is the (nearest )?(hospital|clinic)|בית החולים|בית חולים|โรงพยาบาลอยู่ที่ไหน|अस्पताल कहाँ|nearest clinic|where is the hospital|රෝහල/i.test(value);
  // Sinhala renewal phrases are unverified routing hints. They only keep a
  // logistics question on the practical path. They are never displayed.
  const documentsLogistics = /embassy|שגרירות|สถานทูต|दूतावास|තානාපති|איפה מחדשים דרכון|מחדשים דרכון|renew my passport|passport renewal|lost my passport|איבדתי את הדרכון|පාස්පෝට්[^\n]{0,40}අලුත්|ගමන් බලපත්[^\n]{0,40}අලුත්/i.test(value);
  const transport = /אוטובוס|\b(bus|train)\b|רכבת|תחבורה/i.test(value);
  const shopping = /שוק|बाज़ार|market\b|חנות\b/i.test(value) && /פתוח|खुला|open\b/i.test(value);
  const greeting = /^(?:hi|hello|hey|shalom|שלום|היי|สวัสดี(?:ครับ|ค่ะ|คะ)?|नमस्ते|ආයුබෝවන්|හලෝ|හායි|مرحبا|привет)(?![\p{L}\p{M}\p{N}])/iu.test(value.trim());
  return {
    job,
    housing: housingSearch,
    money,
    healthLocation,
    documentsLogistics,
    transport,
    shopping,
    greeting,
  };
}

function anyPractical(flags) {
  return Object.values(flags).some(Boolean);
}

function scriptNeedsNativeReview(text) {
  return /[\u0E00-\u0E7F\u0D80-\u0DFF\u0900-\u097F]/.test(normalized(text));
}

// Hebrew and Latin are the scripts with reviewed legal wording. Any other
// letter (Thai, Sinhala, Devanagari, Arabic, Cyrillic, and the rest) is an
// unverified legal script.
function hasUnverifiedLegalScript(text) {
  const rest = normalized(text).replace(/[\u0000-\u024F\u0590-\u05FF]/g, '');
  return /[\p{L}]/u.test(rest);
}

// Unverified machine-derived hints. Used only to BLOCK a free model answer.
// Never displayed. Never used to choose or quote a handbook record.
// Sinhala covers minimum wage, medical insurance, severance, dismissal,
// worker rights, workers sharing a room, and "the law".
const UNVERIFIED_BLOCK_HINTS = /අවම වැටුප|අවම වේතන|වෛද්‍ය රක්ෂණ|සෞඛ්‍ය රක්ෂණ|වන්දි|පන්සන්|රැකියාවෙන් ඉවත්|වැඩෙන් ඉවත්|පහ කළ|පහකළ|අයිතිවාසිකම්|හිමිකම්|නීතිය|නීත්‍යානුකූල|කම්කරුවන්.{0,32}කාමර|කාමරයක.{0,32}කම්කරු|කාමරයක.{0,32}කම්කරුවන්/u;

function unverifiedBlockHint(text) {
  const value = normalized(text);
  if (UNVERIFIED_BLOCK_HINTS.test(value)) return true;
  // Passport logistics stay practical. Passport plus an employer or a
  // withholding word does not.
  const passportish = /ගමන් බලපත්|පාස්පෝට්|पासपोर्ट|หนังสือเดินทาง/.test(value);
  const control = /යෝජක|තබා|අරගෙන|රදව|नियोक्ता|रख|นายจ้าง|ยึด/.test(value);
  return passportish && control;
}

function topicResult(topic, section, authorityId, trafficking = false) {
  return { topic, section, authorityId, trafficking };
}

function collectLegalTopics(text, flags) {
  const value = normalized(text);
  const found = [];
  const add = (result) => {
    if (!result || found.some((item) => item.topic === result.topic)) return;
    found.push(result);
  };
  const passportWord = /passport|דרכון|หนังสือเดินทาง|पासपोर्ट|විදේශ ගමන්/i.test(value);
  const employerWord = /employer|boss|מעסיק|נายจ้าง|นายจ้าง|मालिक|नियोक्ता|යෝජක/i.test(value);
  const withholdWord = /keep|keeps|withhold|take|takes|took|hold|holds|holding|confiscat|לקח|לקחת|ייקח|החזיק|מחזיק|מחזיר|לא החזיר|ยึด|เอา.*หนังสือ|रख|තබා/i.test(value);

  if (/traffick|slavery|סחר בבני|עבדות|ค้ามนุษย์|לא נותנים לי לצאת|לא נותנים לצאת|ไม่ให้ฉันออกจากที่พัก|cannot leave the housing|do not let me leave/i.test(value)
    || (/passport|דרכון|หนังสือเดินทาง/i.test(value) && /לא נותנים לי לצאת|ไม่ให้ฉันออก|do not let me leave|cannot leave/i.test(value))) {
    add(topicResult('trafficking', '15', 'ministry_of_justice', true));
  }

  if (passportWord && (employerWord || withholdWord) && !(flags.documentsLogistics && !employerWord && !withholdWord)) {
    add(topicResult('passport', '4', 'israel_police'));
  }

  if (/recruitment fee|brokerage fee|placement fee|דמי תיווך|ค่านายหน้า/i.test(value)) {
    add(topicResult('recruitment_fees', '', 'piba'));
  }

  if (/פיקדון|pikadon|deposit fund|deposit money|กองทุนเงินฝาก|डिपॉज़िट|जमा राशि/i.test(value)) {
    add(topicResult('deposit', '12', 'piba'));
  }

  if (/manpower company|לתאגיד אחר|להחליף מעסיק|לעבור לתאגיד|לעבור לקבלן|חברת ביצוע|קבלן כוח אדם|บริษัทจัดหางาน|मैनपावर|change employers|move to another/i.test(value)
    || (/construction|בניין|בניה|בנייה|ก่อสร้าง|निर्माण/i.test(value) && /when can i move|when am i allowed to move|מותר לי לעבור|להחליף/i.test(value))) {
    add(topicResult('construction_transfer', '1C', 'piba'));
  }

  if (/severance|פיצויי|pitzuy|ค่าชดเชยเลיקจ้าง/i.test(value)) {
    add(topicResult('severance', '12', 'piba'));
  }

  const terminationSignal = /notice must i give|how much notice|want to quit|אני רוצה לעזוב|כמה זמן מראש|ลาออก|הודעה מוקדמת|fire me|fires me|\bfired\b|\bdismiss|פיטר|פיטור|לפטר|מפוטר|ไล่.{0,12}ออก|ถูกไล่/i.test(value);
  const explicitDismissal = /הודעה מוקדמת|want to quit|notice must i give|how much notice|ลาออก|פיטרו|\bfired\b|\bdismiss\b|fire me|fires me/i.test(value);
  // "פיצויי פיטורים" names the severance payment. It is not a second dismissal question.
  const severanceContext = /severance|פיצוי|pitzuy/i.test(value);
  if (terminationSignal && !(severanceContext && !explicitDismissal)) {
    add(topicResult('termination', '12', 'piba'));
  }

  if (/complain|תלונ|להתלונן|ร้องเรียน|පැමිණිල|शिकायत|who do i report|למי מדווחים/i.test(value)) {
    add(topicResult('complaints', '13', 'ministry_of_labour_ombudsperson'));
  }

  if (/safety equipment|scaffolding|ציוד מגן|פיגום|นั่งร้าน|ไม่มีอุปกรณ์ป้องกัน/i.test(value)) {
    add(topicResult('safety', '13', 'ministry_of_labour_ombudsperson'));
  }

  if (/injured at|נפצעתי|פציעה בעבודה|บาดเจ็บที่ไซต์|work injury/i.test(value)) {
    add(topicResult('work_injury', '6', 'national_insurance'));
  }

  if (/deduct|deduction|ניכוי|לנכות|מנכ|מוריד|הורידו|หัก|काट|कटौती|අඩු කර/i.test(value)) {
    add(topicResult('deductions', '10', 'piba'));
  }

  if (/health insurance|medical insurance|ביטוח רפואי|ביטוח הרפואי|הביטוח הרפואי|ביטוח בריאות|ประกันสุขภาพ|स्वास्थ्य बीमा|සෞඛ්‍ය රක්ෂණ|insurance company refuses|מסרבת לשלם|บริษัทประกัน/i.test(value)) {
    add(topicResult('medical_insurance', '5', 'piba'));
  }

  if (/workers in one room|suitable housing|provide suitable housing|share one room|workers per room|המגורים לא תקינים|מגורים לא תקינים|housing is bad|my housing is bad|עובדים בחדר אחד|עובדים בחדר|עובדים.{0,40}חדר|מגורים הולמים|10 workers|אנחנו 10|อยู่ห้องเดียวกัน|10 คนอยู่/i.test(value)) {
    add(topicResult('housing', '7', 'piba'));
  }

  if (/weekly rest|מנוחה שבועית|מנוחה שבועי|יום מנוחה|שבעה ימים בשבוע|seven days a week|7 days a week/i.test(value) && !flags.shopping) {
    add(topicResult('weekly_rest', '11', 'piba'));
  }

  if (/overtime|שעות נוספות|7 วัน|12 hours a day|12 שעות|ค่าล่วงเวลา|paid for saturday|עבודה בשבת|(saturday|שבת).{0,32}(pay|paid|work|עבודה)|(pay|paid|work|עבודה|מגיע).{0,32}(saturday|שבת)/i.test(value)
    && !flags.shopping) {
    add(topicResult('hours_rest', '11', 'piba'));
  }

  if (/convalescence|dmei havraah|הבראה|ค่าพักฟื้น/i.test(value)) {
    add(topicResult('wages', '9', 'piba'));
  }

  if (!flags.shopping && !flags.healthLocation) {
    const sickLeave = /sick leave|ימי מחלה|חופשת מחלה|sick for|הייתי חולה|חולה שלוש|ป่วยสาม/i.test(value);
    const annualLeave = /vacation day|paid vacation|annual leave|ימי חופשה|חופשה בתשלום|วันหยุดพักร้อน|songkran|סונגקראן|สงกรานต์|religious holiday|יום חג/i.test(value);
    if (sickLeave) add(topicResult('sick_leave', '11', 'piba'));
    if (annualLeave) add(topicResult('annual_leave', '11', 'piba'));
  }

  if (/minimum wage|minimum hourly wage|\bminimum(?:\s+[a-z]+){0,3}\s+wage\b|שכר מינימום|שכר המינימום|שכר מינימלי|השכר המינימלי|ค่าแรงขั้นต่ำ|न्यूनतम वेतन/i.test(value) && !flags.transport) {
    add(topicResult('minimum_wage', '9', 'piba'));
  }

  const strongUnpaid = /not paid|hasn't paid|has not paid|did not pay|didn't pay|doesn't pay|does not pay|did not receive|didn't receive|לא\s+שיל[מם]|לא משלם|אינו משלם|לא קיבלתי את המשכורת|לא קיבלתי משכורת|ไม่จ่ายเงินเดือน|පඩි ගෙව|वेतन नहीं|payslip|תלוש|สลิปเงินเดือน|in cash|במזומן|เงินสดไม่โอน|payday|by what date must|when should i receive my (salary|pay|wages)|עד איזה תאריך|ภายในวันที่|has not given me work|לא נותן לי עבודה|לא נותנת לי עבודה|ไม่ให้งาน/i.test(value);
  // "Do I get paid?" is a wage question on its own. Next to sick leave or
  // another subject it is part of that subject, not a second unpaid-wage claim.
  const weakPay = /still get paid|how much should i (get paid|be paid)|do i get paid|מגיע לי שכר/i.test(value);
  if ((strongUnpaid || (weakPay && found.length === 0)) && !flags.transport) {
    add(topicResult('wages', '9', 'piba'));
  }

  if (/employment contract|חוזה עבודה|สัญญาจ้าง|in my language|בשפה שלי/i.test(value) && /contract|חוזה|สัญญา/i.test(value)) {
    add(topicResult('employment_contract', '8', 'piba'));
  }

  if (/visa (has )?expired|ויזה שלי נגמרה|วีซ่าของฉันหมดอายุ|วีซ่ายังใช้ได้|ลงทะเบียนกับนายจ้าง|registered with an employer|רשום אצל מעסיק|validity of my visa|בתוקף|หมดอายุ/i.test(value)
    && /visa|ויזה|วีซ่า|אשרה/i.test(value)) {
    add(topicResult('visa_status', '2', 'piba'));
  }

  if (found.length === 0 && /\brights\b|הזכויות שלי|זכויות|สิทธิ|अधिकार|අයිතිවාසිකම්/i.test(value)) {
    add(topicResult('rights_overview', '', 'piba'));
  }

  if (found.length === 0 && /מותר למעסיק|מותר לי|is that legal|זה חוקי|ถูกกฎหมายไหม|न्यायिक|legal\?/i.test(value) && (employerWord || /שכר|wage|salary|דרכון|passport|ניכוי|deduct/i.test(value))) {
    add(topicResult('rights_overview', '', 'piba'));
  }

  return found;
}

function detectLegalTopic(text, flags) {
  return collectLegalTopics(text, flags)[0] || null;
}

function weakEmploymentSignal(text) {
  const value = normalized(text).trim();
  if (!value || MENU_LABEL.test(value)) return false;
  return /לנכות|ניכוי|deduct|פיטור|dismiss|\bfired\b|זכויות|\brights\b|payslip|תלוש|פיקדון|pikadon/i.test(value);
}

function rightsSignal(text, topics) {
  return topics.length > 0 || weakEmploymentSignal(text) || unverifiedBlockHint(text);
}

function classifyUserQuestion(text = '') {
  const value = normalized(text);
  const practical = practicalFlags(value);
  const nativeReviewRequired = scriptNeedsNativeReview(value);
  const unverifiedScript = hasUnverifiedLegalScript(value);
  const base = {
    practical,
    nativeReviewRequired,
    unverifiedScript,
    topic: '',
    section: '',
    authorityId: '',
    trafficking: false,
  };
  if (!value.trim()) return { ...base, disposition: 'none' };
  const topics = collectLegalTopics(value, practical);
  const signal = rightsSignal(value, topics);
  const topic = topics[0] || null;
  // A resolved topic stays on the existing legal path, including an approved
  // Hebrew or English record when the reply language matches. Block hints
  // that do not resolve a topic must not select a record.
  if (topic) {
    return {
      ...base,
      ...topic,
      topics: topics.map((item) => item.topic),
      disposition: 'legal',
    };
  }
  if ((practical.greeting || anyPractical(practical)) && !signal) {
    return { ...base, disposition: 'practical' };
  }
  if (signal || unverifiedScript) {
    return { ...base, disposition: 'uncertain', topic: 'unspecified' };
  }
  return { ...base, disposition: 'none' };
}

function looksLikeLegalOrRightsQuestion(text = '') {
  const result = classifyUserQuestion(text);
  return result.disposition === 'legal' || result.disposition === 'uncertain';
}

module.exports = {
  PENDING_NATIVE_SPEAKER_REVIEW,
  classifyUserQuestion,
  hasUnverifiedLegalScript,
  looksLikeLegalOrRightsQuestion,
  practicalFlags,
  unverifiedBlockHint,
};
