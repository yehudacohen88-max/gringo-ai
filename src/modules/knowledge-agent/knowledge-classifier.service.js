const { KNOWLEDGE_CATEGORIES } = require('./knowledge-agent.constants');

async function classifyQuestion(questionContext) {
  const question = String(questionContext?.question || '').toLowerCase();
  let category = 'Other';

  if (/\b(job|jobs|work|worker|working)\b|עבוד|משרה|תעסוקה/.test(question)) category = 'Jobs FAQ';
  else if (/\b(house|housing|rent|apartment)\b|דירה|שכירות|בית|מגורים/.test(question)) category = 'Housing';
  else if (/\b(money|transfer)\b|כסף|העברה|להעביר/.test(question)) category = 'Money Transfer Companies';
  else if (/\b(exchange|rate|rates)\b|שער|מטבע|חליפין/.test(question)) category = 'Exchange Rates';
  else if (/\b(rights|salary|law|legal)\b|זכויות|שכר|חוק|משפט/.test(question)) category = 'Workers Rights';
  else if (/\b(document|documents|visa|passport)\b|מסמך|מסמכים|ויזה|דרכון/.test(question)) category = 'Documents';
  else if (/\b(doctor|health|healthcare|clinic|hospital)\b|רופא|בריאות|מרפאה|בית חולים/.test(question)) category = 'Healthcare';
  else if (/\b(emergency|police|ambulance|fire)\b|חירום|משטרה|אמבולנס|כיבוי/.test(question)) category = 'Emergency Numbers';
  else if (/\b(food|eat|restaurant)\b|אוכל|מסעדה|לאכול/.test(question)) category = 'Food';
  else if (/\b(shop|shopping|buy)\b|קניות|לקנות|חנות/.test(question)) category = 'Shopping';
  else if (/\b(bus|train|transport|transportation|taxi)\b|אוטובוס|רכבת|תחבורה|מונית/.test(question)) category = 'Transportation';
  else if (/\b(community|event|friends|group)\b|קהילה|אירוע|חברים|קבוצה/.test(question)) category = 'Community';
  else if (/\b(news|update|today)\b|חדשות|עדכון|היום/.test(question)) category = 'News';

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
