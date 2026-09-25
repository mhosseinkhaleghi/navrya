// Coverage guard for the AI Knowledge Base (LAYER A, public/pages/shared/ai-knowledge-registry.js).
//
// `npm run ai:knowledge:check` only proves the generated JSON matches the registry. It never
// compares the registry with the APP. This test does, for the parts that can be checked
// mechanically: every sidebar item, every navrya-src/*View.jsx, every file a domain says it was
// verified against, and every wired Dashboard panel type must be accounted for by a domain.
//
// It catches MISSING coverage of a surface. It cannot tell that the wording of an existing domain
// went stale - that part depends on the rule in skills/navrya-architecture/SKILL.md ("Safe design
// rules") and the how-to in docs/ai/knowledge-base.md ("Keeping the Knowledge Base current").
//
// The checks are pure functions over (source text, registry domains), so the last section runs them
// on synthetic input to prove they really fail - the guard cannot silently stop guarding.
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const repoFile = (...parts) => path.join(root, ...parts);

const HOW_TO_FIX = [
  'How to fix: add or extend the matching domain in public/pages/shared/ai-knowledge-registry.js',
  '(fill verifiedAgainst with the files you actually read, add English + Persian + Arabic terms),',
  'run "npm run ai:knowledge:build" and commit the regenerated public/pages/shared/ai-knowledge/domains.generated.json,',
  'and keep tests/ai-knowledge-coverage.test.mjs green.',
  'Rule: skills/navrya-architecture/SKILL.md (Safe design rules). How-to: docs/ai/knowledge-base.md ("Keeping the Knowledge Base current").'
].join(' ');

// A sidebar id that no domain claims through `routes: ["activeId: '<id>'"]`, with the one-line reason.
const SIDEBAR_ID_ALLOWLIST = {
  more: 'placeholder "More tools" entry: store.setActiveId() has no route for it and no page renders for it, so there is nothing to describe'
};

// A navrya-src/*View.jsx that no domain lists in verifiedAgainst, with the one-line reason.
const VIEW_ALLOWLIST = {};

async function loadDomains() {
  const sandbox = { window: {} };
  vm.runInNewContext(await readFile(repoFile('public', 'pages', 'shared', 'ai-knowledge-registry.js'), 'utf8'), sandbox, { filename: 'ai-knowledge-registry.js' });
  return sandbox.window.TradeJournalAIKnowledgeRegistry.listDomains();
}

// ---- pure checks ----------------------------------------------------------------------------

// The sidebar's own item list: `{ id: '<id>', icon: ...` entries inside navItems().
function parseSidebarIds(characterAppSource) {
  const start = characterAppSource.indexOf('function navItems(');
  if (start < 0) return [];
  const end = characterAppSource.indexOf('\n}', start);
  const body = characterAppSource.slice(start, end < 0 ? undefined : end);
  return Array.from(body.matchAll(/\{\s*id:\s*'([a-z][a-z0-9-]*)'\s*,\s*icon:/g), (m) => m[1]);
}

function claimsSidebarId(domain, id) {
  const pattern = new RegExp("activeId:\\s*'" + id + "'");
  return (domain.routes || []).some((route) => pattern.test(route));
}

function unclaimedSidebarIds(ids, domains, allowlist) {
  return ids.filter((id) => !allowlist[id] && !domains.some((domain) => claimsSidebarId(domain, id)));
}

// verifiedAgainst entries may carry a trailing note such as "navrya-src/x.jsx (PositionsView)".
function verifiedPath(entry) {
  return String(entry).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

async function missingVerifiedFiles(domains, exists) {
  const missing = [];
  for (const domain of domains) {
    for (const entry of domain.verifiedAgainst || []) {
      const file = verifiedPath(entry);
      if (!(await exists(file))) missing.push(domain.id + ' -> ' + file);
    }
  }
  return missing;
}

function unlistedViews(viewFiles, domains, allowlist) {
  const listed = new Set();
  domains.forEach((domain) => (domain.verifiedAgainst || []).forEach((entry) => listed.add(verifiedPath(entry))));
  return viewFiles.filter((file) => !allowlist[path.posix.basename(file)] && !listed.has(file));
}

function sliceBetween(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return '';
  const end = source.indexOf('\n}', start);
  return source.slice(start, end < 0 ? undefined : end);
}

// Wired panel types: `case '<id>': return <Component ...` in panelBody(), minus the NoBackendPanel placeholders.
function parseWiredPanelTypes(dashboardSource) {
  const body = sliceBetween(dashboardSource, 'function panelBody(');
  return Array.from(body.matchAll(/case '([A-Za-z]+)':\s*return\s*<([A-Za-z]+)/g))
    .filter((m) => m[2] !== 'NoBackendPanel')
    .map((m) => m[1]);
}

function parseCatalogPanelTypes(dashboardSource) {
  const body = sliceBetween(dashboardSource, 'export function catalog(');
  return Array.from(body.matchAll(/^\s+([A-Za-z]+):\s*\{\s*title:/gm), (m) => m[1]);
}

const PANEL_LIST_PREFIX = 'board panel types (by id):';

// The dashboard domain lists its panel ids in one capabilities entry: "board panel types (by id): a, b, c".
function listedPanelTypes(dashboardDomain) {
  const entry = (dashboardDomain && dashboardDomain.capabilities || []).find((line) => String(line).toLowerCase().startsWith(PANEL_LIST_PREFIX));
  if (!entry) return null;
  return String(entry).slice(PANEL_LIST_PREFIX.length).split(',').map((id) => id.trim()).filter(Boolean);
}

function panelTypeProblems(wired, catalogIds, listed) {
  if (!listed) return ['the dashboard domain has no capabilities entry starting with "' + PANEL_LIST_PREFIX + '"'];
  return [].concat(
    wired.filter((id) => listed.indexOf(id) < 0).map((id) => 'wired panel type "' + id + '" is not listed'),
    listed.filter((id) => catalogIds.indexOf(id) < 0).map((id) => 'listed panel type "' + id + '" no longer exists in the dashboard catalog')
  );
}

const fail = (title, lines) => title + '\n  - ' + lines.join('\n  - ') + '\n' + HOW_TO_FIX;

// ---- the real repository ----------------------------------------------------------------------

test('every sidebar item in navItems() is claimed by a domain route (activeId: \'<id>\') or a reasoned allowlist entry', async () => {
  const ids = parseSidebarIds(await readFile(repoFile('navrya-src', 'character-app.jsx'), 'utf8'));
  assert.ok(ids.length >= 5, 'could not parse the sidebar ids out of navItems() in navrya-src/character-app.jsx - update parseSidebarIds() in this test if navItems() changed shape');
  const domains = await loadDomains();
  const unclaimed = unclaimedSidebarIds(ids, domains, SIDEBAR_ID_ALLOWLIST);
  assert.deepEqual(unclaimed, [], fail('Sidebar item(s) with no Knowledge Base domain: ' + unclaimed.join(', ') + '. Add a route entry "activeId: \'<id>\'" to the domain that describes the page.', unclaimed));
});

test('the sidebar allowlist has no stale or unexplained entries', async () => {
  const ids = parseSidebarIds(await readFile(repoFile('navrya-src', 'character-app.jsx'), 'utf8'));
  const domains = await loadDomains();
  Object.keys(SIDEBAR_ID_ALLOWLIST).forEach((id) => {
    assert.ok(SIDEBAR_ID_ALLOWLIST[id].trim().length > 10, 'allowlist entry "' + id + '" needs a one-line reason');
    assert.ok(ids.indexOf(id) > -1, 'allowlist entry "' + id + '" is no longer a sidebar id - remove it from SIDEBAR_ID_ALLOWLIST');
    assert.ok(!domains.some((domain) => claimsSidebarId(domain, id)), 'allowlist entry "' + id + '" is now claimed by a domain - remove it from SIDEBAR_ID_ALLOWLIST');
  });
});

test('every file a domain lists in verifiedAgainst still exists', async () => {
  const domains = await loadDomains();
  const missing = await missingVerifiedFiles(domains, async (file) => access(repoFile(file)).then(() => true, () => false));
  assert.deepEqual(missing, [], fail('verifiedAgainst points at file(s) that no longer exist (renamed or deleted?). Update the domain to the real file it now reads.', missing));
});

test('every navrya-src/*View.jsx is in some domain\'s verifiedAgainst or on the reasoned allowlist', async () => {
  const viewFiles = (await readdir(repoFile('navrya-src'))).filter((name) => /View\.jsx$/.test(name)).map((name) => 'navrya-src/' + name);
  assert.ok(viewFiles.length >= 10, 'expected to find the navrya-src/*View.jsx files');
  const domains = await loadDomains();
  const unlisted = unlistedViews(viewFiles, domains, VIEW_ALLOWLIST);
  assert.deepEqual(unlisted, [], fail('View file(s) no domain says it was verified against: ' + unlisted.join(', ') + '. A new page/view needs a domain (or an existing domain extended and its verifiedAgainst updated).', unlisted));
});

test('the view allowlist has no stale or unexplained entries', async () => {
  const viewFiles = (await readdir(repoFile('navrya-src'))).filter((name) => /View\.jsx$/.test(name));
  const domains = await loadDomains();
  Object.keys(VIEW_ALLOWLIST).forEach((name) => {
    assert.ok(VIEW_ALLOWLIST[name].trim().length > 10, 'allowlist entry "' + name + '" needs a one-line reason');
    assert.ok(viewFiles.indexOf(name) > -1, 'allowlist entry "' + name + '" no longer exists - remove it from VIEW_ALLOWLIST');
    assert.deepEqual(unlistedViews(['navrya-src/' + name], domains, {}), ['navrya-src/' + name], 'allowlist entry "' + name + '" is now in a verifiedAgainst - remove it from VIEW_ALLOWLIST');
  });
});

test('every wired Dashboard panel type is listed in the dashboard domain, and it lists no panel type that is gone', async () => {
  const source = await readFile(repoFile('navrya-src', 'dashboardView.jsx'), 'utf8');
  const wired = parseWiredPanelTypes(source);
  const catalogIds = parseCatalogPanelTypes(source);
  assert.ok(wired.length >= 8 && catalogIds.length >= wired.length, 'could not parse the Dashboard panel types out of navrya-src/dashboardView.jsx (panelBody()/catalog()) - update the parsers in this test if they changed shape');
  const domains = await loadDomains();
  const problems = panelTypeProblems(wired, catalogIds, listedPanelTypes(domains.find((domain) => domain.id === 'dashboard')));
  assert.deepEqual(problems, [], fail('The Dashboard panel list in the "dashboard" domain is out of date.', problems));
});

// ---- the guard itself: it must fail on what it claims to catch ---------------------------------

test('guard self-test: a sidebar id nobody claims is reported, a claimed or allowlisted one is not', () => {
  const domains = [{ id: 'x', routes: ["activeId: 'dashboard'", '#somewhere'] }];
  assert.deepEqual(unclaimedSidebarIds(['dashboard', 'brand-new-page', 'more'], domains, { more: 'reason' }), ['brand-new-page']);
  assert.deepEqual(unclaimedSidebarIds(['dashboard'], domains, {}), []);
});

test('guard self-test: navItems() parsing reads the real shape and a fake nav id is picked up', () => {
  const source = "function navItems(t) {\n  return [\n    { id: 'dashboard', icon: 'dashboard', label: t.a },\n    { id: 'brand-new-page', icon: 'x', label: t.b, ...countFor('x', 1) }\n  ];\n}\n\nfunction other() { return { id: 'not-a-nav-item', icon: 'y' }; }\n";
  assert.deepEqual(parseSidebarIds(source), ['dashboard', 'brand-new-page']);
});

test('guard self-test: a verifiedAgainst file that does not exist is reported, and a trailing note is ignored', async () => {
  const domains = [{ id: 'd', verifiedAgainst: ['navrya-src/there.jsx (SomeView)', 'navrya-src/deleted.jsx'] }];
  const missing = await missingVerifiedFiles(domains, async (file) => file === 'navrya-src/there.jsx');
  assert.deepEqual(missing, ['d -> navrya-src/deleted.jsx']);
});

test('guard self-test: a View file no domain lists is reported, a listed or allowlisted one is not', () => {
  const domains = [{ id: 'd', verifiedAgainst: ['navrya-src/aView.jsx (Part)'] }];
  const files = ['navrya-src/aView.jsx', 'navrya-src/newView.jsx', 'navrya-src/okView.jsx'];
  assert.deepEqual(unlistedViews(files, domains, { 'okView.jsx': 'reason' }), ['navrya-src/newView.jsx']);
});

test('guard self-test: a new wired panel type is reported, a placeholder is not, and a removed one is flagged', () => {
  const source = "export function catalog(t) {\n  return {\n    aaa: { title: 1 },\n    bbb: { title: 2 },\n    ccc: { title: 3 },\n    ddd: { title: 4 }\n  };\n}\n\nfunction panelBody(id, ctx) {\n  switch (id) {\n    case 'aaa': return <A />;\n    case 'bbb': return <B t={t} />;\n    case 'ccc': return <NoBackendPanel t={t} />;\n    case 'ddd': return <D />;\n    default: return null;\n  }\n}\n";
  const wired = parseWiredPanelTypes(source);
  const catalogIds = parseCatalogPanelTypes(source);
  assert.deepEqual(wired, ['aaa', 'bbb', 'ddd']);
  assert.deepEqual(catalogIds, ['aaa', 'bbb', 'ccc', 'ddd']);
  const domain = { capabilities: ['x', 'Board panel types (by id): aaa, bbb, gone'] };
  assert.deepEqual(panelTypeProblems(wired, catalogIds, listedPanelTypes(domain)), ['wired panel type "ddd" is not listed', 'listed panel type "gone" no longer exists in the dashboard catalog']);
  assert.equal(panelTypeProblems(wired, catalogIds, listedPanelTypes({ capabilities: [] })).length, 1);
});
