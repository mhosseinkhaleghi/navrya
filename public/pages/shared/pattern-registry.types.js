/**
 * @typedef {Object} PatternStage
 * @property {string} id
 * @property {number} order
 * @property {string} text
 *
 * @typedef {Object} PatternScreenshot
 * @property {string} id
 * @property {string} fileName
 * @property {string=} blobId
 * @property {string=} dataUrl
 * @property {string} uploadedAt
 * @property {string=} note
 *
 * @typedef {Object} PatternChatMessage
 * @property {string} id
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {string} createdAt
 * @property {PatternStage[]=} suggestedStages
 *
 * @typedef {Object} Pattern
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {number} completionThreshold
 * @property {string[]} instruments
 * @property {PatternStage[]} stages
 * @property {PatternScreenshot[]} referenceScreenshots
 * @property {number} usageCount
 * @property {PatternChatMessage[]} chatHistory
 * @property {boolean} isPublic
 * @property {string} createdAt
 * @property {string} updatedAt
 */
(function () {
  window.TradeJournalPatternTypes = Object.freeze({
    Pattern: 'Pattern',
    PatternStage: 'PatternStage',
    PatternScreenshot: 'PatternScreenshot',
    PatternChatMessage: 'PatternChatMessage',
    // A4 process-registry allowlist: fields the global AI dock may suggest into while a
    // pattern's editor is open. Stage text isn't included - stages are an ordered array,
    // and generateStages()/chat() already have their own dedicated stage-suggestion path.
    // completionThreshold added for Journey F's pattern.create (F9/F10) - clamped into the real
    // slider's own [0,100] range in strategiesHubView.jsx's applyValue(), never trusted as-is.
    // instruments added for the Instrument Catalog domain - resolved (never guessed) the same
    // strict way accountId/linkedPatternIds already are, see ai-trade-actions.js's resolveInstruments().
    patternStagePaths: ['name', 'description', 'completionThreshold', 'instruments']
  });
}());
