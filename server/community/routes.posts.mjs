import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { saveImages } from '../storage/storage.mjs';

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

// Mounted at /api/community - the social-feed surface (posts, comments) plus reporting,
// all behind devUserAuth.
export function router(repo, uploadsDir) {
  const app = express.Router();

  app.get('/posts', asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const posts = await repo.posts.list({ limit, before: req.query.before });
    const enriched = await withAuthors(repo, posts, 'userId');
    for (const post of enriched) post.commentCount = (await repo.comments.listByPost(post.id)).length;
    res.json({ posts: enriched, nextBefore: posts.length ? posts[posts.length - 1].createdAt : null });
  }));

  app.post('/posts', asyncHandler(async (req, res) => {
    const { content, images } = req.body || {};
    if (!content && !(images && images.length)) throw new ApiError(400, 'VALIDATION_FAILED');
    const savedImages = await saveImages(images, { uploadsDir, category: 'posts' });
    const post = await repo.posts.create({ userId: req.currentUser.id, content, images: savedImages });
    res.status(201).json({ ...post, author: req.currentUser, commentCount: 0 });
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

  app.post('/posts/:id/comments', asyncHandler(async (req, res) => {
    const comment = await repo.comments.create({ postId: req.params.id, userId: req.currentUser.id, content: (req.body || {}).content });
    res.status(201).json({ ...comment, author: req.currentUser });
  }));

  app.post('/reports', asyncHandler(async (req, res) => {
    const { targetType, targetId, reason } = req.body || {};
    const report = await repo.reports.create({ targetType, targetId, reporterId: req.currentUser.id, reason });
    res.status(201).json(report);
  }));

  return app;
}
