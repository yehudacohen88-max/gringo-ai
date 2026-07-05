function uniqueList(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function splitInterests(value) {
  return String(value || '')
    .split(',')
    .map((interest) => interest.trim())
    .filter(Boolean);
}

function extractMemorySignals(message = '') {
  const normalized = String(message).toLowerCase();
  const interests = [];

  if (/\b(job|jobs|work|worker|working)\b/.test(normalized)) {
    interests.push('Jobs');
  }

  if (/\b(money|rate|rates|exchange|transfer)\b/.test(normalized)) {
    interests.push('Money Transfer');
  }

  if (/\b(house|housing|rent|apartment)\b/.test(normalized)) {
    interests.push('Housing');
  }

  if (/\b(rights|visa|document|documents)\b/.test(normalized)) {
    interests.push('Rights/Documents');
  }

  return {
    interests: uniqueList(interests),
  };
}

function mergeInterests(existingInterests, newInterests) {
  return uniqueList([...splitInterests(existingInterests), ...newInterests]).join(',');
}

module.exports = {
  extractMemorySignals,
  mergeInterests,
};
