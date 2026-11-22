# סקירת שלב 2 — טיוטות זכויות בעברית ובאנגלית

המסמך הזה מיועד ליהודה. זו סקירה של 12 טיוטות בעברית ובאנגלית אחרי בדיקה מול הזכותון הרשמי של רשות האוכלוסין וההגירה, מהדורת 2026, ומול דף שכר המינימום של המוסד לביטוח לאומי. תאריך הבדיקה: 2026-11-22.

תיבות הסימון במסמך הזה נשארו ריקות. הן לא סומנו כסקירה משפטית עצמאית, ואין במסמך הזה אישור משפטי.

החלטת התוכן של הבעלים, t103u (יהודה כהן, 2026-11-22), נרשמה אחר כך ב־16 קבצי JSON ב־`knowledge/approvals/` (PR #28): עברית ואנגלית עבור passport, construction_transfer, minimum_wage, housing, medical_insurance, weekly_rest, sick_leave, severance. כל קובץ מכיל `recordId`, `contentHash` של הטיוטה כפי שהיא, `reviewer`, `date` ו־`note` עם הנוסח `owner decision t103u`. זו החלטת תוכן של הבעלים. היא אינה ראיה לסקירה משפטית עצמאית. הטיוטות עצמן נשארו `status: "draft"`, והנוסח שלהן לא שונה כאן.

אחרי מיזוג PR #27, אחר כך PR #28, ואחר כך תיקון הטעינה, הבוט טוען טיוטה מ־`knowledge/drafts/` רק כשיש לה אישור עם אותו hash, ומציג אותה רק כשנושא השאלה והשפה תואמים. deductions, annual_leave, deposit ו־complaints נשארים בלי אישור. תאית, הינדית וסינהלית נשארות `extraction_unreliable` ובלי אישור, והן לא מוצגות.

ה־PDF העברי והאנגלי הורדו שוב מ־gov.il ב־2026-11-22. ערכי ה־SHA-256 זהים לקבצים שבמאגר:

- עברית: `43f74b37c6758c406aae01bb88e377347550914768794849be8239122a0a7f01`
- אנגלית: `a193555d71db6a359f66e5aff19ba90a82b4ced191ba55fcc96f3a7482c3a867`

הציטוטים נבדקו מול עמוד ה־PDF עצמו: `pdftotext -layout` ועמודים שרונדרו ב־`pdftoppm` ונקראו ב־Tesseract (עברית ואנגלית). תאית, הינדית וסינהלית נשארו `extraction_unreliable`, בלי ציטוט ובלי תשובה.

## טבלה

| נושא | שאלה | מקור עברי (עמוד) | מקור אנגלי (עמוד) | קבוצה | מוכן לסקירה סופית | אושר על ידי יהודה |
| --- | --- | --- | --- | --- | --- | --- |
| passport | מותר למעסיק לקחת לי את הדרכון? | סעיף 4, עמוד 15 | סעיף 4, עמוד 19 | א. מוכן לסקירה ולאישור | כן | ☐ |
| construction_transfer | אני עובד בניין. מתי מותר לי לעבור לתאגיד אחר? | סעיף 1C, עמוד 9 | סעיף 1C, עמוד 12 | א. מוכן לסקירה ולאישור | כן | ☐ |
| minimum_wage | מה שכר המינימום עכשיו? | סעיף 9, עמוד 16 | סעיף 9, עמוד 22 | א. מוכן לסקירה ולאישור | כן | ☐ |
| deductions | מה מותר למעסיק לנכות לי מהמשכורת? | סעיף 10, עמוד 17 | סעיף 10, עמוד 23 | ב. חסר מידע | לא | ☐ |
| housing | המעסיק חייב לדאוג לי למגורים הולמים? | סעיף 7, עמוד 15 | סעיף 7, עמוד 20 | א. מוכן לסקירה ולאישור | כן | ☐ |
| medical_insurance | המעסיק חייב לעשות לי ביטוח רפואי? | סעיף 5, עמוד 15 | סעיף 5, עמוד 19 | א. מוכן לסקירה ולאישור | כן | ☐ |
| weekly_rest | כמה מנוחה שבועית מגיעה לי? | סעיף 11, עמוד 19 | סעיף 11, עמוד 26 | א. מוכן לסקירה ולאישור | כן | ☐ |
| annual_leave | כמה ימי חופשה בתשלום מגיעים לי? | סעיף 11, עמוד 19 | סעיף 11, עמוד 26 | ג. חסום בגלל סתירה | לא | ☐ |
| sick_leave | מה מגיע לי בימי מחלה? | סעיף 11, עמוד 20 | סעיף 11, עמוד 27 | א. מוכן לסקירה ולאישור | כן | ☐ |
| severance | מתי מגיעים פיצויי פיטורים? | סעיף 12, עמוד 20 | סעיף 12, עמוד 28 | א. מוכן לסקירה ולאישור | כן | ☐ |
| deposit | איך מקבלים את כסף הפיקדון? | סעיף 12, עמוד 21 | סעיף 12, עמוד 29 | ג. חסום בגלל סתירה | לא | ☐ |
| complaints | למי אפשר להתלונן על המעסיק? | סעיף 13, עמוד 23 | סעיף 13, עמוד 31 | ג. חסום בגלל סתירה | לא | ☐ |

התשובות המלאות, התנאים והמקורות מופיעים לפי נושא למטה. העמודה האנגלית היא התשובה שבקובץ האנגלי, לא תרגום נפרד.

## א. מוכן לסקירה ולאישור

passport, construction_transfer, minimum_wage, housing, medical_insurance, weekly_rest, sick_leave, severance.

אלה נושאים שבהם העברית והאנגלית אומרות אותו דבר על התנאים שנשאלו, והמספרים שבתשובה נמצאים בציטוט. שכר המינימום גם תואם את הדף העדכני של הביטוח הלאומי.

## ב. חסר מידע

deductions.

חסר הקובץ שמצורף לדף gov.il `https://www.gov.il/he/pages/circular2026`. כותרת הדף, כפי שנראתה ברשימת תוצאות ולא בקובץ שנפתח: "חוזר אגרות לשנת 2026" / עדכון סכומי אגרות, פיקדון, ערובה, ניכוי בעד מגורים הולמים, הוצאות נלוות וניכוי בעד ביטוח רפואי. תאריכים שמופיעים ברשימה: פרסום 18.08.2026, עדכון 26.08.2026. הורדת הדף נחסמה (Cloudflare 403), ולכן גוף החוזר לא נקרא. תקרות השקלים שבזכותון אינן נכתבות בתשובה כסכום עדכני. כלל 25% וההבהרה שאינו ניכוי אוטומטי ואינו הרשאה גורפת כן מצוטטים מהזכותון.

## ג. חסום בגלל סתירה

annual_leave, deposit, complaints.

- annual_leave: בעמוד העברי כתוב שהוותק הוא "אצל אותו מטופל". בעמוד האנגלי כתוב "for the employer" / "by the employer". שתי הנוסחאות אומתו בקריאה מהעמוד. אין הכרעה.
- deposit: בשהייה לא חוקית העברית אומרת שהניכוי הוא "מיתרת 25%" וגם שאחרי 12 חודשים אובדת "יתרת 75%". האנגלית אומרת שהניכוי הוא מהיתרה של 75% ושאחרי 12 חודשים מופקעים 75%. אומת ב־OCR של עמוד 21 בעברית ועמוד 29 באנגלית. אין הכרעה על בסיס הניכוי. שלבי קבלת הכסף ביציאה חוקית (15%, 10 ימי עבודה, 30 ימי עבודה) תואמים בשתי המהדורות ומופיעים בתשובה.
- complaints: המהדורה האנגלית מדפיסה לטופס המקוון את `www.molsa.gov.il`. בשורת הטופס בעברית הקישור בטקסט נקטע, וקישור שמוטמע ב־PDF מוביל ל־`https://www.gov.il/he/departments/Units/foreign-workers-rights-at-work`. אין הכרעה איזה אתר עדכני. מספרי טלפון ודוא"ל לא הועתקו לתשובה.

## סתירות ומקורות שלא הוכרעו

1. חופשה שנתית: "אצל אותו מטופל" מול "for the employer". סעיף 11. עמוד עברי 19, עמוד אנגלי 26.
2. ניכוי פיקדון בשהייה לא חוקית: יתרת 25% בעברית מול יתרת 75% באנגלית. סעיף 12. עמוד עברי 21, עמוד אנגלי 29.
3. כתובת הטופס המקוון לתלונה: `www.molsa.gov.il` באנגלית מול קישור gov.il של היחידה בעברית. סעיף 13. עמוד עברי 23, עמוד אנגלי 31.
4. סעיף 15: העברית מפנה למחלקה לסיוע משפטי במשרד המשפטים ומדפיסה טלפון. האנגלית מפנה ליחידת התיאום למאבק בסחר בבני אדם במשרד המשפטים ומדפיסה דוא"ל. שתי הנוסחאות נשארות ב־`docs/CONTACTS_PENDING_VERIFICATION.md` ואינן בתשובה.
5. קו לעובד, תל אביב, סעיף 16: ב־OCR של העמוד העברי מופיע `03-6883766`. במהדורה האנגלית מופיע `03-6883537`. שני המספרים ממתינים לאימות ואינם בתשובה.
6. בפסקת האגרה לעובד סיעוד, הזכותון האנגלי מדפיס את שכר המינימום החודשי "as last updated on _April 2026" בלי יום. הזכותון העברי ודף הביטוח הלאומי מדפיסים 01.04.2026 לאותו סכום חודשי. אין סתירה על הסכום. היום החסר באנגלית לא שימש כתאריך.
7. דף החוזר `https://www.gov.il/he/pages/circular2026` לא נפתח. גם דף "עדכון בעניין תשלום שכר לעובדים זרים" מ־30.07.2026 לא נפתח. כותרתו, לפי רשימת תוצאות בלבד, עוסקת בדרך תשלום השכר. גוף החוזר לא נקרא ולכן לא שינה את תשובת שכר המינימום.

## שכר מינימום

הסכום שבתוקף לפי דף המוסד לביטוח לאומי, נבדק ב־2026-11-22:

- מקור: https://www.btl.gov.il/Mediniyut/GeneralData/Pages/%D7%A9%D7%9B%D7%A8%20%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%95%D7%9D.aspx
- מגיל 18 ומעלה, החל ב־01.04.2026
- חודשי: 6,443.85 ש"ח
- לשעה בהיקף של 182 שעות: 35.4 ש"ח
- לשעה בהיקף של 186 שעות: 34.64 ש"ח

הזכותון מדפיס את 6,443.85 ואת 35.4 למשרה מלאה של לכל היותר 182 שעות. זה אותו סכום שבתוקף, לא סכום ישן. הסכום הקודם בדף הביטוח הלאומי, 6,247.67 מ־01.04.2025, אינו מוצג כעדכני.

## פירוט לפי נושא

### passport

- **שאלה:** מותר למעסיק לקחת לי את הדרכון?
- **קבוצה:** א. מוכן לסקירה ולאישור
- **מוכן לסקירה סופית:** כן
- **נבדק:** 2026-11-22
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 4; עמוד PDF 15
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 4; עמוד PDF 19
- **תשובה בעברית:**

תשובה: החזקת דרכון של עובד בניגוד לרצונו היא עבירה פלילית.

תנאים וחריגים: הזכותון קושר את העבירה להחזקה בניגוד לרצון העובד. לא מפורט בו חריג.

מה אפשר לעשות: עובד שדרכונו מוחזק בניגוד לרצונו בידי המעסיק, חברת כוח אדם, לשכה פרטית או כל אדם אחר, רשאי להגיש תלונה למשטרת ישראל. כך כתוב בזכותון.

מקור: זכותון רשות האוכלוסין וההגירה לעובדים זרים, מהדורת 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: Withholding a worker’s passport against his will is a criminal offence.

Conditions and exceptions: The handbook ties the offence to holding the passport against the worker’s will. It states no exception.

What you can do: An employee whose passport is held against his will by an employer, a manpower company, a placement bureau, or any other person, may file a complaint with the Israel Police.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### construction_transfer

- **שאלה:** אני עובד בניין. מתי מותר לי לעבור לתאגיד אחר?
- **קבוצה:** א. מוכן לסקירה ולאישור
- **מוכן לסקירה סופית:** כן
- **נבדק:** 2026-11-22
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 1C; עמוד PDF 9
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 1C; עמוד PDF 12
- **תשובה בעברית:**

תשובה: עובד זר בענף הבניין רשאי לעבור למעסיק אחר רק אחת לרבעון, בתאריכים 1 בינואר, 1 באפריל, 1 ביולי ו-1 באוקטובר, אחרי הודעה מוקדמת בכתב כדין למעסיק.

תנאים וחריגים: מי שהגיע דרך קבלן כוח אדם מורשה יכול לעבור רק לקבלן כוח אדם מורשה אחר. מי שהגיע דרך קבלן זר רשום (חברת ביצוע) יכול לעבור רק בין חברות ביצוע כאלה. בין הרבעונים, אם המעסיק הנוכחי הפר זכויות, אפשר לבקש רשות מהממונה על זכויות עובדים זרים בעבודה במשרד העבודה. במקרים יוצאי דופן של הפרות חמורות, עובד של קבלן זר רשום יכול לבקש מרשות האוכלוסין מעבר חריג לקבלן כוח אדם מורשה, או להיפך, והרשות מחליטה אחרי בחינת התלונה.

מה אפשר לעשות: הבקשה לרשות האוכלוסין מוגשת דרך המעסיק החדש. העבודה אצלו מתחילה רק אחרי תשובה חיובית בכתב מהרשות, שנשלחת למעסיק החדש, והוא חייב להודיע לעובד. פרטי ההתקשרות עם הממונה נמצאים בפרק הגשת התלונות בזכותון, ואינם מפורסמים כאן.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: A foreign worker in construction may change employers only once a quarter, on 1 January, 1 April, 1 July and 1 October, after lawful advance notice in writing to the employer.

Conditions and exceptions: A worker who arrived through a licensed manpower company may move only to another licensed manpower company. A worker who arrived through a registered foreign contractor may move only between such contractors. Between quarters, if the current employer has violated the worker’s rights, the worker can ask the Ombudsperson for Foreign Worker Labour Rights in the Ministry of Labour for permission. In exceptional cases of severe violations, a worker employed by a registered foreign contractor may ask PIBA for a transfer to a licensed construction manpower company, or the other way around. PIBA decides after it examines the complaint.

What you can do: The new employer files the request with PIBA. Work for that employer starts only after PIBA sends a positive written answer to the new employer, who must tell the worker. The handbook puts the Ombudsperson’s contact details in the complaints section. Those details are not repeated here.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### minimum_wage

- **שאלה:** מה שכר המינימום עכשיו?
- **קבוצה:** א. מוכן לסקירה ולאישור
- **מוכן לסקירה סופית:** כן
- **נבדק:** 2026-11-22
- **בתוקף מ־:** 2026-04-01
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 9; עמוד PDF 16
  - שכר מינימום - נתונים כלליים | ביטוח לאומי; https://www.btl.gov.il/Mediniyut/GeneralData/Pages/%D7%A9%D7%9B%D7%A8%20%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%95%D7%9D.aspx; סעיף btl-minimum-wage; עמוד PDF None
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 9; עמוד PDF 22
  - שכר מינימום - נתונים כלליים | ביטוח לאומי; https://www.btl.gov.il/Mediniyut/GeneralData/Pages/%D7%A9%D7%9B%D7%A8%20%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%95%D7%9D.aspx; סעיף btl-minimum-wage; עמוד PDF None
- **תשובה בעברית:**

תשובה: לפי דף שכר המינימום של המוסד לביטוח לאומי, מגיל 18 ומעלה, החל ב-01.04.2026, השכר החודשי הוא 6,443.85 ש"ח. שכר לשעה בהיקף של 182 שעות בחודש הוא 35.4 ש"ח, ושכר לשעה בהיקף של 186 שעות בחודש הוא 34.64 ש"ח.

תנאים וחריגים: אלה שני בסיסי שעה שהביטוח הלאומי מפרסם, לא סכום אחד. הזכותון העברי מדפיס את 6,443.85 ואת 35.4 למשרה מלאה של לכל היותר 182 שעות, וזהה לסכום שבתוקף בדף הביטוח הלאומי. הוא אינו סכום ישן. בענף או במקום עבודה שבהם הסכם קיבוצי או צו הרחבה קובע שכר גבוה יותר, כדוגמת ענף הבניין, חל השכר הגבוה.

מה אפשר לעשות: הזכותון ממליץ לנהל רישום בכתב של שעות העבודה ושל שעות וימי המנוחה.

מקור: המוסד לביטוח לאומי, שכר מינימום, https://www.btl.gov.il/Mediniyut/GeneralData/Pages/%D7%A9%D7%9B%D7%A8%20%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%95%D7%9D.aspx וגם זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: On the National Insurance Institute minimum-wage page, for a worker aged 18 and over, from 01.04.2026, the monthly wage is 6,443.85 NIS. The hourly wage on a 182-hour month is 35.4 NIS, and the hourly wage on a 186-hour month is 34.64 NIS.

Conditions and exceptions: The Institute publishes both hourly bases. The 2026 handbook prints 6,443.85 and 35.4 for a full-time job of at most 182 hours. That handbook figure is the same amount the Institute lists as in effect from 01.04.2026. It is not an older amount presented as current. Where a collective agreement or extension order sets a higher wage, such as in construction, the higher wage applies.

What you can do: The handbook advises keeping a written record of daily working hours and of rest hours and rest days.

Source: National Insurance Institute, minimum wage. https://www.btl.gov.il/Mediniyut/GeneralData/Pages/%D7%A9%D7%9B%D7%A8%20%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%95%D7%9D.aspx Also PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### deductions

- **שאלה:** מה מותר למעסיק לנכות לי מהמשכורת?
- **קבוצה:** ב. חסר מידע
- **מוכן לסקירה סופית:** לא
- **נבדק:** 2026-11-22
- **מה חסר או מה סותר:** הקובץ של חוזר האגרות לשנת 2026 לא נפתח, ולכן תקרות השקלים לא נכתבות כסכום עדכני.
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 10; עמוד PDF 17
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 10; עמוד PDF 23
- **תשובה בעברית:**

תשובה: מעסיק רשאי לנכות רק סוגים מסוימים: תשלומים לפי חוק (מס הכנסה וביטוח לאומי); מגורים והוצאות נלוות עד התקרה שבתקנות; חלק מעלות ביטוח הבריאות הפרטי עד התקרה שבתקנות; וסכומים קצובים לחוב של העובד, אם העובד הסכים לכך בכתב. אגרות ומסים שמוטלים על המעסיק אינם ניתנים לניכוי.

תנאים וחריגים: התקרה החודשית לביטוח בריאות, מגורים הולמים והוצאות נלוות, וחובות למעסיק, היא עד 25% מהשכר. תקרת 25% אינה הרשאה גורפת לנכות 25%. הניכוי אינו אוטומטי, ומותר רק בעד הוצאות בפועל. אם הניכויים המותרים נמוכים מ-25%, אין לנכות את מלוא ה-25%. אם הם גבוהים מ-25%, אין לנכות יותר מ-25% בחודש. בחודש העבודה האחרון מותר לנכות את כל ההוצאות המותרות. תקרות השקלים המודפסות בזכותון אינן נכתבות כאן כסכום עדכני, כי דף רשמי מאוחר יותר על עדכון התקרות האלה לא נפתח בבדיקה.

מה אפשר לעשות: הזכותון אומר שמעסיק בעסק חייב לתת בכל חודש תלוש מפורט. מעסיק בסיעוד בביתו אינו חייב להנפיק תלוש.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: An employer may deduct only these kinds of amounts: payments required by law (income tax and national insurance); housing and related expenses up to the regulatory ceiling; part of the private health-insurance cost up to the regulatory ceiling; and set amounts for a debt to the employer if the employee agreed in writing. Fees and taxes imposed on the employer may not be deducted.

Conditions and exceptions: The monthly ceiling for health insurance, suitable housing and related expenses, and debts to the employer is 25% of the salary. The 25% cap is not a blanket permission to deduct 25%. It is not an automatic deduction, and the employer may deduct only actual expenses. If the permitted deductions are less than 25%, the employer may not deduct the entire 25%. If they are more than 25%, the employer may not deduct more than 25% in a month. In the final month of employment, all permitted expenses may be deducted. Shekel ceilings printed in the handbook are not stated here as the current amounts, because a later official page about updating those ceilings was not retrieved in this check.

What you can do: The handbook says an employer who employs a foreign worker in a business must give an itemized pay slip every month. A person receiving care who employs a caregiver at home does not have to issue a pay slip.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### housing

- **שאלה:** המעסיק חייב לדאוג לי למגורים הולמים?
- **קבוצה:** א. מוכן לסקירה ולאישור
- **מוכן לסקירה סופית:** כן
- **נבדק:** 2026-11-22
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 7; עמוד PDF 15
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 7; עמוד PDF 20
- **תשובה בעברית:**

תשובה: המעסיק חייב לספק מגורים הולמים לפי התנאים שבתקנות, במשך כל תקופת ההעסקה ולפחות שבעה ימים אחרי סיומה.

תנאים וחריגים: המגורים כוללים, בין השאר, מקום לינה של לפחות 4 מ"ר לעובד, לא יותר משישה עובדים בחדר, ארון ומיטה לכל עובד, חימום ואוורור, תאורה ונקודות חשמל, מים חמים וקרים, מטבח עם כיור, דלפק, ארונות, כיריים, מקרר, שולחן וכיסאות, מכונת כביסה לשישה עובדים, ומטף. צריכה להיות גישה סבירה למגורים ולשירותים ולרחצה. בסיעוד, הסדרי המגורים הסבירים הם בבית המטופל.

מה אפשר לעשות: הזכותון קובע את החובה ואת הרשימה. הוא אינו נותן כאן כתובת נפרדת לפנייה על מגורים.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: The employer must provide suitable housing that meets the conditions in the relevant regulations, throughout the employment and for a minimum of seven days after it ends.

Conditions and exceptions: The housing must include at least 4 square meters of sleeping space per worker, no more than six workers in a room, a personal cupboard and bedding, heating and ventilation, reasonable lighting and electrical outlets, hot and cold water, a sink, kitchen counters and cupboards, a stovetop, a refrigerator, a table and chairs, a washing machine for six workers, and a fire extinguisher. There must be reasonable access to the rooms and to the toilets and bathrooms. In caregiving, reasonable housing is in the home of the person receiving care.

What you can do: The handbook states the duty and the list. It does not give a separate address in this section for a housing complaint.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### medical_insurance

- **שאלה:** המעסיק חייב לעשות לי ביטוח רפואי?
- **קבוצה:** א. מוכן לסקירה ולאישור
- **מוכן לסקירה סופית:** כן
- **נבדק:** 2026-11-22
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 5; עמוד PDF 15
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 5; עמוד PDF 19
- **תשובה בעברית:**

תשובה: מעסיק של עובד זר חייב לספק ביטוח רפואי פרטי במשך כל תקופת ההעסקה, ולמסור לעובד סיכום של הפוליסה בשפה שהעובד מבין.

תנאים וחריגים: הביטוח בדרך כלל אינו מכסה מצב רפואי שהיה קיים לפני הנפקתו. הוא גם לא יכסה טיפול נוסף אם לפי חוות דעת רפואית מקצועית העובד לא יוכל לחזור לעבודה אחרי 90 ימי טיפול, ואז העובד צריך לשוב לארץ המוצא לטיפול. אם חברת הביטוח מסרבת, אפשר לערער. במקרים רבים חובה להגיש את הערעור בתוך 21 יום מקבלת הודעת הסירוב.

מה אפשר לעשות: לערער על סירוב בתוך המועד שהפוליסה והזכותון מתארים. הזכותון אומר שאפשר לפנות לארגוני הסיוע שבסוף הזכותון. פרטי ההתקשרות שלהם אינם מפורסמים כאן.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: An employer of a foreign worker must provide private medical insurance throughout the employment period, and must give the worker a summary of the policy in a language the worker understands.

Conditions and exceptions: The insurance usually does not cover a condition that existed before the policy was issued. It will not cover further treatment if an expert medical opinion finds that the worker will not be able to return to work after 90 days of treatment. In that case the worker must return to the country of origin for treatment. If the insurer refuses, the worker can appeal. In many cases the appeal must be filed within 21 days of the refusal notice.

What you can do: Appeal a refusal within the time the handbook describes. The handbook says the worker may ask the assistance organizations listed at the end of the handbook. Their contact details are not repeated here.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### weekly_rest

- **שאלה:** כמה מנוחה שבועית מגיעה לי?
- **קבוצה:** א. מוכן לסקירה ולאישור
- **מוכן לסקירה סופית:** כן
- **נבדק:** 2026-11-22
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 11; עמוד PDF 19
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 11; עמוד PDF 26
- **תשובה בעברית:**

תשובה: לפי חוק שעות עבודה ומנוחה, תשי"א-1951, כפי שהזכותון מצטט אותו, עובד זכאי למנוחה שבועית של 36 שעות לפחות, שכוללת יום שישי או יום שבת או יום ראשון.

תנאים וחריגים: לפי הפסיקה כפי שהזכותון מביא אותה, כלל 36 השעות אינו חל על עובד סיעוד שגר בבית המעסיק. גם אז מגיעות לו 25 שעות רצופות לפחות.

מה אפשר לעשות: הזכותון ממליץ לרשום בכתב את שעות העבודה ואת שעות וימי המנוחה.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: Under the Hours of Work and Rest Law, 1951, as the handbook quotes it, a worker is entitled to a weekly rest of at least 36 hours, which must include Friday or Saturday or Sunday.

Conditions and exceptions: As the handbook reports the case law, the 36-hour rule does not apply to a live-in caregiver. That worker must still receive at least 25 consecutive hours.

What you can do: The handbook advises keeping a written record of working hours and of rest hours and rest days.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### annual_leave

- **שאלה:** כמה ימי חופשה בתשלום מגיעים לי?
- **קבוצה:** ג. חסום בגלל סתירה
- **מוכן לסקירה סופית:** לא
- **נבדק:** 2026-11-22
- **מה חסר או מה סותר:** העברית מונה את הוותק אצל אותו מטופל, והאנגלית אצל המעסיק. אין הכרעה.
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 11; עמוד PDF 19
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 11; עמוד PDF 26
- **תשובה בעברית:**

תשובה: שתי המהדורות אומרות שכל עובד זכאי לימי חופשה בתשלום, ואז חלוקות על מול מי נספר הוותק. העברית אומרת "אצל אותו מטופל". האנגלית אומרת "for the employer". הרשומה הזאת אינה מכריעה ביניהן.

תנאים וחריגים: המספרים המודפסים בשתי המהדורות הם 16 ימים בכל אחת מחמש השנים הראשונות, 18 בשנה השישית, 21 בשביעית, ויום נוסף בכל שנה מהשמינית עד 28. אלה ימים קלנדריים שכוללים את סוף השבוע, ולכן בשבוע של חמישה ימים מדובר ב-12 ימי עבודה ובשבוע של שישה ימים ב-14, בחמש השנים הראשונות. בדרך כלל מנצלים את החופשה עד סוף השנה. אם המעסיק מסכים, אפשר לנצל רק 7 ימים בשנה ולצבור את היתרה לשנה הבאה או לשנה שאחריה.

מה אפשר לעשות: אין כאן צעד מעשי אחד, כי לא הוכרע אם הספירה היא מול המטופל או מול המעסיק.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: Both editions say every worker is entitled to paid vacation days, and they do not use the same word for who the seniority is counted with. The Hebrew edition says "with the same patient". The English edition says "for the employer". This record does not decide between them.

Conditions and exceptions: The numbers printed in both editions are 16 days in each of the first five years, 18 in the sixth year, 21 in the seventh, and one more day each year from the eighth year up to 28. These are calendar days, including the weekend, so a five-day week is 12 workdays and a six-day week is 14 workdays in the first five years. The days are usually used by the end of the year. If the employer agrees, the worker may use only 7 days in a year and save the rest for the next year or the year after that.

What you can do: There is no single practical step here, because the record does not decide whether the count is with the patient or with the employer.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### sick_leave

- **שאלה:** מה מגיע לי בימי מחלה?
- **קבוצה:** א. מוכן לסקירה ולאישור
- **מוכן לסקירה סופית:** כן
- **נבדק:** 2026-11-22
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 11; עמוד PDF 20
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 11; עמוד PDF 27
- **תשובה בעברית:**

תשובה: עובד זכאי לימי מחלה בתשלום לפי תקופת העבודה אצל המעסיק הנוכחי: יום וחצי לכל חודש עבודה, עד 90 יום, בכפוף לאישור רפואי על הצורך להיעדר.

תנאים וחריגים: אין תשלום ליום המחלה הראשון. ביום השני והשלישי המעסיק משלם 50% מהשכר הרגיל. מהיום הרביעי הוא משלם את השכר הרגיל, עד התקופה המרבית.

מה אפשר לעשות: להציג אישור רפואי שמציין את הצורך להיעדר מהעבודה, כפי שהזכותון דורש.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: An employee is entitled to sick pay according to the length of employment with the current employer: a day and a half for each month worked, up to 90 days, upon a doctor’s note stating the need to be absent.

Conditions and exceptions: There is no pay for the first day of illness. For the second and third days the employer pays 50% of the regular salary. From the fourth day the employer pays the regular salary, up to the maximum period.

What you can do: Present a doctor’s note that states the need to be absent from work, as the handbook requires.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### severance

- **שאלה:** מתי מגיעים פיצויי פיטורים?
- **קבוצה:** א. מוכן לסקירה ולאישור
- **מוכן לסקירה סופית:** כן
- **נבדק:** 2026-11-22
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 12; עמוד PDF 20
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 12; עמוד PDF 28
- **תשובה בעברית:**

תשובה: עובד שפוטר אחרי שעבד אצל מעסיק אחד, או במקום עבודה אחד, שנה אחת או יותר, זכאי לפיצויי פיטורים. השיעור הוא שכר של חודש אחד לכל שנת עבודה אצל אותו מעסיק או באותו מקום עבודה.

תנאים וחריגים: מי שעבודתו הופסקה אחרי שנה אחת בגלל מות המעסיק, פשיטת רגל, או פירוק חברה, זכאי לפיצויים כאילו פוטר. הסעיף הזה אינו אומר שהתפטרות כשלעצמה יוצרת את אותה זכות. צו הרחבה כללי לפנסיה חל על כל המעסיקים, והזכותון מפנה לאתר משרד העבודה למידע.

מה אפשר לעשות: הזכותון מפנה לאתר משרד העבודה למידע על הפנסיה. אין בו בסעיף הזה טופס נפרד לקבלת פיצויי הפיטורים עצמם.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: An employee who is dismissed after one year or more with one employer, or in one place of employment, is entitled to severance pay. The rate is one month’s wage for each year with that employer or in that workplace.

Conditions and exceptions: A worker whose employment stops after one year because the employer died or went bankrupt, or because a company was liquidated, is entitled to severance pay as if dismissed. This section does not say that resignation by itself creates the same right. A general pension extension order binds all employers, and the handbook points to the Ministry of Labour website for that information.

What you can do: The handbook points to the Ministry of Labour website for the pension information. This section does not set out a separate form for receiving the severance pay itself.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### deposit

- **שאלה:** איך מקבלים את כסף הפיקדון?
- **קבוצה:** ג. חסום בגלל סתירה
- **מוכן לסקירה סופית:** לא
- **נבדק:** 2026-11-22
- **מה חסר או מה סותר:** העברית אומרת שהניכוי על שהייה לא חוקית הוא מיתרת 25%, והאנגלית מיתרת 75%. אין הכרעה.
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 12; עמוד PDF 21
  - PIBA Foreign Workers' Rights Handbook 2026 link annotation; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 12; עמוד PDF 29
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 12; עמוד PDF 29
  - PIBA Foreign Workers' Rights Handbook 2026 link annotation; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 12; עמוד PDF 29
- **תשובה בעברית:**

תשובה: הזכותון מתאר איך מקבלים את כספי הפיקדון ביציאה חוקית וקבועה. שתי המהדורות אינן אומרות אותו דבר על הבסיס לניכוי בגלל שהייה לא חוקית, והרשומה הזאת אינה מכריעה.

תנאים וחריגים: ההפקדה חלה על ענפים שהזכותון מונה, לרבות בניין, מלונות, מסעדות למעט שפים אתניים מומחים, תעשייה, מסחר ושירותים, מוסדות סיעוד ופרויקטים בטכנולוגיה מיוחדת, וגם על חברות סיעוד. המינימום בזכותון אינו קטן מ-12.5% משכר חודשי של משרה מלאה, ובחודש הראשון והאחרון אפשר סכום יחסי. ההפקדה היא מעל השכר ואינה מנוכה ממנו. ביציאה חוקית וקבועה העובד מקבל את הצבירה כולל ריבית, פחות עמלות בנק ופחות מס של 15%. אחרי קבלת הכסף אי אפשר לחזור לישראל. בשהייה לא חוקית העברית אומרת שהניכוי הוא מיתרת 25% ושאחרי 12 חודשים אובדת יתרת 75%. האנגלית אומרת שהניכוי הוא מיתרת 75% ושאחרי 12 חודשים מופקעים 75%. אין כאן הכרעה.

מה אפשר לעשות: לקבל דולרים או יורו בבנק בשדה התעופה אחרי ביקורת הגבולות, אם הוגשה בקשה לרשות לפחות 10 ימי עבודה לפני היציאה, או העברה לחשבון בחו"ל בתוך 30 ימי עבודה מהגשת הבקשה. בקשת ויתור על ניכוי, אם השהייה נבעה מטעות בתום לב או מסיבה מוצדקת אחרת, היא בקשה בכתב לרשות. כתובת הדוא"ל שבזכותון אינה מפורסמת כאן. המהדורה האנגלית מקשרת לנוהל: https://www.gov.il/en/departments/policies/deposit_monies_foreign_workers_constructions_technology_procedure

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: The handbook describes how the deposit is received on a legal and permanent exit. The two editions do not say the same thing about the base for an illegal-overstay deduction, and this record does not decide.

Conditions and exceptions: The deposit applies to the sectors the handbook lists, including construction, hotels, restaurants other than expert ethnic chefs, industry, commerce and services, long-term care facilities, and special-technology projects, and also to caregiving companies. The handbook minimum is no less than 12.5% of the regular monthly salary for full-time work, with a proportional sum allowed in the first and last month only. The deposit is on top of salary and is not deducted from it. On a legal and permanent exit the worker receives the balance including interest, less bank fees and less tax of 15%. After receiving the money the worker may not return to Israel. On illegal overstay the Hebrew edition says the deduction is from the remaining 25% and that after 12 months the remaining 75% is lost. The English edition says the deduction is from the remaining 75% and that after 12 months 75% is forfeited. This record does not decide.

What you can do: Receive US dollars or euros at the airport bank after border control, if the worker or the employer applied to PIBA at least 10 working days before departure, or receive a transfer to a bank account abroad within 30 working days of the application. A request to waive a deduction, where the overstay was a good-faith mistake or another justified reason, is a written application to PIBA. The email address printed in the handbook is not repeated here. The English edition links to the procedure: https://www.gov.il/en/departments/policies/deposit_monies_foreign_workers_constructions_technology_procedure

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

### complaints

- **שאלה:** למי אפשר להתלונן על המעסיק?
- **קבוצה:** ג. חסום בגלל סתירה
- **מוכן לסקירה סופית:** לא
- **נבדק:** 2026-11-22
- **מה חסר או מה סותר:** המהדורה העברית והאנגלית אינן נותנות אותו קישור לטופס המקוון.
- **תנאים וחריגים:** ראו בגוף התשובה. לא נוסף תנאי שאינו בציטוט.
- **מקור עברי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 13; עמוד PDF 23
  - PIBA Foreign Workers' Rights Handbook 2026 link annotation; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf; סעיף 13; עמוד PDF 23
- **מקור אנגלי:**
  - PIBA Foreign Workers' Rights Handbook 2026; https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf; סעיף 13; עמוד PDF 31
- **תשובה בעברית:**

תשובה: עובד שמעסיקו לא מילא חובות לפי חוקי העבודה יכול להגיש תלונה לממונה על זכויות עובדים זרים בעבודה במשרד העבודה. אפשר גם לפנות למרכז הפניות של רשות האוכלוסין למידע או לתלונה על מעסיק או על לשכה. שתי המהדורות אינן מדפיסות אותו אתר לטופס המקוון, והרשומה הזאת אינה מכריעה איזה אתר הוא הערוץ העדכני.

תנאים וחריגים: החוק, כפי שהזכותון מביא אותו, אוסר לפטר עובד, להפחית שכר או להרע תנאים בגלל תלונה או תביעה שהוגשה בתום לב, או בגלל סיוע לעובד אחר להגיש תלונה. המהדורה האנגלית מדפיסה את האתר www.molsa.gov.il. בטקסט העברי הקישור נקטע; קישור שמוטמע בקובץ ה-PDF מוביל אל https://www.gov.il/he/departments/Units/foreign-workers-rights-at-work.

מה אפשר לעשות: להגיש את התלונה לממונה או למרכז הפניות של הרשות, דרך העמוד הרשמי, בלי להסתמך כאן על מספר טלפון. מספרי הטלפון והדוא"ל המודפסים בזכותון אינם מפורסמים כאן.

מקור: זכותון 2026, הסעיף המתאים בזכותון. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf

אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.

- **תשובה באנגלית:**

Answer: A worker whose employer has not met duties under labour law can file a complaint with the Ombudsperson for Foreign Workers’ Labour Rights in the Ministry of Labour. A worker may also contact the PIBA call center for information or to complain about an employer or a placement bureau. The two editions do not print the same website for the online form, and this record does not decide which site is the current channel.

Conditions and exceptions: The law, as the handbook states it, prohibits dismissing an employee or reducing salary or conditions because of a complaint or claim filed in good faith, or because the employee helped another employee file one. The English edition prints www.molsa.gov.il. The Hebrew text line breaks the link; a link embedded in the PDF goes to https://www.gov.il/he/departments/Units/foreign-workers-rights-at-work.

What you can do: File the complaint with the Ombudsperson or the PIBA call center through the official page, without relying on a phone number here. Phone numbers and email addresses printed in the handbook are not repeated here.

Source: PIBA Foreign Workers' Rights Handbook 2026, the handbook section. https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf

This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.

This is not legal advice. The information is general only and does not replace professional advice concerning the circumstances of your case.

- **אושר על ידי יהודה:** ☐

