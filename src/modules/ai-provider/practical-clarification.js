// Structured practical clarification templates when topic classification is
// confident (non-legal, practical domain agreed by code + model) but factual
// context is insufficient or user details (origin, city, destination, service
// type) are missing.
//
// Policy:
// - Never invent bus/train line numbers, schedules, addresses, opening hours,
//   phone numbers, or unverified service/app/company names.
// - Only include generic safe guidance or verified facts already in repo
//   (e.g. emergency ambulance 101 from emergency-numbers.json for health_place,
//   generic safety checks from jobs-faq.json / housing.json / money-transfer-companies.json).
// - Thai (th), Hindi (hi), and Sinhala (si) templates are machine-translated and
//   MUST be marked nativeReviewRequired=true / pending_native_review (never
//   auto-approved or presented as native-reviewed).

const PENDING_NATIVE_SPEAKER_REVIEW = Object.freeze(['th', 'hi', 'si']);

function templateEntry(translations) {
  return Object.freeze({
    he: Object.freeze({
      text: translations.he,
      reviewStatus: 'owner_review_ready',
      machineTranslated: false,
      nativeReviewRequired: false,
    }),
    en: Object.freeze({
      text: translations.en,
      reviewStatus: 'owner_review_ready',
      machineTranslated: false,
      nativeReviewRequired: false,
    }),
    th: Object.freeze({
      text: translations.th,
      reviewStatus: 'pending_native_review',
      machineTranslated: true,
      nativeReviewRequired: true,
    }),
    hi: Object.freeze({
      text: translations.hi,
      reviewStatus: 'pending_native_review',
      machineTranslated: true,
      nativeReviewRequired: true,
    }),
    si: Object.freeze({
      text: translations.si,
      reviewStatus: 'pending_native_review',
      machineTranslated: true,
      nativeReviewRequired: true,
    }),
  });
}

const PRACTICAL_CLARIFICATION_TEMPLATES = Object.freeze({
  public_transport: templateEntry({
    he: 'כדי לעזור לך עם הגעה בתחבורה ציבורית (אוטובוס או רכבת), כתבו מאיזו עיר או אזור אתם יוצאים ולאיזו תחנה או יעד אתם צריכים להגיע. אין לי כאן לוחות זמנים או מספרי קווים מאומתים בזמן אמת — כדאי לבדוק בלוח הזמנים הרשמי של הרכבת או התחבורה הציבורית, או לשאול בתחנה.',
    en: 'To help with public transport (bus or train), please share which city or area you are starting from and the station or destination you want to reach. I do not have verified live schedules or line numbers here—please check official public transport schedules or ask at the station.',
    th: 'เพื่อช่วยเรื่องการเดินทางด้วยรถโดยสารหรือรถไฟ โปรดบอกเมืองหรือพื้นที่ที่คุณเริ่มต้น และสถานีหรือปลายทางที่ต้องการไป ฉันไม่มีตารางเวลาหรือหมายเลขสายที่ยืนยันแบบเรียลไทม์ที่นี่ กรุณาตรวจสอบจากตารางเวลาขนส่งสาธารณะทางการหรือสอบถามที่สถานี',
    hi: 'सार्वजनिक परिवहन (बस या ट्रेन) में मदद के लिए कृपया बताएं कि आप किस शहर या इलाके से शुरू कर रहे हैं और किस स्टेशन या जगह जाना चाहते हैं। मेरे पास यहाँ लाइव समय-सारणी या बस/ट्रेन नंबर की सत्यापित जानकारी नहीं है—कृपया आधिकारिक परिवहन समय-सारणी देखें या स्टेशन पर पूछें।',
    si: 'පොදු ප්‍රවාහන (බස් හෝ දුම්රිය) මාර්ග සඳහා උදව් කිරීමට, ඔබ පිටත් වන නගරය හෝ ප්‍රදේශය සහ යා යුතු ස්ථානය හෝ දුම්රිය ස්ථානය සඳහන් කරන්න. මෙහි සජීවී කාලසටහන් හෝ බස්/දුම්රිය අංක තහවුරු කර නොමැත—කරුණාකර නිල ප්‍රවාහන කාලසටහන් පරීක්ෂා කරන්න හෝ ස්ථානයේදී විමසන්න.',
  }),
  telecom: templateEntry({
    he: 'כדי להכווין אותך בנושא סים או תקשורת, כתבו באיזו עיר או אזור אתם נמצאים ומה בדיוק אתם מחפשים (סים פריפייד, חבילת סלולר או אינטרנט). ברוב מרכזי הערים והקניונים יש חנויות תקשורת ומובייל, וכדאי להביא תעודה מזהה אם נדרש רישום; אין לי כאן כתובות או מחירים מאומתים של חנויות.',
    en: 'To guide you on a SIM card or mobile service, please share which city or area you are in and what you need (prepaid SIM, mobile plan, or internet). Mobile shops in city centers or shopping malls usually sell SIM cards—bring an ID if registration is required; I do not have verified store addresses or prices here.',
    th: 'เพื่อช่วยแนะนำเรื่องซิมการ์ดหรืออินเทอร์เน็ต โปรดบอกเมืองหรือพื้นที่ที่คุณอยู่ และสิ่งที่ต้องการ (ซิมเติมเงิน แพ็กเกจมือถือ หรืออินเทอร์เน็ต) ร้านโทรศัพท์ในย่านใจกลางเมืองหรือห้างสรรพสินค้ามักมีซิมจำหน่าย และอาจต้องใช้บัตรยืนยันตัวตน ที่นี่ไม่มีที่อยู่ร้านหรือราคาที่ยืนยันแล้ว',
    hi: 'सिम कार्ड या मोबाइल सेवा में मदद के लिए कृपया बताएं कि आप किस शहर या इलाके में हैं और आपको क्या चाहिए (प्रीपेड सिम, मोबाइल प्लान या इंटरनेट)। शहर के मुख्य बाज़ार या शॉपिंग मॉल में मोबाइल दुकानों पर आमतौर पर सिम मिल जाते हैं; ज़रूरत पड़ने पर पहचान पत्र साथ रखें। मेरे पास यहाँ दुकानों के सत्यापित पते या कीमतें नहीं हैं।',
    si: 'සිම් කාඩ්පතක් හෝ ජංගම දුරකථන සේවාවක් ගැන මගපෙන්වීමට, ඔබ සිටින නගරය හෝ ප්‍රදේශය සහ අවශ්‍ය දේ (පෙරගෙවුම් සිම්, පැකේජ හෝ අන්තර්ජාලය) සඳහන් කරන්න. නගර මධ්‍යයේ හෝ සාප්පු සංකීර්ණවල දුරකථන වෙළඳසැල්වල සාමාන්‍යයෙන් සිම් ලබා ගත හැක; ලියාපදිංචියට හැඳුනුම්පතක් අවශ්‍ය විය හැක. මෙහි තහවුරු කළ ලිපිනයන් හෝ මිල ගණන් නොමැත.',
  }),
  shopping_local_services: templateEntry({
    he: 'כדי לעזור לך למצוא חנות או שירות מקומי, כתבו באיזו עיר או שכונה אתם נמצאים ומה בדיוק אתם מחפשים (מזון, חנות, דואר או שירות אחר). אין לי כאן כתובות מדויקות או שעות פתיחה מאומתות בזמן אמת.',
    en: 'To help you find a shop or local service, please share which city or neighborhood you are in and what you are looking for. I do not have verified live addresses or opening hours here.',
    th: 'เพื่อช่วยค้นหาร้านค้าหรือบริการในพื้นที่ โปรดบอกเมืองหรือย่านที่คุณอยู่ และสิ่งที่ต้องการหา ที่นี่ไม่มีที่อยู่หรือเวลาเปิด-ปิดที่ยืนยันแบบเรียลไทม์',
    hi: 'दुकान या स्थानीय सेवा ढूँढने में मदद के लिए कृपया बताएं कि आप किस शहर या मोहल्ले में हैं और आपको क्या चाहिए। मेरे पास यहाँ लाइव पते या खुलने का समय सत्यापित नहीं है।',
    si: 'වෙළඳසැලක් හෝ ප්‍රාදේශීය සේවාවක් සොයා ගැනීමට උදව් කිරීමට, ඔබ සිටින නගරය හෝ ප්‍රදේශය සහ ඔබ සොයන දේ සඳහන් කරන්න. මෙහි සජීවී ලිපිනයන් හෝ විවෘත වේලාවන් තහවුරු කර නොමැත.',
  }),
  health_place: templateEntry({
    he: 'כדי לעזור לך למצוא מרפאה, בית חולים או בית מרקחת, כתבו באיזו עיר או אזור אתם נמצאים ומה אתם מחפשים. אין לי כאן כתובות או שעות פתיחה מאומתות בזמן אמת — כדאי לבדוק מול ספק השירות הרפואי שלכם. במקרה חירום רפואי בישראל, חייגו 101 לאמבולנס.',
    en: 'To help you find a clinic, hospital, or pharmacy, please share which city or area you are in and which place you need. I do not have verified live addresses or opening hours here—please check with your medical clinic provider. In a medical emergency in Israel, call 101 for an ambulance.',
    th: 'เพื่อช่วยค้นหาคลินิก โรงพยาบาล หรือร้านขายยา โปรดบอกเมืองหรือพื้นที่ที่คุณอยู่และสถานที่ที่ต้องการ ที่นี่ไม่มีที่อยู่หรือเวลาเปิดทำการแบบเรียลไทม์ กรุณาตรวจสอบกับผู้ให้บริการคลินิกของคุณ หากเป็นเหตุฉุกเฉินทางการแพทย์ในอิสราเอล โทร 101 เพื่อเรียกรถพยาบาล',
    hi: 'क्लिनिक, अस्पताल या फ़ार्मेसी ढूँढने में मदद के लिए कृपया बताएं कि आप किस शहर या इलाके में हैं और आपको कौन-सी जगह चाहिए। मेरे पास यहाँ लाइव पते या खुलने का समय सत्यापित नहीं है—कृपया अपने चिकित्सा सेवा प्रदाता से जांच करें। इज़राइल में चिकित्सा आपातकाल में एम्बुलेंस के लिए 101 पर कॉल करें।',
    si: 'සායනයක්, රෝහලක් හෝ ඔසුසලක් සොයා ගැනීමට උදව් කිරීමට, ඔබ සිටින නගරය හෝ ප්‍රදේශය සහ අවශ්‍ය ස්ථානය සඳහන් කරන්න. මෙහි සජීවී ලිපිනයන් හෝ විවෘත වේලාවන් තහවුරු කර නොමැත—කරුණාකර ඔබේ වෛද්‍ය සේවා සපයන්නාගෙන් පරීක්ෂා කරන්න. ඊශ්‍රායලයේ හදිසි වෛද්‍ය අවස්ථාවකදී ගිලන් රථයක් සඳහා 101 අමතන්න.',
  }),
  job_search: templateEntry({
    he: 'כדי לעזור בחיפוש עבודה מעשי, כתבו באיזה תחום או מקצוע ובאיזו עיר אתם מחפשים. מומלץ לפנות לאנשי קשר אמינים או לחברות מורשות, ולהיזהר מכל מי שמבקש תשלום מראש לפני מסירת פרטי עבודה ברורים.',
    en: 'To help with a practical job search, please share what kind of work and which city or area you are looking in. Start with trusted contacts or licensed agencies, and be careful with anyone asking for money before giving clear job details.',
    th: 'เพื่อช่วยค้นหางานในทางปฏิบัติ โปรดบอกประเภทงานและเมืองหรือพื้นที่ที่ต้องการ เริ่มจากคนรู้จักที่เชื่อถือได้หรือหน่วยงานที่ได้รับอนุญาต และระวังผู้ที่ขอให้จ่ายเงินล่วงหน้าก่อนให้รายละเอียดงานที่ชัดเจน',
    hi: 'काम ढूँढने में व्यावहारिक मदद के लिए कृपया बताएं कि आप किस तरह का काम और किस शहर या इलाके में ढूँढ रहे हैं। भरोसेमंद संपर्कों या लाइसेंस प्राप्त एजेंसियों से शुरुआत करें, और साफ नौकरी विवरण दिए बिना पहले पैसे मांगने वालों से सावधान रहें।',
    si: 'රැකියා සෙවීමේදී ප්‍රායෝගික උදව් සඳහා, ඔබ සොයන රැකියා වර්ගය සහ නගරය හෝ ප්‍රදේශය සඳහන් කරන්න. විශ්වාසවන්ත සම්බන්ධතා හෝ බලපත්‍රලාභී ආයතන හරහා සොයන්න, පැහැදිලි රැකියා විස්තර දීමට පෙර මුදල් ඉල්ලන අයගෙන් ප්‍රවේශම් වන්න.',
  }),
  housing_search: templateEntry({
    he: 'כדי לעזור בחיפוש חדר או דירה, כתבו באיזו עיר או אזור אתם מחפשים ומה סוג המגורים הרצוי. לפני תשלום סכום גדול, בדקו מחיר, חשבונות, הסכם שכירות, ערבות ותחבורה ציבורית באזור, ואל תשלמו לפני שראיתם את המקום והבנתם את ההסכם.',
    en: 'To help with finding a room or apartment, please share which city or area and what type of place you are looking for. Check the price, bills, contract, deposit, and nearby public transport, and do not pay large amounts before seeing the place and understanding the agreement.',
    th: 'เพื่อช่วยหาห้องหรือที่พัก โปรดบอกเมืองหรือพื้นที่และประเภทที่พักที่ต้องการ ควรตรวจสอบค่าเช่า ค่าน้ำค่าไฟ สัญญา เงินมัดจำ และการเดินทางสาธารณะ และอย่าจ่ายเงินก้อนใหญ่ก่อนเห็นสถานที่จริงและเข้าใจข้อตกลง',
    hi: 'कमरा या मकान ढूँढने में मदद के लिए कृपया बताएं कि आप किस शहर या इलाके में और किस तरह की जगह ढूँढ रहे हैं। किराया, बिल, अनुबंध, अग्रिम राशि और आसपास के परिवहन की जांच करें, और जगह देखे बिना या शर्तें समझे बिना बड़ी रकम न दें।',
    si: 'කාමරයක් හෝ නිවසක් සොයා ගැනීමට උදව් කිරීමට, ඔබ සොයන නගරය හෝ ප්‍රදේශය සහ ස්ථාන වර්ගය සඳහන් කරන්න. කුලිය, බිල්පත්, ගිවිසුම, තැන්පතු මුදල් සහ ප්‍රවාහන පහසුකම් පරීක්ෂා කරන්න; ස්ථානය බැලීමට සහ ගිවිසුම තේරුම් ගැනීමට පෙර විශාල මුදලක් ගෙවන්න එපා.',
  }),
  money_transfer: templateEntry({
    he: 'כדי לעזור בהעברת כסף או בדיקת שער, כתבו לאיזו מדינה ומטבע אתם שולחים ואם אתם מעדיפים איסוף כסף או הפקדה לחשבון בנק. מומלץ להשתמש בשירות מורשה, להשוות גם את השער וגם את העמלה הכוללת לפני השליחה, ולשמור את הקבלה.',
    en: 'To help with a money transfer or rate question, please share which country and currency you are sending to and whether you prefer cash pickup or bank deposit. Use a licensed service, compare both the exchange rate and the total fee before sending, and keep the receipt.',
    th: 'เพื่อช่วยเรื่องการโอนเงินหรืออัตราแลกเปลี่ยน โปรดบอกประเทศและสกุลเงินปลายทาง รวมถึงเลือกรับเงินสดหรือโอนเข้าบัญชีธนาคาร ควรใช้บริการที่มีใบอนุญาต เปรียบเทียบทั้งอัตราแลกเปลี่ยนและค่าธรรมเนียมรวมก่อนส่ง และเก็บใบเสร็จไว้',
    hi: 'पैसे भेजने या विनिमय दर में मदद के लिए कृपया बताएं कि आप किस देश और मुद्रा में भेज रहे हैं और नकद पिकअप या बैंक जमा चुनना चाहते हैं। लाइसेंस प्राप्त सेवा का उपयोग करें, भेजने से पहले दर और कुल शुल्क दोनों की तुलना करें, और रसीद संभाल कर रखें।',
    si: 'මුදල් යැවීම හෝ විනිමය අනුපාත ගැන උදව් කිරීමට, ඔබ යවන රට සහ මුදල් වර්ගය මෙන්ම මුදල් ලබා ගැනීම හෝ බැංකු තැන්පතුව යන ක්‍රමය සඳහන් කරන්න. බලපත්‍රලාභී සේවාවක් භාවිතා කරන්න, යැවීමට පෙර විනිමය අනුපාතය සහ මුළු ගාස්තුව සංසන්දනය කර රිසිට්පත තබා ගන්න.',
  }),
  practical_banking: templateEntry({
    he: 'כדי לעזור בסידורים מול בנק או דואר, כתבו מה בדיוק אתם צריכים לבצע ובאיזו עיר אתם נמצאים. כדאי לבדוק מראש אילו מסמכי זיהוי ואישורים נדרשים בסניף; אין לי כאן כתובות או שעות פתיחה מאומתות בזמן אמת.',
    en: 'To help with a banking or post office errand, please share what you need to do and which city you are in. Check in advance which identification and permit documents the branch requires; I do not have verified live branch addresses or opening hours here.',
    th: 'เพื่อช่วยเรื่องติดต่อธนาคารหรือไปรษณีย์ โปรดบอกเรื่องที่ต้องการทำและเมืองที่คุณอยู่ ควรตรวจสอบล่วงหน้าว่าต้องใช้เอกสารยืนยันตัวตนหรือเอกสารใดบ้าง ที่นี่ไม่มีที่อยู่สาขาหรือเวลาทำการแบบเรียลไทม์',
    hi: 'बैंक या डाकघर के काम में मदद के लिए कृपया बताएं कि आपको क्या काम करना है और आप किस शहर में हैं। जाने से पहले जाँच लें कि शाखा में कौन से पहचान पत्र या दस्तावेज़ चाहिए; मेरे पास यहाँ शाखा के लाइव पते या खुलने का समय नहीं है।',
    si: 'බැංකු හෝ තැපැල් කටයුත්තකට උදව් කිරීමට, ඔබට කළ යුතු කාර්යය සහ ඔබ සිටින නගරය සඳහන් කරන්න. ශාඛාවට අවශ්‍ය හැඳුනුම්පත් සහ ලේඛන මොනවාදැයි කලින් පරීක්ෂා කරන්න; මෙහි සජීවී ශාඛා ලිපිනයන් හෝ විවෘත වේලාවන් නොමැත.',
  }),
  embassy_admin: templateEntry({
    he: 'כדי לעזור בסידורים מול שגרירות או גוף מנהלי (כמו תור או חידוש מסמך), כתבו איזו שגרירות או איזה הליך אתם צריכים ובאיזו עיר אתם נמצאים. בדקו באתר הרשמי של השגרירות או הרשות הרלוונטית לגבי תורים ומסמכים נדרשים; אין לי כאן כתובות, שעות או מספרי טלפון מאומתים.',
    en: 'To help with an embassy or administrative errand (such as an appointment or document renewal), please share which embassy or task you need and which city you are near. Check the official embassy or authority website for appointments and required documents; I do not have verified addresses, hours, or phone numbers here.',
    th: 'เพื่อช่วยเรื่องติดต่อสถานทูตหรือเอกสารราชการ (เช่น นัดหมายหรือต่ออายุเอกสาร) โปรดบอกสถานทูตหรือขั้นตอนที่ต้องการและเมืองที่คุณอยู่ กรุณาตรวจสอบการนัดหมายและเอกสารที่ต้องใช้จากเว็บไซต์ทางการของสถานทูตหรือหน่วยงานนั้น ที่นี่ไม่มีที่อยู่ เวลาทำการ หรือเบอร์โทรที่ยืนยันแล้ว',
    hi: 'दूतावास या प्रशासनिक काम (जैसे अपॉइंटमेंट या दस्तावेज़ नवीनीकरण) में मदद के लिए कृपया बताएं कि आपको किस दूतावास या प्रक्रिया की जानकारी चाहिए और आप किस शहर के पास हैं। अपॉइंटमेंट और ज़रूरी दस्तावेज़ों के लिए संबंधित दूतावास या प्राधिकरण की आधिकारिक वेबसाइट देखें; मेरे पास यहाँ सत्यापित पते, समय या फ़ोन नंबर नहीं हैं।',
    si: 'තානාපති කාර්යාල හෝ පරිපාලන කටයුත්තක් (වේලාවක් වෙන් කිරීම හෝ ලේඛන අලුත් කිරීම වැනි) සඳහා උදව් කිරීමට, අවශ්‍ය තානාපති කාර්යාලය හෝ කාර්යය සහ ඔබ සිටින නගරය සඳහන් කරන්න. වේලාවන් සහ අවශ්‍ය ලේඛන සඳහා නිල වෙබ් අඩවිය පරීක්ෂා කරන්න; මෙහි තහවුරු කළ ලිපිනයන්, වේලාවන් හෝ දුරකථන අංක නොමැත.',
  }),
});

function practicalClarificationLanguage(language) {
  const code = String(language || '').toLowerCase();
  if (code.startsWith('he') || code.startsWith('iw')) return 'he';
  if (code.startsWith('th')) return 'th';
  if (code.startsWith('si')) return 'si';
  if (code.startsWith('hi')) return 'hi';
  return 'en';
}

function formatPracticalClarification(domain, language) {
  const lang = practicalClarificationLanguage(language);
  const byDomain = PRACTICAL_CLARIFICATION_TEMPLATES[domain];
  if (!byDomain) {
    return null;
  }
  const entry = byDomain[lang] || byDomain.en;
  return {
    domain,
    language: lang,
    reply: entry.text,
    reviewStatus: entry.reviewStatus,
    machineTranslated: entry.machineTranslated,
    nativeReviewRequired: entry.nativeReviewRequired,
    noAutoApproval: true,
  };
}

function allPracticalClarificationTexts() {
  const texts = [];
  for (const byDomain of Object.values(PRACTICAL_CLARIFICATION_TEMPLATES)) {
    for (const entry of Object.values(byDomain)) {
      if (entry && entry.text) texts.push(entry.text);
    }
  }
  return texts;
}

function isPracticalClarificationText(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return allPracticalClarificationTexts().includes(value);
}

module.exports = {
  PENDING_NATIVE_SPEAKER_REVIEW,
  PRACTICAL_CLARIFICATION_TEMPLATES,
  allPracticalClarificationTexts,
  formatPracticalClarification,
  isPracticalClarificationText,
  practicalClarificationLanguage,
};
