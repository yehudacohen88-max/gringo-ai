# הוראות הקמה מפורטות — פיילוט Gringo (Telegram בלבד)

מצב: מוכן לביצוע **אחרי אישור**. שום דבר כאן לא בוצע. אין בקובץ סודות. עובדות נבדקו ב-4.11.2026 — לאמת שוב ביום הביצוע.
החלטות מאושרות (יהודה, 4.11.2026): Telegram ערוץ יחיד; LINE ו-WhatsApp כבויים; גיליון חדש + חשבון שירות ייעודי; פרויקט OpenAI נפרד עם יעד $20/חודש, מכסות פנימיות ומתג חירום; Render מועדף — **תשלום טרם אושר**.

**כללי ברזל לסודות:** מפתח JSON, טוקן בוט, מפתח OpenAI ו-ADMIN_API_KEY/WEB_SESSION_SECRET — **לעולם לא** בצ'אט (כולל איתי), במייל, ב-git או בצילום מסך. מקום אחד בלבד: לוח ה-Environment של Render (ומנהל סיסמאות אישי אם רוצים עותק).

---

## 1. עובדות Render (נבדק 4.11.2026, מקורות רשמיים)
| נושא | עובדה | מקור |
|---|---|---|
| Workspace | Hobby ‏$0 לחודש + compute. עד 25 שירותים, 1 משתמש | render.com/pricing |
| Starter | ‏`0.5c-512mb` (‏0.5 CPU, ‏512MB) ‏**$7/חודש**, חיוב יחסי לשנייה | render.com/pricing, render.com/docs/blueprint-spec |
| דיסק קבוע | **$0.25 ל-GB לחודש** (1GB = ‏$0.25). אפשר להגדיל, אי אפשר להקטין | render.com/pricing, render.com/docs/disks |
| דיסק דורש תשלום | דיסק רק לשירות בתוכנית compute **בתשלום**; Free לא תומך בדיסק | render.com/docs/disks, render.com/docs/free |
| מגבלות דיסק | מופע **יחיד** (אי אפשר scale); **אין zero-downtime deploy** — כמה שניות השבתה בכל deploy; הדיסק לא זמין בזמן build/pre-deploy/one-off jobs; אי אפשר לשנות shutdown delay | render.com/docs/disks |
| Snapshots | snapshot אוטומטי כל 24 שעות, נשמר **7 ימים**, שחזור מלא בלבד (מוחק שינויים מאז) | render.com/docs/disks |
| Build | ‏500 דקות build לחודש ב-Hobby, אח"כ $5 ל-1,000 דקות. ללא אמצעי תשלום — builds נחסמים עד סוף החודש | render.com/pricing, render.com/docs/free |
| תעבורה | ‏5GB יוצא לחודש כלול, אח"כ $0.15/GB | render.com/pricing |
| Rollback / לוגים | ‏5 builds אחרונים לשחזור; לוגים 7 ימים | render.com/pricing |
| Free | נרדם אחרי 15 דק' בלי תעבורה נכנסת, 750 שעות/חודש, אין דיסק, אין Shell — **לא מתאים** | render.com/docs/free |
| אזורים | oregon (ברירת מחדל), ohio, virginia, frankfurt, singapore — **frankfurt** הכי קרוב לישראל; לא ניתן לשנות אחרי יצירה | render.com/docs/blueprint-spec |
| כרטיס | חיוב בדיקה $1 שמוחזר | render.com/pricing |
**עלות Render צפויה: ‏$7.25 לחודש** (‏$7 + ‏$0.25), כל עוד התעבורה מתחת ל-5GB ו-builds מתחת ל-500 דק'.

## 2. עובדות OpenAI — איך נאכפת תקרת ההוצאה, ומה נשמר (נבדק 4.11.2026)
| נושא | עובדה | מקור |
|---|---|---|
| Spend alert | **התראה בלבד** — התעבורה ממשיכה | developers.openai.com/api/docs/guides/spend-limits |
| Hard spend limit (ארגון או פרויקט) | אחרי הגעה לתקרה הבקשות נכשלות ב-**429** עם `project_spend_limit_exceeded` | שם |
| עיכוב אכיפה | "Enforcement is not instantaneous" — ההוצאה בפועל **יכולה לעבור מעט** את התקרה | שם |
| איפוס | התקרה מתאפסת במחזור החודשי הבא, או כשמעלים/מסירים אותה | שם |
| Usage tier | ל-OpenAI יש גם מגבלת שימוש חודשית לפי tier — נפרדת מהתקרה שלנו | שם |
| Rate limits לפרויקט | ניתן להגדיר בפרויקט מגבלות קצב לכל מודל (Project settings → Limits) — נמוך מברירת המחדל של הארגון | help.openai.com/en/articles/9186755 |
| אימון | נתוני API לא משמשים לאימון כברירת מחדל (אלא אם בחרת opt-in) | developers.openai.com/api/docs/guides/your-data |
| `store:false` | ב-Responses API ברירת המחדל שומרת "application state" ‏30 יום לפחות; `store:false` מבטל רק את זה | שם |
| Abuse monitoring | **גם עם `store:false`** — לוגים שעשויים לכלול prompts ותשובות נשמרים **עד 30 יום** (יותר אם נדרש בחוק) | שם |
| ZDR / Modified Abuse Monitoring | רק **באישור מראש** של OpenAI (דרך sales) ועם דרישות נוספות | שם |

**המסקנה שלנו:** המגן הראשי הוא בתוך האפליקציה — `AI_DAILY_USER_LIMIT`, `AI_DAILY_GLOBAL_LIMIT`, `AI_DAILY_TOKEN_LIMIT`, `AI_TIMEOUT_MS`, ומתג החירום `AI_ENABLED=false`, שנאכפים **לפני** שנשלחת בקשה ונשמרים בדיסק. תקרת הפרויקט ב-OpenAI היא רשת ביטחון שנייה (לא מיידית). אם התקרה נתפסת, הבוט עובר לתשובת fallback ללא AI (לאמת בבדיקת הקבלה). **לא לכתוב בשום מסמך או הודעה למשתמשים ש-OpenAI "לא שומרת מידע".**

---

## 3. יצירת מפתחות מקומית (≈5 דק', $0)
במחשב של יהודה (Mac/Linux Terminal, או Windows PowerShell עם OpenSSL / Git Bash):
```
openssl rand -base64 48     # פעם אחת → ADMIN_API_KEY
openssl rand -base64 48     # פעם שנייה → WEB_SESSION_SECRET
```
- להעתיק כל אחד ישר לשדה ב-Render (שלב 7). לא לשמור בקובץ בתיקיית הפרויקט.
- שני ערכים שונים. מינימום 32 תווים (השרת מסרב לעלות אחרת).

## 4. Google Cloud — פרויקט, Sheets API, חשבון שירות (≈20 דק', $0)
1. https://console.cloud.google.com → התחברות בחשבון Google של יהודה.
2. למעלה: בורר הפרויקטים → **New Project** → שם: `gringo-pilot` → **Create** → לבחור אותו.
3. תפריט ☰ → **APIs & Services → Library** → לחפש **Google Sheets API** → **Enable**. (לא להפעיל APIs אחרים.)
4. ☰ → **IAM & Admin → Service Accounts** → **+ Create service account**:
   - Name: `gringo-pilot-sheets` → **Create and continue**.
   - **Grant access (roles): לדלג** — לא לתת שום תפקיד → **Continue** → **Done**.
5. ללחוץ על החשבון שנוצר → להעתיק את כתובת המייל (`gringo-pilot-sheets@gringo-pilot.iam.gserviceaccount.com` או דומה) — זה `GOOGLE_SHEETS_CLIENT_EMAIL` (לא סוד גדול, אבל לא לפרסם).
6. לשונית **Keys** → **Add key → Create new key → JSON → Create**. קובץ יורד למחשב.
   - אם מופיעה שגיאת מדיניות ארגונית (`iam.disableServiceAccountKeyCreation`) — לעצור ולפנות אליי; בחשבון Gmail פרטי זה לא אמור לקרות.
7. **טיפול בקובץ ה-JSON:**
   - לא לשלוח, לא להעלות ל-Drive, לא לצרף ל-git.
   - לפתוח בעורך טקסט, להעתיק את הערך של `private_key` (מ-`-----BEGIN PRIVATE KEY-----` עד `-----END PRIVATE KEY-----\n`, כולל ה-`\n`) → זה `GOOGLE_SHEETS_PRIVATE_KEY` ב-Render. האפליקציה ממירה `\n` לשורות חדשות.
   - אחרי שהשירות עובד: למחוק את הקובץ מהמחשב (וגם מסל המחזור). אם צריך שוב — יוצרים מפתח חדש ומוחקים את הישן ב-Keys.

## 5. גיליון פיילוט חדש (≈5 דק', $0)
1. https://sheets.google.com → **Blank** → שם: `Gringo Pilot`.
2. מה-URL להעתיק את המזהה: `https://docs.google.com/spreadsheets/d/<המזהה>/edit` → זה `GOOGLE_SHEETS_SPREADSHEET_ID`.
3. **Share** → להוסיף **רק** את מייל חשבון השירות (סעיף 4.5) → **Editor** → לבטל "Notify people" → **Share**.
4. **General access** חייב להיות **Restricted**. לא לשתף עם אף אחד נוסף (SEC-01).
5. לא לערוך ידנית שורות בזמן שהשרת רץ (TD-01).
6. יצירת הלשוניות (tabs): השרת יוצר בעצמו בעלייה את PrivacyConsents, PrivacyAudit ולשוניות ה-CRM. את השאר יוצרים **אחרי ה-deploy הראשון, באישור**, מתוך Render → השירות → **Shell**:
   ```
   npm run setup:pilot -- --dry-run   # מציג מה ייווצר, בלי לגעת בגיליון
   npm run setup:pilot                # Telegram, התראות, משימות, מסמכים, שירותים, אנשי קשר
   npm run setup:crm-agent && npm run setup:admin && npm run setup:workers
   npm run setup:jobs && npm run setup:money && npm run setup:housing && npm run setup:community
   npm run setup:manager-agent && npm run setup:content-agent
   npm run test:sheets                # בדיקת חיבור
   ```
   הסקריפטים כותבים רק שורת כותרת; הם לא מוחקים נתונים. (ככה המפתח לא צריך להיות על המחשב של יהודה בכלל.)

## 6. Telegram — בוט חדש ב-BotFather (≈10 דק', $0)
1. בטלפון, ב-Telegram לחפש **@BotFather** (עם ✔ כחול) → **Start**.
2. `/newbot` → שם תצוגה: `Gringo Pilot` → username שמסתיים ב-`bot` (למשל `GringoPilotBot`).
3. BotFather שולח **טוקן** (`<מספר>:<מחרוזת>`) → זה `TELEGRAM_BOT_TOKEN`. להעתיק ישר ל-Render. לא לשלוח לאף אחד. אם דלף: `/revoke` ולהחליף.
4. `/setjoingroups` → לבחור את הבוט → **Disable** (הבוט עובד רק בצ'אט פרטי).
5. `/setprivacy` → לבחור את הבוט → **Enable** (ברירת מחדל; בקבוצות הבוט לא קורא הכול — ובכל מקרה הוא חסום לקבוצות).
6. `/setcommands` → לבחור את הבוט → להדביק:
   ```
   privacy - הודעת פרטיות / Privacy notice / ความเป็นส่วนตัว
   language - שפה / Language / ภาษา (/language he, /language th, /language en)
   accept - אישור הסכמה / Accept / ยอมรับ
   decline - סירוב / Decline / ไม่ยอมรับ
   mydata - סיכום המידע שלי / My data / ข้อมูลของฉัน
   withdraw - ביטול הסכמה / Withdraw consent / ถอนความยินยอม
   delete - מחיקת המידע שלי / Delete my data / ลบข้อมูล
   ```
7. (אופציונלי) `/setdescription` ו-`/setuserpic` — טקסט ותמונה; בלי מידע אישי.
8. **לא** להגדיר webhook. המצב הוא polling.

## 7. OpenAI — פרויקט, מפתח, תקרות, מודל (≈15 דק'; עלות לפי שימוש עד התקרה)
1. https://platform.openai.com → התחברות → בורר הפרויקטים למעלה → **Create project** → שם: `gringo-pilot`.
2. בתוך הפרויקט: **Project settings → Limits**:
   - **Spend → Edit spend limit** → Monthly: **20** → להפעיל **Enforce a hard limit** → Save.
   - **Spend alert** ב-**10** (התראה במייל).
   - **Rate limits**: להשאיר גישה רק למודל שנבחר (Model usage → Allow only), ולהוריד מגבלות קצב למודל הזה אם האפשרות קיימת.
3. **Billing**: לוודא שיש אמצעי תשלום/קרדיט בארגון (**דורש אישור הוצאה**). מומלץ קרדיט מראש קטן (למשל $10–20) בלי auto-recharge.
4. **Settings → Organization → Data controls**: לוודא ש-sharing/training **כבוי** (ברירת מחדל). לא לצפות ל-ZDR — זה רק באישור OpenAI.
5. **API keys** (בתוך הפרויקט) → **Create new secret key** → Owned by: You/Service account, Project: `gringo-pilot`, Permissions: **Restricted** עם הרשאת כתיבה ל-Responses בלבד, אם הממשק מאפשר; אחרת All. להעתיק פעם אחת ישר ל-`AI_API_KEY` ב-Render.
6. **מודל:** ברירת המחדל בקוד `gpt-4.1-mini` (זול ותומך בתאית/עברית). יהודה מאשר מודל סופי לפי המחירון ביום ההקמה; אפשר לשנות דרך `AI_MODEL` בלי deploy של קוד.
7. מתג חירום: ב-Render לשנות `AI_ENABLED` ל-`false` → Save (Render מבצע restart) → הבוט ממשיך לעבוד בלי AI (תשובות fallback, פקודות פרטיות פעילות).

## 8. Render — חשבון ו-Blueprint (רק אחרי אישור תשלום ו-Deploy)
**עד אישור: לפתוח חשבון זה בסדר רק אם יהודה מאשר הרשמה; בלי כרטיס אין דיסק ואין Starter.**
1. https://dashboard.render.com → **Sign up with GitHub** (חשבון yehudacohen88-max) → להפעיל 2FA (Account settings).
2. **Billing → Add payment method** (חיוב בדיקה $1 שמוחזר). **← דורש אישור הוצאה.**
3. GitHub: לאשר ל-Render גישה **רק** ל-repo `gringo-ai`.
4. **New → Blueprint** → לבחור `gringo-ai` → branch `main` → Render קורא את `render.yaml`.
5. Render יבקש ערכים לכל משתנה `sync: false`: להדביק את 7 הסודות (ADMIN_API_KEY, WEB_SESSION_SECRET, TELEGRAM_BOT_TOKEN, AI_API_KEY, GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY).
6. לבדוק לפני Apply: Plan = Starter (0.5 CPU/512MB), Region = Frankfurt, Disk 1GB ב-`/var/data`, Instances = 1. **Apply** ← זה ה-Deploy (**דורש אישור Deploy**).
7. אחרי שהסטטוס Live: Logs צריכים להראות `Durable privacy storage verified` ו-`Channels: telegram=on line=off whatsapp=off`. אם `Refusing to start` — לא לנסות לתקן לבד; לשלוח לי **רק את שורת השגיאה** (אין בה סודות).
8. Shell → סקריפטי הגיליון (סעיף 5.6) → ואז בדיקות הקבלה (`docs/ops/TELEGRAM_ACCEPTANCE_he.md`).
9. Auto-deploy כבוי (`autoDeployTrigger: off`): כל deploy עתידי = **Manual Deploy** ביוזמת יהודה.

## 9. אחרי העלייה
- UptimeRobot (חינם, בדיקה כל 5 דק') על `https://<service>.onrender.com/health`.
- גיבוי שבועי של הגיליון (Apps Script) — INF-09.
- Snapshot הדיסק אוטומטי (7 ימים). הדיסק מכיל רק מונים ונעילה.
