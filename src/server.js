const app = require('./app');
const { env } = require('./config/env');
const { crmAgentRepository } = require('./modules/crm-agent');
const { telegramDeliveryService, telegramLinkService, telegramUpdateService } = require('./modules/telegram');
const { whatsappDeliveryService } = require('./modules/whatsapp');
const { lineDeliveryService, lineLinkService } = require('./modules/line');
const { isProductionRuntime } = require('./shared/pilotCatalog');
const { verifyPrivacyStorage } = require('./modules/privacy/privacy-storage-check');

// PILOT REQUIREMENT: run exactly ONE Gringo process (one instance, no
// cluster, no autoscaling). Google Sheets reads are cached in process memory
// for 45 seconds and invalidated only by writes from the same process, and
// delete codes, rate limits and Telegram polling state are per process. A
// second instance could read a stale consent or deletion_pending state.
const SINGLE_PROCESS_NOTICE = '[startup] Pilot mode: run a single Gringo process only (45s in-process Sheets read cache; no multi-instance consistency).';

let server;
const intervals = [];

function startBackgroundWork() {
  telegramUpdateService.startPolling().catch(() => {
    console.warn('[telegram] Polling did not start. Gringo web app is still running.');
  });
  telegramLinkService.expireOldCodes().catch(() => {
    console.warn('[telegram] Link-code cleanup did not finish. Gringo web app is still running.');
  });
  lineLinkService.expireOldCodes().catch(() => {
    console.warn('[line] Link-code cleanup did not finish. Gringo web app is still running.');
  });
  const deliveries = [
    ['telegram', () => telegramDeliveryService.processPendingTelegramDeliveries()],
    ['whatsapp', () => whatsappDeliveryService.processPendingWhatsAppDeliveries()],
    ['line', () => lineDeliveryService.processPendingLineDeliveries()],
  ];
  for (const [channel, run] of deliveries) {
    const tick = () => run().catch(() => {
      console.warn(`[${channel}] Notification delivery did not finish. Gringo web app is still running.`);
    });
    tick();
    const interval = setInterval(tick, 60 * 1000);
    interval.unref?.();
    intervals.push(interval);
  }
}

// Order: durable privacy storage check -> CRM sheets -> listen -> polling,
// webhooks (served by app only after listen) and schedulers. Nothing that
// serves users starts if the check fails.
async function startServer(options = {}) {
  const production = options.production ?? isProductionRuntime();
  const verify = options.verifyPrivacyStorage || verifyPrivacyStorage;
  if (production) {
    await verify();
    console.log('[startup] Durable privacy storage verified (PrivacyConsents, PrivacyAudit).');
  }
  console.log(SINGLE_PROCESS_NOTICE);
  await crmAgentRepository.initializeMvpCrmSheets();
  await new Promise((resolve, reject) => {
    server = app.listen(options.port ?? env.port, () => resolve());
    server.once('error', reject);
  });
  console.log(`Gringo Community API is running on http://localhost:${server.address().port}`);
  (options.startBackgroundWork || startBackgroundWork)();
  return server;
}

function shutdown() {
  telegramUpdateService.stopPolling();
  intervals.forEach(clearInterval);
  if (!server) {
    process.exit(0);
    return;
  }
  server.close(() => process.exit(0));
}

if (require.main === module) {
  startServer().catch((error) => {
    const reason = error && error.name === 'PrivacyStorageError' ? error.message : 'CRM Google Sheets initialization failed.';
    console.error(`[startup] Refusing to start: ${reason}`);
    process.exit(1);
  });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { startServer, startBackgroundWork, SINGLE_PROCESS_NOTICE };
