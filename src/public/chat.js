const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const chatSendButton = document.querySelector('#chatSendButton');
const chatHistory = document.querySelector('#chatHistory');
const chatAlert = document.querySelector('#chatAlert');
const chatLoading = document.querySelector('#chatLoading');

const channelUserId = localStorage.getItem('gringoWebUserId') || `web_${Date.now()}`;
localStorage.setItem('gringoWebUserId', channelUserId);

function showError(message) {
  chatAlert.textContent = message;
  chatAlert.hidden = false;
}

function hideError() {
  chatAlert.hidden = true;
  chatAlert.textContent = '';
}

function addMessage(author, text) {
  const item = document.createElement('div');
  item.className = `chat-message chat-message-${author.toLowerCase()}`;
  item.textContent = `${author}: ${text}`;
  chatHistory.appendChild(item);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function sendMessage(message) {
  const response = await fetch('/api/chat/message', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message,
      channel: 'web',
      channelUserId,
    }),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message || 'Could not send message.');
  }

  return body;
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  const message = chatInput.value.trim();
  if (!message) return;

  addMessage('You', message);
  chatInput.value = '';
  chatSendButton.disabled = true;
  chatLoading.hidden = false;

  try {
    const result = await sendMessage(message);
    addMessage('Gringo', result.reply);
  } catch (error) {
    showError(error.message);
  } finally {
    chatSendButton.disabled = false;
    chatLoading.hidden = true;
    chatInput.focus();
  }
});
