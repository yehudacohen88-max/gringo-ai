const workersAlert = document.querySelector('#workersAlert');
const workerCount = document.querySelector('#workerCount');
const workersLoadingState = document.querySelector('#workersLoadingState');
const workersEmptyState = document.querySelector('#workersEmptyState');
const workersTable = document.querySelector('#workersTable');
const workersTableBody = document.querySelector('#workersTableBody');
const workerFiltersForm = document.querySelector('#workerFiltersForm');
const refreshWorkersButton = document.querySelector('#refreshWorkersButton');
const clearWorkerFiltersButton = document.querySelector('#clearWorkerFiltersButton');

function showWorkersAlert(message, type = 'error') {
  workersAlert.textContent = message;
  workersAlert.className = `alert alert-${type}`;
  workersAlert.hidden = false;
}

function hideWorkersAlert() {
  workersAlert.hidden = true;
  workersAlert.textContent = '';
}

function formatWorkerValue(value) {
  return value ? value.replace(/_/g, ' ') : '';
}

function getWorkerFilters() {
  const params = new URLSearchParams();
  new FormData(workerFiltersForm).forEach((value, key) => {
    const cleaned = value.trim();
    if (cleaned) params.set(key, cleaned);
  });
  return params;
}

async function requestWorkersJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'Request failed.');
  return body.data;
}

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value || '';
  row.appendChild(cell);
}

function appendWorkerActions(row, worker) {
  const cell = document.createElement('td');
  const actions = document.createElement('div');
  const editLink = document.createElement('a');
  const archiveButton = document.createElement('button');

  actions.className = 'row-actions';
  editLink.className = 'button button-secondary button-small';
  editLink.href = `/edit-worker.html?id=${encodeURIComponent(worker.worker_id)}`;
  editLink.textContent = 'Edit';

  archiveButton.className = 'button button-danger button-small';
  archiveButton.type = 'button';
  archiveButton.textContent = 'Archive';
  archiveButton.disabled = worker.status === 'archived' || Boolean(worker.archived_at);
  archiveButton.addEventListener('click', () => archiveWorker(worker.worker_id));

  actions.appendChild(editLink);
  actions.appendChild(archiveButton);
  cell.appendChild(actions);
  row.appendChild(cell);
}

function renderWorkers(workers) {
  workersTableBody.innerHTML = '';

  workers.forEach((worker) => {
    const row = document.createElement('tr');
    const name = [worker.first_name, worker.last_name].filter(Boolean).join(' ') || worker.nickname || 'Unnamed worker';

    appendCell(row, name);
    appendCell(row, worker.nationality);
    appendCell(row, worker.phone || worker.whatsapp);
    appendCell(row, worker.profession);
    appendCell(row, worker.current_city);
    appendCell(row, formatWorkerValue(worker.availability));
    appendCell(row, formatWorkerValue(worker.status));
    appendWorkerActions(row, worker);
    workersTableBody.appendChild(row);
  });
}

async function loadWorkers() {
  hideWorkersAlert();
  refreshWorkersButton.disabled = true;
  refreshWorkersButton.textContent = 'Refreshing...';
  workersLoadingState.hidden = false;
  workersEmptyState.hidden = true;
  workersTable.hidden = true;

  try {
    const params = getWorkerFilters();
    const url = params.toString() ? `/api/workers?${params.toString()}` : '/api/workers';
    const workers = await requestWorkersJson(url);
    workerCount.textContent = `${workers.length} worker${workers.length === 1 ? '' : 's'} found`;

    if (workers.length === 0) {
      workersEmptyState.hidden = false;
    } else {
      renderWorkers(workers);
      workersTable.hidden = false;
    }
  } catch (error) {
    workerCount.textContent = 'Workers could not be loaded';
    showWorkersAlert(error.message);
  } finally {
    refreshWorkersButton.disabled = false;
    refreshWorkersButton.textContent = 'Refresh';
    workersLoadingState.hidden = true;
  }
}

async function archiveWorker(workerId) {
  const confirmed = window.confirm('Archive this worker?');
  if (!confirmed) return;

  try {
    await requestWorkersJson(`/api/workers/${encodeURIComponent(workerId)}/archive`, { method: 'POST' });
    showWorkersAlert('Worker archived successfully.', 'success');
    await loadWorkers();
  } catch (error) {
    showWorkersAlert(error.message);
  }
}

workerFiltersForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadWorkers();
});
clearWorkerFiltersButton.addEventListener('click', () => {
  workerFiltersForm.reset();
  loadWorkers();
});
refreshWorkersButton.addEventListener('click', loadWorkers);
loadWorkers();
