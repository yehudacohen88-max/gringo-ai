const { KNOWLEDGE_CATEGORIES } = require('./knowledge-agent.constants');

async function classifyQuestion(questionContext) {
  const question = String(questionContext?.question || '').toLowerCase();
  let category = 'Other';

  if (/\b(job|jobs|work|worker|working)\b|\u05e2\u05d1\u05d5\u05d3|\u05de\u05e9\u05e8\u05d4|\u05ea\u05e2\u05e1\u05d5\u05e7\u05d4/.test(question)) category = 'Jobs FAQ';
  else if (/\b(house|housing|rent|apartment|room)\b|\u05d3\u05d9\u05e8\u05d4|\u05d7\u05d3\u05e8|\u05e9\u05db\u05d9\u05e8\u05d5\u05ea|\u05d1\u05d9\u05ea|\u05de\u05d2\u05d5\u05e8\u05d9\u05dd/.test(question)) category = 'Housing';
  else if (/\b(money|transfer)\b|\u05db\u05e1\u05e3|\u05d4\u05e2\u05d1\u05e8\u05d4|\u05dc\u05d4\u05e2\u05d1\u05d9\u05e8/.test(question)) category = 'Money Transfer Companies';
  else if (/\b(exchange|rate|rates)\b|\u05e9\u05e2\u05e8|\u05de\u05d8\u05d1\u05e2|\u05d7\u05dc\u05d9\u05e4\u05d9\u05df/.test(question)) category = 'Exchange Rates';
  else if (/\b(rights|salary|law|legal|pay|paid|employer)\b|\u05d6\u05db\u05d5\u05d9\u05d5\u05ea|\u05e9\u05db\u05e8|\u05d7\u05d5\u05e7|\u05de\u05e9\u05e4\u05d8/.test(question)) category = 'Workers Rights';
  else if (/\b(document|documents|visa|passport)\b|\u05de\u05e1\u05de\u05da|\u05de\u05e1\u05de\u05db\u05d9\u05dd|\u05d5\u05d9\u05d6\u05d4|\u05d3\u05e8\u05db\u05d5\u05df/.test(question)) category = 'Documents';
  else if (/\b(doctor|health|healthcare|clinic|hospital)\b|\u05e8\u05d5\u05e4\u05d0|\u05d1\u05e8\u05d9\u05d0\u05d5\u05ea|\u05de\u05e8\u05e4\u05d0\u05d4|\u05d1\u05d9\u05ea \u05d7\u05d5\u05dc\u05d9\u05dd/.test(question)) category = 'Healthcare';
  else if (/\b(emergency|police|ambulance|fire)\b|\u05d7\u05d9\u05e8\u05d5\u05dd|\u05de\u05e9\u05d8\u05e8\u05d4|\u05d0\u05de\u05d1\u05d5\u05dc\u05e0\u05e1|\u05db\u05d9\u05d1\u05d5\u05d9/.test(question)) category = 'Emergency Numbers';
  else if (/\b(food|eat|restaurant)\b|\u05d0\u05d5\u05db\u05dc|\u05de\u05e1\u05e2\u05d3\u05d4|\u05dc\u05d0\u05db\u05d5\u05dc/.test(question)) category = 'Food';
  else if (/\b(shop|shopping|buy)\b|\u05e7\u05e0\u05d9\u05d5\u05ea|\u05dc\u05e7\u05e0\u05d5\u05ea|\u05d7\u05e0\u05d5\u05ea/.test(question)) category = 'Shopping';
  else if (/\b(bus|train|transport|transportation|taxi)\b|\u05d0\u05d5\u05d8\u05d5\u05d1\u05d5\u05e1|\u05e8\u05db\u05d1\u05ea|\u05ea\u05d7\u05d1\u05d5\u05e8\u05d4|\u05de\u05d5\u05e0\u05d9\u05ea/.test(question)) category = 'Transportation';
  else if (/\b(community|event|friends|group)\b|\u05e7\u05d4\u05d9\u05dc\u05d4|\u05d0\u05d9\u05e8\u05d5\u05e2|\u05d7\u05d1\u05e8\u05d9\u05dd|\u05e7\u05d1\u05d5\u05e6\u05d4/.test(question)) category = 'Community';
  else if (/\b(news|update|today)\b|\u05d7\u05d3\u05e9\u05d5\u05ea|\u05e2\u05d3\u05db\u05d5\u05df|\u05d4\u05d9\u05d5\u05dd/.test(question)) category = 'News';

  return {
    status: 'classified',
    category,
    availableCategories: KNOWLEDGE_CATEGORIES,
    questionContext,
  };
}

module.exports = {
  classifyQuestion,
};
