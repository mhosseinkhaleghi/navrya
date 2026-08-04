import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function loadInto(sandbox, files) {
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  return sandbox.window;
}

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.style = {}; this.attributes = {}; this.src = ''; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener() {}
  removeEventListener() {}
  remove() {}
  // Minimal tag-name-only lookup - enough for account-profile-ui.js's chip.querySelector('b'/'small'/'img').
  querySelector(selector) {
    const tag = selector.replace('#', '').toLowerCase();
    for (const child of this.children) {
      if (child.tagName && child.tagName.toLowerCase() === tag) return child;
      const nested = child.querySelector && child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  querySelectorAll() { return []; }
  get classList() {
    const self = this;
    return {
      add(c) { if (self.className.split(' ').indexOf(c) === -1) self.className = (self.className + ' ' + c).trim(); },
      remove(c) { self.className = self.className.split(' ').filter(x => x !== c).join(' '); },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); }
    };
  }
}

function buildChip() {
  const chip = new FakeNode('button');
  const avatar = new FakeNode('span');
  const img = new FakeNode('img');
  avatar.append(img);
  const label = new FakeNode('span');
  const name = new FakeNode('b'); name.textContent = 'شکارچی';
  const sub = new FakeNode('small'); sub.textContent = 'Hunter';
  label.append(name, sub);
  chip.append(avatar, label);
  return chip;
}

function makeSandbox() {
  const state = { hash: '' };
  const chip = buildChip();
  const sandbox = {
    window: {},
    document: {
      createElement: tag => new FakeNode(tag),
      documentElement: { lang: 'en' },
      body: new FakeNode('body'),
      querySelector: selector => (selector === '#userChip' ? chip : null),
      querySelectorAll: () => [],
      addEventListener() {}
    },
    location: { get hash() { return state.hash; }, set hash(value) { state.hash = value; } },
    history: { replaceState: (_s, _t, url) => { state.hash = url; } },
    setTimeout, clearTimeout
  };
  sandbox.window = Object.assign(sandbox.window, {
    dispatchEvent() {}, addEventListener() {},
    document: sandbox.document, setTimeout, clearTimeout, location: sandbox.location, history: sandbox.history
  });
  sandbox.chip = chip;
  return sandbox;
}

async function profilePageSandbox({ layerCalls, profile } = {}) {
  const sandbox = makeSandbox();
  await loadInto(sandbox, ['profile-xp-rules.js', 'account-profile-i18n.js']);
  sandbox.window.TradeJournalPanelLayer = { show: (_page, view) => (layerCalls || []).push(view) };
  sandbox.window.TradeJournalAccountProfileStore = {
    getProfile: () => Promise.resolve(profile || { id: 'u1', displayName: 'Test User', xpTotal: 0, avatarDataUrl: null }),
    getXpEvents: () => Promise.resolve([]),
    getMastery: () => Promise.resolve({ xpLevel: 1, gatedLevel: 1, blockers: [] }),
    getAchievements: () => Promise.resolve([]),
    getSubscriptions: () => Promise.resolve([])
  };
  await loadInto(sandbox, ['account-profile-ui.js']);
  return sandbox;
}

test('route() parses #account/profile hashes for all five tabs and rejects anything else', async () => {
  const sandbox = await profilePageSandbox();
  const page = sandbox.window.TradeJournalAccountProfilePage;

  sandbox.location.hash = '#account/profile';
  assert.equal(page.route(), 'identity');
  sandbox.location.hash = '#account/profile/identity';
  assert.equal(page.route(), 'identity');
  sandbox.location.hash = '#account/profile/level';
  assert.equal(page.route(), 'level');
  sandbox.location.hash = '#account/profile/achievements';
  assert.equal(page.route(), 'achievements');
  sandbox.location.hash = '#account/profile/subscriptions';
  assert.equal(page.route(), 'subscriptions');
  sandbox.location.hash = '#account/profile/role';
  assert.equal(page.route(), 'role');
  sandbox.location.hash = '#account/profile/not-a-real-tab';
  assert.equal(page.route(), null);
  sandbox.location.hash = '#mindset';
  assert.equal(page.route(), null);
});

test('open(tab) sets the hash and routes through TradeJournalPanelLayer.show(page, "account-profile")', async () => {
  const layerCalls = [];
  const sandbox = await profilePageSandbox({ layerCalls });
  const page = sandbox.window.TradeJournalAccountProfilePage;

  page.open('level');
  assert.equal(sandbox.location.hash, '#account/profile/level');
  assert.ok(layerCalls.includes('account-profile'));

  layerCalls.length = 0;
  page.open('not-a-real-tab');
  assert.equal(sandbox.location.hash, '#account/profile/identity', 'an unrecognized tab falls back to identity');
});

test('populateUserChip() fills the existing #userChip button with the real signed-in user data and wires it to open the profile', async () => {
  const sandbox = await profilePageSandbox({ profile: { id: 'u1', displayName: 'Real Name', xpTotal: 150, avatarDataUrl: 'data:image/png;base64,abc' } });
  const page = sandbox.window.TradeJournalAccountProfilePage;

  await page.populateUserChip();

  const chip = sandbox.chip;
  assert.equal(chip.querySelector('b').textContent, 'Real Name');
  assert.equal(chip.querySelector('small').textContent, 'Level 2', 'xpTotal 150 is level 2 per LEVEL_THRESHOLDS');
  assert.equal(chip.querySelector('img').src, 'data:image/png;base64,abc');

  chip.onclick({ preventDefault() {} });
  assert.equal(sandbox.location.hash, '#account/profile/identity', 'clicking the chip navigates to the profile page');
});
