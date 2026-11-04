const { messageFor } = require('./userFacingCopy');

// Pilot catalog policy for jobs, housing, services, money, and community.
// Demo rows are a development aid only. They are never written to Sheets and
// never returned as real pilot data.
//
// GRINGO_DEMO_DATA=true enables labelled demo rows in development and test.
// NODE_ENV=production and hosted runtimes ignore that flag.
// GRINGO_MODULE_<NAME>_ENABLED=false hides one module. Unset means enabled.
const MODULES = Object.freeze(['jobs', 'housing', 'services', 'money', 'community']);
const DEMO_ENV = 'GRINGO_DEMO_DATA';
const HOSTING_ENV_MARKERS = Object.freeze([
  'VERCEL',
  'RENDER',
  'RAILWAY_ENVIRONMENT',
  'FLY_APP_NAME',
  'K_SERVICE',
  'DYNO',
  'HEROKU_APP_NAME',
  'AWS_EXECUTION_ENV',
]);

const STATE_KEYS = Object.freeze({
  empty: 'catalogEmpty',
  unavailable: 'catalogUnavailable',
  disabled: 'catalogDisabled',
  demo: 'catalogDemo',
});

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function flagOn(value) {
  return ['1', 'true', 'yes', 'on'].includes(cleanText(value).toLowerCase());
}

function flagOff(value) {
  return ['0', 'false', 'no', 'off'].includes(cleanText(value).toLowerCase());
}

function envPresent(name) {
  return cleanText(process.env[name]) !== '';
}

function isHostedRuntime() {
  return HOSTING_ENV_MARKERS.some((name) => envPresent(name));
}

function isProductionRuntime() {
  return cleanText(process.env.NODE_ENV).toLowerCase() === 'production' || isHostedRuntime();
}

function demoDataEnabled() {
  if (isProductionRuntime()) return false;
  return flagOn(process.env[DEMO_ENV]);
}

function moduleEnvName(moduleName) {
  return `GRINGO_MODULE_${cleanText(moduleName).toUpperCase()}_ENABLED`;
}

function moduleEnabled(moduleName) {
  const value = process.env[moduleEnvName(moduleName)];
  if (value === undefined || cleanText(value) === '') return true;
  return !flagOff(value);
}

function sampleIdSet(samples, idFields) {
  const ids = new Set();
  for (const sample of samples || []) {
    for (const field of idFields || []) {
      const id = cleanText(sample && sample[field]);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function isDemoRecord(record, samples = [], idFields = []) {
  if (!record || typeof record !== 'object') return false;
  if (record.demo === true || record.dataSource === 'demo') return true;
  const ids = sampleIdSet(samples, idFields);
  return (idFields || []).some((field) => ids.has(cleanText(record[field])));
}

function labelDemoRecords(samples) {
  return (samples || []).map((record) => ({
    ...record,
    demo: true,
    dataSource: 'demo',
    demoLabel: 'Demo data only. This is not a live listing, rate, or confirmed offer.',
  }));
}

function tagCatalog(list, state, demo) {
  const items = Array.isArray(list) ? list.slice() : [];
  Object.defineProperty(items, 'catalogState', { value: state, enumerable: false });
  Object.defineProperty(items, 'catalogDemo', { value: Boolean(demo), enumerable: false });
  return items;
}

function catalogMeta(value) {
  if (!value || typeof value !== 'object') return { state: 'ok', demo: false };
  return {
    state: value.catalogState || 'ok',
    demo: value.catalogDemo === true,
  };
}

function carryCatalog(source, target) {
  const meta = catalogMeta(source);
  if (!source || !source.catalogState) return target;
  return tagCatalog(target, meta.state, meta.demo);
}

function refuseDemoWrite(record, samples, idFields) {
  if (!isDemoRecord(record, samples, idFields)) return;
  const error = new Error('Demo records are not stored.');
  error.statusCode = 400;
  error.code = 'DEMO_NOT_STORED';
  error.details = [];
  throw error;
}

// Personal records (tasks, documents) keep the caller's own in-memory rows
// when a sheet write could not be stored. Sample rows stay out of that set.
async function readPersonalCatalog({ read, samples = [], idFields = ['id'], localRecords = [] }) {
  let sheetError = false;
  let rows = [];
  try {
    const result = await read();
    rows = Array.isArray(result) ? result : [];
  } catch (error) {
    sheetError = true;
  }

  const idField = idFields[0];
  const records = [];
  const seen = new Set();
  for (const row of [...rows, ...(localRecords || [])]) {
    if (!row || typeof row !== 'object') continue;
    if (isDemoRecord(row, samples, idFields)) continue;
    const id = cleanText(row[idField]);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    records.push(row);
  }

  if (records.length) return { state: sheetError ? 'unavailable' : 'ok', records, demo: false };
  if (demoDataEnabled()) return { state: 'demo', records: labelDemoRecords(samples), demo: true };
  return { state: sheetError ? 'unavailable' : 'empty', records: [], demo: false };
}

async function readPilotCatalog({ moduleName, read, samples = [], idFields = [] }) {
  if (!moduleEnabled(moduleName)) {
    return { state: 'disabled', records: [], demo: false };
  }

  let rows;
  try {
    rows = await read();
  } catch (error) {
    if (demoDataEnabled()) {
      return { state: 'demo', records: labelDemoRecords(samples), demo: true };
    }
    return { state: 'unavailable', records: [], demo: false };
  }

  if (!Array.isArray(rows)) {
    return demoDataEnabled()
      ? { state: 'demo', records: labelDemoRecords(samples), demo: true }
      : { state: 'unavailable', records: [], demo: false };
  }

  const real = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (isDemoRecord(row, samples, idFields)) continue;
    real.push(row);
  }

  if (real.length) return { state: 'ok', records: real, demo: false };
  if (demoDataEnabled()) return { state: 'demo', records: labelDemoRecords(samples), demo: true };
  return { state: 'empty', records: [], demo: false };
}

function catalogMessage(state, language, { assistant = false } = {}) {
  if (state === 'empty' && assistant) {
    return `${messageFor(language, 'catalogEmpty')} ${messageFor(language, 'catalogNoInformation')}`;
  }
  const key = STATE_KEYS[state];
  return key ? messageFor(language, key) : '';
}

function assistantCatalogReply(state, language) {
  return catalogMessage(state, language, { assistant: true });
}

function visibleCatalogState(list) {
  const meta = catalogMeta(list);
  if ((!list || !list.length) && (meta.state === 'ok' || meta.state === 'demo')) return 'empty';
  return meta.state || 'empty';
}

function catalogListReply(list, language) {
  const meta = catalogMeta(list);
  if (meta.state === 'disabled' || meta.state === 'unavailable') {
    return { blocked: assistantCatalogReply(meta.state, language) };
  }
  if (!list || !list.length) return { blocked: assistantCatalogReply('empty', language) };
  if (meta.demo || list.some((item) => item && item.demo)) return { prefix: catalogMessage('demo', language) };
  return {};
}

function publicCatalogFields(list, language) {
  const meta = catalogMeta(list);
  const state = visibleCatalogState(list);
  const showDemo = Boolean(meta.demo && list && list.length && state === 'demo');
  return {
    availability: state,
    demo: showDemo,
    message: state === 'ok' ? '' : catalogMessage(showDemo ? 'demo' : state, language),
    ...(showDemo ? { demoNotice: catalogMessage('demo', language) } : {}),
  };
}

module.exports = {
  DEMO_ENV,
  MODULES,
  assistantCatalogReply,
  carryCatalog,
  catalogListReply,
  catalogMessage,
  catalogMeta,
  demoDataEnabled,
  isDemoRecord,
  isProductionRuntime,
  labelDemoRecords,
  moduleEnabled,
  moduleEnvName,
  publicCatalogFields,
  readPersonalCatalog,
  readPilotCatalog,
  refuseDemoWrite,
  tagCatalog,
  visibleCatalogState,
};
