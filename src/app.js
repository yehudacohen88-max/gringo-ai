const express = require('express');
const path = require('path');
const contactRoutes = require('./modules/contacts/contact.routes');
const workerRoutes = require('./modules/workers/worker.routes');
const { jobRoutes } = require('./modules/jobs');
const { housingRoutes } = require('./modules/housing');
const { moneyRoutes } = require('./modules/money');
const { communityRoutes } = require('./modules/community');
const { adminRoutes } = require('./modules/admin');
const { serviceRoutes } = require('./modules/services');
const { documentRoutes } = require('./modules/documents');
const { notificationRoutes, notificationService } = require('./modules/notifications');
const { taskRoutes } = require('./modules/tasks');
const { chatRoutes } = require('./modules/chat');
const { telegramRoutes } = require('./modules/telegram');
const { whatsappRoutes } = require('./modules/whatsapp');
const { lineRoutes } = require('./modules/line');
const { privacyRoutes } = require('./modules/privacy');
const { errorHandler } = require('./shared/errorHandler');
const { blockPersonalDataVariants } = require('./shared/blockPersonalDataRoute');

const app = express();

// Express would otherwise send X-Powered-By: Express.
app.disable('x-powered-by');
// Stay false. Rate limits read TRUST_PROXY_HOPS themselves. See clientIp.js.
app.set('trust proxy', false);

// Before body parsing and routers, so URL variants cannot reach a data store.
app.use(blockPersonalDataVariants);

app.use(
  express.json({
    // Preserve the original bytes. WhatsApp and LINE signatures are HMACs over
    // this buffer; JSON.stringify(req.body) is not the signed payload.
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'gringo-community-api',
  });
});

app.use('/api/contacts', contactRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/housing', housingRoutes);
app.use('/api/money', moneyRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/line', lineRoutes);
app.use('/api/privacy', privacyRoutes);

app.use(errorHandler);

notificationService.processScheduledNotifications().catch(() => {});
const notificationInterval = setInterval(() => {
  notificationService.processScheduledNotifications().catch(() => {});
}, 5 * 60 * 1000);
notificationInterval.unref?.();

module.exports = app;
