const { coreAgentService } = require('../core-agent');
const { refusePersonalDataChannelUserId } = require('../../shared/blockPersonalDataRoute');
const { loadWebProfile, stripClientIdentity } = require('../../shared/webPersonalData');
const communityService = require('./community.service');

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function preferUnseen(items = [], idKey, seenValue = '') {
  const seenIds = new Set(splitList(seenValue));
  const unseen = items.filter((item) => !seenIds.has(item[idKey]));
  return unseen.length ? unseen : items;
}

async function getPublishedPosts(req, res, next) {
  try {
    const posts = await communityService.getPublishedPosts(req.query || {});
    res.status(200).json({
      posts,
      safetyNotice: communityService.COMMUNITY_SAFETY_NOTICE,
    });
  } catch (error) {
    next(error);
  }
}

async function getRelevantPosts(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ posts: [], safetyNotice: communityService.COMMUNITY_SAFETY_NOTICE });
      return;
    }
    const matchingPosts = await communityService.getRelevantPosts(profile);
    const posts = preferUnseen(matchingPosts, 'postId', profile.lastRelevantPostIds);
    if (posts.length) {
      await coreAgentService.updateUserProfile(context, {
        lastRelevantPostIds: posts
          .slice(0, 5)
          .map((post) => post.postId)
          .join(', '),
      });
    }

    res.status(200).json({
      posts,
      safetyNotice: communityService.COMMUNITY_SAFETY_NOTICE,
    });
  } catch (error) {
    next(error);
  }
}

async function getPost(req, res, next) {
  try {
    const post = await communityService.getPostById(req.params.postId);
    if (!post) {
      res.status(404).json({ error: { message: 'Community post not found.' } });
      return;
    }

    const comments = await communityService.getComments(req.params.postId);
    res.status(200).json({
      post,
      comments,
      safetyNotice: communityService.COMMUNITY_SAFETY_NOTICE,
    });
  } catch (error) {
    next(error);
  }
}

async function addComment(req, res, next) {
  try {
    const { profile, userId } = await loadWebProfile(req, { create: true });
    const post = await communityService.getPostById(req.params.postId);
    if (!post || post.status !== 'Published') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.', details: [] } });
      return;
    }
    const body = stripClientIdentity(req.body, ['commentId', 'postId', 'userName', 'status']);
    const comment = await communityService.addComment({
      postId: post.postId,
      userId,
      userName: profile.fullName || 'Community member',
      body: body.body,
      language: profile.preferredLanguage || profile.language || 'English',
    });

    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
}

async function flagComment(req, res, next) {
  try {
    refusePersonalDataChannelUserId();
    const comment = await communityService.flagComment(req.params.commentId);
    if (!comment) {
      res.status(404).json({ error: { message: 'Comment not found.' } });
      return;
    }

    res.status(200).json({ comment });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  addComment,
  flagComment,
  getPost,
  getPublishedPosts,
  getRelevantPosts,
};
