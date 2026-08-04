import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

let server, baseUrl, uploadsDir;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  server = createApp({ repo: createMemoryRepo(), uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-dev-user-id'] = userId;
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) {
  const { body } = await api('POST', '/api/users', { body: { displayName: name } });
  return body;
}

function sampleProfile() {
  return {
    userId: 'local-trader', createdAt: '2026-01-01T00:00:00.000Z', lastUpdatedAt: '2026-01-01T00:00:00.000Z', version: 2,
    baseline: { initialStressLevel: 6, initialEmotionalRegulation: 4, tradingExperienceYears: 2, selfReportedWeaknesses: ['fomo'], assessmentDate: '2026-01-01T00:00:00.000Z', completed: true },
    emotionalProfile: { dominantNegativeEmotions: ['anxious'], dominantPositiveEmotions: ['confident'], emotionalVolatilityScore: 3, averageStressLevel: 5, stressTrend: 'improving' },
    triggerProfile: { triggers: [{ id: 'trigger-1', description: 'big red candle', triggerType: 'custom', detectedCount: 2, lastTriggeredAt: '2026-01-01T00:00:00.000Z', recommendedAction: 'breathe', source: 'user' }], autoDetectedTriggers: [], draftTrigger: { description: '', triggerType: 'custom', recommendedAction: '' } },
    behavioralPatterns: { revengeTradingFrequency: 1, overTradingEpisodes: 2, planDeviationRate: 0.1, cooldownComplianceRate: 0.8, preChecklistCompletionRate: 0.9 },
    cognitiveProfile: { identifiedBiases: [{ type: 'fomo', firstDetectedAt: '2026-01-01T00:00:00.000Z', evidenceTradeIds: ['trade-1'], status: 'active', cyclePhase: 'assessment', phaseHistory: [] }], biasStrengthScores: { fomo: 3 }, lastCognitiveRestructuringDate: null, thoughtRecords: [], draftThoughtRecord: { automaticThought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', balancedThought: '' } },
    progressTracking: { weeklySnapshots: [], milestones: [{ id: 'milestone-1', title: 'First week complete', achievedAt: '2026-01-01T00:00:00.000Z', relatedBiasType: null }], currentPhase: 'assessment', overallProgressScore: 10 },
    activeInterventions: { cooldownTimerEnabled: true, cooldownDurationMinutes: 5, preTradeChecklistEnabled: false, checklistItems: [], alertThresholds: [] },
    healthReportCache: { lastGeneratedAt: null, weeklyScore: 0, monthlyScore: 0, winRateByStressLevel: {}, emotionOutcomeCorrelations: [] },
    chatHistory: [{ id: 'mh-chat-1', role: 'user', content: 'hello', createdAt: '2026-01-01T00:00:00.000Z', suggestions: [] }],
    educationCards: {},
    intake: { completed: true, completedAt: '2026-01-01T00:00:00.000Z', filledVia: 'form', demographics: { age: 30, gender: null, maritalStatus: null, primaryOccupation: null, isFullTimeTrader: false }, financialContext: { capitalType: null, capitalAllocationPercent: null, borrowedMoneyForTrading: false }, tradingHistory: { yearsTrading: 2, marketsTraded: ['forex'], largestWin: { amount: 500, percent: 10 }, largestLoss: { amount: -200, percent: -4 }, marginCallOrZeroedCount: 0 }, motivationForTrading: null, firstBigLossReaction: null, transparencyMatrix: { profitKnownToFamily: null, lossKnownToFamily: null, capitalKnownToFamily: null, tradingActivityKnownToFamily: null }, legacyBaselineV1: null },
    psychologicalProfile: { standardizedTests: { bigFive: null, riskToleranceScale: null, bis11Impulsivity: null, sogsGamblingScreen: null }, scenarioAssessment: { completedAt: null, responses: [], draftResponse: { choice: '', sliderValue: null, freeText: '' } }, biasChecklist: { lastAssessedAt: null, biases: [] } },
    continuousTracking: { preSessionCheckIns: [], preTradeContext: [], postTradeReflections: [], monthlyCorrelationReports: [] },
    redFlags: { active: [], resolved: [] }
  };
}

test('a request with no x-dev-user-id is rejected with DEV_USER_ID_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/mental-health');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'DEV_USER_ID_REQUIRED');
});

test('GET returns a null profile for a user who has never saved one', async () => {
  const user = await createUser('Hunter Zero');
  const result = await api('GET', '/api/sync/mental-health', { userId: user.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.profile, null);
});

test('POST upserts the whole profile document and GET reassembles it identically', async () => {
  const user = await createUser('Hunter One');
  const created = await api('POST', '/api/sync/mental-health', { userId: user.id, body: sampleProfile() });
  assert.equal(created.status, 200);
  assert.equal(created.body.baseline.initialStressLevel, 6);
  assert.equal(created.body.triggerProfile.triggers.length, 1);
  assert.equal(created.body.cognitiveProfile.identifiedBiases[0].type, 'fomo');
  assert.equal(created.body.chatHistory[0].content, 'hello');

  const fetched = await api('GET', '/api/sync/mental-health', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.profile.intake.tradingHistory.yearsTrading, 2);
});

test('re-POSTing replaces the whole document (idempotent whole-document upsert), not a merge or a second row', async () => {
  const user = await createUser('Hunter Two');
  await api('POST', '/api/sync/mental-health', { userId: user.id, body: sampleProfile() });

  const changed = sampleProfile();
  changed.baseline.initialStressLevel = 9;
  changed.redFlags.active.push({ id: 'flag-1', type: 'revenge_trading', detectedAt: '2026-01-02T00:00:00.000Z', evidence: 'two trades in 5 min', status: 'active', professionalReferralShown: false });
  const updated = await api('POST', '/api/sync/mental-health', { userId: user.id, body: changed });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.baseline.initialStressLevel, 9);
  assert.equal(updated.body.redFlags.active.length, 1);

  const fetched = await api('GET', '/api/sync/mental-health', { userId: user.id });
  assert.equal(fetched.body.profile.baseline.initialStressLevel, 9, 're-upserting must fully replace the stored document, not merge onto it');
});

test('a profile is scoped strictly by the real dev-user-id header, never by the profile payload\'s own internal userId field', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/mental-health', { userId: owner.id, body: sampleProfile() });

  const strangerFetch = await api('GET', '/api/sync/mental-health', { userId: stranger.id });
  assert.equal(strangerFetch.status, 200);
  assert.equal(strangerFetch.body.profile, null, 'a different real user must never see another user\'s profile, regardless of the payload\'s own internal userId field');
});
