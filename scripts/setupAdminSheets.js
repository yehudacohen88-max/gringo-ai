const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const { ADMIN_NOTE_FIELDS, HUMAN_FOLLOW_UP_FIELDS, KNOWLEDGE_DRAFT_FIELDS } = require('../src/modules/admin/admin.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.humanFollowUps, HUMAN_FOLLOW_UP_FIELDS);
  await ensureSheetWithHeader(env.googleSheets.sheets.adminNotes, ADMIN_NOTE_FIELDS);
  await ensureSheetWithHeader(env.googleSheets.sheets.knowledgeDrafts, KNOWLEDGE_DRAFT_FIELDS);
  console.log('Admin sheets are ready.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
