const express = require('express');
const path = require('path');
const contactRoutes = require('./modules/contacts/contact.routes');
const workerRoutes = require('./modules/workers/worker.routes');
const { chatRoutes } = require('./modules/chat');
const { errorHandler } = require('./shared/errorHandler');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'gringo-community-api',
  });
});

app.use('/api/contacts', contactRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/chat', chatRoutes);

app.use(errorHandler);

module.exports = app;
