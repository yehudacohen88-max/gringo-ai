function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const SAMPLE_DOCUMENTS = [
  {
    documentId: 'doc_somchai_passport',
    userId: 'usr_somchai',
    documentType: 'Passport',
    documentNumber: '4821',
    issuingCountry: 'Thailand',
    issueDate: '',
    expiryDate: '2027-05-20',
    status: 'Valid',
    fileName: '',
    fileUrl: '',
    notes: 'Last four characters only.',
    reminderDaysBefore: '30',
    verified: 'No',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    documentId: 'doc_somchai_visa',
    userId: 'usr_somchai',
    documentType: 'Visa',
    documentNumber: '1198',
    issuingCountry: 'Israel',
    issueDate: '',
    expiryDate: daysFromNow(20),
    status: 'Expiring Soon',
    fileName: '',
    fileUrl: '',
    notes: 'Demo visa record.',
    reminderDaysBefore: '30',
    verified: 'No',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    documentId: 'doc_somchai_contract',
    userId: 'usr_somchai',
    documentType: 'Employment Contract',
    documentNumber: '',
    issuingCountry: 'Israel',
    issueDate: '',
    expiryDate: '',
    status: 'Valid',
    fileName: '',
    fileUrl: '',
    notes: 'Employment contract marked valid.',
    reminderDaysBefore: '30',
    verified: 'No',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

module.exports = { SAMPLE_DOCUMENTS };
