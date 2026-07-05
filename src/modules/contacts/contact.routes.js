const express = require('express');
const contactController = require('./contact.controller');

const router = express.Router();

router.get('/', contactController.getContacts);
router.post('/', contactController.createContact);
router.put('/:contactId', contactController.updateContact);
router.post('/:contactId/archive', contactController.archiveContact);

module.exports = router;
