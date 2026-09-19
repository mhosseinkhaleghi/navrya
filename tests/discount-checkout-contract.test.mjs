import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
  withApp, makeUser, makeCode, setPlanBonus, setBscConfig, mockRpc, rpcCallCounter, iso, ORIGINAL_FETCH,
  HOUR_MS, MINUTE_MS, PRO_MICRO, PRO_15_DISCOUNT, PRO_15_FINAL, PLUS_15_FINAL, PLUS_MICRO
} from './helpers/discount-fixtures.mjs';

// End-to-end HTTP contract for discounted SUBSCRIPTION checkout (routes.subscriptions.mjs), through
// the real Express app and the real billing providers. Pins:
//   POST /api/sync/subscriptions/quote            { planId, code } -> provisional server-computed quote
//   POST /api/sync/subscriptions/upgrade-request  { planId, discountCode? } -> authoritative creation
// The server alone decides every amount; the quote is provisional and is recomputed at creation.

afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

const QUOTE = '/api/sync/subscriptions/quote';
const UPGRADE = '/api/sync/subscriptions/upgrade-request';

test('a quote is a provisional, server-computed result: original, discount, final, wallet bonus - and it reserves nothing', async () => {
  await withApp(async ({ repo, api }) => {
    await setPlanBonus(repo, 'pro', 3);
    const code = await makeCode(repo, { code: 'SPRING15', campaignName: 'Spring', maxRedemptions: 30 });
    const user = await makeUser(repo, 'Quoter');

    const result = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: 'SPRING15' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.provisional, true);
    assert.equal(result.body.planId, 'pro');
    assert.equal(result.body.code, 'SPRING15');
    assert.equal(result.body.campaignName, 'Spring');
    assert.equal(result.body.discountType, 'percent');
    assert.equal(result.body.currency, 'USD');
    assert.equal(result.body.originalAmountMicroUsd, PRO_MICRO);
    assert.equal(result.body.discountAmountMicroUsd, PRO_15_DISCOUNT);
    assert.equal(result.body.finalAmountMicroUsd, PRO_15_FINAL);
    assert.equal(result.body.walletBonusMicroUsd, 3_000_000);
    assert.equal(result.body.noCost, false);

    const stats = await repo.discountCodes.stats(code.id);
    assert.equal(stats.pendingReservations, 0, 'a quote never reserves capacity');
    assert.equal((await repo.paymentTransactions.listForUser(user.id)).length, 0, 'a quote never creates a transaction');
  });
});

test('quote normalizes the typed code and supports fixed-amount codes and the Plus plan', async () => {
  await withApp(async ({ repo, api }) => {
    await makeCode(repo, { code: 'FIVEOFF', discountType: 'fixed', discountValue: 5_000_000 });
    await makeCode(repo, { code: 'PLUS15' });
    const user = await makeUser(repo, 'Quoter Two');

    const fixed = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: '  fiveoff ' } });
    assert.equal(fixed.status, 200);
    assert.equal(fixed.body.code, 'FIVEOFF');
    assert.equal(fixed.body.discountType, 'fixed');
    assert.equal(fixed.body.discountAmountMicroUsd, 5_000_000);
    assert.equal(fixed.body.finalAmountMicroUsd, 9_990_000);

    const plus = await api('POST', QUOTE, { userId: user.id, body: { planId: 'plus', code: 'plus15' } });
    assert.equal(plus.body.originalAmountMicroUsd, PLUS_MICRO);
    assert.equal(plus.body.finalAmountMicroUsd, PLUS_15_FINAL);
  });
});

test('quote rejects malformed input with 400 VALIDATION_FAILED and requires authentication', async () => {
  await withApp(async ({ repo, api }) => {
    await makeCode(repo, { code: 'SPRING15' });
    const user = await makeUser(repo, 'Malformed');
    for (const planId of ['free', 'enterprise', '', null, undefined]) {
      const result = await api('POST', QUOTE, { userId: user.id, body: { planId, code: 'SPRING15' } });
      assert.equal(result.status, 400, 'planId ' + JSON.stringify(planId));
      assert.equal(result.body.error, 'VALIDATION_FAILED');
    }
    for (const code of ['a', 'SPRING 15', 'ſpring15', 12345, '', null, undefined]) {
      const result = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code } });
      assert.equal(result.status, 400, 'code ' + JSON.stringify(code));
      assert.equal(result.body.error, 'VALIDATION_FAILED');
    }
    assert.equal((await api('POST', QUOTE, { body: { planId: 'pro', code: 'SPRING15' } })).status, 401);
  });
});

test('quote and checkout report the exact reason a code cannot be used', async () => {
  await withApp(async ({ repo, api }) => {
    const buyer = await makeUser(repo, 'Buyer');
    const other = await makeUser(repo, 'Other');
    const request = (userId, code) => api('POST', QUOTE, { userId, body: { planId: 'pro', code } });

    // unknown and deactivated codes are indistinguishable on purpose (no existence oracle)
    await makeCode(repo, { code: 'DEACTIVATED', active: false });
    for (const code of ['NOSUCHCODE', 'DEACTIVATED']) {
      const result = await request(buyer.id, code);
      assert.equal(result.status, 404, code);
      assert.equal(result.body.error, 'DISCOUNT_CODE_INVALID', code);
    }

    const future = await makeCode(repo, { code: 'NOTYET', startsAt: iso(Date.now() + 5 * HOUR_MS) });
    const notYet = await request(buyer.id, 'NOTYET');
    assert.equal(notYet.status, 409);
    assert.equal(notYet.body.error, 'DISCOUNT_CODE_NOT_STARTED');
    assert.equal(notYet.body.startsAt, future.startsAt);

    const past = await makeCode(repo, { code: 'TOOLATE', expiresAt: iso(Date.now() - HOUR_MS) });
    const tooLate = await request(buyer.id, 'TOOLATE');
    assert.equal(tooLate.status, 409);
    assert.equal(tooLate.body.error, 'DISCOUNT_CODE_EXPIRED');
    assert.equal(tooLate.body.expiresAt, past.expiresAt);

    const full = await makeCode(repo, { code: 'ONLYONE', maxRedemptions: 1 });
    const taken = await repo.discountRedemptions.reserve({ codeId: full.id, userId: other.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + HOUR_MS) });
    assert.ok(taken);
    const exhausted = await request(buyer.id, 'ONLYONE');
    assert.equal(exhausted.status, 409);
    assert.equal(exhausted.body.error, 'DISCOUNT_CODE_EXHAUSTED');

    const used = await makeCode(repo, { code: 'USEDONCE' });
    const usedRedemption = await repo.discountRedemptions.reserve({ codeId: used.id, userId: buyer.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + HOUR_MS) });
    const usedTx = await repo.paymentTransactions.create({ userId: buyer.id, type: 'subscription', provider: 'manual', amountMicroUsd: usedRedemption.finalAmountMicroUsd, productId: 'pro', metadata: { planId: 'pro' } });
    await repo.discountRedemptions.attachTransaction(usedRedemption.id, usedTx.id);
    await repo.discountRedemptions.confirmForTransaction(usedTx.id);
    const alreadyUsed = await request(buyer.id, 'USEDONCE');
    assert.equal(alreadyUsed.status, 409);
    assert.equal(alreadyUsed.body.error, 'DISCOUNT_CODE_ALREADY_USED');

    const pending = await makeCode(repo, { code: 'PENDINGONE' });
    const held = await api('POST', UPGRADE, { userId: buyer.id, body: { planId: 'pro', discountCode: 'PENDINGONE' } });
    assert.equal(held.status, 201);
    const again = await request(buyer.id, 'PENDINGONE');
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'DISCOUNT_CODE_RESERVATION_PENDING');
    assert.equal(again.body.transactionId, held.body.transactionId);
    assert.ok(again.body.reservedUntil);
    assert.ok(pending);

    // checkout reports the very same reasons, and creates nothing
    const checkout = await api('POST', UPGRADE, { userId: buyer.id, body: { planId: 'pro', discountCode: 'ONLYONE' } });
    assert.equal(checkout.status, 409);
    assert.equal(checkout.body.error, 'DISCOUNT_CODE_EXHAUSTED');
  });
});

test('MANUAL checkout charges the discounted amount and snapshots original, discount, code, final and wallet bonus on the transaction', async () => {
  await withApp(async ({ repo, api }) => {
    await setPlanBonus(repo, 'pro', 3);
    const code = await makeCode(repo, { code: 'SPRING15', campaignName: 'Spring', maxRedemptions: 30 });
    const user = await makeUser(repo, 'Manual Buyer');

    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'spring15' } });
    assert.equal(result.status, 201);
    assert.equal(result.body.status, 'pending');
    assert.equal(result.body.invoiceId, undefined, 'the Manual provider never creates a crypto invoice');
    assert.notEqual(result.body.noCost, true);

    const transaction = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(transaction.type, 'subscription');
    assert.equal(transaction.provider, 'manual');
    assert.equal(transaction.productId, 'pro');
    assert.equal(transaction.amountMicroUsd, PRO_15_FINAL, 'the transaction amount IS the final payable amount');
    assert.equal(transaction.metadata.planId, 'pro');
    assert.equal(transaction.metadata.billingInterval, 'month');

    const pricing = transaction.metadata.pricing;
    assert.equal(pricing.originalAmountMicroUsd, PRO_MICRO);
    assert.equal(pricing.discountAmountMicroUsd, PRO_15_DISCOUNT);
    assert.equal(pricing.finalAmountMicroUsd, PRO_15_FINAL);
    assert.equal(pricing.walletBonusMicroUsd, 3_000_000);
    assert.equal(pricing.discount.code, 'SPRING15');
    assert.equal(pricing.discount.campaignName, 'Spring');
    assert.equal(pricing.discount.type, 'percent');
    assert.equal(pricing.discount.value, 1500);
    assert.equal(pricing.discount.codeId, code.id);
    assert.deepEqual(result.body.pricing, pricing, 'the response echoes exactly the authoritative snapshot');

    const redemption = await repo.discountRedemptions.getByTransactionId(transaction.id);
    assert.equal(redemption.status, 'reserved');
    assert.equal(redemption.id, pricing.discount.redemptionId);
    assert.equal(redemption.finalAmountMicroUsd, PRO_15_FINAL);
    const holdMs = new Date(redemption.reservedUntil).getTime() - Date.now();
    assert.ok(Math.abs(holdMs - 24 * HOUR_MS) < 2 * MINUTE_MS, 'the Manual hold is 24 hours, got ' + holdMs + ' ms');
  });
});

test('a checkout without a code still snapshots the plan price and bonus, with no discount', async () => {
  await withApp(async ({ repo, api }) => {
    await setPlanBonus(repo, 'plus', 2);
    const user = await makeUser(repo, 'Plain Buyer');
    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'plus' } });
    assert.equal(result.status, 201);
    const transaction = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(transaction.amountMicroUsd, PLUS_MICRO);
    assert.ok(transaction.metadata.pricing, 'every new subscription checkout carries an authoritative pricing snapshot');
    assert.equal(transaction.metadata.pricing.originalAmountMicroUsd, PLUS_MICRO);
    assert.equal(transaction.metadata.pricing.discountAmountMicroUsd, 0);
    assert.equal(transaction.metadata.pricing.finalAmountMicroUsd, PLUS_MICRO);
    assert.equal(transaction.metadata.pricing.walletBonusMicroUsd, 2_000_000);
    assert.equal(transaction.metadata.pricing.discount, null);
    assert.equal(await repo.discountRedemptions.getByTransactionId(transaction.id), null);
  });
});

test('THE CLIENT CANNOT CHOOSE THE PRICE: amounts, discounts and bonuses sent in the request body are ignored', async () => {
  await withApp(async ({ repo, api }) => {
    await setPlanBonus(repo, 'pro', 3);
    await makeCode(repo, { code: 'SPRING15' });
    const user = await makeUser(repo, 'Cheater');

    const forged = await api('POST', UPGRADE, {
      userId: user.id,
      body: {
        planId: 'pro', discountCode: 'SPRING15',
        amountUsd: 0.01, amountMicroUsd: 1, priceAmountUsd: 0.01, price: { amountUsd: 0 },
        originalAmountMicroUsd: 1, discountAmountMicroUsd: 14_989_999, finalAmountMicroUsd: 1,
        discountType: 'fixed', discountValue: 999, walletBonusUsd: 9999, walletBonusMicroUsd: 9_999_000_000
      }
    });
    assert.equal(forged.status, 201);
    const transaction = await repo.paymentTransactions.get(forged.body.transactionId);
    assert.equal(transaction.amountMicroUsd, PRO_15_FINAL);
    assert.equal(transaction.metadata.pricing.originalAmountMicroUsd, PRO_MICRO);
    assert.equal(transaction.metadata.pricing.discountAmountMicroUsd, PRO_15_DISCOUNT);
    assert.equal(transaction.metadata.pricing.walletBonusMicroUsd, 3_000_000);
    assert.equal(transaction.metadata.pricing.discount.type, 'percent');

    const plain = await makeUser(repo, 'Cheater Two');
    const noCode = await api('POST', UPGRADE, { userId: plain.id, body: { planId: 'pro', amountUsd: 0.01, amountMicroUsd: 1, finalAmountMicroUsd: 1 } });
    assert.equal(noCode.status, 201);
    assert.equal((await repo.paymentTransactions.get(noCode.body.transactionId)).amountMicroUsd, PRO_MICRO);

    const quote = await api('POST', QUOTE, { userId: plain.id, body: { planId: 'pro', code: 'SPRING15', finalAmountMicroUsd: 1, amountUsd: 0.01, discountAmountMicroUsd: 14_989_999 } });
    assert.equal(quote.body.finalAmountMicroUsd, PRO_15_FINAL);
  });
});

test('the quote is provisional: capacity consumed or a code deactivated between quote and checkout is caught at authoritative creation, which creates nothing', async () => {
  await withApp(async ({ repo, api }) => {
    const code = await makeCode(repo, { code: 'LASTSLOT', maxRedemptions: 1 });
    const [first, second, third] = await Promise.all(['First', 'Second', 'Third'].map((name) => makeUser(repo, name)));

    assert.equal((await api('POST', QUOTE, { userId: second.id, body: { planId: 'pro', code: 'LASTSLOT' } })).status, 200);
    assert.equal((await api('POST', UPGRADE, { userId: first.id, body: { planId: 'pro', discountCode: 'LASTSLOT' } })).status, 201);
    const stale = await api('POST', UPGRADE, { userId: second.id, body: { planId: 'pro', discountCode: 'LASTSLOT' } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'DISCOUNT_CODE_EXHAUSTED');
    assert.equal((await repo.paymentTransactions.listForUser(second.id)).length, 0, 'the refused checkout created no transaction');
    assert.equal((await repo.discountCodes.stats(code.id)).pendingReservations, 1, 'and no extra reservation');

    const other = await makeCode(repo, { code: 'WILLDIE' });
    assert.equal((await api('POST', QUOTE, { userId: third.id, body: { planId: 'pro', code: 'WILLDIE' } })).status, 200);
    await repo.discountCodes.update(other.id, { active: false });
    const gone = await api('POST', UPGRADE, { userId: third.id, body: { planId: 'pro', discountCode: 'WILLDIE' } });
    assert.equal(gone.status, 404);
    assert.equal(gone.body.error, 'DISCOUNT_CODE_INVALID');
    assert.equal((await repo.paymentTransactions.listForUser(third.id)).length, 0);
  });
});

test('ZERO-PRICE (Manual): a code that makes the plan free confirms server-side through the transaction model - no invoice, no client trust', async () => {
  await withApp(async ({ repo, api }) => {
    const code = await makeCode(repo, { code: 'FREEPRO', discountType: 'percent', discountValue: 10000 });
    const user = await makeUser(repo, 'Free Buyer');

    const quote = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: 'FREEPRO' } });
    assert.equal(quote.body.finalAmountMicroUsd, 0);
    assert.equal(quote.body.noCost, true);

    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'FREEPRO' } });
    assert.equal(result.status, 201);
    assert.equal(result.body.status, 'confirmed');
    assert.equal(result.body.noCost, true);
    assert.equal(result.body.invoiceId, undefined);

    const transaction = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(transaction.status, 'confirmed', 'confirmed through the real transaction, not faked by the client');
    assert.equal(transaction.amountMicroUsd, 0);
    assert.ok(transaction.confirmedAt);
    assert.equal((await repo.discountRedemptions.getByTransactionId(transaction.id)).status, 'confirmed');
    assert.equal((await repo.discountCodes.stats(code.id)).confirmed, 1);
    assert.equal((await api('GET', '/api/sync/subscriptions', { userId: user.id })).body.plan, 'pro');
  });
});

test('BSC checkout: the invoice is generated for the DISCOUNTED amount and the hold equals the invoice expiry', async () => {
  await withApp(async ({ repo, api }) => {
    await setBscConfig(repo, { invoiceExpiryMinutes: 45 });
    mockRpc({ chainId: 56 });
    await makeCode(repo, { code: 'SPRING15', maxRedemptions: 30 });
    const user = await makeUser(repo, 'Crypto Buyer');

    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'SPRING15' } });
    assert.equal(result.status, 201);
    assert.ok(result.body.invoiceId, 'a crypto checkout answers with an invoice');

    const transaction = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(transaction.provider, 'bsc_crypto');
    assert.equal(transaction.amountMicroUsd, PRO_15_FINAL);
    assert.equal(transaction.metadata.pricing.originalAmountMicroUsd, PRO_MICRO);
    assert.equal(transaction.metadata.pricing.finalAmountMicroUsd, PRO_15_FINAL);

    const invoice = await api('GET', '/api/sync/wallet/invoices/' + result.body.invoiceId, { userId: user.id });
    assert.equal(invoice.status, 200);
    assert.equal(invoice.body.usdAmountMicroUsd, PRO_15_FINAL);
    assert.equal(invoice.body.atomicAmount, '12741500000000000000', '12.7415 tokens at 18 decimals');
    assert.notEqual(invoice.body.atomicAmount, '14990000000000000000', 'never an invoice for the undiscounted amount');

    const redemption = await repo.discountRedemptions.getByTransactionId(transaction.id);
    const holdMs = new Date(redemption.reservedUntil).getTime() - Date.now();
    assert.ok(Math.abs(holdMs - 45 * MINUTE_MS) < 2 * MINUTE_MS, 'the hold follows the configured invoice expiry (45 min), got ' + holdMs + ' ms');
    const stored = await repo.cryptoInvoices.get(result.body.invoiceId);
    assert.ok(Math.abs(new Date(redemption.reservedUntil).getTime() - new Date(stored.expiresAt).getTime()) < MINUTE_MS, 'reservation and invoice lapse together');
  });
});

test('BSC ZERO-PRICE: a free checkout creates no invoice and never contacts the chain', async () => {
  await withApp(async ({ repo, api }) => {
    await setBscConfig(repo);
    const rpc = rpcCallCounter();
    await makeCode(repo, { code: 'FREEPRO', discountType: 'percent', discountValue: 10000 });
    const user = await makeUser(repo, 'Free Crypto Buyer');

    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'FREEPRO' } });
    assert.equal(result.status, 201);
    assert.equal(result.body.status, 'confirmed');
    assert.equal(result.body.noCost, true);
    assert.equal(result.body.invoiceId, undefined);
    assert.equal(rpc.calls, 0, 'no RPC call for a zero-price purchase');
    assert.equal(await repo.cryptoInvoices.getByTransactionId(result.body.transactionId), null);
    assert.equal((await api('GET', '/api/sync/subscriptions', { userId: user.id })).body.plan, 'pro');
  });
});

test('a provider failure after the reservation (BSC chain mismatch) releases the hold, so the user can simply retry', async () => {
  await withApp(async ({ repo, api }) => {
    await setBscConfig(repo);
    const code = await makeCode(repo, { code: 'SPRING15', maxRedemptions: 5 });
    const user = await makeUser(repo, 'Unlucky Buyer');

    mockRpc({ chainId: 97 });
    const failed = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'SPRING15' } });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, 'BSC_CHAIN_ID_MISMATCH');
    assert.equal((await repo.discountCodes.stats(code.id)).pendingReservations, 0, 'the failed checkout does not hold a slot');

    mockRpc({ chainId: 56 });
    const retry = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'SPRING15' } });
    assert.equal(retry.status, 201, 'the retry must not be blocked by RESERVATION_PENDING');
    assert.ok(retry.body.invoiceId);
  });
});

test('wallet top-ups and storage purchases never read or consume a discount code', async () => {
  await withApp(async ({ repo, api }) => {
    const code = await makeCode(repo, { code: 'SPRING15', maxRedemptions: 5 });
    const user = await makeUser(repo, 'Multi Buyer');

    const topUp = await api('POST', '/api/sync/wallet/topup-request', { userId: user.id, body: { amountUsd: 10, discountCode: 'SPRING15' } });
    assert.equal(topUp.status, 201);
    assert.equal((await repo.paymentTransactions.get(topUp.body.transactionId)).amountMicroUsd, 10_000_000);

    await api('GET', '/api/sync/storage/products', { userId: user.id });
    const storage = await api('POST', '/api/sync/storage/purchase-request', { userId: user.id, body: { productId: 'storage-25', discountCode: 'SPRING15' } });
    assert.equal(storage.status, 201);
    assert.equal((await repo.paymentTransactions.get(storage.body.transactionId)).amountMicroUsd, 4_990_000);

    assert.equal((await repo.discountCodes.stats(code.id)).pendingReservations, 0, 'neither purchase touched the code');
    assert.equal(await repo.discountRedemptions.getByTransactionId(topUp.body.transactionId), null);
    assert.equal(await repo.discountRedemptions.getByTransactionId(storage.body.transactionId), null);
  });
});

test('code attempts are rate-limited per user (20 per window); code-less checkout is not', async () => {
  await withApp(async ({ repo, api }) => {
    await makeCode(repo, { code: 'SPRING15' });
    const guesser = await makeUser(repo, 'Guesser');
    const bystander = await makeUser(repo, 'Bystander');

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const result = await api('POST', QUOTE, { userId: guesser.id, body: { planId: 'pro', code: 'GUESS' + attempt } });
      assert.equal(result.status, 404, 'attempt ' + attempt + ' is still answered');
    }
    const blocked = await api('POST', QUOTE, { userId: guesser.id, body: { planId: 'pro', code: 'GUESS21' } });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error, 'RATE_LIMITED');
    assert.ok(blocked.headers.get('retry-after'), 'a Retry-After header is sent');

    const checkoutWithCode = await api('POST', UPGRADE, { userId: guesser.id, body: { planId: 'pro', discountCode: 'SPRING15' } });
    assert.equal(checkoutWithCode.status, 429, 'quote and checkout share one budget');
    const checkoutWithoutCode = await api('POST', UPGRADE, { userId: guesser.id, body: { planId: 'plus' } });
    assert.equal(checkoutWithoutCode.status, 201, 'buying without a code is never throttled by code guessing');

    const fresh = await api('POST', QUOTE, { userId: bystander.id, body: { planId: 'pro', code: 'SPRING15' } });
    assert.equal(fresh.status, 200, 'another user is unaffected');
  });
});

test('concurrency over HTTP: two users racing for the last slot yield exactly one checkout; one user double-submitting yields exactly one', async () => {
  await withApp(async ({ repo, api }) => {
    const code = await makeCode(repo, { code: 'RACE', maxRedemptions: 1 });
    const [a, b] = await Promise.all([makeUser(repo, 'Racer A'), makeUser(repo, 'Racer B')]);
    const results = await Promise.all([a, b].map((user) => api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'RACE' } })));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(results.find((r) => r.status === 409).body.error, 'DISCOUNT_CODE_EXHAUSTED');
    assert.equal((await repo.discountCodes.stats(code.id)).pendingReservations, 1);
    const allTransactions = [...await repo.paymentTransactions.listForUser(a.id), ...await repo.paymentTransactions.listForUser(b.id)];
    assert.equal(allTransactions.length, 1, 'only the winner has a transaction');

    const open = await makeCode(repo, { code: 'DOUBLECLICK', maxRedemptions: 5 });
    const clicker = await makeUser(repo, 'Clicker');
    const clicks = await Promise.all(Array.from({ length: 8 }, () => api('POST', UPGRADE, { userId: clicker.id, body: { planId: 'pro', discountCode: 'DOUBLECLICK' } })));
    assert.equal(clicks.filter((r) => r.status === 201).length, 1);
    clicks.filter((r) => r.status !== 201).forEach((r) => assert.equal(r.body.error, 'DISCOUNT_CODE_RESERVATION_PENDING'));
    assert.equal((await repo.paymentTransactions.listForUser(clicker.id)).length, 1);
    assert.equal((await repo.discountCodes.stats(open.id)).pendingReservations, 1);
  });
});
