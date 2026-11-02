// Operator-typed admin API key for this page.
// The value lives in this variable and the password field only.
// It is sent as the x-admin-api-key header and is never written anywhere else.
let adminApiKeyMemory = '';

function bindAdminApiKeyInput(input) {
  if (!input) return;
  const remember = () => {
    adminApiKeyMemory = String(input.value || '').trim();
  };
  input.addEventListener('input', remember);
  input.addEventListener('change', remember);
  remember();
}

function adminApiKeyHeaders(extraHeaders) {
  const input = document.querySelector('#adminApiKey');
  if (input) adminApiKeyMemory = String(input.value || '').trim();
  return {
    'x-admin-api-key': adminApiKeyMemory,
    ...(extraHeaders || {}),
  };
}

function adminRequestErrorMessage(response, body) {
  if (response && (response.status === 401 || response.status === 403)) {
    return 'Admin API key was rejected. Type the key into the Admin API key field and try again. It stays on this page only and is not saved in the browser.';
  }
  const details = body && body.error && Array.isArray(body.error.details) && body.error.details.length
    ? ` ${body.error.details.join(' ')}`
    : '';
  const message = body && body.error && body.error.message ? body.error.message : 'Request failed.';
  return `${message}${details}`;
}
