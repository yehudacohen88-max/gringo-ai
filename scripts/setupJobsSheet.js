const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const { JOB_FIELDS } = require('../src/modules/jobs/job.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.jobs, JOB_FIELDS);
  console.log(`Jobs sheet is ready: ${env.googleSheets.sheets.jobs}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
