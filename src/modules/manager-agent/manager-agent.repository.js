const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { CONVERSATION_HISTORY_FIELDS } = require('../crm-agent/conversation-history.model');
const { USER_PROFILE_FIELDS } = require('../crm-agent/user-profile.model');
const {
  DAILY_REPORT_FIELDS,
  RECOMMENDATION_FIELDS,
  WEEKLY_REPORT_FIELDS,
} = require('./manager-report.model');

function rowToObject(fields, row) {
  return fields.reduce((record, field, index) => {
    record[field] = row[index] ?? '';
    return record;
  }, {});
}

function objectToRow(fields, record) {
  return fields.map((field) => record[field] ?? '');
}

function hasValues(record) {
  return Object.values(record).some((value) => String(value).trim() !== '');
}

async function readConversationHistory() {
  const rows = await readSheetRows(env.googleSheets.sheets.conversationHistory);
  return rows
    .slice(1)
    .map((row) => rowToObject(CONVERSATION_HISTORY_FIELDS, row))
    .filter(hasValues);
}

async function readUserProfiles() {
  const rows = await readSheetRows(env.googleSheets.sheets.userProfiles);
  return rows
    .slice(1)
    .map((row) => rowToObject(USER_PROFILE_FIELDS, row))
    .filter(hasValues);
}

async function saveDailyReport(report) {
  await appendSheetRow(env.googleSheets.sheets.dailyReports, objectToRow(DAILY_REPORT_FIELDS, report));
  return report;
}

async function saveWeeklyReport(report) {
  await appendSheetRow(env.googleSheets.sheets.weeklyReports, objectToRow(WEEKLY_REPORT_FIELDS, report));
  return report;
}

async function saveRecommendation(recommendation) {
  await appendSheetRow(
    env.googleSheets.sheets.recommendations,
    objectToRow(RECOMMENDATION_FIELDS, recommendation)
  );
  return recommendation;
}

async function readDailyReports() {
  const rows = await readSheetRows(env.googleSheets.sheets.dailyReports);
  return rows
    .slice(1)
    .map((row) => rowToObject(DAILY_REPORT_FIELDS, row))
    .filter(hasValues);
}

async function readRecommendations() {
  const rows = await readSheetRows(env.googleSheets.sheets.recommendations);
  return rows
    .slice(1)
    .map((row) => rowToObject(RECOMMENDATION_FIELDS, row))
    .filter(hasValues);
}

async function updateRecommendation(recommendationId, recommendation) {
  const rows = await readSheetRows(env.googleSheets.sheets.recommendations);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === recommendationId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.recommendations, rowIndex + 1, objectToRow(RECOMMENDATION_FIELDS, recommendation));
  return recommendation;
}

module.exports = {
  readDailyReports,
  readConversationHistory,
  readRecommendations,
  readUserProfiles,
  saveDailyReport,
  saveRecommendation,
  saveWeeklyReport,
  updateRecommendation,
};
