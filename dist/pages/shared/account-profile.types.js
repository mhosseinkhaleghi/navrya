/**
 * @typedef {'trader'|'mentor'|'teacher'} ProfileRole
 * @typedef {'not_started'|'pending'|'verified'|'rejected'} KycStatus
 *
 * @typedef {Object} AccountProfile
 * @property {string} id
 * @property {string} displayName
 * @property {string|null} email
 * @property {boolean} emailVerified
 * @property {string|null} phone
 * @property {boolean} phoneVerified
 * @property {ProfileRole} profileRole
 * @property {KycStatus} kycStatus
 * @property {string|null} avatarDataUrl
 * @property {number} xpTotal
 * @property {number} level
 *
 * @typedef {Object} XpEvent
 * @property {string} id
 * @property {string} type
 * @property {number} points
 * @property {Object} meta
 * @property {string} occurredAt
 *
 * @typedef {Object} Achievement
 * @property {string} achievementKey
 * @property {string} unlockedAt
 * @property {Object} evidence
 */
