const { coreAgentService } = require('../core-agent');
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
    const onboardingStatus = await coreAgentService.getOnboardingStatus({
      channel: req.query.channel || 'web',
      channelUserId: req.query.channelUserId || 'local-web-user',
    });
    const profile = onboardingStatus.profile || {};
    const matchingPosts = await communityService.getRelevantPosts(profile);
    const posts = preferUnseen(matchingPosts, 'postId', profile.lastRelevantPostIds);
    if (posts.length) {
      await coreAgentService.updateUserProfile(
        {
          channel: req.query.channel || 'web',
          channelUserId: req.query.channelUserId || 'local-web-user',
        },
        {
          lastRelevantPostIds: posts
            .slice(0, 5)
            .map((post) => post.postId)
            .join(', '),
        }
      );
    }

    res.status(200).json({
      posts,
      profile,
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
    const onboardingStatus = await coreAgentService.getOnboardingStatus({
      channel: req.body.channel || 'web',
      channelUserId: req.body.channelUserId || 'local-web-user',
    });
    const profile = onboardingStatus.profile || {};
    const comment = await communityService.addComment({
      postId: req.params.postId,
      userId: onboardingStatus.user?.userId || req.body.channelUserId || 'local-web-user',
      userName: profile.fullName || 'Community member',
      body: req.body.body,
      language: profile.preferredLanguage || profile.language || 'English',
    });

    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
}

async function flagComment(req, res, next) {
  try {
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
