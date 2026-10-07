const communityRepository = require('./community.repository');
const { COMMUNITY_COMMENT_STATUSES } = require('./community-comment.model');
const {
  COMMUNITY_CATEGORIES,
  COMMUNITY_POST_STATUSES,
  COMMUNITY_POST_TYPES,
} = require('./community-post.model');
const { SAMPLE_COMMUNITY_POSTS } = require('./sample-community-posts');

const COMMUNITY_SAFETY_NOTICE = 'Community information may be user-generated. Verify important details before acting.';
const MAX_COMMENT_LENGTH = 500;

const memoryComments = [];
const memoryPosts = [];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function buildPost(input = {}) {
  const now = new Date().toISOString();

  return {
    postId: cleanText(input.postId) || generateId('post'),
    title: cleanText(input.title),
    body: cleanText(input.body),
    category: cleanText(input.category) || 'Community',
    language: cleanText(input.language) || 'English',
    targetCountry: cleanText(input.targetCountry),
    targetWorkSector: cleanText(input.targetWorkSector),
    targetCity: cleanText(input.targetCity),
    postType: cleanText(input.postType) || 'Discussion',
    sourceName: cleanText(input.sourceName),
    sourceUrl: cleanText(input.sourceUrl),
    status: cleanText(input.status) || 'Draft',
    publishedAt: cleanText(input.publishedAt),
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: cleanText(input.updatedAt) || now,
  };
}

function validatePost(post) {
  const errors = [];
  if (!post.title) errors.push('title is required.');
  if (!post.body) errors.push('body is required.');
  if (!COMMUNITY_CATEGORIES.includes(post.category)) errors.push('category is invalid.');
  if (!COMMUNITY_POST_TYPES.includes(post.postType)) errors.push('postType is invalid.');
  if (!COMMUNITY_POST_STATUSES.includes(post.status)) errors.push('status is invalid.');
  return errors;
}

function validationError(message, details = []) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
}

async function readPostsWithFallback() {
  try {
    const posts = await communityRepository.findAllPosts();
    return posts.length > 0 ? posts : [...SAMPLE_COMMUNITY_POSTS, ...memoryPosts];
  } catch (error) {
    return [...SAMPLE_COMMUNITY_POSTS, ...memoryPosts];
  }
}

async function readCommentsWithFallback() {
  try {
    const comments = await communityRepository.findAllComments();
    return comments.length > 0 ? comments : memoryComments;
  } catch (error) {
    return memoryComments;
  }
}

async function createPost(input = {}) {
  const post = buildPost(input);
  const errors = validatePost(post);
  if (errors.length > 0) throw validationError('Community post validation failed.', errors);

  try {
    return await communityRepository.createPost(post);
  } catch (error) {
    memoryPosts.push(post);
    return post;
  }
}

async function publishPost(postId) {
  const posts = await readPostsWithFallback();
  const existingPost = posts.find((post) => post.postId === postId);
  if (!existingPost) return null;

  const now = new Date().toISOString();
  const publishedPost = {
    ...existingPost,
    status: 'Published',
    publishedAt: existingPost.publishedAt || now,
    updatedAt: now,
  };

  try {
    return (await communityRepository.updatePost(postId, publishedPost)) || publishedPost;
  } catch (error) {
    const memoryIndex = memoryPosts.findIndex((post) => post.postId === postId);
    if (memoryIndex >= 0) memoryPosts[memoryIndex] = publishedPost;
    return publishedPost;
  }
}

function isPublished(post) {
  return post.status === 'Published';
}

function postMatchesFilters(post, filters = {}) {
  if (filters.category && post.category !== filters.category) return false;
  if (filters.language && normalize(post.language) !== normalize(filters.language)) return false;
  if (filters.country && post.targetCountry && normalize(post.targetCountry) !== normalize(filters.country)) return false;
  if (filters.workSector && post.targetWorkSector && normalize(post.targetWorkSector) !== normalize(filters.workSector)) return false;
  if (filters.city && post.targetCity && normalize(post.targetCity) !== normalize(filters.city)) return false;
  return true;
}

async function getPublishedPosts(filters = {}) {
  const posts = await readPostsWithFallback();
  return posts
    .filter(isPublished)
    .filter((post) => postMatchesFilters(post, filters))
    .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
}

function getUserInterests(userProfile = {}) {
  return [
    userProfile.workSector,
    userProfile.profession,
    userProfile.preferredHousingType,
    userProfile.preferredCurrency,
    userProfile.country,
    userProfile.city,
  ]
    .map(normalize)
    .filter(Boolean);
}

function getActiveGoals(userProfile = {}) {
  return cleanText(userProfile.activeGoals)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function scorePost(post, userProfile = {}) {
  const reasons = [];
  let score = 0;
  const postText = normalize(`${post.title} ${post.body} ${post.category}`);
  const language = normalize(userProfile.preferredLanguage || userProfile.language);
  const country = normalize(userProfile.country);
  const workSector = normalize(userProfile.workSector);
  const city = normalize(userProfile.city);
  const interests = getUserInterests(userProfile);
  const activeGoals = getActiveGoals(userProfile);

  if (language && normalize(post.language) === language) {
    score += 60;
    reasons.push(`Relevant in ${post.language}`);
  }

  if (country && normalize(post.targetCountry) === country) {
    score += 50;
    reasons.push(`Relevant to ${post.targetCountry}`);
  }

  if (workSector && normalize(post.targetWorkSector) === workSector) {
    score += 45;
    reasons.push(`Relevant to ${post.targetWorkSector}`);
  }

  if (city && normalize(post.targetCity) === city) {
    score += 35;
    reasons.push(`Relevant to ${post.targetCity}`);
  }

  if (interests.some((interest) => interest && postText.includes(interest))) {
    score += 25;
    reasons.push('Matches your interests');
  }

  if (activeGoals.includes('Find Job') && post.category === 'Jobs') {
    score += 30;
    reasons.push('Matches your active job goal');
  }

  if (activeGoals.includes('Find Housing') && post.category === 'Housing') {
    score += 30;
    reasons.push('Matches your active housing goal');
  }

  if (activeGoals.includes('Send Money') && post.category === 'Money') {
    score += 30;
    reasons.push('Matches your money goal');
  }

  if (activeGoals.includes('Learn Rights') && post.category === 'Rights') {
    score += 30;
    reasons.push('Matches your rights goal');
  }

  const recencyScore = Math.max(0, 20 - Math.floor((Date.now() - new Date(post.publishedAt || post.createdAt).getTime()) / 86400000));
  score += recencyScore;

  return {
    score,
    reason: reasons[0] || 'Recent community update',
  };
}

async function getRelevantPosts(userProfile = {}) {
  const posts = await getPublishedPosts();
  return posts
    .map((post) => ({
      ...post,
      relevance: scorePost(post, userProfile),
    }))
    .sort((a, b) => b.relevance.score - a.relevance.score);
}

async function getPostById(postId) {
  const posts = await readPostsWithFallback();
  return posts.find((post) => post.postId === postId) || null;
}

function commentStatusForBody(body) {
  if (/\b\d{2,3}[-\s]?\d{3}[-\s]?\d{4}\b/.test(body)) return 'Flagged';
  if (/https?:\/\/|www\./i.test(body)) return 'Flagged';
  return 'Published';
}

async function addComment(input = {}) {
  const body = cleanText(input.body);
  if (!body) throw validationError('Comment cannot be empty.');
  if (body.length > MAX_COMMENT_LENGTH) throw validationError(`Comment must be ${MAX_COMMENT_LENGTH} characters or less.`);

  const comment = {
    commentId: cleanText(input.commentId) || generateId('comment'),
    postId: cleanText(input.postId),
    userId: cleanText(input.userId),
    userName: cleanText(input.userName) || 'Community member',
    body,
    language: cleanText(input.language) || 'English',
    status: commentStatusForBody(body),
    createdAt: cleanText(input.createdAt) || new Date().toISOString(),
  };

  if (!comment.postId) throw validationError('postId is required.');
  if (!COMMUNITY_COMMENT_STATUSES.includes(comment.status)) throw validationError('comment status is invalid.');

  try {
    return await communityRepository.addComment(comment);
  } catch (error) {
    memoryComments.push(comment);
    return comment;
  }
}

async function getComments(postId) {
  const comments = await readCommentsWithFallback();
  return comments
    .filter((comment) => comment.postId === postId)
    .filter((comment) => comment.status !== 'Hidden')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function getAllComments() {
  return readCommentsWithFallback();
}

async function flagComment(commentId) {
  const comments = await readCommentsWithFallback();
  const existingComment = comments.find((comment) => comment.commentId === commentId);
  if (!existingComment) return null;
  const flaggedComment = { ...existingComment, status: 'Flagged' };

  try {
    return (await communityRepository.updateComment(commentId, flaggedComment)) || flaggedComment;
  } catch (error) {
    const memoryIndex = memoryComments.findIndex((comment) => comment.commentId === commentId);
    if (memoryIndex >= 0) memoryComments[memoryIndex] = flaggedComment;
    return flaggedComment;
  }
}

async function updateCommentStatus(commentId, status) {
  if (!COMMUNITY_COMMENT_STATUSES.includes(status)) throw validationError('comment status is invalid.');
  const comments = await readCommentsWithFallback();
  const existingComment = comments.find((comment) => comment.commentId === commentId);
  if (!existingComment) return null;
  const updatedComment = { ...existingComment, status };

  try {
    return (await communityRepository.updateComment(commentId, updatedComment)) || updatedComment;
  } catch (error) {
    const memoryIndex = memoryComments.findIndex((comment) => comment.commentId === commentId);
    if (memoryIndex >= 0) memoryComments[memoryIndex] = updatedComment;
    return updatedComment;
  }
}

function mapDraftCategory(category) {
  if (COMMUNITY_CATEGORIES.includes(category)) return category;
  if (/money|exchange/i.test(category)) return 'Money';
  if (/job|work/i.test(category)) return 'Jobs';
  if (/house|housing|rent/i.test(category)) return 'Housing';
  return 'Community';
}

function mapDraftPostType(contentType) {
  if (/tip|advice/i.test(contentType)) return 'Tip';
  if (/news/i.test(contentType)) return 'Update';
  if (/faq|question/i.test(contentType)) return 'Question';
  return 'Discussion';
}

async function publishApprovedDraft(draft) {
  if (!draft || draft.status !== 'Approved') return null;
  const now = new Date().toISOString();
  return createPost({
    postId: `post_from_${draft.draftId}`,
    title: draft.title,
    body: draft.body || draft.summary,
    category: mapDraftCategory(draft.category),
    language: draft.language || 'English',
    targetCountry: '',
    targetWorkSector: '',
    targetCity: '',
    postType: mapDraftPostType(draft.contentType),
    sourceName: 'Content Agent',
    sourceUrl: '',
    status: 'Published',
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

function formatPostsForChat(posts = []) {
  if (!posts.length) {
    return `I do not see new community updates for you yet. ${COMMUNITY_SAFETY_NOTICE}`;
  }

  const lines = posts.slice(0, 5).map((post, index) => {
    return `${index + 1}. ${post.title} - ${post.category}. ${post.relevance?.reason || 'Community update'}.`;
  });

  return `Here are community updates that may help you:\n${lines.join('\n')}\n${COMMUNITY_SAFETY_NOTICE}`;
}

module.exports = {
  COMMUNITY_SAFETY_NOTICE,
  addComment,
  createPost,
  flagComment,
  getAllComments,
  formatPostsForChat,
  getComments,
  getPostById,
  getPublishedPosts,
  getRelevantPosts,
  publishApprovedDraft,
  publishPost,
  scorePost,
  updateCommentStatus,
};
