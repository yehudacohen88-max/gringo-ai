const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const { WORKER_FIELDS } = require('../src/modules/workers/worker.model');
const { WORKER_HISTORY_FIELDS } = require('../src/modules/workers/workerHistory.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.workers, WORKER_FIELDS);
  await ensureSheetWithHeader(env.googleSheets.sheets.workerHistory, WORKER_HISTORY_FIELDS);

  console.log('Workers sheets are ready.');
  console.log(`Created or updated tab: ${env.googleSheets.sheets.workers}`);
  console.log(`Created or updated tab: ${env.googleSheets.sheets.workerHistory}`);
}

main().catch((error) => {
  console.error('Workers sheets setup failed.');
  console.error(error.message);
  process.exit(1);
});
