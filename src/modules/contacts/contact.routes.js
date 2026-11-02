const express = require('express');
const contactController = require('./contact.controller');
const { requireAdminKey } = require('../../shared/requireAdminKey');

const router = express.Router();

router.use(requireAdminKey);

router.get('/', contactController.getContacts);
router.post('/', contactController.createContact);
router.put('/:contactId', contactController.updateContact);
router.post('/:contactId/archive', contactController.archiveContact);

module.exports = router;
