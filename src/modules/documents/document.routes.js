const express = require('express');
const documentController = require('./document.controller');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');

const router = express.Router();

router.use(requireSameOrigin);
router.use(attachWebIdentity);

router.get('/', documentController.listDocuments);
router.get('/alerts', documentController.listAlerts);
router.get('/history', documentController.getHistory);
router.post('/', documentController.createDocument);
router.get('/:documentId/history', documentController.getHistory);
router.put('/:documentId', documentController.updateDocument);
router.post('/:documentId/renew', documentController.renewDocument);
router.post('/:documentId/archive', documentController.archiveDocument);

module.exports = router;
