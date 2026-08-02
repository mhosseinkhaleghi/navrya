import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const source = file => readFile(path.join(root, 'public', 'pages', 'select', file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; this._handlers = {}; this.hidden = false; }
  addEventListener(type, fn) { this._handlers[type] = this._handlers[type] || []; this._handlers[type].push(fn); }
  removeEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  append(...nodes) { this.children.push(...nodes); }
  closest() { return null; }
  focus() {}
  get classList() {
    const self = this;
    return {
      add(c) { if (self.className.split(' ').indexOf(c) === -1) self.className = (self.className + ' ' + c).trim(); },
      remove(c) { self.className = self.className.split(' ').filter(x => x !== c).join(' '); },
      toggle(c, on) { const has = self.className.split(' ').indexOf(c) > -1; const want = on === undefined ? !has : on; if (want && !has) this.add(c); else if (!want && has) this.remove(c); }
    };
  }
}

function fire(node, type) { return (node._handlers[type] || []).map(fn => fn({ preventDefault() {}, target: node })); }

function characterCard(name) {
  const card = new FakeNode('article'); card.dataset.character = name;
  const selectButton = new FakeNode('button');
  selectButton.closest = () => card;
  return { card, selectButton };
}

function buildSandbox(localStorage) {
  const toast = new FakeNode('div');
  const languageButton = new FakeNode('button');
  const languageMenu = new FakeNode('div'); languageMenu.hidden = true;
  const currentLanguage = new FakeNode('span');
  const langButtons = ['fa', 'ar', 'en', 'es'].map(l => { const b = new FakeNode('button'); b.dataset.language = l; return b; });
  const loginButtons = ['google', 'email', 'signup'].map(a => { const b = new FakeNode('button'); b.dataset.action = a; return b; });
  const hunter = characterCard('hunter');
  const engineer = characterCard('engineer');
  const characterCards = [hunter.card, engineer.card];
  const selectButtons = [hunter.selectButton, engineer.selectButton];
  const nameStepOverlay = new FakeNode('div'); nameStepOverlay.hidden = true;
  const nameStepInput = new FakeNode('input'); nameStepInput.dataset.i18nPlaceholder = 'nameStepPlaceholder'; nameStepInput.value = '';
  const nameStepSubmit = new FakeNode('button');
  const nameStepError = new FakeNode('p');
  const nameStepClose = new FakeNode('button');

  const byId = { toast, languageButton, languageMenu, currentLanguage, nameStepOverlay, nameStepInput, nameStepSubmit, nameStepError, nameStepClose };
  const document = {
    querySelector: sel => sel.startsWith('#') ? (byId[sel.slice(1)] || null) : null,
    querySelectorAll: sel => {
      if (sel === '[data-language]') return langButtons;
      if (sel === '[data-i18n]') return [];
      if (sel === '[data-i18n-placeholder]') return [nameStepInput];
      if (sel === '.select-character') return selectButtons;
      if (sel === '.character-card') return characterCards;
      if (sel === '[data-action]') return loginButtons;
      return [];
    },
    documentElement: {},
    addEventListener() {}
  };

  const sandbox = {
    window: {}, document, localStorage: localStorage || memoryStorage(),
    // A real (deferred) setTimeout stand-in: showToast() schedules a delayed "hide again"
    // callback that must NOT run synchronously, or the very act of showing a toast would
    // immediately undo itself within the same tick. Only fire zero-delay calls (e.g. the
    // focus-on-open nicety, or the postMessage-after-select delay) synchronously.
    setTimeout: (fn, delay) => { if (!delay) fn(); return 0; }, clearTimeout() {}
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, setTimeout: sandbox.setTimeout,
    parent: { postMessage() {} },
    TradeJournalDevUserSwitcher: { createUser: async () => ({ id: 'stub-id', displayName: 'Stub' }) }
  });
  return {
    sandbox,
    els: { toast, languageButton, languageMenu, currentLanguage, langButtons, loginButtons, characterCards, hunterCard: hunter.card, hunterSelect: hunter.selectButton, engineerCard: engineer.card, nameStepOverlay, nameStepInput, nameStepSubmit, nameStepError, nameStepClose }
  };
}

// createUserImplFactory receives the SANDBOX's own TypeError constructor (not Node's) so a
// stub that throws `new TypeError(...)` produces an error the sandboxed app.js's own
// `error instanceof TypeError` check actually recognizes - vm contexts each have their own
// realm, so an outer-realm TypeError fails `instanceof` against the sandbox's TypeError even
// with identical name/message.
async function load(localStorage, createUserImplFactory) {
  const { sandbox, els } = buildSandbox(localStorage);
  const context = vm.createContext(sandbox);
  if (createUserImplFactory) {
    const SandboxTypeError = vm.runInContext('TypeError', context);
    sandbox.window.TradeJournalDevUserSwitcher.createUser = createUserImplFactory(SandboxTypeError);
  }
  vm.runInContext(await source('app.js'), context, { filename: 'app.js' });
  return els;
}

test('fresh browser (no dev-user-id): clicking a character\'s Select button opens the name step instead of completing the selection', async () => {
  const els = await load(memoryStorage());
  assert.equal(els.nameStepOverlay.hidden, true, 'starts hidden');
  fire(els.hunterSelect, 'click');
  assert.equal(els.nameStepOverlay.hidden, false, 'the name step opens');
  assert.doesNotMatch(els.hunterCard.className, /selected/, 'the character is NOT selected yet - creating the account comes first');
});

test('fresh browser: the decorative "login" buttons stay pure demo actions - they never open the name step themselves', async () => {
  const els = await load(memoryStorage());
  fire(els.loginButtons[0], 'click');
  assert.equal(els.nameStepOverlay.hidden, true, 'clicking Google/Email/Sign up does not gate on an account - only character selection does');
  assert.match(els.toast.className, /show/, 'the original demo toast still fires for these buttons');
});

test('fresh browser: submitting a name after selecting a character creates the user via the shared createUser() and THEN completes that exact character\'s selection', async () => {
  let calledWith = null;
  const els = await load(memoryStorage(), () => async (name) => { calledWith = name; return { id: 'new-1', displayName: name }; });
  fire(els.hunterSelect, 'click');
  els.nameStepInput.value = 'Alex';
  await Promise.all(fire(els.nameStepSubmit, 'click'));
  assert.equal(calledWith, 'Alex', 'the exact reusable dev-user-switcher.js createUser() is called - not a second, duplicated fetch');
  assert.equal(els.nameStepOverlay.hidden, true, 'the overlay closes once the user is created');
  assert.match(els.hunterCard.className, /selected/, 'the originally-clicked character is now selected');
  assert.doesNotMatch(els.engineerCard.className, /selected/, 'a different character card must not be affected');
});

test('fresh browser: submitting an empty name does not call createUser and keeps the overlay open', async () => {
  let called = false;
  const els = await load(memoryStorage(), () => async () => { called = true; return { id: 'x' }; });
  fire(els.hunterSelect, 'click');
  els.nameStepInput.value = '   ';
  await Promise.all(fire(els.nameStepSubmit, 'click'));
  assert.equal(called, false);
  assert.equal(els.nameStepOverlay.hidden, false);
});

test('a server-rejected create shows the real server error code, not a dead-end generic message', async () => {
  const error = new Error('VALIDATION_FAILED'); error.status = 400;
  const els = await load(memoryStorage(), () => async () => { throw error; });
  fire(els.hunterSelect, 'click');
  els.nameStepInput.value = 'Alex';
  await Promise.all(fire(els.nameStepSubmit, 'click'));
  assert.match(els.nameStepError.textContent, /VALIDATION_FAILED/, 'the underlying server error code must be visible, not hidden behind a generic message');
  assert.equal(els.nameStepOverlay.hidden, false, 'the overlay stays open so the user can retry');
  assert.doesNotMatch(els.hunterCard.className, /selected/, 'no character gets selected on a failed create');
});

test('an unreachable server (fetch itself throws a TypeError) shows a distinct "server unreachable" message instead of the generic one', async () => {
  const els = await load(memoryStorage(), (SandboxTypeError) => async () => { throw new SandboxTypeError('Failed to fetch'); });
  fire(els.hunterSelect, 'click');
  els.nameStepInput.value = 'Alex';
  await Promise.all(fire(els.nameStepSubmit, 'click'));
  assert.match(els.nameStepError.textContent, /dev:community-api/, 'a TypeError from fetch (network/connection failure) must point at starting the community backend, not just say "try again"');
});

test('returning browser (dev-user-id already stored): clicking a character\'s Select button completes the selection immediately, same as today\'s behavior', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:dev-user-id', 'existing-user');
  let createUserCalled = false;
  const els = await load(localStorage, () => async () => { createUserCalled = true; return { id: 'x' }; });
  fire(els.hunterSelect, 'click');
  assert.equal(els.nameStepOverlay.hidden, true, 'the name step never opens for a returning session');
  assert.equal(createUserCalled, false);
  assert.match(els.hunterCard.className, /selected/, 'the character selection completes immediately, unblocked');
});

test('the close button dismisses the overlay without creating a user or selecting a character', async () => {
  let called = false;
  const els = await load(memoryStorage(), () => async () => { called = true; return { id: 'x' }; });
  fire(els.hunterSelect, 'click');
  assert.equal(els.nameStepOverlay.hidden, false);
  fire(els.nameStepClose, 'click');
  assert.equal(els.nameStepOverlay.hidden, true);
  assert.equal(called, false);
  assert.doesNotMatch(els.hunterCard.className, /selected/);
});
