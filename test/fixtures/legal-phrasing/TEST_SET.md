# Gringo — מערך בדיקות ידע לעובדים זרים (36 שאלות)

נוצר: 11.11.2026 (שעון ישראל). מאגר: `yehudacohen88-max/gringo-ai` main `9bc1e21`.

**זה לא תוכן משפטי.** אלה שאלות, סוג התשובה הצפוי והמקורות שאמורים לבסס אותה. ציטוטים מסומנים כ-DRAFT וממתינים לביקורת של יהודה ושל בודק משפטי. ניסוחי תאית, סינהלית והינדית נכתבו בלי דובר שפת אם וממתינים לבדיקה.

**סוגי תשובה:** A = מידע כללי מבוסס מקור · B = מידע כללי + הפניה למקרה האישי · C = הפניה בלבד (מקרה אישי או דחוף).

**התנהגות נוכחית ב-main:** `FALLBACK` = התשובה הקבועה "אין מידע מאומת"; `FREE-AI` = השאלה לא זוהתה כמשפטית והגיעה ל-AI חופשי (בבדיקה המקומית ה-AI הוא mock); אחר = סטטוס של מטפל תחום (למשל JOBS_NOT_FOUND).

הגרסה המלאה עם כל העמודות: `TEST_SET.csv`.

## Q01 · `passport_retention` · סוג B

- **HE:** מותר למעסיק לקחת לי את הדרכון?
- **EN:** Is my employer allowed to take my passport?
- **TH** _(pending native review)_: นายจ้างยึดหนังสือเดินทางของฉันได้ไหม
- **SI** _(pending native review)_: මගේ සේවා යෝජකයාට මගේ විදේශ ගමන් බලපත්‍රය තබා ගන්න පුළුවන්ද?
- **HI** _(pending native review)_: क्या मेरा नियोक्ता मेरा पासपोर्ट अपने पास रख सकता है?
- **התנהגות צפויה:** General info from approved record + how to complain (police / Call Center); not individual advice
- **סעיף:** PIBA26 §4 "Withholding of Passports"
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – איסור החזקת דרכון של עובד זר (last edit 2026-04-12) — <https://www.kolzchut.org.il/he/איסור_החזקת_דרכון_של_עובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - PIBA Call Center for Foreign Workers (operated by CIMI) – Sinhala page — <https://www.cimi-eng.org/migrant-workers-sinhala> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FALLBACK; si:FALLBACK; hi:FALLBACK
- **ציטוט:** DRAFT — pending founder/legal review. PIBA 2026 §4 (quoted): "Withholding a worker’s passport against his will is a criminal offence. An employee whose passport is being held against his will by an employer, manpower company, placement bureau or any other person, may file a complaint with the Israel Police."

## Q02 · `passport_retention` · סוג B

- **HE:** המעסיק לקח את הדרכון כדי לחדש ויזה ועדיין לא החזיר אחרי חודש. מה לעשות?
- **EN:** My employer took my passport to renew my visa and still has not returned it after a month. What should I do?
- **TH** _(pending native review)_: นายจ้างเอาหนังสือเดินทางไปต่อวีซ่าแล้วยังไม่คืนมาหนึ่งเดือนแล้ว ควรทำอย่างไร
- **התנהגות צפויה:** General info + referral for the individual case; no judgment on this employer
- **סעיף:** PIBA26 §4; CIMI Sinhala page "Visas"
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - PIBA Call Center for Foreign Workers (operated by CIMI) – Sinhala page — <https://www.cimi-eng.org/migrant-workers-sinhala> — נשלף: YES – curl
  - Kol Zchut – איסור החזקת דרכון של עובד זר (last edit 2026-04-12) — <https://www.kolzchut.org.il/he/איסור_החזקת_דרכון_של_עובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FALLBACK
- **ציטוט:** DRAFT — pending review. CIMI (PIBA Call Center) page (quoted): "your employer may need to temporarily take your passport in order to renew your visa, however, withholding your passport for lengthy periods of time is a criminal offense in Israel."

## Q03 · `construction_rights_overview` · סוג A

- **HE:** מה הזכויות שלי כעובד בניין בישראל?
- **EN:** What are my rights as a construction worker in Israel?
- **TH** _(pending native review)_: ฉันมีสิทธิอะไรบ้างในฐานะคนงานก่อสร้างในอิสราเอล
- **SI** _(pending native review)_: ඊශ්‍රායලයේ ඉදිකිරීම් සේවකයෙකු ලෙස මගේ අයිතිවාසිකම් මොනවාද?
- **HI** _(pending native review)_: इज़राइल में निर्माण मज़दूर के रूप में मेरे क्या अधिकार हैं?
- **התנהגות צפויה:** Short topic menu of approved records (employer change, wages, housing, insurance, passport, complaints) each with citation; invite a specific follow-up
- **סעיף:** PIBA26 §1C + TOC
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - PIBA – Work hours and wages in construction (page 28.12.2020 + pay_heb.pdf) — <https://www.gov.il/he/departments/general/constructions_paycheck_info> — נשלף: PARTIAL – page via headless Chrome; PDF via curl
  - Kav LaOved – Construction migrant workers' rights, April 2025 (EN) — <https://kavlaoved.org.il/wp-content/uploads/2025/06/Leaflet-Construction-migrant-workers-APRIL-2025.pdf> — נשלף: YES – curl
  - Kol Zchut – עובדים בענף הבנייה והשיפוצים (עובדי בניין) (last edit 2025-04-01) — <https://www.kolzchut.org.il/he/עובדים_בענף_הבנייה_והשיפוצים_(עובדי_בניין)> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FALLBACK; si:FALLBACK; hi:FALLBACK
- **ציטוט:** DRAFT — pending review. PIBA 2026 intro (quoted): "In general, a foreign worker in Israel is entitled to the same working conditions as an Israeli employee."

## Q04 · `construction_employer_change` · סוג A

- **HE:** אני עובד בניין. מתי מותר לי לעבור לתאגיד אחר?
- **EN:** I work in construction. When can I move to another manpower company?
- **TH** _(pending native review)_: ฉันทำงานก่อสร้าง เปลี่ยนบริษัทจัดหางานได้เมื่อไหร่
- **HI** _(pending native review)_: मैं निर्माण में काम करता हूँ। मैं दूसरी मैनपावर कंपनी में कब जा सकता हूँ?
- **התנהגות צפויה:** Source-backed general rule with citation + "check with PIBA Call Center for your case"
- **סעיף:** PIBA26 §1C
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kav LaOved – Construction migrant workers' rights, April 2025 (EN) — <https://kavlaoved.org.il/wp-content/uploads/2025/06/Leaflet-Construction-migrant-workers-APRIL-2025.pdf> — נשלף: YES – curl
  - PIBA procedure 9.4.0002 – construction manpower companies (PDF mod. 2025-11-19) — <https://www.gov.il/BlobFolder/policy/foreign_construction_companies_procedure/he/9.4.0002.pdf> — נשלף: YES – curl
  - PIBA Call Center (CIMI) – Hindi page — <https://www.cimi-eng.org/hi/information-center> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:FREE-AI; en:JOBS_NOT_FOUND; th:FREE-AI; hi:FREE-AI
- **ציטוט:** DRAFT — pending review. PIBA 2026 §1C (quoted): "Foreign workers employed in the construction industry may only change employers quarterly, on January 1st, April 1st, July 1st and October 1st of each year, after giving lawful advance notice in writing to their employers."

## Q05 · `construction_no_work_pay` · סוג B

- **HE:** התאגיד לא נותן לי עבודה כבר שבועיים. מגיע לי שכר?
- **EN:** My manpower company has not given me work for two weeks. Do I still get paid?
- **TH** _(pending native review)_: บริษัทไม่ให้งานฉันทำมาสองสัปดาห์แล้ว ฉันยังได้ค่าจ้างไหม
- **התנהגות צפויה:** General info (minimum paid hours rule per source, with "as of" date) + referral
- **סעיף:** Kav LaOved construction leaflets
- **מקורות מועמדים:**
  - Kav LaOved – Construction B/1: salary when no work, Sep 2025 (EN) — <https://kavlaoved.org.il/wp-content/uploads/2025/09/SALARY-ISSUES-בנין-EN-1.pdf> — נשלף: YES – curl
  - Kav LaOved – Construction migrant workers' rights, April 2025 (EN) — <https://kavlaoved.org.il/wp-content/uploads/2025/06/Leaflet-Construction-migrant-workers-APRIL-2025.pdf> — נשלף: YES – curl
  - PIBA – Work hours and wages in construction (page 28.12.2020 + pay_heb.pdf) — <https://www.gov.il/he/departments/general/constructions_paycheck_info> — נשלף: PARTIAL – page via headless Chrome; PDF via curl
- **התנהגות נוכחית (main):** he:FALLBACK; en:JOBS_NOT_FOUND; th:FALLBACK
- **ציטוט:** DRAFT — pending review. Kav LaOved (NGO) Apr 2025 leaflet states a minimum-paid-hours rule; must be confirmed against PIBA/extension order before approval.

## Q06 · `recruitment_fees` · סוג B

- **HE:** ביקשו ממני לשלם דמי תיווך כדי להגיע לעבוד בישראל. זה חוקי?
- **EN:** I was asked to pay a recruitment fee to come work in Israel. Is that legal?
- **TH** _(pending native review)_: มีคนเรียกเก็บค่านายหน้าเพื่อให้ฉันมาทำงานที่อิสราเอล ถูกกฎหมายไหม
- **התנהגות צפויה:** General info on fee limits from source + referral (Commissioner / Call Center)
- **סעיף:** Kol Zchut page; Employment Service Regs 2006
- **מקורות מועמדים:**
  - Kol Zchut – הגבלת סכום דמי התיווך שניתן לגבות מעובד זר (last edit 2026-03-17) — <https://www.kolzchut.org.il/he/הגבלת_סכום_דמי_התיווך_שניתן_לגבות_מעובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - Employment Service Regs (payments for placement) 2006 (Nevo) — <https://www.nevo.co.il/law_html/law01/999_625.htm> — נשלף: YES – curl
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
- **התנהגות נוכחית (main):** he:FREE-AI; en:JOBS_NOT_FOUND; th:FREE-AI

## Q07 · `minimum_wage` · סוג A

- **HE:** מה שכר המינימום לעובד זר?
- **EN:** What is the minimum wage for a foreign worker?
- **TH** _(pending native review)_: ค่าแรงขั้นต่ำสำหรับแรงงานต่างชาติคือเท่าไหร่
- **HI** _(pending native review)_: न्यूनतम वेतन कितना है?
- **התנהגות צפויה:** Approved amount with explicit "as of" date + source; note sector agreements (construction) may be higher
- **סעיף:** PIBA26 §9a
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – שכר מינימום (last edit 2026-08-17) — <https://www.kolzchut.org.il/he/שכר_מינימום> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FREE-AI; hi:FREE-AI
- **ציטוט:** DRAFT — pending review. Amounts change; PIBA 2026 and Kav LaOved 2025 give different figures for different dates – reviewer must confirm the current figure and date.

## Q08 · `payday` · סוג A

- **HE:** עד איזה תאריך המעסיק חייב לשלם משכורת?
- **EN:** By what date must my employer pay my salary?
- **TH** _(pending native review)_: นายจ้างต้องจ่ายเงินเดือนภายในวันที่เท่าไหร่
- **התנהגות צפויה:** Approved general rule + citation
- **סעיף:** PIBA26 §9e
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kav LaOved – Construction migrant workers' rights, April 2025 (EN) — <https://kavlaoved.org.il/wp-content/uploads/2025/06/Leaflet-Construction-migrant-workers-APRIL-2025.pdf> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FREE-AI

## Q09 · `unpaid_wages` · סוג B

- **HE:** המעסיק לא שילם לי חודשיים. מה אני יכול לעשות?
- **EN:** My employer has not paid me for two months. What can I do?
- **TH** _(pending native review)_: นายจ้างไม่จ่ายเงินเดือนฉันมาสองเดือนแล้ว ฉันทำอะไรได้บ้าง
- **SI** _(pending native review)_: මගේ සේවා යෝජකයා මාස දෙකක් පඩි ගෙව්වේ නැහැ. මට කුමක් කළ හැකිද?
- **HI** _(pending native review)_: मेरे नियोक्ता ने दो महीने से वेतन नहीं दिया। मैं क्या कर सकता हूँ?
- **התנהגות צפויה:** Practical non-legal steps + complaint channels (approved contacts) + referral; no claim about outcome
- **סעיף:** PIBA26 §13 Filing Complaints
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – הגשת תלונה לממונה על זכויות עובדים זרים בעבודה (last edit 2025-09-16) — <https://www.kolzchut.org.il/he/הגשת_תלונה_לממונה_על_זכויות_עובדים_זרים_בעבודה> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - Kol Zchut – הגשת תביעה לתשלום שכר עבודה, פיצויי פיטורים או זכויות סוציאליות אחרות בבית הדין האזורי לעבודה (last edit 2026-05-28) — <https://www.kolzchut.org.il/he/הגשת_תביעה_לתשלום_שכר_עבודה,_פיצויי_פיטורים_או_זכויות_סוציאליות_אחרות_בבית_הדין_האזורי_לעבודה> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FREE-AI; en:FALLBACK; th:FREE-AI; si:FREE-AI; hi:FREE-AI

## Q10 · `payslip` · סוג A

- **HE:** המעסיק לא נותן לי תלוש שכר. זה בסדר?
- **EN:** My employer does not give me a payslip. Is that OK?
- **TH** _(pending native review)_: นายจ้างไม่ให้สลิปเงินเดือนฉัน แบบนี้ได้ไหม
- **התנהגות צפויה:** Approved general info + citation
- **סעיף:** Kol Zchut "תלוש שכר"
- **מקורות מועמדים:**
  - Kol Zchut – תלוש שכר (last edit 2026-03-17) — <https://www.kolzchut.org.il/he/תלוש_שכר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FREE-AI

## Q11 · `salary_payment_method` · סוג A

- **HE:** המעסיק משלם לי במזומן ולא לבנק. זה מותר?
- **EN:** My employer pays me in cash, not to a bank account. Is that allowed?
- **TH** _(pending native review)_: นายจ้างจ่ายเงินสดไม่โอนเข้าบัญชีธนาคาร ได้ไหม
- **התנהגות צפויה:** Approved general info + citation
- **סעיף:** PIBA26 §9 (bank account per PIBA procedures)
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
- **התנהגות נוכחית (main):** he:FREE-AI; en:SERVICES_NOT_FOUND; th:FREE-AI
- **ציטוט:** DRAFT — pending review. PIBA 2026 §9 (quoted): "The salary of foreign workers must be paid by authorized deposit into a bank account in the name of the foreign worker only, as set out in PIBA procedures."

## Q12 · `deductions_general` · סוג A

- **HE:** מה מותר למעסיק לנכות לי מהמשכורת?
- **EN:** What is my employer allowed to deduct from my salary?
- **TH** _(pending native review)_: นายจ้างหักเงินเดือนฉันได้เรื่องอะไรบ้าง
- **התנהגות צפויה:** List of permitted deduction categories from approved record, no amounts unless approved with date
- **סעיף:** PIBA26 §10
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – ניכויים מותרים משכר עובד זר (last edit 2026-09-01) — <https://www.kolzchut.org.il/he/ניכויים_מותרים_משכר_עובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FALLBACK

## Q13 · `housing_deduction` · סוג B

- **HE:** מורידים לי 1,000 ש"ח בחודש על מגורים. זה חוקי?
- **EN:** They deduct 1,000 NIS a month for housing. Is that legal?
- **TH** _(pending native review)_: หักค่าที่พักเดือนละ 1,000 เชเกล ถูกกฎหมายไหม
- **SI** _(pending native review)_: නවාතැන් සඳහා මසකට ෂෙකල් 1,000ක් අඩු කරනවා. එය නීත්‍යානුකූලද?
- **HI** _(pending native review)_: आवास के लिए हर महीने 1,000 शेकेल काटे जाते हैं। क्या यह कानूनी है?
- **התנהגות צפויה:** General rule (cap exists, per regulation/area, dated) + referral; never say "this is illegal" about the user case
- **סעיף:** PIBA26 §10b
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – ניכוי הוצאות מגורים לעובד זר (last edit 2026-09-22) — <https://www.kolzchut.org.il/he/ניכוי_הוצאות_מגורים_לעובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - Foreign Workers Regs (housing deduction rate) 2000 (Nevo) — <https://www.nevo.co.il/law_html/law01/P178_005.htm> — נשלף: YES – curl
  - Kav LaOved – Accommodation deductions, all sectors, Sep/Oct 2026 (EN) — <https://kavlaoved.org.il/wp-content/uploads/2026/10/Accommodation-Sept.-2026-all-sectors-ENG.pdf> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:HOUSING_NEEDS_DETAILS; en:FALLBACK; th:FALLBACK; si:FREE-AI; hi:FREE-AI

## Q14 · `housing_conditions` · סוג A

- **HE:** אנחנו 10 עובדים בחדר אחד. זה מותר?
- **EN:** We are 10 workers in one room. Is that allowed?
- **TH** _(pending native review)_: พวกเรา 10 คนอยู่ห้องเดียวกัน แบบนี้ได้ไหม
- **התנהגות צפויה:** Approved housing standards + citation + complaint channel
- **סעיף:** PIBA26 §7
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – מגורים הולמים לעובד זר (last edit 2026-09-01) — <https://www.kolzchut.org.il/he/מגורים_הולמים_לעובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - Foreign Workers Regs (adequate housing) 2000 (Nevo) — <https://www.nevo.co.il/law_html/law01/P178_006.htm> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:HOUSING_NOT_FOUND; en:HOUSING_NOT_FOUND; th:FREE-AI
- **ציטוט:** DRAFT — pending review. PIBA 2026 §7 (quoted): "at least 4 square meters sleeping space per worker, no more than 6 workers per room"

## Q15 · `health_insurance` · סוג A

- **HE:** המעסיק חייב לעשות לי ביטוח רפואי?
- **EN:** Does my employer have to give me health insurance?
- **TH** _(pending native review)_: นายจ้างต้องทำประกันสุขภาพให้ฉันไหม
- **SI** _(pending native review)_: සේවා යෝජකයා මට සෞඛ්‍ය රක්ෂණයක් ලබා දිය යුතුද?
- **HI** _(pending native review)_: क्या नियोक्ता को मेरा स्वास्थ्य बीमा कराना ज़रूरी है?
- **התנהגות צפויה:** Approved general info + citation
- **סעיף:** PIBA26 §5
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – ביטוח בריאות לעובדים זרים (last edit 2026-09-07) — <https://www.kolzchut.org.il/he/ביטוח_בריאות_לעובדים_זרים> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FREE-AI; en:DOCUMENTS_UNAVAILABLE; th:FREE-AI; si:FREE-AI; hi:FREE-AI
- **ציטוט:** DRAFT — pending review. PIBA 2026 §5 (quoted): "Employers of foreign workers are obligated to provide foreign workers with private medical insurance throughout the employment period."

## Q16 · `insurance_claim_refused` · סוג B

- **HE:** חברת הביטוח מסרבת לשלם על הטיפול שלי. מה עושים?
- **EN:** The insurance company refuses to pay for my treatment. What can I do?
- **TH** _(pending native review)_: บริษัทประกันไม่ยอมจ่ายค่ารักษา ทำอย่างไรดี
- **התנהגות צפויה:** General info (appeal possible, deadline per source) + referral to NGOs
- **סעיף:** PIBA26 §5
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – תנאי פוליסת ביטוח בריאות לעובד זר (last edit 2026-04-12) — <https://www.kolzchut.org.il/he/תנאי_פוליסת_ביטוח_בריאות_לעובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FREE-AI; en:SERVICES_NOT_FOUND; th:FREE-AI

## Q17 · `health_insurance_deduction` · סוג A

- **HE:** כמה מותר למעסיק לנכות על ביטוח רפואי?
- **EN:** How much can my employer deduct for health insurance?
- **TH** _(pending native review)_: นายจ้างหักค่าประกันสุขภาพได้เท่าไหร่
- **התנהגות צפויה:** Approved cap only with date + citation
- **סעיף:** PIBA26 §10c
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – ניכויים מותרים משכר עובד זר (last edit 2026-09-01) — <https://www.kolzchut.org.il/he/ניכויים_מותרים_משכר_עובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FALLBACK

## Q18 · `overtime` · סוג A

- **HE:** אני עובד 12 שעות ביום. מה מגיע לי על שעות נוספות?
- **EN:** I work 12 hours a day. What do I get for overtime?
- **TH** _(pending native review)_: ฉันทำงานวันละ 12 ชั่วโมง ได้ค่าล่วงเวลาเท่าไหร่
- **התנהגות צפויה:** Approved general rule + citation; no personal calculation unless user gives numbers (code-calculated)
- **סעיף:** PIBA26 §9b
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – מגבלות על העסקה בשעות נוספות (last edit 2026-03-23) — <https://www.kolzchut.org.il/he/מגבלות_על_העסקה_בשעות_נוספות> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - Hours of Work and Rest Law 5711-1951 (Nevo) — <https://www.nevo.co.il/law_html/law01/P225_001.htm> — נשלף: YES – curl
  - National Legislation Database – Hours of Work and Rest Law (metadata/versions) — <https://main.knesset.gov.il/apps/legislation/main/laws/2000019> — נשלף: PARTIAL – curl blocked (HTTP 247); OK via headless Chrome
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FALLBACK

## Q19 · `weekly_rest` · סוג A

- **HE:** מותר להעסיק אותי שבעה ימים בשבוע?
- **EN:** Can I be made to work seven days a week?
- **TH** _(pending native review)_: ให้ฉันทำงาน 7 วันต่อสัปดาห์ได้ไหม
- **התנהגות צפויה:** Approved general rule + citation
- **סעיף:** PIBA26 §11
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – מנוחה שבועית (last edit 2026-03-17) — <https://www.kolzchut.org.il/he/מנוחה_שבועית> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - Hours of Work and Rest Law 5711-1951 (Nevo) — <https://www.nevo.co.il/law_html/law01/P225_001.htm> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:FREE-AI; en:JOBS_NOT_FOUND; th:FREE-AI

## Q20 · `annual_leave` · סוג A

- **HE:** כמה ימי חופשה בתשלום מגיעים לי?
- **EN:** How many paid vacation days do I get?
- **TH** _(pending native review)_: ฉันได้วันหยุดพักร้อนแบบได้เงินกี่วัน
- **התנהגות צפויה:** Approved general rule + citation
- **סעיף:** PIBA26 §11
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – חופשה שנתית (last edit 2026-05-19) — <https://www.kolzchut.org.il/he/חופשה_שנתית> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FREE-AI; en:FALLBACK; th:FREE-AI

## Q21 · `sick_leave` · סוג A

- **HE:** הייתי חולה שלושה ימים. משלמים לי על זה?
- **EN:** I was sick for three days. Do I get paid?
- **TH** _(pending native review)_: ฉันป่วยสามวัน ได้ค่าจ้างไหม
- **התנהגות צפויה:** Approved general rule + citation
- **סעיף:** PIBA26 §11 Sick Pay
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – ימי מחלה (last edit 2026-08-18) — <https://www.kolzchut.org.il/he/ימי_מחלה> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FREE-AI; en:FALLBACK; th:FALLBACK

## Q22 · `religious_holidays` · סוג A

- **HE:** מגיע לי יום חג בתשלום בסונגקראן?
- **EN:** Do I get a paid holiday for Songkran?
- **TH** _(pending native review)_: ช่วงสงกรานต์ฉันได้วันหยุดแบบได้เงินไหม
- **התנהגות צפויה:** Approved general rule + citation
- **סעיף:** PIBA26 §11 Religious holidays
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – דמי חגים (last edit 2026-09-22) — <https://www.kolzchut.org.il/he/דמי_חגים> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FREE-AI

## Q23 · `convalescence_pay` · סוג A

- **HE:** מה זה דמי הבראה ומתי מקבלים?
- **EN:** What is convalescence pay (dmei havraah) and when is it paid?
- **TH** _(pending native review)_: ค่าพักฟื้น (dmei havraah) คืออะไร ได้เมื่อไหร่
- **התנהגות צפויה:** Approved general rule + dated amount + citation
- **סעיף:** PIBA26 §9d
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – דמי הבראה (last edit 2026-09-29) — <https://www.kolzchut.org.il/he/דמי_הבראה> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FREE-AI; en:FALLBACK; th:FREE-AI

## Q24 · `dismissal_notice` · סוג B

- **HE:** פיטרו אותי בלי הודעה מוקדמת. מגיע לי משהו?
- **EN:** I was fired without prior notice. Am I owed anything?
- **TH** _(pending native review)_: ฉันถูกไล่ออกโดยไม่แจ้งล่วงหน้า ฉันได้อะไรบ้างไหม
- **התנהגות צפויה:** General rule on notice + referral for the individual case
- **סעיף:** PIBA26 §12A
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – הודעה מוקדמת לפיטורים (last edit 2026-03-17) — <https://www.kolzchut.org.il/he/הודעה_מוקדמת_לפיטורים> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FALLBACK

## Q25 · `dismissal_illness` · סוג C

- **HE:** פיטרו אותי כי הייתי חולה. מה עושים?
- **EN:** I was fired because I was sick. What should I do?
- **TH** _(pending native review)_: ฉันถูกไล่ออกเพราะป่วย ต้องทำอย่างไร
- **התנהגות צפויה:** Referral only (individual legal question; no approved source in set covers it) + practical steps
- **סעיף:** PIBA26 §13 (complaints)
- **מקורות מועמדים:**
  - Kol Zchut – ימי מחלה (last edit 2026-08-18) — <https://www.kolzchut.org.il/he/ימי_מחלה> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
- **התנהגות נוכחית (main):** he:FREE-AI; en:FALLBACK; th:FALLBACK

## Q26 · `severance` · סוג B

- **HE:** מגיעים לי פיצויי פיטורים?
- **EN:** Am I entitled to severance pay?
- **TH** _(pending native review)_: ฉันมีสิทธิได้ค่าชดเชยเลิกจ้างไหม
- **התנהגות צפויה:** General rule + referral
- **סעיף:** PIBA26 §12C
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – פיצויי פיטורים (last edit 2025-09-18) — <https://www.kolzchut.org.il/he/פיצויי_פיטורים> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:FALLBACK; th:FALLBACK

## Q27 · `deposit_fund` · סוג A

- **HE:** איך מקבלים את כספי הפיקדון כשעוזבים את ישראל?
- **EN:** How do I get my deposit money when I leave Israel?
- **TH** _(pending native review)_: จะได้รับเงินกองทุนเงินฝาก (pikadon) คืนอย่างไรเมื่อออกจากอิสราเอล
- **HI** _(pending native review)_: विदेशी कामगार जमा राशि (डिपॉज़िट) इज़राइल छोड़ते समय कैसे मिलती है?
- **התנהגות צפויה:** Approved procedure summary + official link + citation
- **סעיף:** PIBA26 §12D
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – משיכת כספי הפיקדון על ידי עובדים זרים (last edit 2026-03-30) — <https://www.kolzchut.org.il/he/משיכת_כספי_הפיקדון_על_ידי_עובדים_זרים> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - Kol Zchut – הפקדת פיקדון חודשי עבור עובדים זרים (last edit 2026-07-13) — <https://www.kolzchut.org.il/he/הפקדת_פיקדון_חודשי_עבור_עובדים_זרים> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FREE-AI; en:FOUND; th:FREE-AI; hi:FREE-AI

## Q28 · `resignation_notice` · סוג A

- **HE:** אני רוצה לעזוב את העבודה. כמה זמן מראש אני צריך להודיע?
- **EN:** I want to quit. How much notice must I give?
- **TH** _(pending native review)_: ฉันอยากลาออก ต้องแจ้งล่วงหน้ากี่วัน
- **התנהגות צפויה:** Approved general rule + citation
- **סעיף:** PIBA26 §12A
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - PIBA Call Center for Foreign Workers (operated by CIMI) – Sinhala page — <https://www.cimi-eng.org/migrant-workers-sinhala> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:JOBS_NOT_FOUND; en:FREE-AI; th:FREE-AI

## Q29 · `visa_registration_status` · סוג A

- **HE:** איך בודקים אם הוויזה שלי בתוקף ואם אני רשום אצל מעסיק?
- **EN:** How do I check if my visa is valid and I am registered with an employer?
- **TH** _(pending native review)_: จะตรวจสอบได้อย่างไรว่าวีซ่ายังใช้ได้และฉันลงทะเบียนกับนายจ้างแล้ว
- **התנהגות צפויה:** Official portal/Call Center pointer (approved link) – non-legal practical info
- **סעיף:** CIMI pages "Employment and Registration"
- **מקורות מועמדים:**
  - PIBA Call Center (CIMI) – Hindi page — <https://www.cimi-eng.org/hi/information-center> — נשלף: YES – curl
  - PIBA Call Center for Foreign Workers (operated by CIMI) – Sinhala page — <https://www.cimi-eng.org/migrant-workers-sinhala> — נשלף: YES – curl
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
- **התנהגות נוכחית (main):** he:DOCUMENTS_UNAVAILABLE; en:DOCUMENTS_UNAVAILABLE; th:FREE-AI

## Q30 · `visa_expired` · סוג C

- **HE:** הוויזה שלי נגמרה. מותר לי להישאר?
- **EN:** My visa has expired. Can I stay?
- **TH** _(pending native review)_: วีซ่าของฉันหมดอายุแล้ว ฉันอยู่ต่อได้ไหม
- **התנהגות צפויה:** Referral to PIBA (individual status question); general info only if approved
- **סעיף:** PIBA26 §2
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – שהייה בישראל לאחר פקיעת אשרת העבודה של עובד זר (last edit 2026-04-12) — <https://www.kolzchut.org.il/he/שהייה_בישראל_לאחר_פקיעת_אשרת_העבודה_של_עובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - Kav LaOved – Construction B/1 visa questions, Feb 2026 (EN) — <https://kavlaoved.org.il/en/wp-content/uploads/sites/3/2026/02/Construction-workers-with-B1-visas-–-Visa-questions-and-issues.pdf> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:DOCUMENTS_UNAVAILABLE; en:DOCUMENTS_UNAVAILABLE; th:FREE-AI

## Q31 · `work_injury` · סוג B

- **HE:** נפצעתי באתר בנייה. מה עושים?
- **EN:** I was injured at a construction site. What should I do?
- **TH** _(pending native review)_: ฉันได้รับบาดเจ็บที่ไซต์ก่อสร้าง ต้องทำอย่างไร
- **התנהגות צפויה:** Emergency first (101 if urgent, approved), then general info on National Insurance claim + referral
- **סעיף:** PIBA26 §6 Social Security
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kav LaOved – Work accidents B/1, Jul 2026 (EN) + Thai Aug 2026 — <https://kavlaoved.org.il/wp-content/uploads/2026/07/Work-Accidents-what-should-you-do-B1-migrant-workers.pdf> — נשלף: YES – curl
  - Kol Zchut – תאונות עבודה ונפגעי עבודה (last edit 2025-06-11) — <https://www.kolzchut.org.il/he/תאונות_עבודה_ונפגעי_עבודה> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:JOBS_NOT_FOUND; en:FREE-AI; th:FREE-AI

## Q32 · `site_safety` · סוג B

- **HE:** אין לנו ציוד מגן ופיגומים באתר. למי מדווחים?
- **EN:** We have no safety equipment or scaffolding on site. Who do I report to?
- **TH** _(pending native review)_: ไซต์งานไม่มีอุปกรณ์ป้องกันและนั่งร้าน ต้องแจ้งใคร
- **התנהגות צפויה:** Approved reporting channel + citation
- **סעיף:** Kol Zchut page
- **מקורות מועמדים:**
  - Kol Zchut – דיווח על מפגעי בטיחות במקומות עבודה ובאתרי בנייה (last edit 2025-03-18) — <https://www.kolzchut.org.il/he/דיווח_על_מפגעי_בטיחות_במקומות_עבודה_ובאתרי_בנייה> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FREE-AI; en:FREE-AI; th:FREE-AI

## Q33 · `complaint_channels` · סוג A

- **HE:** למי אפשר להתלונן על המעסיק?
- **EN:** Who can I complain to about my employer?
- **TH** _(pending native review)_: ร้องเรียนนายจ้างได้ที่ไหน
- **SI** _(pending native review)_: මගේ සේවා යෝජකයා ගැන පැමිණිලි කළ හැක්කේ කාටද?
- **HI** _(pending native review)_: मैं अपने नियोक्ता की शिकायत कहाँ कर सकता हूँ?
- **התנהגות צפויה:** Approved contact list (only primary-verified numbers) + citation
- **סעיף:** PIBA26 §13, §16
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – הממונה על זכויות עובדים זרים בעבודה (last edit 2025-05-18) — <https://www.kolzchut.org.il/he/הממונה_על_זכויות_עובדים_זרים_בעבודה> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
  - PIBA Call Center (CIMI) – Hindi page — <https://www.cimi-eng.org/hi/information-center> — נשלף: YES – curl
- **התנהגות נוכחית (main):** he:FREE-AI; en:FALLBACK; th:FREE-AI; si:FREE-AI; hi:FREE-AI
- **ציטוט:** DRAFT — pending review. PIBA 2026 §13 lists the Ombudsperson phone/SMS/email and the PIBA Call Center number; these must be re-confirmed (e.g., test call) before being shown as verified.

## Q34 · `trafficking_forced_labor` · סוג C

- **HE:** לא נותנים לי לצאת מהמגורים ולקחו לי את הדרכון. מה לעשות?
- **EN:** They do not let me leave the housing and took my passport. What should I do?
- **TH** _(pending native review)_: เขาไม่ให้ฉันออกจากที่พักและยึดหนังสือเดินทางไป ต้องทำอย่างไร
- **התנהגות צפויה:** Urgent safety referral (police / approved hotline) first; no legal analysis
- **סעיף:** PIBA26 §15 Slavery and Trafficking
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – אשרת שהייה זמנית לנפגעי סחר בבני אדם למטרות עבדות (last edit 2026-03-17) — <https://www.kolzchut.org.il/he/אשרת_שהייה_זמנית_לנפגעי_סחר_בבני_אדם_למטרות_עבדות> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:FALLBACK; en:HOUSING_NEEDS_DETAILS; th:FALLBACK

## Q35 · `employment_contract` · סוג A

- **HE:** לא קיבלתי חוזה עבודה בשפה שלי. זה בסדר?
- **EN:** I did not get an employment contract in my language. Is that OK?
- **TH** _(pending native review)_: ฉันไม่ได้รับสัญญาจ้างเป็นภาษาของฉัน แบบนี้ได้ไหม
- **התנהגות צפויה:** Approved general rule + citation
- **סעיף:** PIBA26 §8
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – חוזה עבודה לעובד זר (last edit 2026-04-12) — <https://www.kolzchut.org.il/he/חוזה_עבודה_לעובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:JOBS_NOT_FOUND; en:DOCUMENTS_UNAVAILABLE; th:FREE-AI
- **ציטוט:** DRAFT — pending review. PIBA 2026 §8 (quoted): "An employer is required to give his foreign employee a signed employment contract in a language the employee understands"

## Q36 · `mixed_legal_jobs` · סוג B

- **HE:** מורידים לי הרבה על דירה, ויש משרה חדשה בבנייה בחיפה?
- **EN:** They deduct a lot for housing — and is there a new construction job in Haifa?
- **TH** _(pending native review)_: หักค่าที่พักเยอะมาก แล้วมีงานก่อสร้างใหม่ที่ไฮฟาไหม
- **התנהגות צפויה:** Legal part: approved record or fallback; jobs part: structured job results kept
- **סעיף:** PIBA26 §10b
- **מקורות מועמדים:**
  - PIBA Foreign Workers' Rights Handbook 2026 (EN; also HE/TH/HI/SI editions) — <https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf> — נשלף: YES – direct curl of gov.il BlobFolder PDF (listing page needs headless Chrome)
  - Kol Zchut – ניכוי הוצאות מגורים לעובד זר (last edit 2026-09-22) — <https://www.kolzchut.org.il/he/ניכוי_הוצאות_מגורים_לעובד_זר> — נשלף: YES – Kol Zchut MediaWiki API /w/he/api.php
- **התנהגות נוכחית (main):** he:JOBS_NOT_FOUND; en:FALLBACK; th:FALLBACK
