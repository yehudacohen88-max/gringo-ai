const alertBox = document.querySelector('#listAlert');
const contactCount = document.querySelector('#contactCount');
const loadingState = document.querySelector('#loadingState');
const emptyState = document.querySelector('#emptyState');
const refreshButton = document.querySelector('#refreshButton');
const filtersForm = document.querySelector('#filtersForm');
const clearFiltersButton = document.querySelector('#clearFiltersButton');
const table = document.querySelector('#contactsTable');
const tableBody = document.querySelector('#contactsTableBody');
const editModal = document.querySelector('#editModal');
const editContactForm = document.querySelector('#editContactForm');
const closeEditButton = document.querySelector('#closeEditButton');
const saveEditButton = document.querySelector('#saveEditButton');

let currentContacts = [];

function showAlert(message, type = 'error') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.hidden = false;
}

function hideAlert() {
  alertBox.hidden = true;
  alertBox.textContent = '';
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatStatus(value) {
  return value ? value.replace(/_/g, ' ') : 'new';
}

function getFilters() {
  const formData = new FormData(filtersForm);
  const params = new URLSearchParams();

  formData.forEach((value, key) => {
    const cleanedValue = value.trim();

    if (cleanedValue) {
      params.set(key, cleanedValue);
    }
  });

  return params;
}

function formToContact(form) {
  const formData = new FormData(form);
  const contact = {};

  formData.forEach((value, key) => {
    contact[key] = value.trim();
  });

  return contact;
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value || '';
  row.appendChild(cell);
}

function appendStatusCell(row, value) {
  const cell = document.createElement('td');
  const status = document.createElement('span');
  status.className = 'status-pill';
  status.textContent = formatStatus(value);
  cell.appendChild(status);
  row.appendChild(cell);
}

function appendActionsCell(row, contact) {
  const cell = document.createElement('td');
  const actions = document.createElement('div');
  const editButton = document.createElement('button');
  const archiveButton = document.createElement('button');

  actions.className = 'row-actions';
  editButton.className = 'button button-secondary button-small';
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => openEditModal(contact));

  archiveButton.className = 'button button-danger button-small';
  archiveButton.type = 'button';
  archiveButton.textContent = 'Archive';
  archiveButton.disabled = contact.status === 'archived' || Boolean(contact.archived_at);
  archiveButton.addEventListener('click', () => archiveContact(contact.contact_id));

  actions.appendChild(editButton);
  actions.appendChild(archiveButton);
  cell.appendChild(actions);
  row.appendChild(cell);
}

function renderContacts(contacts) {
  tableBody.innerHTML = '';

  contacts.forEach((contact) => {
    const row = document.createElement('tr');
    const name = contact.display_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ');

    appendTextCell(row, name || 'Unnamed contact');
    appendTextCell(row, contact.email);
    appendTextCell(row, contact.phone);
    appendStatusCell(row, contact.status);
    appendTextCell(row, contact.source);
    appendTextCell(row, contact.country);
    appendTextCell(row, formatDate(contact.created_at));
    appendActionsCell(row, contact);

    tableBody.appendChild(row);
  });
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? 'Refreshing...' : 'Refresh';
  loadingState.hidden = !isLoading;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();

  if (!response.ok) {
    const details = body.error?.details?.length ? ` ${body.error.details.join(' ')}` : '';
    throw new Error(`${body.error?.message || 'Request failed.'}${details}`);
  }

  return body.data;
}

async function loadContacts() {
  hideAlert();
  setLoading(true);
  emptyState.hidden = true;
  table.hidden = true;

  try {
    const params = getFilters();
    const url = params.toString() ? `/api/contacts?${params.toString()}` : '/api/contacts';
    const contacts = await requestJson(url);

    currentContacts = contacts || [];
    contactCount.textContent = `${currentContacts.length} contact${currentContacts.length === 1 ? '' : 's'} found`;

    if (currentContacts.length === 0) {
      emptyState.hidden = false;
    } else {
      renderContacts(currentContacts);
      table.hidden = false;
    }
  } catch (error) {
    contactCount.textContent = 'Contacts could not be loaded';
    showAlert(error.message);
  } finally {
    setLoading(false);
  }
}

function openEditModal(contact) {
  editContactForm.reset();

  Array.from(editContactForm.elements).forEach((element) => {
    if (!element.name) return;
    element.value = contact[element.name] || '';
  });

  editModal.hidden = false;
}

function closeEditModal() {
  editModal.hidden = true;
}

async function updateContact(event) {
  event.preventDefault();
  hideAlert();

  const contact = formToContact(editContactForm);
  const contactId = contact.contact_id;
  delete contact.contact_id;

  saveEditButton.disabled = true;
  saveEditButton.textContent = 'Saving...';

  try {
    await requestJson(`/api/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(contact),
    });
    closeEditModal();
    showAlert('Contact updated successfully.', 'success');
    await loadContacts();
  } catch (error) {
    showAlert(error.message);
  } finally {
    saveEditButton.disabled = false;
    saveEditButton.textContent = 'Save changes';
  }
}

async function archiveContact(contactId) {
  const shouldArchive = window.confirm('Archive this contact? The contact will be hidden from active lists.');

  if (!shouldArchive) return;

  hideAlert();

  try {
    await requestJson(`/api/contacts/${encodeURIComponent(contactId)}/archive`, {
      method: 'POST',
    });
    showAlert('Contact archived successfully.', 'success');
    await loadContacts();
  } catch (error) {
    showAlert(error.message);
  }
}

filtersForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadContacts();
});

clearFiltersButton.addEventListener('click', () => {
  filtersForm.reset();
  loadContacts();
});

refreshButton.addEventListener('click', loadContacts);
closeEditButton.addEventListener('click', closeEditModal);
editContactForm.addEventListener('submit', updateContact);
loadContacts();
