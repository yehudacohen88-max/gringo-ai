const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const {
  DAILY_REPORT_FIELDS,
  RECOMMENDATION_FIELDS,
  WEEKLY_REPORT_FIELDS,
} = require('../src/modules/manager-agent/manager-report.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.dailyReports, DAILY_REPORT_FIELDS);
  await ensureSheetWithHeader(env.googleSheets.sheets.weeklyReports, WEEKLY_REPORT_FIELDS);
  await ensureSheetWithHeader(env.googleSheets.sheets.recommendations, RECOMMENDATION_FIELDS);

  console.log('Manager Agent sheets are ready.');
  console.log(`Created or updated tab: ${env.googleSheets.sheets.dailyReports}`);
  console.log(`Created or updated tab: ${env.googleSheets.sheets.weeklyReports}`);
  console.log(`Created or updated tab: ${env.googleSheets.sheets.recommendations}`);
}

main().catch((error) => {
  console.error('Manager Agent sheets setup failed.');
  console.error(error.message);
  process.exit(1);
});
