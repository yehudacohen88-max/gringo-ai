const documentRepository = require('./document.repository');
const {
  ALLOWED_FILE_EXTENSIONS,
  DOCUMENT_CHANGE_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  REQUIRED_DOCUMENTS_BY_SECTOR,
} = require('./document.model');
const { SAMPLE_DOCUMENTS } = require('./sample-documents');

const memoryDocuments = [];
const memoryHistory = [];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function toDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function daysUntil(value) {
  const date = toDate(value);
  if (!date) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  date.setUTCHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function maskDocumentNumber(value) {
  const clean = cleanText(value).replace(/\s+/g, '');
  if (!clean) return '';
  const last4 = clean.slice(-4);
  return `****${last4}`;
}

function normalizeFileMetadata(file = {}) {
  const fileName = cleanText(file.fileName || file.name);
  if (!fileName) return { fileName: '', fileUrl: '' };

  const extension = fileName.split('.').pop().toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
    const error = new Error('Unsupported file type. Please use PDF, JPG, JPEG, or PNG.');
    error.statusCode = 400;
    throw error;
  }

  const size = Number(file.size || file.fileSize || 0);
  if (size > MAX_FILE_SIZE_BYTES) {
    const error = new Error('File is too large. Please use a file up to 10 MB.');
    error.statusCode = 400;
    throw error;
  }

  return {
    fileName,
    fileUrl: 'Local metadata only - file not uploaded',
  };
}

function calculateDocumentStatus(document = {}) {
  if (document.status === 'Archived') return 'Archived';
  if (!cleanText(document.documentType)) return 'Missing';
  if (!cleanText(document.expiryDate)) return cleanText(document.status) || 'Valid';

  const remainingDays = daysUntil(document.expiryDate);
  if (remainingDays === null) return cleanText(document.status) || 'Valid';
  if (remainingDays < 0) return 'Expired';
  if (remainingDays <= Number(document.reminderDaysBefore || 30)) return 'Expiring Soon';
  return 'Valid';
}

function buildDocument(input = {}) {
  const now = new Date().toISOString();
  const fileMetadata = normalizeFileMetadata(input.file || input);
  const document = {
    documentId: cleanText(input.documentId) || generateId('doc'),
    userId: cleanText(input.userId),
    documentType: cleanText(input.documentType),
    documentNumber: cleanText(input.documentNumber),
    issuingCountry: cleanText(input.issuingCountry),
    issueDate: cleanText(input.issueDate),
    expiryDate: cleanText(input.expiryDate),
    status: cleanText(input.status),
    fileName: fileMetadata.fileName || cleanText(input.fileName),
    fileUrl: fileMetadata.fileUrl || cleanText(input.fileUrl),
    notes: cleanText(input.notes),
    reminderDaysBefore: cleanText(input.reminderDaysBefore) || '30',
    verified: cleanText(input.verified) || 'No',
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: cleanText(input.updatedAt) || now,
  };
  document.status = calculateDocumentStatus(document);
  return document;
}

function validateDocument(document) {
  const errors = [];
  if (!document.userId) errors.push('userId is required.');
  if (!DOCUMENT_TYPES.includes(document.documentType)) errors.push('documentType is invalid.');
  if (!DOCUMENT_STATUSES.includes(document.status)) errors.push('status is invalid.');
  return errors;
}

function validationError(details) {
  const error = new Error('Document validation failed.');
  error.statusCode = 400;
  error.details = details;
  return error;
}

async function readDocumentsWithFallback() {
  try {
    const documents = await documentRepository.findAllDocuments();
    const source = documents.length ? documents : SAMPLE_DOCUMENTS;
    const byId = new Map(source.map((document) => [document.documentId, document]));
    memoryDocuments.forEach((document) => byId.set(document.documentId, document));
    return Array.from(byId.values());
  } catch (error) {
    const byId = new Map(SAMPLE_DOCUMENTS.map((document) => [document.documentId, document]));
    memoryDocuments.forEach((document) => byId.set(document.documentId, document));
    return Array.from(byId.values());
  }
}

function buildHistory(existing = {}, updated = {}, changeType = 'Updated') {
  const safeChangeType = DOCUMENT_CHANGE_TYPES.includes(changeType) ? changeType : 'Updated';
  return {
    historyId: generateId('dochist'),
    documentId: updated.documentId || existing.documentId,
    userId: updated.userId || existing.userId,
    previousExpiryDate: cleanText(existing.expiryDate),
    newExpiryDate: cleanText(updated.expiryDate),
    previousStatus: cleanText(existing.status),
    newStatus: cleanText(updated.status),
    changedAt: new Date().toISOString(),
    changeType: safeChangeType,
  };
}

async function recordHistory(existing, updated, changeType) {
  const history = buildHistory(existing, updated, changeType);
  try {
    return await documentRepository.appendHistory(history);
  } catch (error) {
    memoryHistory.push(history);
    return history;
  }
}

async function createDocument(input = {}) {
  const document = buildDocument(input);
  const errors = validateDocument(document);
  if (errors.length) throw validationError(errors);

  try {
    const created = await documentRepository.createDocument(document);
    await recordHistory({}, created, 'Created');
    return created;
  } catch (error) {
    memoryDocuments.push(document);
    await recordHistory({}, document, 'Created');
    return document;
  }
}

async function updateDocument(documentId, updates = {}) {
  const existing = await getDocumentById(documentId);
  if (!existing) return null;
  const changeType = cleanText(updates.changeType) || inferChangeType(existing, updates);
  const updated = buildDocument({
    ...existing,
    ...updates,
    documentId: existing.documentId,
    userId: existing.userId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });

  try {
    const saved = (await documentRepository.updateDocument(documentId, updated)) || updated;
    await recordHistory(existing, saved, changeType);
    return saved;
  } catch (error) {
    const memoryIndex = memoryDocuments.findIndex((document) => document.documentId === documentId);
    if (memoryIndex >= 0) memoryDocuments[memoryIndex] = updated;
    else memoryDocuments.push(updated);
    await recordHistory(existing, updated, changeType);
    return updated;
  }
}

function inferChangeType(existing, updates = {}) {
  if (updates.status === 'Archived') return 'Archived';
  if (updates.verified === 'Yes' && existing.verified !== 'Yes') return 'Verified';
  if (updates.status && updates.status !== existing.status) return 'Status Changed';
  return 'Updated';
}

async function getUserDocuments(userId) {
  const documents = await readDocumentsWithFallback();
  return documents
    .filter((document) => document.userId === userId && document.status !== 'Archived')
    .map((document) => ({ ...document, status: calculateDocumentStatus(document) }));
}

async function getAllDocuments() {
  const documents = await readDocumentsWithFallback();
  return documents.map((document) => ({ ...document, status: calculateDocumentStatus(document) }));
}

async function getDocumentById(documentId) {
  const documents = await readDocumentsWithFallback();
  const document = documents.find((item) => item.documentId === documentId);
  return document ? { ...document, status: calculateDocumentStatus(document) } : null;
}

async function getExpiringDocuments(userId, daysAhead = 30) {
  const documents = await getUserDocuments(userId);
  return documents.filter((document) => {
    const remaining = daysUntil(document.expiryDate);
    return remaining !== null && remaining >= 0 && remaining <= Number(daysAhead || 30);
  });
}

async function archiveDocument(documentId) {
  return updateDocument(documentId, { status: 'Archived', changeType: 'Archived' });
}

async function renewDocument(documentId, newExpiryDate) {
  return updateDocument(documentId, {
    expiryDate: cleanText(newExpiryDate),
    changeType: 'Renewed',
  });
}

function getRequiredDocuments(workSector) {
  return REQUIRED_DOCUMENTS_BY_SECTOR[workSector] || REQUIRED_DOCUMENTS_BY_SECTOR.Construction;
}

function getRequiredChecklist(userProfile = {}, documents = []) {
  const required = getRequiredDocuments(userProfile.workSector);
  const byType = new Map(documents.map((document) => [document.documentType, document]));
  return required.map((type) => {
    if (type === 'Training document if available') {
      return { documentType: type, status: byType.has(type) ? byType.get(type).status : 'Missing', optional: true };
    }
    const document = byType.get(type);
    return {
      documentType: type,
      status: document ? calculateDocumentStatus(document) : 'Missing',
      expiryDate: document?.expiryDate || '',
      documentId: document?.documentId || '',
    };
  });
}

function summarizeDocuments(userProfile = {}, documents = []) {
  const checklist = getRequiredChecklist(userProfile, documents);
  const missing = checklist.filter((item) => item.status === 'Missing' && !item.optional).map((item) => item.documentType);
  const expiring = documents.filter((document) => calculateDocumentStatus(document) === 'Expiring Soon');
  const expired = documents.filter((document) => calculateDocumentStatus(document) === 'Expired');
  const nextExpiry = documents
    .filter((document) => toDate(document.expiryDate))
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0];

  return {
    checklist,
    documentsComplete: missing.length === 0 && expired.length === 0 ? 'Yes' : 'No',
    missingDocumentTypes: missing.join(', '),
    expiringDocumentCount: String(expiring.length),
    expiredDocumentCount: String(expired.length),
    nextDocumentExpiryDate: nextExpiry?.expiryDate || '',
  };
}

function createDocumentAlerts(userProfile = {}, documents = [], limit = 3) {
  const alerts = [];
  const activeDocuments = documents.filter((document) => document.status !== 'Archived');
  const checklist = getRequiredChecklist(userProfile, activeDocuments);

  activeDocuments.forEach((document) => {
    const remaining = daysUntil(document.expiryDate);
    const status = calculateDocumentStatus(document);
    if (status === 'Expired') {
      alerts.push({
        alertId: `expired_${document.documentId}`,
        type: 'Expired',
        documentId: document.documentId,
        documentType: document.documentType,
        message: `Your ${document.documentType.toLowerCase()} is already expired.`,
        daysUntilExpiry: remaining,
      });
    } else if (status === 'Expiring Soon') {
      alerts.push({
        alertId: `expiring_${document.documentId}`,
        type: 'Expiring Soon',
        documentId: document.documentId,
        documentType: document.documentType,
        message: `Your ${document.documentType.toLowerCase()} expires in ${remaining} days.`,
        daysUntilExpiry: remaining,
      });
    }
  });

  checklist
    .filter((item) => item.status === 'Missing' && !item.optional)
    .forEach((item) => {
      alerts.push({
        alertId: `missing_${item.documentType.replace(/\s+/g, '_').toLowerCase()}`,
        type: 'Missing',
        documentId: '',
        documentType: item.documentType,
        message: `You have not added ${item.documentType.toLowerCase()} yet.`,
        daysUntilExpiry: '',
      });
    });

  const priority = { Expired: 1, 'Expiring Soon': 2, Missing: 3 };
  return alerts.sort((a, b) => (priority[a.type] || 9) - (priority[b.type] || 9)).slice(0, Number(limit || 3));
}

async function getDocumentHistory(documentId) {
  try {
    const history = await documentRepository.findAllHistory();
    const rows = history.length ? history : memoryHistory;
    return rows.filter((item) => item.documentId === documentId).sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
  } catch (error) {
    return memoryHistory.filter((item) => item.documentId === documentId).sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
  }
}

async function getUserDocumentHistory(userId) {
  try {
    const history = await documentRepository.findAllHistory();
    const rows = history.length ? history : memoryHistory;
    return rows.filter((item) => item.userId === userId).sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
  } catch (error) {
    return memoryHistory.filter((item) => item.userId === userId).sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
  }
}

function toSafeDocument(document = {}) {
  return {
    ...document,
    documentNumber: maskDocumentNumber(document.documentNumber),
    fileUrl: document.fileUrl ? 'Stored metadata only' : '',
  };
}

function buildAdminDocumentWarnings(profiles = [], documents = []) {
  const activeDocuments = documents.filter((document) => document.status !== 'Archived').map((document) => ({
    ...document,
    status: calculateDocumentStatus(document),
  }));
  const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));
  const docsByUser = new Map();
  activeDocuments.forEach((document) => {
    if (!docsByUser.has(document.userId)) docsByUser.set(document.userId, []);
    docsByUser.get(document.userId).push(document);
  });

  const missingRequiredDocuments = [];
  const usersWithNoPassport = [];
  const usersWithNoVisa = [];

  profiles.forEach((profile) => {
    const userDocs = docsByUser.get(profile.userId) || [];
    const checklist = getRequiredChecklist(profile, userDocs);
    checklist
      .filter((item) => item.status === 'Missing' && !item.optional)
      .forEach((item) => {
        missingRequiredDocuments.push({
          userId: profile.userId,
          userName: profile.fullName || profile.userId,
          documentType: item.documentType,
        });
      });
    if (!findDocumentByType(userDocs, 'Passport')) usersWithNoPassport.push(profile.fullName || profile.userId);
    if (!findDocumentByType(userDocs, 'Visa')) usersWithNoVisa.push(profile.fullName || profile.userId);
  });

  return {
    expiredDocuments: activeDocuments.filter((document) => document.status === 'Expired').map(toSafeDocument),
    expiringDocuments: activeDocuments.filter((document) => document.status === 'Expiring Soon').map(toSafeDocument),
    missingRequiredDocuments,
    underReviewDocuments: activeDocuments.filter((document) => document.status === 'Under Review').map(toSafeDocument),
    usersWithNoPassport,
    usersWithNoVisa,
    documents: activeDocuments.map((document) => ({
      ...toSafeDocument(document),
      userName: profileById.get(document.userId)?.fullName || document.userId,
    })),
  };
}

function formatDocumentsForChat(documents = [], summary = {}) {
  if (!documents.length) {
    return 'I do not have your document details yet. Please add the document type, last four characters if you want, and the expiry date.';
  }

  const lines = documents.map((document, index) => {
    return `${index + 1}. ${document.documentType}: ${calculateDocumentStatus(document)}${
      document.expiryDate ? `, expires ${document.expiryDate}` : ''
    }${document.documentNumber ? `, number ending ${document.documentNumber}` : ''}`;
  });

  return [
    'Here are your saved documents:',
    lines.join('\n'),
    summary.missingDocumentTypes ? `Missing required documents: ${summary.missingDocumentTypes}` : 'Required checklist: Complete',
  ].join('\n');
}

function findDocumentByType(documents = [], type = '') {
  const normalized = cleanText(type).toLowerCase();
  return documents.find((document) => document.documentType.toLowerCase() === normalized) || null;
}

module.exports = {
  archiveDocument,
  calculateDocumentStatus,
  createDocument,
  createDocumentAlerts,
  findDocumentByType,
  formatDocumentsForChat,
  getDocumentHistory,
  getDocumentById,
  getAllDocuments,
  getExpiringDocuments,
  getRequiredChecklist,
  getRequiredDocuments,
  getUserDocumentHistory,
  getUserDocuments,
  buildAdminDocumentWarnings,
  maskDocumentNumber,
  renewDocument,
  summarizeDocuments,
  toSafeDocument,
  updateDocument,
};
