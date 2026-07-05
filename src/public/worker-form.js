const workerForm = document.querySelector('#workerForm');
const workerFormFields = document.querySelector('#workerFormFields');
const workerAlert = document.querySelector('#workerFormAlert');
const saveWorkerButton = document.querySelector('#saveWorkerButton');
const workerLoading = document.querySelector('#workerFormLoading');

createWorkerFormFields(workerFormFields);

function showWorkerAlert(message, type = 'error') {
  workerAlert.textContent = message;
  workerAlert.className = `alert alert-${type}`;
  workerAlert.hidden = false;
}

function hideWorkerAlert() {
  workerAlert.hidden = true;
  workerAlert.textContent = '';
}

function getWorkerIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

function workerFormToPayload() {
  const payload = {};
  new FormData(workerForm).forEach((value, key) => {
    if (key !== 'worker_id') payload[key] = value.trim();
  });
  return payload;
}

function fillWorkerForm(worker) {
  Array.from(workerForm.elements).forEach((element) => {
    if (!element.name) return;
    element.value = worker[element.name] || '';
  });
}

async function requestWorkerJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    const details = body.error?.details?.length ? ` ${body.error.details.join(' ')}` : '';
    throw new Error(`${body.error?.message || 'Request failed.'}${details}`);
  }
  return body.data;
}

async function loadWorkerForEdit() {
  if (workerForm.dataset.mode !== 'edit') return;

  const workerId = getWorkerIdFromUrl();
  if (!workerId) {
    showWorkerAlert('Missing worker ID.');
    return;
  }

  try {
    const worker = await requestWorkerJson(`/api/workers/${encodeURIComponent(workerId)}`);
    fillWorkerForm(worker);
    workerForm.hidden = false;
  } catch (error) {
    showWorkerAlert(error.message);
  } finally {
    if (workerLoading) workerLoading.hidden = true;
  }
}

workerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideWorkerAlert();
  saveWorkerButton.disabled = true;
  saveWorkerButton.textContent = workerForm.dataset.mode === 'edit' ? 'Saving...' : 'Creating...';

  try {
    const payload = workerFormToPayload();
    const isEdit = workerForm.dataset.mode === 'edit';
    const workerId = getWorkerIdFromUrl();
    const url = isEdit ? `/api/workers/${encodeURIComponent(workerId)}` : '/api/workers';
    const method = isEdit ? 'PUT' : 'POST';
    await requestWorkerJson(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    showWorkerAlert(isEdit ? 'Worker updated successfully.' : 'Worker created successfully.', 'success');
    if (!isEdit) workerForm.reset();
  } catch (error) {
    showWorkerAlert(error.message);
  } finally {
    saveWorkerButton.disabled = false;
    saveWorkerButton.textContent = workerForm.dataset.mode === 'edit' ? 'Save changes' : 'Save worker';
  }
});

loadWorkerForEdit();
