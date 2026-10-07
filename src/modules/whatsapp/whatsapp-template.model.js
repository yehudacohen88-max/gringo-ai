const WHATSAPP_TEMPLATE_FIELDS = [
  'templateId',
  'internalName',
  'metaTemplateName',
  'languageCode',
  'notificationType',
  'status',
  'parameterMapping',
  'createdAt',
  'updatedAt',
];

const WHATSAPP_TEMPLATE_STATUSES = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Disabled'];

module.exports = {
  WHATSAPP_TEMPLATE_FIELDS,
  WHATSAPP_TEMPLATE_STATUSES,
};
