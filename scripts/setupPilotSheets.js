// Creates the tabs the Telegram pilot needs that no other setup script or the
// startup check creates (Telegram link/delivery, notifications, tasks,
// documents, services, contacts). Idempotent: existing tabs keep their rows;
// only the header row is written. Run ONLY against the new, empty pilot sheet.
//
//   npm run setup:pilot -- --dry-run   (prints the plan, no network)
//   npm run setup:pilot                (needs GOOGLE_SHEETS_* env)
const { env } = require('../src/config/env');
const S = env.googleSheets.sheets;

function pilotTabs() {
  const req = (p, k) => require(p)[k];
  return [
    [S.telegramLinkCodes, req('../src/modules/telegram/telegram-link.model', 'TELEGRAM_LINK_CODE_FIELDS')],
    [S.telegramLinkHistory, req('../src/modules/telegram/telegram-link.model', 'TELEGRAM_LINK_HISTORY_FIELDS')],
    [S.telegramDeliveries, req('../src/modules/telegram/telegram-delivery.model', 'TELEGRAM_DELIVERY_FIELDS')],
    [S.userNotifications, req('../src/modules/notifications/notification.model', 'NOTIFICATION_FIELDS')],
    [S.userTasks, req('../src/modules/tasks/task.model', 'TASK_FIELDS')],
    [S.userTaskHistory, req('../src/modules/tasks/task.model', 'TASK_HISTORY_FIELDS')],
    [S.userDocuments, req('../src/modules/documents/document.model', 'DOCUMENT_FIELDS')],
    [S.userDocumentHistory, req('../src/modules/documents/document.model', 'DOCUMENT_HISTORY_FIELDS')],
    [S.services, req('../src/modules/services/service.model', 'SERVICE_FIELDS')],
    [S.contacts, req('../src/modules/contacts/contact.model', 'CONTACT_FIELDS')],
    [S.contactHistory, req('../src/modules/contacts/contactHistory.model', 'CONTACT_HISTORY_FIELDS')],
  ];
}

async function main() {
  const tabs = pilotTabs();
  for (const [name, fields] of tabs) {
    if (!name || !Array.isArray(fields) || !fields.length) throw new Error(`Bad tab definition: ${name}`);
  }
  if (process.argv.includes('--dry-run')) {
    tabs.forEach(([name, fields]) => console.log(`would ensure tab: ${name} (${fields.length} columns)`));
    return;
  }
  const { ensureSheetWithHeader } = require('../src/config/googleSheets');
  for (const [name, fields] of tabs) {
    await ensureSheetWithHeader(name, fields);
    console.log(`Created or updated tab: ${name}`);
  }
  console.log('Pilot sheets are ready.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Pilot sheets setup failed.');
    console.error(error.message);
    process.exit(1);
  });
}
module.exports = { pilotTabs };
