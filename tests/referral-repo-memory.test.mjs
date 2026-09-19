import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { registerReferralRepoScenarios } from './helpers/referral-repo-scenarios.mjs';

// The behavioural scenarios shared with tests/referral-postgres-integration.test.mjs - the same assertions on both
// backends is the repository-parity guarantee.
registerReferralRepoScenarios({ test, makeRepo: async () => createMemoryRepo(), label: 'memory' });
