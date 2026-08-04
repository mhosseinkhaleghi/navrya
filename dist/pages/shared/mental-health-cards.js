(function () {
  'use strict';
  var ai = window.TradeJournalMentalHealthAI;
  var store = window.TradeJournalMentalHealthStore;
  if (!ai || !store) return;

  // Default seam: no real image API is wired up, so cards always render the CSS/SVG fallback below.
  // A future integration replaces this function; it never becomes a hard dependency.
  window.TradeJournalImageGenerationProvider = window.TradeJournalImageGenerationProvider || function () { return Promise.resolve(null); };

  function evidenceFor(profile, bias) { return { frequency: bias.evidenceTradeIds.length, sampleSize: profile.cognitiveProfile.identifiedBiases.length }; }

  async function ensureCard(profile, biasType, forceRegenerate) {
    var bias = profile.cognitiveProfile.identifiedBiases.find(function (b) { return b.type === biasType; });
    if (!bias) return { profile: profile, card: null };
    var existing = profile.educationCards[biasType];
    if (existing && !forceRegenerate) return { profile: profile, card: existing };
    var result = await ai.educationCard(biasType, evidenceFor(profile, bias));
    var imageUrl = null;
    try { imageUrl = await window.TradeJournalImageGenerationProvider(result.imagePrompt, biasType); } catch (_) { imageUrl = null; }
    var card = {
      title: result.title, explanation: result.explanation, whyItMattersForYou: result.whyItMattersForYou,
      practicalSteps: result.practicalSteps, imagePrompt: result.imagePrompt, imageUrl: imageUrl,
      generatedAt: new Date().toISOString(), viewedAt: existing ? existing.viewedAt : null, local: !!result.local
    };
    var record = store.load();
    record.educationCards[biasType] = card;
    record = store.save(record);
    return { profile: record, card: card };
  }

  // `note` is optional - a short personal-response field next to the existing "Mark Viewed"
  // button (ARCHITECTURE.md Section 11.8's "read an Education Card and record a personal
  // response"; the card previously only had viewedAt, no field for what the trader actually
  // thought). Re-calling with a note after the card was already viewed still records it - only
  // the first viewedAt stamp is preserved, not the note.
  function markViewed(biasType, note) {
    var record = store.load();
    var card = record.educationCards[biasType];
    if (card) {
      var changed = false;
      if (!card.viewedAt) { card.viewedAt = new Date().toISOString(); changed = true; }
      var trimmed = note ? String(note).trim() : '';
      if (trimmed && card.personalResponse !== trimmed) { card.personalResponse = trimmed; changed = true; }
      if (changed) record = store.save(record);
    }
    return record;
  }

  // Deterministic calm/abstract SVG, hue seeded by bias type so each pattern's card looks stable and
  // distinct even though nothing was actually generated - the honest placeholder, never a fake photo.
  function fallbackVisual(biasType) {
    var hues = { fomo: 190, loss_aversion: 210, overconfidence: 35, revenge_trading: 350, anchoring: 260, confirmation_bias: 160, gambler_fallacy: 280, recency_bias: 150 };
    var hue = hues[biasType] || 200;
    var svg = '<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">'
      + '<defs><radialGradient id="g" cx="50%" cy="40%" r="70%">'
      + '<stop offset="0%" stop-color="hsl(' + hue + ',70%,78%)"/>'
      + '<stop offset="100%" stop-color="hsl(' + hue + ',55%,55%)"/>'
      + '</radialGradient></defs>'
      + '<rect width="200" height="120" fill="hsl(' + hue + ',40%,14%)"/>'
      + '<circle cx="100" cy="55" r="42" fill="url(#g)" opacity="0.85"/>'
      + '<circle cx="60" cy="85" r="16" fill="hsl(' + hue + ',60%,70%)" opacity="0.5"/>'
      + '<circle cx="140" cy="80" r="10" fill="hsl(' + hue + ',60%,80%)" opacity="0.45"/>'
      + '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  window.TradeJournalMentalHealthCards = { ensureCard: ensureCard, markViewed: markViewed, fallbackVisual: fallbackVisual };
}());
