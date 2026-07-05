require('dotenv').config();

function normalizePrivateKey(value) {
  return value ? value.replace(/\\n/g, '\n') : '';
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  googleSheets: {
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '',
    clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '',
    privateKey: normalizePrivateKey(process.env.GOOGLE_SHEETS_PRIVATE_KEY),
    sheets: {
      contacts: process.env.GOOGLE_SHEETS_CONTACTS_SHEET_NAME || 'Contacts',
      contactNotes: process.env.GOOGLE_SHEETS_CONTACT_NOTES_SHEET_NAME || 'ContactNotes',
      contactHistory: process.env.GOOGLE_SHEETS_CONTACT_HISTORY_SHEET_NAME || 'ContactHistory',
      workers: process.env.GOOGLE_SHEETS_WORKERS_SHEET_NAME || 'Workers',
      workerHistory: process.env.GOOGLE_SHEETS_WORKER_HISTORY_SHEET_NAME || 'WorkerHistory',
      userProfiles: process.env.GOOGLE_SHEETS_USER_PROFILES_SHEET_NAME || 'UserProfiles',
      conversationHistory: process.env.GOOGLE_SHEETS_CONVERSATION_HISTORY_SHEET_NAME || 'ConversationHistory',
      dailyReports: process.env.GOOGLE_SHEETS_DAILY_REPORTS_SHEET_NAME || 'DailyReports',
      weeklyReports: process.env.GOOGLE_SHEETS_WEEKLY_REPORTS_SHEET_NAME || 'WeeklyReports',
      recommendations: process.env.GOOGLE_SHEETS_RECOMMENDATIONS_SHEET_NAME || 'Recommendations',
      contentDrafts: process.env.GOOGLE_SHEETS_CONTENT_DRAFTS_SHEET_NAME || 'ContentDrafts',
    },
  },
};

module.exports = { env };
