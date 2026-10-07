const DOCUMENT_FIELDS = [
  'documentId',
  'userId',
  'documentType',
  'documentNumber',
  'issuingCountry',
  'issueDate',
  'expiryDate',
  'status',
  'fileName',
  'fileUrl',
  'notes',
  'reminderDaysBefore',
  'verified',
  'createdAt',
  'updatedAt',
];

const DOCUMENT_TYPES = [
  'Passport',
  'Visa',
  'Work Permit',
  'Employment Contract',
  'Health Insurance',
  'Payslip',
  'Bank Document',
  'Residence Document',
  'Driving License',
  'Medical Document',
  'Other',
];

const DOCUMENT_STATUSES = ['Valid', 'Expiring Soon', 'Expired', 'Missing', 'Under Review', 'Archived'];
const DOCUMENT_HISTORY_FIELDS = [
  'historyId',
  'documentId',
  'userId',
  'previousExpiryDate',
  'newExpiryDate',
  'previousStatus',
  'newStatus',
  'changedAt',
  'changeType',
];
const DOCUMENT_CHANGE_TYPES = ['Created', 'Updated', 'Renewed', 'Archived', 'Verified', 'Status Changed'];

const REQUIRED_DOCUMENTS_BY_SECTOR = {
  Construction: ['Passport', 'Visa', 'Work Permit', 'Employment Contract', 'Health Insurance'],
  Agriculture: ['Passport', 'Visa', 'Work Permit', 'Employment Contract', 'Health Insurance'],
  Caregiving: ['Passport', 'Visa', 'Work Permit', 'Employment Contract', 'Health Insurance', 'Training document if available'],
};

const ALLOWED_FILE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

module.exports = {
  ALLOWED_FILE_EXTENSIONS,
  DOCUMENT_CHANGE_TYPES,
  DOCUMENT_FIELDS,
  DOCUMENT_HISTORY_FIELDS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  REQUIRED_DOCUMENTS_BY_SECTOR,
};
