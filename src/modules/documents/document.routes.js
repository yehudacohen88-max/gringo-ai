const express = require('express');
const documentController = require('./document.controller');

const router = express.Router();

router.get('/', documentController.listDocuments);
router.get('/alerts', documentController.listAlerts);
router.get('/history', documentController.getHistory);
router.post('/', documentController.createDocument);
router.get('/:documentId/history', documentController.getHistory);
router.put('/:documentId', documentController.updateDocument);
router.post('/:documentId/renew', documentController.renewDocument);
router.post('/:documentId/archive', documentController.archiveDocument);

module.exports = router;
