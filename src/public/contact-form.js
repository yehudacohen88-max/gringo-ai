const form = document.querySelector('#contactForm');
const alertBox = document.querySelector('#formAlert');
const submitButton = document.querySelector('#submitButton');

bindAdminApiKeyInput(document.querySelector('#adminApiKey'));

function showAlert(message, type) {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.hidden = false;
}

function hideAlert() {
  alertBox.hidden = true;
  alertBox.textContent = '';
}

function formToContact(formData) {
  const contact = {};

  formData.forEach((value, key) => {
    const cleanedValue = value.trim();

    if (cleanedValue) {
      contact[key] = cleanedValue;
    }
  });

  return contact;
}

async function createContact(contact) {
  const response = await fetch('/api/contacts', {
    method: 'POST',
    headers: adminApiKeyHeaders({
      'content-type': 'application/json',
    }),
    body: JSON.stringify(contact),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(adminRequestErrorMessage(response, body));
  }

  return body.data;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert();

  const contact = formToContact(new FormData(form));
  submitButton.disabled = true;
  submitButton.textContent = 'Saving...';

  try {
    await createContact(contact);
    form.reset();
    showAlert('Contact saved. You can add another contact or open the contact list.', 'success');
  } catch (error) {
    showAlert(error.message, 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Save contact';
  }
});
