import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { saveImages } from '../storage/storage.mjs';

function requiredFields(body, fields) {
  for (const field of fields) if (body[field] === undefined || body[field] === null || body[field] === '') throw new ApiError(400, 'VALIDATION_FAILED');
}

// Mounted at /api/marketplace, behind devUserAuth.
export function router(repo, uploadsDir) {
  const app = express.Router();

  app.get('/listings', asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    if (req.query.mine === 'true') {
      return res.json(await repo.listings.listBySeller(req.currentUser.id));
    }
    res.json(await repo.listings.listPublished({ type: req.query.type, limit, before: req.query.before }));
  }));

  app.post('/listings', asyncHandler(async (req, res) => {
    const body = req.body || {};
    requiredFields(body, ['type', 'sourceId', 'title', 'priceAmount', 'previewContent', 'fullContent', 'evidenceAsOf']);
    // 'subscription' added for the Account Profile feature (Section 5/1 of the migration) -
    // widens the existing type enum rather than introducing a parallel listing_type column.
    if (!['pattern', 'strategy', 'subscription'].includes(body.type)) throw new ApiError(400, 'VALIDATION_FAILED');
    const screenshots = await saveImages(body.screenshots, { uploadsDir, category: 'listings' });
    const listing = await repo.listings.create({ ...body, sellerId: req.currentUser.id, screenshots });
    res.status(201).json(listing);
  }));

  // Registered before /:id so "by-source" is never swallowed by the :id param route.
  app.get('/listings/by-source/:sourceId', asyncHandler(async (req, res) => {
    const listing = await repo.listings.findBySource(req.params.sourceId, req.currentUser.id);
    if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
    res.json(listing);
  }));

  app.get('/listings/:id', asyncHandler(async (req, res) => {
    const listing = await repo.listings.get(req.params.id);
    if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
    const isSeller = listing.sellerId === req.currentUser.id;
    const purchase = isSeller ? null : await repo.purchases.find(listing.id, req.currentUser.id);
    const canSeeFull = isSeller || !!purchase;
    res.json(canSeeFull ? listing : { ...listing, fullContent: null });
  }));

  app.patch('/listings/:id', asyncHandler(async (req, res) => {
    const listing = await repo.listings.get(req.params.id);
    if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
    if (listing.sellerId !== req.currentUser.id) throw new ApiError(403, 'NOT_LISTING_OWNER');
    res.json(await repo.listings.update(req.params.id, req.body || {}));
  }));

  app.post('/listings/:id/purchase', asyncHandler(async (req, res) => {
    const listing = await repo.listings.get(req.params.id);
    if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
    const purchase = await repo.purchases.create({ listingId: listing.id, buyerId: req.currentUser.id, priceAtPurchase: listing.priceAmount });
    res.status(201).json(purchase);
  }));

  app.get('/listings/:id/ratings', asyncHandler(async (req, res) => {
    const ratings = await repo.ratings.listByListing(req.params.id);
    const average = ratings.length ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : null;
    res.json({ ratings, average, count: ratings.length });
  }));

  app.post('/listings/:id/ratings', asyncHandler(async (req, res) => {
    const { rating, reviewText } = req.body || {};
    const record = await repo.ratings.create({ listingId: req.params.id, buyerId: req.currentUser.id, rating, reviewText });
    res.status(201).json(record);
  }));

  return app;
}
