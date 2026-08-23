import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Covers public/pages/select/app.js - the two-step "Account" (sign in / sign up) then
// "Character" (pick a role) flow. Replaces the old modal-based login-name-step.test.mjs: the
// underlying concerns (gating, translated error messages, offline detection, returning-session
// skip, stale-token fallback) are unchanged, but the DOM shape is a full two-step page now
// instead of a login overlay stacked over the character grid.

const root = process.cwd();
const source = (file) => readFile(path.join(root, 'public', 'pages', 'select', file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

class FakeNode {
  constructor(tag) {
    this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.attributes = {};
    this._handlers = {}; this.hidden = false; this.disabled = false; this.value = ''; this.style = {}; this.src = '';
  }
  addEventListener(type, fn) { this._handlers[type] = this._handlers[type] || []; this._handlers[type].push(fn); }
  removeEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  closest() { return null; }
  focus() {}
  get classList() {
    const self = this;
    return {
      add(c) { if (self.className.split(' ').indexOf(c) === -1) self.className = (self.className + ' ' + c).trim(); },
      remove(c) { self.className = self.className.split(' ').filter((x) => x !== c).join(' '); },
      toggle(c, on) { const has = self.className.split(' ').indexOf(c) > -1; const want = on === undefined ? !has : on; if (want && !has) this.add(c); else if (!want && has) this.remove(c); }
    };
  }
}

function fire(node, type) { return (node._handlers[type] || []).map((fn) => fn({ preventDefault() {}, key: undefined, target: node })); }
function fireKeydown(node, key) { return (node._handlers.keydown || []).map((fn) => fn({ preventDefault() {}, key, target: node })); }

function characterCard(id) {
  const card = new FakeNode('article'); card.dataset.character = id;
  const selectButton = new FakeNode('button');
  selectButton.closest = () => card;
  return { card, selectButton };
}

function buildSandbox(localStorage, isStoredUserValidImpl) {
  const ids = ['stepChipAccount', 'stepChipCharacter', 'stepAccount', 'stepCharacter', 'showcaseMedia', 'showcaseCount', 'showcaseBody', 'showcaseRole', 'showcaseTitle', 'showcaseQuote', 'showcaseTrait0', 'showcaseTrait1', 'showcaseTrait2', 'showcaseTrait3', 'authCardTitle', 'authCardSub', 'tabSignin', 'tabSignup', 'googleBtn', 'googleLabel', 'nameField', 'nameInput', 'emailInput', 'passwordInput', 'authError', 'continueBtn', 'continueLabel', 'switchPrompt', 'switchAction', 'pickedBar', 'pickedCrest', 'pickedTitle', 'pickedPlaceholder', 'backBtn', 'enterBtn', 'languageButton', 'languageMenu', 'currentLanguage', 'toast'];
  const byId = {};
  for (const id of ids) byId[id] = new FakeNode('div');
  byId.stepCharacter.hidden = true; // matches index.html's `hidden` attribute
  byId.pickedCrest.hidden = true;
  byId.nameField.hidden = true;
  byId.languageMenu.hidden = true;
  byId.enterBtn.disabled = true;

  const langButtons = ['fa', 'ar', 'en', 'es'].map((l) => { const b = new FakeNode('button'); b.dataset.language = l; return b; });
  const characters = { hunter: characterCard('hunter'), engineer: characterCard('engineer'), commander: characterCard('commander'), sage: characterCard('sage') };
  const characterCards = Object.values(characters).map((c) => c.card);
  const selectButtons = Object.values(characters).map((c) => c.selectButton);

  const document = {
    querySelector: (sel) => (sel.startsWith('#') ? (byId[sel.slice(1)] || null) : null),
    querySelectorAll: (sel) => {
      if (sel === '[data-language]') return langButtons;
      if (sel === '[data-i18n]') return [];
      if (sel === '[data-i18n-placeholder]') return [];
      if (sel === '.character-card') return characterCards;
      if (sel === '.select-character') return selectButtons;
      if (sel === '.slide-btn') return [];
      return [];
    },
    documentElement: {},
    addEventListener() {}
  };

  const sandbox = {
    window: {}, document, localStorage: localStorage || memoryStorage(),
    // A real (deferred) setTimeout stand-in: showToast() schedules a delayed "hide again"
    // callback that must NOT run synchronously. Only fire zero-delay calls (initGoogle's
    // `window.setTimeout(initGoogle, 0)`) synchronously.
    setTimeout: (fn, delay) => { if (!delay) fn(); return 0; }, clearTimeout() {},
    setInterval: () => 0, clearInterval() {}
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, setTimeout: sandbox.setTimeout, setInterval: sandbox.setInterval, clearInterval: sandbox.clearInterval,
    requestAnimationFrame: (fn) => fn(),
    // A real, non-file: origin - exercises the same targetOrigin branch a real https deployment
    // takes (ADR-0001's postMessage hardening), not the file:// '*' exception.
    location: { protocol: 'https:', origin: 'https://app.navrya.com' },
    parent: { postMessage() {} },
    TradeJournalDevUserSwitcher: {
      register: async () => ({ id: 'stub-id', displayName: 'Stub' }),
      login: async () => ({ id: 'stub-id', displayName: 'Stub' }),
      loginWithGoogle: async () => ({ id: 'stub-id', displayName: 'Stub' }),
      // Defaults to "fresh browser" (false) since that's what most tests here exercise -
      // app.js's isLoggedIn() asks this (a real server-validity check), not a bare
      // localStorage-presence check.
      isStoredUserValid: isStoredUserValidImpl || (async () => false)
    }
  });
  return {
    sandbox,
    els: {
      ...byId, langButtons, characterCards,
      hunterCard: characters.hunter.card, hunterSelect: characters.hunter.selectButton,
      engineerCard: characters.engineer.card, engineerSelect: characters.engineer.selectButton,
      postMessages: [], postMessageTargetOrigins: []
    }
  };
}

// registerImplFactory/loginImplFactory receive the SANDBOX's own TypeError constructor (not
// Node's) so a stub that throws `new TypeError(...)` produces an error app.js's own
// `error instanceof TypeError` check actually recognizes - vm contexts each have their own
// realm.
async function load(localStorage, overridesFactory, isStoredUserValidImpl) {
  const { sandbox, els } = buildSandbox(localStorage, isStoredUserValidImpl);
  sandbox.window.parent.postMessage = (message, targetOrigin) => { els.postMessages.push(message); els.postMessageTargetOrigins.push(targetOrigin); };
  const context = vm.createContext(sandbox);
  if (overridesFactory) {
    const SandboxTypeError = vm.runInContext('TypeError', context);
    Object.assign(sandbox.window.TradeJournalDevUserSwitcher, overridesFactory(SandboxTypeError));
  }
  vm.runInContext(await source('app.js'), context, { filename: 'app.js' });
  // app.js kicks off isLoggedIn().then(...) at boot - flush pending microtasks (real Promises,
  // unaffected by the sandboxed fake timers) before the caller asserts on the resulting step.
  await new Promise((resolve) => setImmediate(resolve));
  return els;
}

test('fresh browser: boots straight into the Account step, Character step hidden', async () => {
  const els = await load(memoryStorage());
  assert.equal(els.stepAccount.hidden, false);
  assert.equal(els.stepCharacter.hidden, true);
});

test('switching to the Sign up tab reveals the trader-name field; switching back to Sign in hides it again', async () => {
  const els = await load(memoryStorage());
  assert.equal(els.nameField.hidden, true, 'starts hidden (sign in is the default mode)');
  fire(els.tabSignup, 'click');
  assert.equal(els.nameField.hidden, false);
  fire(els.tabSignin, 'click');
  assert.equal(els.nameField.hidden, true);
});

test('the Google button never crashes when Google Identity Services is unavailable, and shows a toast instead of advancing', async () => {
  const els = await load(memoryStorage());
  fire(els.googleBtn, 'click');
  assert.match(els.toast.className, /show/, 'a "not configured" toast is shown instead of silently failing');
  assert.equal(els.stepAccount.hidden, false, 'still on the account step');
  assert.equal(els.stepCharacter.hidden, true);
});

test('submitting the sign-in form calls login() with the entered credentials and advances to the Character step', async () => {
  let calledWith = null;
  const els = await load(memoryStorage(), () => ({ login: async (payload) => { calledWith = payload; return { id: 'new-1', displayName: 'X' }; } }));
  els.emailInput.value = 'trader@example.com';
  els.passwordInput.value = 'abcd';
  await Promise.all(fire(els.continueBtn, 'click'));
  assert.equal(calledWith.email, 'trader@example.com');
  assert.equal(calledWith.password, 'abcd');
  assert.equal(els.stepAccount.hidden, true, 'the account step is left');
  assert.equal(els.stepCharacter.hidden, false, 'the character step opens');
});

test('pressing Enter in the password field submits the sign-in form', async () => {
  let called = false;
  const els = await load(memoryStorage(), () => ({ login: async () => { called = true; return { id: 'x' }; } }));
  els.emailInput.value = 'trader@example.com';
  els.passwordInput.value = 'abcd';
  await Promise.all(fireKeydown(els.passwordInput, 'Enter'));
  assert.equal(called, true);
});

test('switching to Sign up and submitting calls register() with the display name, email, and password', async () => {
  let calledWith = null;
  const els = await load(memoryStorage(), () => ({ register: async (payload) => { calledWith = payload; return { id: 'new-2', displayName: payload.displayName }; } }));
  fire(els.tabSignup, 'click');
  els.nameInput.value = 'Alex';
  els.emailInput.value = 'alex@example.com';
  els.passwordInput.value = 'abcd';
  await Promise.all(fire(els.continueBtn, 'click'));
  assert.equal(calledWith.displayName, 'Alex');
  assert.equal(calledWith.email, 'alex@example.com');
  assert.equal(els.stepCharacter.hidden, false);
});

test('a server-rejected login shows a translated message for a known error code, not the raw code, and stays on the Account step', async () => {
  const error = new Error('INVALID_CREDENTIALS'); error.status = 401; error.code = 'INVALID_CREDENTIALS';
  const els = await load(memoryStorage(), () => ({ login: async () => { throw error; } }));
  els.emailInput.value = 'trader@example.com';
  els.passwordInput.value = 'wrong';
  await Promise.all(fire(els.continueBtn, 'click'));
  assert.match(els.authError.textContent, /Incorrect email or password/, 'known error codes get a friendly translated message');
  assert.equal(els.stepAccount.hidden, false, 'stays on the account step so the user can retry');
  assert.equal(els.stepCharacter.hidden, true);
});

test('an unreachable server (fetch itself throws a TypeError) shows a distinct "server unreachable" message', async () => {
  const els = await load(memoryStorage(), (SandboxTypeError) => ({ login: async () => { throw new SandboxTypeError('Failed to fetch'); } }));
  els.emailInput.value = 'trader@example.com';
  els.passwordInput.value = 'abcd';
  await Promise.all(fire(els.continueBtn, 'click'));
  assert.match(els.authError.textContent, /dev:community-api/, 'a TypeError from fetch (network/connection failure) must point at starting the community backend');
  assert.equal(els.stepAccount.hidden, false);
});

test('returning browser (a session token the server still accepts): boots straight into the Character step, without calling login()', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:auth-token', 'existing-token');
  let loginCalled = false;
  const els = await load(localStorage, () => ({ login: async () => { loginCalled = true; return { id: 'x' }; } }), async () => true);
  assert.equal(els.stepCharacter.hidden, false, 'the character step opens automatically');
  assert.equal(els.stepAccount.hidden, true);
  assert.equal(loginCalled, false);
});

test('returning browser with a STALE token (the server no longer accepts it): stays on the Account step instead of silently advancing', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:auth-token', 'stale-token-from-a-wiped-backend');
  const els = await load(localStorage, () => ({}), async () => false);
  assert.equal(els.stepAccount.hidden, false, 'a stale token must not be trusted');
  assert.equal(els.stepCharacter.hidden, true);
});

test('on the Character step, clicking a character\'s Select button marks that card selected, leaves others alone, and enables Enter', async () => {
  const els = await load(memoryStorage(), () => ({ login: async () => ({ id: 'x' }) }));
  els.emailInput.value = 'trader@example.com';
  els.passwordInput.value = 'abcd';
  await Promise.all(fire(els.continueBtn, 'click'));
  assert.equal(els.enterBtn.disabled, true, 'nothing picked yet');
  fire(els.hunterSelect, 'click');
  assert.match(els.hunterCard.className, /selected/);
  assert.doesNotMatch(els.engineerCard.className, /selected/, 'a different character card must not be affected');
  assert.equal(els.enterBtn.disabled, false);
  assert.equal(els.pickedPlaceholder.hidden, true);
});

test('clicking Enter after picking a character posts tradejournal:character-selected with that exact character to the parent window', async () => {
  const els = await load(memoryStorage(), () => ({ login: async () => ({ id: 'x' }) }));
  els.emailInput.value = 'trader@example.com';
  els.passwordInput.value = 'abcd';
  await Promise.all(fire(els.continueBtn, 'click'));
  fire(els.engineerSelect, 'click');
  fire(els.enterBtn, 'click');
  assert.equal(els.postMessages.length, 1);
  assert.equal(els.postMessages[0].type, 'tradejournal:character-selected');
  assert.equal(els.postMessages[0].character, 'engineer');
  assert.equal(els.postMessageTargetOrigins[0], 'https://app.navrya.com', 'the real parent origin must be targeted explicitly, never the literal wildcard \'*\'');
});

test('Enter does nothing while no character is picked', async () => {
  const els = await load(memoryStorage(), () => ({ login: async () => ({ id: 'x' }) }));
  els.emailInput.value = 'trader@example.com';
  els.passwordInput.value = 'abcd';
  await Promise.all(fire(els.continueBtn, 'click'));
  fire(els.enterBtn, 'click');
  assert.equal(els.postMessages.length, 0);
});

test('the Back button on the Character step returns to the Account step', async () => {
  const els = await load(memoryStorage(), () => ({ login: async () => ({ id: 'x' }) }));
  els.emailInput.value = 'trader@example.com';
  els.passwordInput.value = 'abcd';
  await Promise.all(fire(els.continueBtn, 'click'));
  assert.equal(els.stepCharacter.hidden, false);
  fire(els.backBtn, 'click');
  assert.equal(els.stepAccount.hidden, false);
  assert.equal(els.stepCharacter.hidden, true);
});
