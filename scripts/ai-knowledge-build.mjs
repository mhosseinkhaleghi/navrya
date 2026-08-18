// Journey D: generates a versioned, hashed, provider-independent JSON snapshot of LAYER A
// (public/pages/shared/ai-knowledge-registry.js's own real, application-owned domain
// registrations) under public/pages/shared/ai-knowledge/ - "generate from the canonical source,
// never hand-maintain a second copy" (section 6 of the spec). The registry module itself, loaded
// here via the exact same vm.runInNewContext technique tests/*.test.mjs already use, remains the
// one real source of truth; this script only ever snapshots it, so there is no risk of this file
// silently drifting out of sync with a hand-written duplicate.
//
// IMPORTANT, and stated plainly rather than silently implied: the generated artifact this script
// writes is NOT read by the running app at page-load time. Every character page still loads the
// real, live ai-knowledge-registry.js directly (see public/pages/{hunter,engineer,commander,
// sage}/index.html) - that stays the one runtime source of truth NAVRYA's own AI actually queries
// every turn, exactly as it does today. Reading this JSON file back into the browser instead would
// recreate precisely the "two sources of truth" risk the whole Knowledge Base design otherwise
// avoids. This artifact exists for three narrower, real purposes: (1) `ai:knowledge:check` as a
// CI-style staleness gate - a change to the registry's own domain shape without regenerating the
// committed artifact fails the check; (2) a stable, versioned, diffable snapshot for code review
// and any future external tooling/doc generator; (3) satisfying the spec's own explicit
// "build commands producing versioned/hashed generated JSON artifacts" requirement honestly, not
// symbolically.
//
// Usage: `npm run ai:knowledge:build` (writes/overwrites the artifact) or
// `npm run ai:knowledge:check` (regenerates in memory and fails, non-zero exit, if the committed
// artifact's content hash no longer matches - generated-output-determinism + stale-artifact
// detection, per tests/ai-knowledge-build.test.mjs).
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const registryPath = path.join(root, 'public', 'pages', 'shared', 'ai-knowledge-registry.js');
const outDir = path.join(root, 'public', 'pages', 'shared', 'ai-knowledge');
const outPath = path.join(outDir, 'domains.generated.json');

const ARTIFACT_VERSION = 1;

async function loadRegistry() {
  const source = await readFile(registryPath, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'ai-knowledge-registry.js' });
  return sandbox.window.TradeJournalAIKnowledgeRegistry;
}

// actionsKnowledge() needs a live window.TradeJournalAIActionRegistry, which does not exist in
// this Node build context (no browser, no character-app.jsx mount ever runs here) - deliberately
// left OUT of the generated artifact rather than faked with a stand-in registry, which would risk
// baking a stale action catalog into a committed file. Real per-turn availableActions already
// come from the real, live Action Registry at request time (see ai-context-builder.js's own
// `availableActions` passthrough) - this generated file is LAYER A product-domain knowledge only.
function buildArtifact(registry) {
  const domains = registry.listDomains().map((d) => ({
    id: d.id, title: d.title, description: d.description, routes: d.routes, entities: d.entities,
    workflows: d.workflows, capabilities: d.capabilities, terms: d.terms, relationships: d.relationships,
    relatedDomains: d.relatedDomains, notes: d.notes, verifiedAgainst: d.verifiedAgainst
  }));
  // Deterministic content hash over the version + domain data only (never generatedAt) - running
  // the build twice in a row with no real registry change must produce a byte-identical hash, so
  // `check` can compare against it without false positives from timestamp churn alone.
  const contentHash = createHash('sha256').update(JSON.stringify({ version: ARTIFACT_VERSION, domains })).digest('hex').slice(0, 16);
  return { version: ARTIFACT_VERSION, contentHash, domains };
}

async function readExistingArtifact() {
  try {
    return JSON.parse(await readFile(outPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function writeArtifact(artifact) {
  await mkdir(outDir, { recursive: true });
  const withTimestamp = Object.assign({ generatedAt: new Date().toISOString() }, artifact);
  await writeFile(outPath, JSON.stringify(withTimestamp, null, 2) + '\n', 'utf8');
  return withTimestamp;
}

async function main(mode) {
  const registry = await loadRegistry();
  if (!registry) throw new Error('ai-knowledge-registry.js did not expose window.TradeJournalAIKnowledgeRegistry');
  const fresh = buildArtifact(registry);

  if (mode === 'check') {
    const existing = await readExistingArtifact();
    if (!existing) {
      console.error(`ai:knowledge:check FAILED - ${outPath} does not exist yet. Run "npm run ai:knowledge:build" first.`);
      process.exitCode = 1;
      return;
    }
    if (existing.contentHash !== fresh.contentHash) {
      console.error(`ai:knowledge:check FAILED - the committed artifact is stale (committed hash ${existing.contentHash}, freshly-generated hash ${fresh.contentHash}). Run "npm run ai:knowledge:build" and commit the result.`);
      process.exitCode = 1;
      return;
    }
    console.log(`ai:knowledge:check OK - ${path.relative(root, outPath)} matches the real, live ai-knowledge-registry.js (${fresh.domains.length} domains, hash ${fresh.contentHash}).`);
    return;
  }

  const written = await writeArtifact(fresh);
  console.log(`ai:knowledge:build OK - wrote ${path.relative(root, outPath)} (${written.domains.length} domains, hash ${written.contentHash}).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv[2] === 'check' ? 'check' : 'build';
  main(mode).catch((error) => { console.error(error); process.exitCode = 1; });
}

export { loadRegistry, buildArtifact, readExistingArtifact, writeArtifact, outPath, registryPath };
