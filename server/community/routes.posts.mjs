import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { saveImages } from '../storage/storage.mjs';
import { rateLimit, sessionKey } from './security/rate-limit.mjs';

// Launch-readiness audit fix (P1-3): none of these write endpoints had any rate limit at all -
// only requireAuth()+csrfProtection() gate them (see app.mjs), and registration is cheap/self-
// serve, so "authenticated" alone was never a real throttle against spam. Session-keyed (not
// IP-keyed) since every caller here already has a real session by the time these run - the same
// primitive /api/auth/* already uses (security/rate-limit.mjs), just applied to a new surface.
const postLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: sessionKey('community-post') });
const commentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyFn: sessionKey('community-comment') });
const likeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: sessionKey('community-like') });
const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyFn: sessionKey('community-report') });

async function withAuthors(repo, records, key) {
  const cache = new Map();
  async function author(userId) {
    if (!cache.has(userId)) cache.set(userId, await repo.users.get(userId));
    return cache.get(userId);
  }
  const enriched = [];
  for (const record of records) enriched.push({ ...record, author: await author(record[key]) });
  return enriched;
}

// Mutates `post` in place with likeCount/likedByMe/firstLiker - the earliest liker, resolved to
// their real display name, for the "Liked by {name}" row (design shows a single name, not a
// count-only affordance).
async function attachLikes(repo, post, currentUserId) {
  const likes = await repo.likes.listByPost(post.id);
  post.likeCount = likes.length;
  post.likedByMe = likes.some((like) => like.userId === currentUserId);
  post.firstLiker = likes.length ? await repo.users.get(likes[0].userId) : null;
}

// Mounted at /api/community - the social-feed surface (posts, comments) plus reporting,
// all behind devUserAuth.
export function router(repo, uploadsDir) {
  const app = express.Router();

  app.get('/posts', asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const posts = await repo.posts.list({ limit, before: req.query.before });
    const enriched = await withAuthors(repo, posts, 'userId');
    for (const post of enriched) {
      post.commentCount = (await repo.comments.listByPost(post.id)).length;
      await attachLikes(repo, post, req.currentUser.id);
    }
    res.json({ posts: enriched, nextBefore: posts.length ? posts[posts.length - 1].createdAt : null });
  }));

  app.post('/posts', postLimiter, asyncHandler(async (req, res) => {
    const { content, images } = req.body || {};
    if (!content && !(images && images.length)) throw new ApiError(400, 'VALIDATION_FAILED');
    const savedImages = await saveImages(images, { uploadsDir, category: 'posts' });
    const post = await repo.posts.create({ userId: req.currentUser.id, content, images: savedImages.map((image) => image.url) });
    res.status(201).json({ ...post, author: req.currentUser, commentCount: 0, likeCount: 0, likedByMe: false, firstLiker: null });
  }));

  app.delete('/posts/:id', asyncHandler(async (req, res) => {
    await repo.posts.remove(req.params.id, req.currentUser.id);
    res.status(204).end();
  }));

  app.get('/posts/:id/comments', asyncHandler(async (req, res) => {
    const post = await repo.posts.get(req.params.id);
    if (!post) throw new ApiError(404, 'POST_NOT_FOUND');
    const comments = await repo.comments.listByPost(req.params.id);
    res.json(await withAuthors(repo, comments, 'userId'));
  }));

  app.post('/posts/:id/comments', commentLimiter, asyncHandler(async (req, res) => {
    const comment = await repo.comments.create({ postId: req.params.id, userId: req.currentUser.id, content: (req.body || {}).content });
    res.status(201).json({ ...comment, author: req.currentUser });
  }));

  // Toggle: like if not already liked, unlike otherwise - mirrors the prototype's likes-array
  // toggle behavior but backed by the real post_likes table instead of a client-side array.
  app.post('/posts/:id/likes', likeLimiter, asyncHandler(async (req, res) => {
    const existing = await repo.likes.find(req.params.id, req.currentUser.id);
    if (existing) { await repo.likes.remove(req.params.id, req.currentUser.id); res.json({ liked: false }); }
    else { await repo.likes.create({ postId: req.params.id, userId: req.currentUser.id }); res.json({ liked: true }); }
  }));

  app.get('/posts/:id/likes', asyncHandler(async (req, res) => {
    const likes = await repo.likes.listByPost(req.params.id);
    res.json(await withAuthors(repo, likes, 'userId'));
  }));

  app.post('/reports', reportLimiter, asyncHandler(async (req, res) => {
    const { targetType, targetId, reason } = req.body || {};
    const report = await repo.reports.create({ targetType, targetId, reporterId: req.currentUser.id, reason });
    res.status(201).json(report);
  }));

  return app;
}
