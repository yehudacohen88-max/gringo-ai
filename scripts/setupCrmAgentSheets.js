const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const { USER_PROFILE_FIELDS } = require('../src/modules/crm-agent/user-profile.model');
const { CONVERSATION_HISTORY_FIELDS } = require('../src/modules/crm-agent/conversation-history.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.userProfiles, USER_PROFILE_FIELDS);
  await ensureSheetWithHeader(env.googleSheets.sheets.conversationHistory, CONVERSATION_HISTORY_FIELDS);

  console.log('CRM Agent sheets are ready.');
  console.log(`Created or updated tab: ${env.googleSheets.sheets.userProfiles}`);
  console.log(`Created or updated tab: ${env.googleSheets.sheets.conversationHistory}`);
}

main().catch((error) => {
  console.error('CRM Agent sheets setup failed.');
  console.error(error.message);
  process.exit(1);
});
