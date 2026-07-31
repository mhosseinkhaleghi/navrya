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
    PatternChatMessage: 'PatternChatMessage'
  });
}());
