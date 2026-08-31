/**
 * Analysis Image Prep — Adaptive AI Session Analysis (brief §5, "IMAGE COST CONTROL").
 *
 * One reusable path that resizes/re-encodes a chart screenshot into a compact representation
 * before it is sent to a vision model. Investigation of this repo (Phase 1) found no existing
 * resize/compression pipeline anywhere - client screenshots and pattern-registry images are both
 * shipped to their respective AI endpoints completely unmodified (only a server-side security
 * re-encode exists, server/storage/storage.mjs's reencode(), which never changes dimensions). This
 * file is genuinely new infrastructure, not a rename of something that already existed.
 *
 * Non-goals, on purpose: never mutates or replaces the original upload (the caller's own
 * IndexedDB/server-hosted image is never touched - see session-analysis-client.js's
 * resolveEntryImageDataUrl(), which reads the original and only ever produces a NEW, separate
 * data URL for transport); never upscales; never chosen to be so aggressive that chart
 * labels/price action become unreadable (JPEG quality 0.85 at a 1600px long edge, not a byte-size
 * target).
 */
(function () {
  'use strict';

  var MAX_DIMENSION = 1600;
  var JPEG_QUALITY = 0.85;

  // Pure, DOM-free arithmetic - deliberately kept unit-testable in plain Node (see
  // tests/analysis-image-prep.test.mjs) even though the actual re-encode below needs a real
  // browser canvas. Never upscales: a source already smaller than maxDimension is returned as-is.
  function targetDimensions(width, height, maxDimension) {
    var max = maxDimension || MAX_DIMENSION;
    var w = Number(width) || 0;
    var h = Number(height) || 0;
    if (!w || !h) return { width: w, height: h };
    var longest = Math.max(w, h);
    if (longest <= max) return { width: w, height: h };
    var scale = max / longest;
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
  }

  function loadImageElement(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('IMAGE_LOAD_FAILED')); };
      img.src = url;
    });
  }

  // Resizes/re-encodes a source (data URL or blob URL) into a compact JPEG data URL used ONLY for
  // AI transport - the caller's own original stays untouched on disk/IndexedDB. Preserves aspect
  // ratio (never distorts, never crops).
  function prepareForTransport(sourceUrl, options) {
    var opts = options || {};
    var maxDimension = opts.maxDimension || MAX_DIMENSION;
    var quality = opts.quality || JPEG_QUALITY;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return Promise.reject(new Error('BROWSER_ONLY'));
    }
    return loadImageElement(sourceUrl).then(function (img) {
      var size = targetDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, maxDimension);
      var canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size.width, size.height);
      return canvas.toDataURL('image/jpeg', quality);
    });
  }

  window.TradeJournalAnalysisImagePrep = {
    targetDimensions: targetDimensions,
    prepareForTransport: prepareForTransport,
    MAX_DIMENSION: MAX_DIMENSION,
    JPEG_QUALITY: JPEG_QUALITY
  };
}());
