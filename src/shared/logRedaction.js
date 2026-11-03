function requestPath(req) {
  const raw = req && typeof req.originalUrl === 'string'
    ? req.originalUrl
    : req && typeof req.url === 'string'
      ? req.url
      : '';
  const path = String(raw).split('?')[0];
  return path || '/';
}

function redact(value) {
  let text = value === undefined || value === null ? '' : String(value);
  text = text.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted]');
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]');
  text = text.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
  text = text.replace(/\bgw_sid=[^;\s]+/gi, 'gw_sid=[redacted]');
  text = text.replace(
    /\b(?:cookie|set-cookie|authorization|x-admin-api-key|api[_-]?key|secret|token|password)\b\s*[:=]\s*\S+/gi,
    (match) => `${match.split(/[:=]/)[0]}=[redacted]`
  );
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
  text = text.replace(/\+\d{8,15}\b/g, '[redacted]');
  text = text.replace(/\b\d{10,15}\b/g, '[redacted]');
  text = text.replace(/(["'])(?:\\.|(?!\1).){8,}\1/g, '"[redacted]"');
  text = text.replace(/\b(?:[A-Za-z]{2,}[ \t]+){3,}[A-Za-z]{2,}\b/g, '[redacted]');
  text = text.replace(/[\u0590-\u05ff\u0600-\u06ff\u0e00-\u0e7f\u0d80-\u0dff\u0900-\u097f\u0400-\u04ff]{4,}/g, '[redacted]');
  return text;
}

function logServerError(error, req) {
  const method = req && req.method ? req.method : 'UNKNOWN';
  const path = requestPath(req);
  const name = error && error.name ? error.name : 'Error';
  const message = redact(error && error.message ? error.message : '');
  const stack = redact(error && error.stack ? error.stack : '');
  console.error(`[http] ${method} ${path} ${name}: ${message}\n${stack}`);
}

module.exports = {
  logServerError,
  redact,
  requestPath,
};
