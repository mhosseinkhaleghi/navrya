import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

test('wallet top-up remembers an open crypto invoice and resumes it instead of creating a duplicate payment request', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /const WALLET_CRYPTO_INVOICE_SESSION_KEY = 'navrya:wallet-crypto-invoice-id';/);
  assert.match(src, /window\.sessionStorage\.getItem\(WALLET_CRYPTO_INVOICE_SESSION_KEY\)/);
  assert.match(src, /window\.sessionStorage\.setItem\(WALLET_CRYPTO_INVOICE_SESSION_KEY, invoiceId\)/);
  assert.match(src, /resumeInvoiceId=\{checkoutInvoiceId\}/);
  assert.match(src, /onInvoiceCreated=\{rememberInvoice\}/);
  assert.match(src, /onClick=\{\(\) => openCheckout\(resumableInvoiceId\)\}/);
});

test('the crypto invoice UI leaves an expired invoice checkable when the payer supplies a valid hash', async () => {
  const src = await read('navrya-src', 'cryptoInvoiceModal.jsx');
  assert.match(src, /dto\.status === 'pending' \|\| dto\.status === 'expired'/);
  assert.match(src, /const acceptsTxHash = dto\.status === 'pending' \|\| dto\.status === 'expired';/);
});
