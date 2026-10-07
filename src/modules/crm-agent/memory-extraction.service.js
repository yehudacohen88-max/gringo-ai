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

  if (/\b(job|jobs|work|worker|working)\b|\u05e2\u05d1\u05d5\u05d3|\u05de\u05e9\u05e8\u05d4|\u05ea\u05e2\u05e1\u05d5\u05e7\u05d4/.test(normalized)) {
    interests.push('Jobs');
  }

  if (/\b(money|rate|rates|exchange|transfer)\b|\u05db\u05e1\u05e3|\u05d4\u05e2\u05d1\u05e8\u05d4|\u05e9\u05e2\u05e8|\u05de\u05d8\u05d1\u05e2/.test(normalized)) {
    interests.push('Money Transfer');
  }

  if (/\b(house|housing|rent|apartment|room)\b|\u05d3\u05d9\u05e8\u05d4|\u05d7\u05d3\u05e8|\u05e9\u05db\u05d9\u05e8\u05d5\u05ea|\u05de\u05d2\u05d5\u05e8\u05d9\u05dd/.test(normalized)) {
    interests.push('Housing');
  }

  if (/\b(rights|visa|document|documents|salary|pay|paid|employer)\b|\u05d6\u05db\u05d5\u05d9\u05d5\u05ea|\u05e9\u05db\u05e8|\u05de\u05e1\u05de\u05da|\u05d5\u05d9\u05d6\u05d4/.test(normalized)) {
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
