const contactService = require('./contact.service');

async function createContact(req, res, next) {
  try {
    const contact = await contactService.createContact(req.body);

    res.status(201).json({
      data: contact,
    });
  } catch (error) {
    next(error);
  }
}

async function getContacts(req, res, next) {
  try {
    const contacts = await contactService.getContacts(req.query);

    res.status(200).json({
      data: contacts,
    });
  } catch (error) {
    next(error);
  }
}

async function updateContact(req, res, next) {
  try {
    const contact = await contactService.updateContact(req.params.contactId, req.body);

    res.status(200).json({
      data: contact,
    });
  } catch (error) {
    next(error);
  }
}

async function archiveContact(req, res, next) {
  try {
    const contact = await contactService.archiveContact(req.params.contactId);

    res.status(200).json({
      data: contact,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  archiveContact,
  createContact,
  getContacts,
  updateContact,
};
