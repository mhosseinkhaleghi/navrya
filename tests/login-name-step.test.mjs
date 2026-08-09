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
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; this._handlers = {}; this.hidden = false; this.value = ''; }
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

function buildSandbox(localStorage, isStoredUserValidImpl) {
  const toast = new FakeNode('div');
  const languageButton = new FakeNode('button');
  const languageMenu = new FakeNode('div'); languageMenu.hidden = true;
  const currentLanguage = new FakeNode('span');
  const langButtons = ['fa', 'ar', 'en', 'es'].map(l => { const b = new FakeNode('button'); b.dataset.language = l; return b; });
  const googleButton = new FakeNode('button'); googleButton.dataset.action = 'google';
  const emailButton = new FakeNode('button'); emailButton.dataset.action = 'email';
  const signupButton = new FakeNode('button'); signupButton.dataset.action = 'signup';
  const loginButtons = [googleButton, emailButton, signupButton];
  const hunter = characterCard('hunter');
  const engineer = characterCard('engineer');
  const characterCards = [hunter.card, engineer.card];
  const selectButtons = [hunter.selectButton, engineer.selectButton];
  const authOverlay = new FakeNode('div'); authOverlay.hidden = true;
  const authTitle = new FakeNode('h2');
  const authHint = new FakeNode('p');
  const authNameInput = new FakeNode('input'); authNameInput.dataset.i18nPlaceholder = 'nameStepPlaceholder';
  const authEmailInput = new FakeNode('input'); authEmailInput.dataset.i18nPlaceholder = 'emailPlaceholder';
  const authPasswordInput = new FakeNode('input'); authPasswordInput.dataset.i18nPlaceholder = 'passwordPlaceholder';
  const authSubmit = new FakeNode('button');
  const authError = new FakeNode('p');
  const authClose = new FakeNode('button');
  const authToggleBtn = new FakeNode('button');

  const byId = {
    toast, languageButton, languageMenu, currentLanguage,
    authOverlay, authTitle, authHint, authNameInput, authEmailInput, authPasswordInput, authSubmit, authError, authClose, authToggleBtn
  };
  const document = {
    querySelector: sel => sel.startsWith('#') ? (byId[sel.slice(1)] || null) : null,
    querySelectorAll: sel => {
      if (sel === '[data-language]') return langButtons;
      if (sel === '[data-i18n]') return [];
      if (sel === '[data-i18n-placeholder]') return [authNameInput, authEmailInput, authPasswordInput];
      if (sel === '.select-character') return selectButtons;
      if (sel === '.character-card') return characterCards;
      if (sel === '[data-action="google"]') return [googleButton];
      if (sel === '[data-action="email"]') return [emailButton];
      if (sel === '[data-action="signup"]') return [signupButton];
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
    // focus-on-open nicety, or the postMessage-after-select delay) synchronously - this also
    // means initGoogle() (scheduled via `window.setTimeout(initGoogle, 0)`) runs during load().
    setTimeout: (fn, delay) => { if (!delay) fn(); return 0; }, clearTimeout() {}
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, setTimeout: sandbox.setTimeout,
    parent: { postMessage() {} },
    // isStoredUserValid defaults to "fresh browser" (false) since that's what most tests in this
    // file exercise - app.js's isLoggedIn() asks this (a real server-validity check) instead of
    // a bare localStorage-presence check.
    TradeJournalDevUserSwitcher: {
      register: async () => ({ id: 'stub-id', displayName: 'Stub' }),
      login: async () => ({ id: 'stub-id', displayName: 'Stub' }),
      loginWithGoogle: async () => ({ id: 'stub-id', displayName: 'Stub' }),
      isStoredUserValid: isStoredUserValidImpl || (async () => false)
    }
  });
  return {
    sandbox,
    els: {
      toast, languageButton, languageMenu, currentLanguage, langButtons, loginButtons, googleButton, emailButton, signupButton,
      characterCards, hunterCard: hunter.card, hunterSelect: hunter.selectButton, engineerCard: engineer.card,
      authOverlay, authNameInput, authEmailInput, authPasswordInput, authSubmit, authError, authClose, authToggleBtn
    }
  };
}

// registerImplFactory/loginImplFactory receive the SANDBOX's own TypeError constructor (not
// Node's) so a stub that throws `new TypeError(...)` produces an error the sandboxed app.js's
// own `error instanceof TypeError` check actually recognizes - vm contexts each have their own
// realm, so an outer-realm TypeError fails `instanceof` against the sandbox's TypeError even
// with identical name/message.
async function load(localStorage, overridesFactory, isStoredUserValidImpl) {
  const { sandbox, els } = buildSandbox(localStorage, isStoredUserValidImpl);
  const context = vm.createContext(sandbox);
  if (overridesFactory) {
    const SandboxTypeError = vm.runInContext('TypeError', context);
    Object.assign(sandbox.window.TradeJournalDevUserSwitcher, overridesFactory(SandboxTypeError));
  }
  vm.runInContext(await source('app.js'), context, { filename: 'app.js' });
  return els;
}

test('fresh browser (no session): clicking a character\'s Select button opens the login step instead of completing the selection', async () => {
  const els = await load(memoryStorage());
  assert.equal(els.authOverlay.hidden, true, 'starts hidden');
  await Promise.all(fire(els.hunterSelect, 'click'));
  assert.equal(els.authOverlay.hidden, false, 'the login step opens');
  assert.doesNotMatch(els.hunterCard.className, /selected/, 'the character is NOT selected yet - logging in comes first');
});

test('fresh browser: clicking "Continue with Email" opens the login form directly, without needing a character click first', async () => {
  const els = await load(memoryStorage());
  fire(els.emailButton, 'click');
  assert.equal(els.authOverlay.hidden, false);
});

test('fresh browser: clicking "Sign up" opens the same overlay in signup mode, revealing the display-name field', async () => {
  const els = await load(memoryStorage());
  fire(els.signupButton, 'click');
  assert.equal(els.authOverlay.hidden, false);
  assert.equal(els.authNameInput.hidden, false, 'signup mode must reveal the display-name field, unlike login mode');
});

test('fresh browser: the Google button never crashes when Google Identity Services is unavailable in the sandbox, and shows a toast', async () => {
  const els = await load(memoryStorage());
  fire(els.googleButton, 'click');
  assert.equal(els.authOverlay.hidden, true, 'the Google button does not open the email/password overlay');
  assert.match(els.toast.className, /show/, 'a "not configured" toast is shown instead of silently failing');
});

test('fresh browser: submitting the login form after selecting a character calls login() and THEN completes that exact character\'s selection', async () => {
  let calledWith = null;
  const els = await load(memoryStorage(), () => ({ login: async (payload) => { calledWith = payload; return { id: 'new-1', displayName: 'X' }; } }));
  await Promise.all(fire(els.hunterSelect, 'click'));
  els.authEmailInput.value = 'trader@example.com';
  els.authPasswordInput.value = 'abcd';
  await Promise.all(fire(els.authSubmit, 'click'));
  assert.equal(calledWith.email, 'trader@example.com');
  assert.equal(calledWith.password, 'abcd');
  assert.equal(els.authOverlay.hidden, true, 'the overlay closes once login succeeds');
  assert.match(els.hunterCard.className, /selected/, 'the originally-clicked character is now selected');
  assert.doesNotMatch(els.engineerCard.className, /selected/, 'a different character card must not be affected');
});

test('fresh browser: toggling to signup and submitting calls register() with the display name, email, and password', async () => {
  let calledWith = null;
  const els = await load(memoryStorage(), () => ({ register: async (payload) => { calledWith = payload; return { id: 'new-2', displayName: payload.displayName }; } }));
  fire(els.signupButton, 'click');
  els.authNameInput.value = 'Alex';
  els.authEmailInput.value = 'alex@example.com';
  els.authPasswordInput.value = 'abcd';
  await Promise.all(fire(els.authSubmit, 'click'));
  assert.equal(calledWith.displayName, 'Alex');
  assert.equal(calledWith.email, 'alex@example.com');
  assert.equal(els.authOverlay.hidden, true);
});

test('a server-rejected login shows a translated message for a known error code, not the raw code itself', async () => {
  const error = new Error('INVALID_CREDENTIALS'); error.status = 401; error.code = 'INVALID_CREDENTIALS';
  const els = await load(memoryStorage(), () => ({ login: async () => { throw error; } }));
  await Promise.all(fire(els.hunterSelect, 'click'));
  els.authEmailInput.value = 'trader@example.com';
  els.authPasswordInput.value = 'wrong';
  await Promise.all(fire(els.authSubmit, 'click'));
  assert.match(els.authError.textContent, /Incorrect email or password/, 'known error codes get a friendly translated message');
  assert.equal(els.authOverlay.hidden, false, 'the overlay stays open so the user can retry');
  assert.doesNotMatch(els.hunterCard.className, /selected/, 'no character gets selected on a failed login');
});

test('an unreachable server (fetch itself throws a TypeError) shows a distinct "server unreachable" message', async () => {
  const els = await load(memoryStorage(), (SandboxTypeError) => ({ login: async () => { throw new SandboxTypeError('Failed to fetch'); } }));
  await Promise.all(fire(els.hunterSelect, 'click'));
  els.authEmailInput.value = 'trader@example.com';
  els.authPasswordInput.value = 'abcd';
  await Promise.all(fire(els.authSubmit, 'click'));
  assert.match(els.authError.textContent, /dev:community-api/, 'a TypeError from fetch (network/connection failure) must point at starting the community backend');
});

test('returning browser (a session token the server still accepts): clicking a character\'s Select button completes the selection immediately', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:auth-token', 'existing-token');
  let loginCalled = false;
  const els = await load(localStorage, () => ({ login: async () => { loginCalled = true; return { id: 'x' }; } }), async () => true);
  await Promise.all(fire(els.hunterSelect, 'click'));
  assert.equal(els.authOverlay.hidden, true, 'the login step never opens for a returning session');
  assert.equal(loginCalled, false);
  assert.match(els.hunterCard.className, /selected/, 'the character selection completes immediately, unblocked');
});

test('returning browser with a STALE token (the server no longer accepts it): the login step opens instead of silently completing', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:auth-token', 'stale-token-from-a-wiped-backend');
  const els = await load(localStorage, () => ({}), async () => false);
  await Promise.all(fire(els.hunterSelect, 'click'));
  assert.equal(els.authOverlay.hidden, false, 'a stale token must not be trusted - the login step opens exactly as it would for a truly fresh browser');
  assert.doesNotMatch(els.hunterCard.className, /selected/);
});

test('the close button dismisses the overlay without logging in or selecting a character', async () => {
  let called = false;
  const els = await load(memoryStorage(), () => ({ login: async () => { called = true; return { id: 'x' }; } }));
  await Promise.all(fire(els.hunterSelect, 'click'));
  assert.equal(els.authOverlay.hidden, false);
  fire(els.authClose, 'click');
  assert.equal(els.authOverlay.hidden, true);
  assert.equal(called, false);
  assert.doesNotMatch(els.hunterCard.className, /selected/);
});
