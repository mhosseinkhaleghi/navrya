import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

const clone = value => JSON.parse(JSON.stringify(value));

async function knowledgeSandbox(overrides) {
  const sandbox = { window: {} };
  sandbox.window = Object.assign(sandbox.window, { TradeJournalAIActionRegistry: (overrides || {}).actionRegistry });
  vm.runInNewContext(await source('ai-knowledge-registry.js'), sandbox, { filename: 'ai-knowledge-registry.js' });
  return sandbox.window.TradeJournalAIKnowledgeRegistry;
}

// A floor, not the full list: removing one of these is a deliberate act that must touch this test.
// The registry's own size is never hardcoded anywhere - ask listDomains().
const REQUIRED_DOMAIN_IDS = ['dashboard', 'instrument-catalog', 'sessions', 'trade-planning', 'trading-accounts', 'strategies', 'patterns', 'reports', 'psychology', 'ai-assistant', 'community', 'account', 'settings', 'character',
  'session-ai-analysis', 'analysis-profiles', 'media-drive', 'subscription-wallet', 'referral-affiliate', 'support', 'panel-studio'];

test('every required real NAVRYA domain is registered', async () => {
  const registry = await knowledgeSandbox();
  const ids = registry.listDomains().map((d) => d.id);
  REQUIRED_DOMAIN_IDS.forEach((id) => assert.ok(ids.indexOf(id) > -1, 'missing domain: ' + id));
});

test('getDomain() returns a full entry with every field defaulted', async () => {
  const registry = await knowledgeSandbox();
  const dashboard = registry.getDomain('dashboard');
  assert.equal(dashboard.id, 'dashboard');
  assert.ok(dashboard.title.length > 0);
  assert.ok(Array.isArray(dashboard.entities));
  assert.ok(Array.isArray(dashboard.relatedDomains));
});

test('getDomain() returns null for an unknown id, never a guessed/fabricated entry', async () => {
  const registry = await knowledgeSandbox();
  assert.equal(registry.getDomain('does-not-exist'), null);
});

test('registerKnowledgeDomain() rejects a duplicate id rather than silently overwriting it', async () => {
  const registry = await knowledgeSandbox();
  const before = registry.getDomain('dashboard').title;
  const result = registry.registerKnowledgeDomain({ id: 'dashboard', title: 'Fake Overwrite' });
  assert.equal(result, null);
  assert.equal(registry.getDomain('dashboard').title, before);
});

test('registerKnowledgeDomain() rejects malformed input (no id) without throwing', async () => {
  const registry = await knowledgeSandbox();
  assert.equal(registry.registerKnowledgeDomain({ title: 'no id here' }), null);
  assert.equal(registry.registerKnowledgeDomain(null), null);
});

test('a future, fake domain can register without touching any existing core logic', async () => {
  const registry = await knowledgeSandbox();
  const before = registry.listDomains().length;
  const registered = registry.registerKnowledgeDomain({ id: 'future-voice', title: 'Voice', description: 'A future voice input domain.' });
  assert.ok(registered);
  assert.equal(registry.listDomains().length, before + 1);
  assert.equal(registry.getDomain('future-voice').title, 'Voice');
});

// ---- real relationships only reference domains/entities that actually exist ----

test('every relatedDomains reference points at a real, registered domain id', async () => {
  const registry = await knowledgeSandbox();
  const ids = registry.listDomains().map((d) => d.id);
  registry.listDomains().forEach((domain) => {
    (domain.relatedDomains || []).forEach((relatedId) => {
      assert.ok(ids.indexOf(relatedId) > -1, domain.id + ' references unknown related domain: ' + relatedId);
    });
  });
});

// ---- actions knowledge generated live from the real Action Registry, never hand-duplicated ----

test('actionsKnowledge() reflects whatever the real Action Registry currently reports, live', async () => {
  const actionRegistry = { catalogFor: () => [{ id: 'trade.calculator', description: 'Plan a trade', aliases: [], requiredFields: ['riskPercent'], optionalFields: [] }] };
  const registry = await knowledgeSandbox({ actionRegistry });
  assert.deepEqual(clone(registry.actionsKnowledge()), [{ id: 'trade.calculator', description: 'Plan a trade', aliases: [], requiredFields: ['riskPercent'], optionalFields: [] }]);
});

test('actionsKnowledge() never fabricates an action when no Action Registry is present', async () => {
  const registry = await knowledgeSandbox({});
  assert.deepEqual(clone(registry.actionsKnowledge()), []);
});

test('actionsKnowledge() never throws if the real registry itself throws', async () => {
  const registry = await knowledgeSandbox({ actionRegistry: { catalogFor: () => { throw new Error('boom'); } } });
  assert.deepEqual(clone(registry.actionsKnowledge()), []);
});

// ---- deterministic lexical search ----

test('search() finds the Sessions domain for a query mentioning "scenario"', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('what is a scenario');
  assert.ok(results.some((d) => d.id === 'sessions'));
});

test('search() finds the Strategies domain for a query mentioning "max risk"', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('what does strategy max risk affect');
  assert.ok(results.some((d) => d.id === 'strategies'));
});

test('search() finds the Psychology domain for a mental-health-adjacent query', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('where can I review my psychology profile');
  assert.ok(results.some((d) => d.id === 'psychology'));
});

test('search() returns an empty array for an empty/unrelated query rather than guessing a domain', async () => {
  const registry = await knowledgeSandbox();
  assert.deepEqual(clone(registry.search('')), []);
  assert.deepEqual(clone(registry.search('zzzzz qqqqq')), []);
});

test('search() respects a limit option', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('trade session strategy pattern', { limit: 2 });
  assert.ok(results.length <= 2);
});

// ---- honest, non-hallucinated coverage of known real gaps ----

test('the reports domain honestly documents that it is legacy/unreachable, never presented as live navigation', async () => {
  const registry = await knowledgeSandbox();
  const reports = registry.getDomain('reports');
  assert.ok(reports.notes && reports.notes.toLowerCase().indexOf('legacy') > -1);
});

test('the community domain documents marketplace purchases as an explicit mock, not real billing', async () => {
  const registry = await knowledgeSandbox();
  const community = registry.getDomain('community');
  assert.ok(community.notes && community.notes.toLowerCase().indexOf('mock') > -1);
});

// ---- a query in each language finds the domain that owns the concept (added with the 2026-09 refresh) ----
// One English, one Persian and one Arabic question per domain that was added or reworked. The domain must
// come FIRST, not merely appear somewhere in the top five.

const QUERIES_BY_DOMAIN = {
  'session-ai-analysis': { en: 'how does the AI analysis of a session work', fa: 'تحلیل هوش مصنوعی سشن چگونه کار می‌کند', ar: 'كيف يعمل تحليل الذكاء الاصطناعي للجلسة' },
  'analysis-profiles': { en: 'what is an analysis profile', fa: 'پروفایل تحلیل چیست', ar: 'ما هو ملف التحليل' },
  'media-drive': { en: 'where do my screenshots go in the media drive', fa: 'مدیا درایو چیست', ar: 'أين تذهب لقطات الشاشة' },
  'subscription-wallet': { en: 'how do I apply a discount coupon to a plan', fa: 'کد تخفیف اشتراک را کجا وارد کنم', ar: 'كيف أشحن المحفظة' },
  'referral-affiliate': { en: 'how do I get paid for referrals commission', fa: 'کمیسیون معرفی چطور پرداخت می‌شود', ar: 'كيف أحصل على عمولة الإحالة' },
  support: { en: 'how do I open a support ticket', fa: 'چطور تیکت پشتیبانی بفرستم', ar: 'كيف أفتح تذكرة دعم' },
  'panel-studio': { en: 'can I build a custom panel with vibe coding', fa: 'پنل ساز با کدنویسی هوش مصنوعی', ar: 'كيف أنشئ لوحة مخصصة' },
  psychology: { en: 'how do I build a morning routine', fa: 'روتین روزانه را چطور بسازم', ar: 'كيف أبني الروتين' },
  sessions: { en: 'what is the analysis map in a session', fa: 'نقشه تحلیل چیست', ar: 'خريطة التحليل' },
  dashboard: { en: 'which panels can I add to the dashboard', fa: 'چه پنل‌هایی به داشبورد اضافه کنم', ar: 'أضف لوحة' },
  account: { en: 'how do I see my level and achievements', fa: 'سطح و دستاوردهای من', ar: 'المستوى والإنجازات' },
  'ai-assistant': { en: 'how do I change the assistant persona voice', fa: 'صدای دستیار هوش مصنوعی', ar: 'صوت المساعد' }
};

Object.keys(QUERIES_BY_DOMAIN).forEach((id) => {
  ['en', 'fa', 'ar'].forEach((lang) => {
    test('search() finds the ' + id + ' domain first for a ' + lang + ' question', async () => {
      const registry = await knowledgeSandbox();
      const query = QUERIES_BY_DOMAIN[id][lang];
      const results = registry.search(query);
      assert.ok(results.length > 0, 'no result for: ' + query);
      assert.equal(results[0].id, id, 'expected ' + id + ' first for "' + query + '", got ' + results.map((d) => d.id).join(', '));
    });
  });
});

test('search() finds the Calm Room through the psychology domain in all three languages', async () => {
  const registry = await knowledgeSandbox();
  ['what is the calm room', 'اتاق آرامش چیست', 'غرفة الهدوء'].forEach((query) => {
    assert.ok(registry.search(query).some((d) => d.id === 'psychology'), 'psychology missing for: ' + query);
  });
});

// ---- Persian / Arabic matching mechanics ----

test('a query made only of Persian or Arabic function words matches nothing, never a domain by accident', async () => {
  const registry = await knowledgeSandbox();
  ['این چیست و برای چه است؟', 'من می‌خواهم', 'ماذا يمكنني أن أفعل هنا', 'هل هذا في المكان'].forEach((query) => {
    assert.deepEqual(clone(registry.search(query)), [], 'expected no match for: ' + query);
  });
});

test('a zero-width-non-joiner plural still finds the base word, and the bare plural suffix matches nothing', async () => {
  const registry = await knowledgeSandbox();
  assert.equal(registry.search('پروفایل‌های تحلیل')[0].id, 'analysis-profiles');
  assert.equal(registry.search('سشن‌ها')[0].id, 'sessions');
  assert.deepEqual(clone(registry.search('ها')), []);
  assert.deepEqual(clone(registry.search('های')), []);
});

test('Arabic-keyboard letters (ي ك ة ى) and dropped hamza/madda find the same Persian or Arabic vocabulary', async () => {
  const registry = await knowledgeSandbox();
  assert.equal(registry.search('اشتراك')[0].id, 'subscription-wallet'); // Arabic kaf, the vocabulary uses Persian kaf
  assert.equal(registry.search('الاحالة')[0].id, 'referral-affiliate'); // hamza dropped
  assert.equal(registry.search('محفظه')[0].id, 'subscription-wallet'); // teh marbuta typed as heh
  assert.equal(registry.search('ارامش')[0].id, 'psychology'); // madda dropped
});

test('the Arabic word for "how" never collides with the Persian word for "wallet" after the letter fold', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('كيف أفتح تذكرة دعم').map((d) => d.id);
  assert.equal(results.indexOf('subscription-wallet'), -1, 'the fold made "how" match the wallet domain: ' + results.join(', '));
  assert.equal(registry.search('کیف پول')[0].id, 'subscription-wallet');
});

// ---- vocabulary hygiene (the rules in docs/ai/knowledge-base.md "Keeping the Knowledge Base current") ----

test('every domain carries Persian and Arabic vocabulary, so a Persian or Arabic question can ever match it', async () => {
  const registry = await knowledgeSandbox();
  const missing = [];
  registry.listDomains().forEach((domain) => {
    const vocabulary = [].concat(domain.terms || [], domain.entities || []);
    // Persian-only letters mark a Persian entry; Arabic-only letters or the definite article mark an Arabic one.
    if (!vocabulary.some((entry) => /[پچژگکی]/.test(entry))) missing.push(domain.id + ': no Persian term');
    if (!vocabulary.some((entry) => /[يكةىأإ]|(^|\s)ال/.test(entry))) missing.push(domain.id + ': no Arabic term');
  });
  assert.deepEqual(missing, [], 'add Persian and Arabic terms (not descriptions) to: ' + missing.join('; '));
});

test('no searchable vocabulary entry contains a zero-width non-joiner (write two words with a space instead)', async () => {
  const registry = await knowledgeSandbox();
  registry.listDomains().forEach((domain) => {
    [domain.title].concat(domain.terms || [], domain.entities || []).forEach((entry) => {
      assert.equal(String(entry).indexOf(String.fromCharCode(0x200c)), -1, domain.id + ' has a ZWNJ in: ' + entry);
    });
  });
});

// ---- per-turn size budget (docs/ai/context-builder.md "Size budget") ----

test('no single domain\'s model-visible text exceeds the per-domain budget, so a page-seeded turn never balloons', async () => {
  const registry = await knowledgeSandbox();
  // The exact fields chat-dock-core.js's shapeProductContextForWire() sends. 2600 chars is ~650 tokens at 4 chars/token.
  const PER_DOMAIN_MAX_CHARS = 2600;
  const over = registry.listDomains()
    .map((d) => ({ id: d.id, chars: JSON.stringify({ id: d.id, title: d.title, description: d.description, workflows: d.workflows, capabilities: d.capabilities, relationships: d.relationships, notes: d.notes }).length }))
    .filter((row) => row.chars > PER_DOMAIN_MAX_CHARS);
  assert.deepEqual(clone(over), [], 'shorten these domains (description/workflows/capabilities/relationships/notes are what the model receives): ' + over.map((r) => r.id + '=' + r.chars).join(', '));
});
