# תוכנית הקמת סביבת פיילוט בעלות מינימלית — Gringo

מצב: טיוטה לאישור יהודה. לא בוצע Deploy, לא נפתחו חשבונות ולא הוצא כסף. מחירים נבדקו ברשת ב-4.11.2026 (מקורות בסוף); לאמת שוב לפני רכישה. המחירים ללא מע"מ.

## 1. דרישות שמכתיבות את הבחירה
- **מופע אחד בלבד** (מטמונים, מכסות AI, נעילה ו-Telegram polling בזיכרון התהליך). אסור autoscaling או replicas>1.
- **דיסק קבוע** עבור `AI_BUDGET_STATE_FILE` ו-`GRINGO_PROCESS_LOCK_FILE` (קבצים קטנים, 1GB מספיק).
- Node ‏≥20, ‏512MB RAM מספיקים לפיילוט של 5–10 עובדים (בדיקת עומס מקומית: p95≈10ms).
- HTTPS לאתר. Telegram ב-polling לא צריך כתובת נכנסת.
- אחסון הנתונים נשאר Google Sheets (גיליון פיילוט נפרד).

## 2. אפשרויות אחסון (מופע אחד + דיסק קבוע)

| ספק | תצורה | מחיר חודשי (נבדק 4.11.2026) | דיסק קבוע | הערות |
|---|---|---|---|---|
| **Render** | Starter ‏(0.5 CPU, ‏512MB) + דיסק 1GB | ‏$7 + ‏$0.25 = **≈$7.25** | ‏$0.25/GB, גיבוי snapshot יומי | מנוהל, HTTPS אוטומטי, deploy מ-GitHub. דיסק מבטל zero-downtime (כמה שניות השבתה בכל deploy) ומונע scale — מתאים לדרישת המופע היחיד. ה-Free לא תומך בדיסק. |
| **Fly.io** | shared-cpu-1x ‏512MB + volume 1GB (ams/fra) | ≈$3.8 + ‏$0.15 = **≈$4** (256MB: ≈$2.4) | ‏$0.15/GB, snapshots עד 10GB חינם | אין free tier; כרטיס אשראי חובה. דורש `fly.toml` וקצת יותר CLI. |
| **Railway** | Hobby | **$5** (כולל $5 שימוש; 512MB רציף ≈$5 RAM + CPU ⇒ בפועל ≈$5–10) | ‏$0.15/GB, עד 5GB | חיוב לפי שימוש — פחות צפוי. |
| **Hetzner Cloud** | CX23 ‏(2 vCPU, ‏4GB, ‏40GB) | **€5.99** (כולל IPv4) | הדיסק המקומי קבוע | הכי הרבה משאבים לכסף, אבל VPS לא מנוהל: עדכוני OS, firewall, TLS (Caddy), systemd — עבודת תפעול. מאז 26.6.2026 יש הגבלות על פתיחת שרתים ללקוחות חדשים. |
| **Oracle Always Free** | A1 ‏(עד 2 OCPU, ‏12GB) | **$0** | 200GB block חינם | המכסה קוצצה בחצי ב-2026 בלי הודעה; שרתים "לא פעילים" (CPU/רשת/זיכרון <20% שבוע) עלולים להיחזר — אפליקציה קטנה כמו שלנו עלולה להיחשב idle. לא אמין לפיילוט עם עובדים אמיתיים. |

### המלצה
**Render Starter + דיסק 1GB (≈$7.25 לחודש).** הכי פשוט לתפעול בלי איש DevOps, HTTPS ו-deploy מ-GitHub מובנים, הדיסק עם snapshot יומי, ו"דיסק = מופע אחד" אוכף את דרישת התהליך היחיד גם ברמת הפלטפורמה. חלופה זולה: **Fly.io (≈$4)** אם חשוב לחסוך ~$3 בחודש ולקבל עוד עבודת CLI. Hetzner רק אם יש מי שמתחזק שרת. Oracle — לא לפיילוט.

## 3. Telegram: webhook או polling
- **Polling (מומלץ לפיילוט, ברירת המחדל `TELEGRAM_BOT_MODE=polling`).** אין צורך בכתובת ציבורית או בסוד webhook, עובד מאחורי כל ספק. דורש מופע אחד ותמיד פעיל — שני מופעים יגרמו ל-409 מ-Telegram (הנעילה מגינה רק באותו שרת).
- **Webhook לא ממומש בקוד** (השרת מסרב לעלות במצב webhook). מעבר ל-webhook = עבודת פיתוח אחרי הפיילוט (עם `TELEGRAM_WEBHOOK_SECRET` ≥32 תווים ואימות header).
- Render Starter לא נרדם (רק Free נרדם), לכן polling יציב.

## 4. Google: חשבון שירות וגיליון פיילוט ייעודי
1. פרויקט Google Cloud חדש "gringo-pilot" (חינם), הפעלת Google Sheets API בלבד.
2. חשבון שירות בלי תפקידי IAM בפרויקט; יצירת מפתח JSON אחד → ממנו רק `GOOGLE_SHEETS_CLIENT_EMAIL` ו-`GOOGLE_SHEETS_PRIVATE_KEY` לסודות הספק. לא לשמור את הקובץ ב-repo/מחשב משותף.
3. גיליון **חדש וריק** "Gringo Pilot" בחשבון של יהודה; שיתוף רק עם חשבון השירות (Editor) ועם יהודה (SEC-01). בלי "כל מי שיש לו קישור".
4. הרצת סקריפטי ההקמה (`npm run setup:*`) מול הגיליון החדש בלבד — דורש אישור יהודה (כתיבה לגיליון אמיתי).
5. אסור לערוך/למחוק שורות ידנית בזמן שהשרת רץ (TD-01).

## 5. OpenAI: תקציב ובקרות נתונים
- **פרויקט API ייעודי "gringo-pilot"** ומפתח שמוגבל לפרויקט.
- **Hard spend limit לפרויקט** (Project settings → Limits → Spend, "Enforce a hard limit") — מוצע $20/חודש. בהגעה לתקרה הבקשות נכשלות ב-429 והבוט עונה בהודעת "AI מושהה" בשפת המשתמש.
- מכסות באפליקציה (כבר בקוד): `AI_DAILY_USER_LIMIT=30`, `AI_DAILY_GLOBAL_LIMIT=300` לפיילוט, `AI_DAILY_TOKEN_LIMIT=300000`, `AI_TIMEOUT_MS=20000`, ו-`AI_ENABLED=false` כמתג חירום.
- **בקרות נתונים:** נתוני API לא משמשים לאימון כברירת מחדל — לאמת בהגדרות הארגון. הקוד שולח כעת `store:false` (נוסף ב-PR זה). Zero Data Retention דורש אישור מ-OpenAI — לבקש אם רלוונטי; אחרת חלה שמירת abuse-monitoring של OpenAI (לציין בהודעת הפרטיות — בדיקה משפטית).
- מודל: מודל קטן וזול (לבחירת יהודה לפי מחירון OpenAI ביום ההקמה).

## 6. משתני סביבה וסודות (שמות בלבד)
**סודות (רק בלוח הסודות של הספק):** `ADMIN_API_KEY`, `WEB_SESSION_SECRET` (+ `WEB_SESSION_SECRET_PREVIOUS` בהחלפה), `TELEGRAM_BOT_TOKEN`, `AI_API_KEY`, `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_SPREADSHEET_ID`.
**הגדרות (לא סודיות):** `NODE_ENV=production`, `PORT` (לפי הספק), `TRUST_PROXY_HOPS`, `TELEGRAM_BOT_ENABLED=true`, `TELEGRAM_BOT_MODE=polling`, `AI_PROVIDER=openai`, `AI_MODEL`, `AI_ENABLED`, `AI_TIMEOUT_MS`, `AI_DAILY_USER_LIMIT`, `AI_DAILY_GLOBAL_LIMIT`, `AI_DAILY_TOKEN_LIMIT`, `AI_BUDGET_STATE_FILE`, `GRINGO_PROCESS_LOCK_FILE`, `TRANSLATION_PROVIDER` (+`TRANSLATION_API_KEY` אם בשימוש).
**כבויים בפיילוט:** `LINE_ENABLED=false`, `WHATSAPP_ENABLED=false` (וכל סודות LINE/WhatsApp ריקים). `ALLOW_DEV_ADMIN_KEY` לא מוגדר. `GRINGO_PRIVACY_CONSENT_GATE` לא מוגדר (השער נאכף בייצור).
מחולל סודות: `openssl rand -base64 48` על מחשב יהודה; לא בצ'אט, לא ב-git.

## 7. TRUST_PROXY_HOPS לפי ספק
| ספק | ערך | הסבר |
|---|---|---|
| Render | `1` | בקשות עוברות דרך ה-proxy של Render, שמוסיף X-Forwarded-For; השירות לא נגיש ישירות. |
| Fly.io | `1` | Fly Proxy יחיד לפני המכונה (בלי Cloudflare מלפנים). |
| Railway | `1` | edge proxy יחיד. |
| Hetzner + Caddy | `1` | רק אם השרת מאזין ל-127.0.0.1 ו-Caddy הוא הדרך היחידה פנימה (firewall על 3000). |
| כל ספק + Cloudflare מלפנים | `2` | רק אם הגישה הישירה חסומה. |
| לא בטוחים | לא להגדיר | ה-rate limit יעבוד לפי ה-peer (כל המשתמשים כאחד) — בטוח אבל פחות מדויק. |
**לאמת אחרי ה-deploy:** בקשה עם `X-Forwarded-For: 1.2.3.4` מבחוץ לא אמורה לשנות את הכתובת שנרשמת ב-rate limit.

## 8. AI_BUDGET_STATE_FILE ונעילה על הדיסק הקבוע
- Render: mount path `/var/data`; `AI_BUDGET_STATE_FILE=/var/data/ai-budget.json`, `GRINGO_PROCESS_LOCK_FILE=/var/data/gringo.lock`.
- Fly: volume ב-`/data` → `/data/ai-budget.json`, `/data/gringo.lock`.
- בדיקה: לבצע restart ולוודא ב-`/api/admin/ai-usage` שמספר הקריאות היומי נשמר.
- הנעילה על דיסק קבוע: אם התהליך קרס, נעילה של pid מת מוחלפת אוטומטית.

## 9. גיבויים וניטור (חינם)
- **גיבוי הגיליון (INF-09):** Google Apps Script בחשבון יהודה עם trigger שבועי שמעתיק את הקובץ לתיקייה פרטית ("Gringo Backups"), שומר 8 אחרונים. חינם. בנוסף Version history של Google Sheets.
- **דיסק:** snapshot יומי של Render (כלול) / Fly snapshots (10GB חינם). הדיסק מכיל רק מונים ונעילה — לא נתוני משתמשים.
- **Uptime (INF-10):** UptimeRobot Free — עד 50 מוניטורים, בדיקה כל 5 דקות, התראה במייל. מוניטור על `https://<host>/health`. חינם.
- **לוגים:** לוגי הספק (ללא תוכן הודעות/מזהים — כבר נבדק בקוד). לבדוק פעם ביום `[ai-budget]` ו-`[privacy] Deletion retry`.

## 10. סדר הקמה (Y = דורש פעולה/אישור של יהודה)
| # | שלב | מי | יהודה? |
|---|---|---|---|
| 1 | אישור הספק (Render מומלץ) והתקציב החודשי | יהודה | **Y — החלטה + אמצעי תשלום** |
| 2 | פתיחת פרויקט OpenAI, hard limit ‏$20, בדיקת data controls, מפתח לפרויקט | יהודה | **Y — חשבון ותשלום** |
| 3 | פרויקט Google Cloud + חשבון שירות + גיליון פיילוט חדש, שיתוף מצומצם | יהודה (עם הדרכה) | **Y — חשבון Google, סודות** |
| 4 | יצירת בוט Telegram חדש לפיילוט ב-@BotFather (טוקן) | יהודה | **Y — סוד** |
| 5 | יצירת סודות (`ADMIN_API_KEY`, `WEB_SESSION_SECRET`) והזנה ללוח הספק | יהודה | **Y — סודות** |
| 6 | הכנת `render.yaml`/`fly.toml` (ללא סודות) ב-PR | Grok | N (PR בלבד) |
| 7 | יצירת השירות + דיסק 1GB, חיבור ל-GitHub, הגדרת ההגדרות (סעיף 6–8) | יהודה | **Y — Deploy** |
| 8 | הרצת `setup:*` מול גיליון הפיילוט הריק | יהודה / Grok באישור | **Y — כתיבה לגיליון אמיתי** |
| 9 | בדיקות עשן: `/health`, הודעת פרטיות th/he/en, הסכמה, צ'אט, ייצוא, מחיקה, Telegram, `/api/admin/ai-usage`, restart ושמירת מונים, XFF | Grok (רשימה) + יהודה | **Y — מול סביבה אמיתית** |
| 10 | UptimeRobot + Apps Script גיבוי שבועי | יהודה | **Y — חשבונות (חינם)** |
| 11 | סקירה משפטית של הודעת הפרטיות (LEG-01…03) ותרגום תאי ע"י דובר שפת אם (LNG-01) | יהודה | **Y** |
| 12 | Go/No-Go והזמנת 5–10 עובדים | יהודה | **Y** |

## 11. עלות חודשית משוערת (פיילוט 5–10 עובדים)
| רכיב | Render (מומלץ) | Fly.io (חלופה) |
|---|---|---|
| שרת | ‏$7.00 | ‏≈$3.8 (512MB, אירופה) |
| דיסק 1GB | ‏$0.25 | ‏$0.15 |
| Google Sheets / Cloud | ‏$0 | ‏$0 |
| Telegram | ‏$0 | ‏$0 |
| UptimeRobot, Apps Script | ‏$0 | ‏$0 |
| OpenAI (תקרה קשיחה) | עד $20; צפי ‏$2–8 | עד $20; צפי ‏$2–8 |
| **סה"כ** | **≈$9–15 בפועל, תקרה ≈$27** | **≈$6–12 בפועל, תקרה ≈$24** |
צפי OpenAI: ~10 משתמשים × עד 30 קריאות/יום עם max 350 טוקני פלט — תלוי במודל שייבחר; התקרה הקשיחה מגבילה את הסיכון.

## מקורות (נבדקו 4.11.2026)
- Render: https://render.com/pricing , https://render.com/docs/disks
- Fly.io: https://fly.io/pricing , https://docs.fly.io/about/pricing
- Railway: https://railway.com/pricing , https://docs.railway.com/pricing/plans
- Hetzner: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- Oracle: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- OpenAI: https://developers.openai.com/api/docs/guides/spend-limits , https://developers.openai.com/api/docs/guides/your-data
- UptimeRobot: https://uptimerobot.com/pricing/
