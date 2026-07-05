const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const { CONTENT_DRAFT_FIELDS } = require('../src/modules/content-agent/content-draft.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.contentDrafts, CONTENT_DRAFT_FIELDS);

  console.log('Content Agent sheets are ready.');
  console.log(`Created or updated tab: ${env.googleSheets.sheets.contentDrafts}`);
}

main().catch((error) => {
  console.error('Content Agent sheets setup failed.');
  console.error(error.message);
  process.exit(1);
});
