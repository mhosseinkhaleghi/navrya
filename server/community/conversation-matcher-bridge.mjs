// Journey H2, Gate 2: loads the real, browser-authored ai-conversation-matcher.js via
// vm.runInNewContext - the exact technique this repo's own test suite already uses hundreds of
// times to run a classic `window.*`-attaching script under Node - so server-side publish
// validation and collision checks share the literal same scoring implementation the production
// Router and the admin Trigger Lab both run in the browser. There is no second copy of the
// scoring algorithm anywhere in this codebase, byte-for-byte, not merely "kept in sync by a test"
// (the profile-xp-rules.js/xp-rules.mjs precedent, acceptable there for a handful of flat
// constants but not for a real scoring algorithm this size).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const matcherPath = path.join(here, '..', '..', 'public', 'pages', 'shared', 'ai-conversation-matcher.js');

let cachedMatcher = null;

// Loaded once per process and cached - the source file only changes with a real deploy, never
// at runtime, so re-parsing it on every validation call would be pure waste.
export async function getConversationMatcher() {
  if (cachedMatcher) return cachedMatcher;
  const source = await readFile(matcherPath, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'ai-conversation-matcher.js' });
  cachedMatcher = sandbox.window.TradeJournalAIConversationMatcher;
  if (!cachedMatcher) throw new Error('CONVERSATION_MATCHER_LOAD_FAILED');
  return cachedMatcher;
}
