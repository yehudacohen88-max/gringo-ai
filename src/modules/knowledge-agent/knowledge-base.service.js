const fs = require('fs');
const path = require('path');

const KNOWLEDGE_BASE_DIR = path.join(__dirname, 'knowledge-base');

function normalize(value) {
  return String(value || '').toLowerCase();
}

function loadKnowledgeItems() {
  const files = fs.readdirSync(KNOWLEDGE_BASE_DIR).filter((file) => file.endsWith('.json'));

  return files.flatMap((file) => {
    const filePath = path.join(KNOWLEDGE_BASE_DIR, file);
    const contents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(contents);
  });
}

function scoreKnowledgeItem(item, question, category) {
  const normalizedQuestion = normalize(question);
  const normalizedCategory = normalize(category);
  let score = 0;

  if (normalize(item.category) === normalizedCategory) {
    score += 3;
  }

  item.keywords.forEach((keyword) => {
    if (normalizedQuestion.includes(normalize(keyword))) {
      score += 2;
    }
  });

  if (normalizedQuestion.includes(normalize(item.title))) {
    score += 2;
  }

  if (normalize(item.question).split(' ').some((word) => word.length > 3 && normalizedQuestion.includes(word))) {
    score += 1;
  }

  return score;
}

async function searchKnowledgeBase(classifiedQuestion) {
  const question = String(classifiedQuestion?.questionContext?.question || '');
  const category = classifiedQuestion?.category || 'Other';
  const matches = loadKnowledgeItems()
    .map((item) => ({
      item,
      score: scoreKnowledgeItem(item, question, category),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length > 0) {
    const bestMatch = matches[0].item;

    return {
      status: 'FOUND',
      matches: matches.map((match) => match.item.id),
      answer: bestMatch.answer,
      category: bestMatch.category,
      item: bestMatch,
      classifiedQuestion,
    };
  }

  if (/\b(human|person|team)\b/.test(normalize(question))) {
    return {
      status: 'NEEDS_HUMAN',
      matches: [],
      answer: '',
      category,
      classifiedQuestion,
    };
  }

  return {
    status: 'NOT_FOUND',
    matches: [],
    answer: '',
    category,
    classifiedQuestion,
  };
}

module.exports = {
  loadKnowledgeItems,
  scoreKnowledgeItem,
  searchKnowledgeBase,
};
