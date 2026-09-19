// Shared fixtures for the referral payout tests: a configured BSC payout world (settings, RPC secret, a verified referrer with an
// available balance) and a JSON-RPC stub in the same globalThis.fetch convention tests/bsc-crypto-payments.test.mjs established.
import { createMemoryRepo } from '../../server/db/repo.memory.mjs';
import { invalidateCommercialConfigCache } from '../../server/commercial/commercial-config.mjs';
import { MICRO } from '../../server/commercial/referral-rules.mjs';
import { setupProgram, attribute, pay } from './referral-repo-scenarios.mjs';

export const RPC_URL = 'https://referral-payout-rpc.test/bsc';
export const TOKEN = '0x55d398326f99059fF775485246999027B3197955';
export const SENDER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
export const RECIPIENT = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
export const OTHER = '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB';
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const TX_HASH = '0x' + 'ab'.repeat(32);

export const padTopic = (address) => '0x' + '0'.repeat(24) + address.slice(2).toLowerCase();
export const transferLog = ({ address = TOKEN, from = SENDER, to = RECIPIENT, amount }) => ({
  address, topics: [TRANSFER_TOPIC, padTopic(from), padTopic(to)], data: '0x' + amount.toString(16)
});
export const receiptOf = ({ blockNumber = 100, status = '0x1', logs }) => ({ status, blockNumber: '0x' + blockNumber.toString(16), logs });
// 10 USD in an 18-decimal token
export const atomic = (usd) => BigInt(Math.round(usd * 1e6)) * 10n ** 12n;

const realFetch = globalThis.fetch;
export function restoreFetch() { globalThis.fetch = realFetch; }
export function mockRpc({ chainId = 56, receipt = null, blockNumber = 200 } = {}) {
  globalThis.fetch = async (url, options) => {
    if (String(url) !== RPC_URL) return realFetch(url, options);
    const body = JSON.parse(options.body);
    if (body.method === 'eth_chainId') return { ok: true, json: async () => ({ result: '0x' + chainId.toString(16) }) };
    if (body.method === 'eth_getTransactionReceipt') return { ok: true, json: async () => ({ result: receipt }) };
    if (body.method === 'eth_blockNumber') return { ok: true, json: async () => ({ result: '0x' + blockNumber.toString(16) }) };
    throw new Error('unexpected RPC method in test: ' + body.method);
  };
}

export async function publishPayoutSettings(repo, overrides = {}) {
  await repo.commercialConfig.publish('referralPayout:settings', {
    enabled: true, tokenSymbol: 'USDT', tokenContract: TOKEN, tokenDecimals: 18, treasurySender: SENDER, minConfirmations: 15,
    explorerTxUrlTemplate: 'https://bscscan.com/tx/{txHash}', requiredKycStatus: 'verified', reauthMaxAgeMinutes: 10, termsVersion: 'referral-payout-v1',
    makerCheckerRequired: true, minPayoutMicroUsd: 10 * MICRO, ...overrides
  }, { updatedBy: null, changeSummary: 'test settings' });
  await repo.bscPaymentSecrets.setRpcUrl(RPC_URL);
  invalidateCommercialConfigCache();
}

// A referrer with `availableUsd` of matured, spendable earnings, verified email and KYC; two admins; payout settings published.
export async function payoutWorld({ availableUsd = 40, settings = {} } = {}) {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 1000 });
  const admin2 = await repo.users.create({ displayName: 'Second Admin', email: 'admin2@example.test' });
  const { referred } = await attribute(repo, ctx);
  await pay(repo, referred, availableUsd * 10, { confirmedDaysAgo: 1 }); // 10% commission -> availableUsd
  await repo.users.markEmailVerified(ctx.referrer.id);
  await repo.users.updateKyc(ctx.referrer.id, 'verified');
  await publishPayoutSettings(repo, settings);
  const user = await repo.users.get(ctx.referrer.id);
  return { repo, ctx, admin1: ctx.admin, admin2, user, referred, session: { reauthAt: new Date().toISOString() } };
}

export function requestBody(overrides = {}) {
  return {
    amountMicroUsd: 10 * MICRO, address: RECIPIENT, confirmAddress: RECIPIENT, acceptedTermsVersion: 'referral-payout-v1',
    acknowledgeIrreversible: true, acknowledgeNetwork: true, idempotencyKey: 'idem-' + Math.random().toString(36).slice(2, 12), ...overrides
  };
}
