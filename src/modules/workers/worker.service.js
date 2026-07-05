const { WORKER_DEFAULTS } = require('./worker.model');
const workerRepository = require('./worker.repository');
const { validateWorker } = require('./worker.validation');

const EDITABLE_WORKER_FIELDS = [
  'first_name',
  'last_name',
  'nickname',
  'nationality',
  'native_language',
  'phone',
  'whatsapp',
  'telegram',
  'line',
  'passport_number',
  'visa_type',
  'visa_expiration',
  'profession',
  'skills',
  'years_experience',
  'current_employer',
  'previous_employers',
  'current_city',
  'availability',
  'status',
  'notes',
  'documents',
  'tags',
];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function cleanList(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).join(',');
  }

  return cleanText(value);
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function normalizeWorkerInput(input = {}) {
  return {
    first_name: cleanText(input.first_name),
    last_name: cleanText(input.last_name),
    nickname: cleanText(input.nickname),
    nationality: cleanText(input.nationality),
    native_language: cleanText(input.native_language),
    phone: cleanText(input.phone),
    whatsapp: cleanText(input.whatsapp),
    telegram: cleanText(input.telegram).replace(/^@/, ''),
    line: cleanText(input.line),
    passport_number: cleanText(input.passport_number),
    visa_type: cleanText(input.visa_type) || WORKER_DEFAULTS.visa_type,
    visa_expiration: cleanText(input.visa_expiration),
    profession: cleanText(input.profession),
    skills: cleanList(input.skills),
    years_experience: cleanText(input.years_experience),
    current_employer: cleanText(input.current_employer),
    previous_employers: cleanList(input.previous_employers),
    current_city: cleanText(input.current_city),
    availability: cleanText(input.availability) || WORKER_DEFAULTS.availability,
    status: cleanText(input.status) || WORKER_DEFAULTS.status,
    notes: cleanText(input.notes),
    documents: cleanList(input.documents),
    tags: cleanList(input.tags),
  };
}

function buildWorker(input = {}) {
  const now = new Date().toISOString();

  return {
    ...WORKER_DEFAULTS,
    ...normalizeWorkerInput(input),
    worker_id: generateId('wrk'),
    created_at: now,
    updated_at: now,
    archived_at: '',
  };
}

function buildHistory({ workerId, eventType, title, description, oldValue = '', newValue = '' }) {
  return {
    history_id: generateId('whis'),
    worker_id: workerId,
    event_type: eventType,
    title,
    description,
    old_value: oldValue,
    new_value: newValue,
    actor_type: 'system',
    created_at: new Date().toISOString(),
  };
}

function validationError(errors) {
  const error = new Error('Worker validation failed.');
  error.statusCode = 400;
  error.details = errors;
  return error;
}

function notFoundError() {
  const error = new Error('Worker not found.');
  error.statusCode = 404;
  return error;
}

function filterWorkers(workers, filters = {}) {
  const search = cleanText(filters.search).toLowerCase();
  const status = cleanText(filters.status);
  const nationality = cleanText(filters.nationality).toLowerCase();
  const profession = cleanText(filters.profession).toLowerCase();
  const city = cleanText(filters.current_city || filters.city).toLowerCase();
  const availability = cleanText(filters.availability);

  return workers.filter((worker) => {
    if (!status && worker.archived_at) return false;
    if (status && worker.status !== status) return false;
    if (availability && worker.availability !== availability) return false;
    if (nationality && cleanText(worker.nationality).toLowerCase() !== nationality) return false;
    if (profession && !cleanText(worker.profession).toLowerCase().includes(profession)) return false;
    if (city && cleanText(worker.current_city).toLowerCase() !== city) return false;

    if (search) {
      const searchable = [
        worker.first_name,
        worker.last_name,
        worker.nickname,
        worker.phone,
        worker.whatsapp,
        worker.telegram,
        worker.line,
        worker.profession,
        worker.skills,
        worker.passport_number,
      ]
        .map((value) => cleanText(value).toLowerCase())
        .join(' ');

      if (!searchable.includes(search)) return false;
    }

    return true;
  });
}

async function createWorker(input = {}) {
  const errors = validateWorker(input);
  if (errors.length > 0) throw validationError(errors);

  const worker = buildWorker(input);
  const history = buildHistory({
    workerId: worker.worker_id,
    eventType: 'worker_created',
    title: 'Worker created',
    description: 'Worker profile was created.',
  });

  await workerRepository.createWorker(worker);
  await workerRepository.createWorkerHistory(history);

  return worker;
}

async function getWorkers(filters = {}) {
  const workers = await workerRepository.findAllWorkers();
  return filterWorkers(workers, filters);
}

async function getWorker(workerId) {
  const record = await workerRepository.findWorkerRecordById(workerId);
  if (!record) throw notFoundError();
  return record.worker;
}

async function updateWorker(workerId, input = {}) {
  const record = await workerRepository.findWorkerRecordById(workerId);
  if (!record) throw notFoundError();

  const updateInput = EDITABLE_WORKER_FIELDS.reduce((payload, field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      payload[field] = input[field];
    }
    return payload;
  }, {});
  const nextWorker = {
    ...record.worker,
    ...normalizeWorkerInput({
      ...record.worker,
      ...updateInput,
    }),
    worker_id: record.worker.worker_id,
    created_at: record.worker.created_at,
    updated_at: new Date().toISOString(),
    archived_at: record.worker.archived_at,
  };

  if (record.worker.archived_at) {
    nextWorker.status = 'archived';
  }

  const errors = validateWorker(nextWorker);
  if (errors.length > 0) throw validationError(errors);

  const history = buildHistory({
    workerId,
    eventType: 'worker_updated',
    title: 'Worker updated',
    description: 'Worker profile was updated.',
  });

  await workerRepository.updateWorker(record.rowNumber, nextWorker);
  await workerRepository.createWorkerHistory(history);

  return nextWorker;
}

async function archiveWorker(workerId) {
  const record = await workerRepository.findWorkerRecordById(workerId);
  if (!record) throw notFoundError();

  const now = new Date().toISOString();
  const archivedWorker = {
    ...record.worker,
    status: 'archived',
    updated_at: now,
    archived_at: now,
  };
  const history = buildHistory({
    workerId,
    eventType: 'worker_archived',
    title: 'Worker archived',
    description: 'Worker profile was archived.',
    oldValue: record.worker.status || '',
    newValue: 'archived',
  });

  await workerRepository.updateWorker(record.rowNumber, archivedWorker);
  await workerRepository.createWorkerHistory(history);

  return archivedWorker;
}

module.exports = {
  archiveWorker,
  createWorker,
  getWorker,
  getWorkers,
  updateWorker,
};
