const app = require('./app');
const { env } = require('./config/env');
const { crmAgentRepository } = require('./modules/crm-agent');
const { telegramDeliveryService, telegramLinkService, telegramUpdateService } = require('./modules/telegram');
const { whatsappDeliveryService } = require('./modules/whatsapp');
const { lineDeliveryService, lineLinkService } = require('./modules/line');

let server;

async function startServer() {
  await crmAgentRepository.initializeMvpCrmSheets();

  server = app.listen(env.port, () => {
    console.log(`Gringo Community API is running on http://localhost:${env.port}`);
    telegramUpdateService.startPolling().catch(() => {
      console.warn('[telegram] Polling did not start. Gringo web app is still running.');
    });
    telegramLinkService.expireOldCodes().catch(() => {
      console.warn('[telegram] Link-code cleanup did not finish. Gringo web app is still running.');
    });
    lineLinkService.expireOldCodes().catch(() => {
      console.warn('[line] Link-code cleanup did not finish. Gringo web app is still running.');
    });
    telegramDeliveryService.processPendingTelegramDeliveries().catch(() => {
      console.warn('[telegram] Notification delivery did not finish. Gringo web app is still running.');
    });
    whatsappDeliveryService.processPendingWhatsAppDeliveries().catch(() => {
      console.warn('[whatsapp] Notification delivery did not finish. Gringo web app is still running.');
    });
    lineDeliveryService.processPendingLineDeliveries().catch(() => {
      console.warn('[line] Notification delivery did not finish. Gringo web app is still running.');
    });
  });
}

startServer().catch((error) => {
  console.error(`[startup] CRM Google Sheets initialization failed: ${error.message}`);
  process.exit(1);
});

const telegramDeliveryInterval = setInterval(() => {
  telegramDeliveryService.processPendingTelegramDeliveries().catch(() => {
    console.warn('[telegram] Notification delivery did not finish. Gringo web app is still running.');
  });
}, 60 * 1000);
telegramDeliveryInterval.unref?.();

const whatsappDeliveryInterval = setInterval(() => {
  whatsappDeliveryService.processPendingWhatsAppDeliveries().catch(() => {
    console.warn('[whatsapp] Notification delivery did not finish. Gringo web app is still running.');
  });
}, 60 * 1000);
whatsappDeliveryInterval.unref?.();

const lineDeliveryInterval = setInterval(() => {
  lineDeliveryService.processPendingLineDeliveries().catch(() => {
    console.warn('[line] Notification delivery did not finish. Gringo web app is still running.');
  });
}, 60 * 1000);
lineDeliveryInterval.unref?.();

function shutdown() {
  telegramUpdateService.stopPolling();
  if (!server) {
    process.exit(0);
    return;
  }

  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
