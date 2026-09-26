import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeLabel, findField, createFieldStateDecorator } from '../navrya-src/dockFieldStates.js';

// The four voice states drawn on the real fields of an open form (ChatDock design plate XIV). This
// project has no DOM test harness, so the field finder and the overlay are exercised against a tiny
// fake DOM that implements exactly what dockFieldStates.js touches - enough to prove which element a
// label resolves to, and that the overlay draws the right state without ever touching the form.

class FakeText { constructor(text) { this.nodeType = 3; this.nodeValue = text; this.parentElement = null; } }

class FakeEl {
  constructor(tag, attrs, children, ownerDocument) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = { ...(attrs || {}) }; this.childNodes = []; this.parentElement = null;
    this.ownerDocument = ownerDocument; this.style = {}; this.className = ''; this.innerHTML = ''; this.listeners = {}; this.isConnected = true;
    (children || []).forEach((c) => this.append(c));
  }
  append(child) {
    const node = typeof child === 'string' ? new FakeText(child) : child;
    node.parentElement = this; this.childNodes.push(node); return node;
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get nextElementSibling() { const siblings = this.parentElement.children; return siblings[siblings.indexOf(this) + 1] || null; }
  getAttribute(name) { return this.attrs[name] === undefined ? null : this.attrs[name]; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  hasAttribute(name) { return this.attrs[name] !== undefined; }
  contains(other) { for (let n = other; n; n = n.parentElement) if (n === this) return true; return false; }
  closest(selector) { for (let n = this; n; n = n.parentElement) if (n.matches(selector)) return n; return null; }
  // Only the selectors dockFieldStates.js uses.
  matches(selector) {
    return selector.split(',').some((part) => {
      const s = part.trim();
      if (s === 'label' || s === 'textarea' || s === 'select' || s === 'button') return this.tagName === s.toUpperCase();
      if (s.startsWith('input')) {
        if (this.tagName !== 'INPUT') return false;
        const type = this.attrs.type || 'text';
        return !['hidden', 'checkbox', 'radio'].includes(type);
      }
      const attr = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(s);
      if (attr) return attr[2] === undefined ? this.hasAttribute(attr[1]) : this.attrs[attr[1]] === attr[2];
      return false;
    });
  }
  querySelector(selector) { for (const child of this.children) { if (child.matches(selector)) return child; const inner = child.querySelector(selector); if (inner) return inner; } return null; }
  querySelectorAll() { return []; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40 }; }
  set textContent(v) { this.childNodes = []; this.append(String(v)); }
  get textContent() { return this.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.textContent)).join(''); }
  remove() {}
}

function makeDoc() {
  const doc = {
    defaultView: { getComputedStyle: () => ({ position: 'static', borderTopWidth: '1px', borderRadius: '10px' }), ResizeObserver: undefined },
    head: { appendChild() {} }, documentElement: {},
    getElementById: () => null,
    createTreeWalker(root) {
      const texts = [];
      (function collect(n) { n.childNodes.forEach((c) => (c.nodeType === 3 ? texts.push(c) : collect(c))); }(root));
      let i = -1;
      return { nextNode: () => texts[++i] || null };
    },
    createElement(tag) { const el = new FakeEl(tag, {}, [], doc); el.parentNode = null; return el; }
  };
  doc.createElement = (tag) => { const el = new FakeEl(tag, {}, [], doc); el.className = ''; return el; };
  // an overlay is appended to its group and removed through parentNode
  FakeEl.prototype.appendChild = function appendChild(child) { child.parentNode = this; return this.append(child); };
  FakeEl.prototype.removeChild = function removeChild(child) { this.childNodes = this.childNodes.filter((n) => n !== child); child.parentNode = null; child.isConnected = false; };
  Object.defineProperty(FakeEl.prototype, 'parentNode', { get() { return this._pn || this.parentElement; }, set(v) { this._pn = v; }, configurable: true });
  return doc;
}

// A form the way NAVRYA renders one: <label><span>Label</span><control/></label> per field.
function form(doc) {
  const el = (tag, attrs, kids) => new FakeEl(tag, attrs, kids, doc);
  const field = (label, control) => el('label', {}, [el('span', {}, [label]), control]);
  const root = el('div', { role: 'dialog', 'aria-modal': 'true' }, [
    el('div', {}, ['New session']),
    field('Trading session', el('button', { 'aria-haspopup': 'listbox' }, ['Tokyo'])),
    field('Primary timeframe', el('button', { 'aria-haspopup': 'listbox' }, ['5m'])),
    field('Instrument *', el('div', {}, [el('span', {}, ['e.g. XAUUSD'])])),
    field('Loop / update interval (minutes)', el('input', { type: 'number' }, []))
  ]);
  return root;
}
const all = ['Trading session', 'Primary timeframe', 'Instrument', 'Loop / update interval (minutes)'];

test('labels match as the form draws them: case, a required star, a colon and zero-width marks do not matter', () => {
  assert.equal(normalizeLabel('  Instrument * '), 'instrument');
  assert.equal(normalizeLabel('Loop:'), 'loop');
  assert.equal(normalizeLabel('سشن‌ معاملاتی؟'), 'سشن معاملاتی');
  assert.equal(normalizeLabel('a​b'), 'ab');
  assert.equal(normalizeLabel(null), '');
});

test('a field is found by its label: the wrapping <label>, its control - or, for an input-like <div> with no input, the box after the label text', () => {
  const doc = makeDoc();
  const root = form(doc);
  const session = findField(root, 'Trading session', all);
  assert.equal(session.group.tagName, 'LABEL');
  assert.equal(session.control.tagName, 'BUTTON');
  const loop = findField(root, 'Loop / update interval (minutes)', all);
  assert.equal(loop.control.tagName, 'INPUT');
  const instrument = findField(root, 'Instrument', all);
  assert.equal(instrument.control, null, 'a tag-picker <div> has no <input>');
  assert.equal(instrument.box.tagName, 'DIV', 'so the box right after the label text is what is ringed');
  assert.equal(findField(root, 'Not a label', all), null);
  assert.equal(findField(null, 'x', all), null);
});

test('a label is never matched to a neighbour: a group that would also hold another field\'s label is refused', () => {
  const doc = makeDoc();
  const el = (tag, attrs, kids) => new FakeEl(tag, attrs, kids, doc);
  // labels NOT wrapped in <label>: the nearest ancestor holding a control is the whole grid
  const grid = el('div', {}, [
    el('div', {}, [el('span', {}, ['City']), el('input', { type: 'text' }, [])]),
    el('div', {}, [el('span', {}, ['Note'])])
  ]);
  assert.equal(findField(grid, 'City', ['City', 'Note']).control.tagName, 'INPUT', 'the smallest group with its own control is fine');
  const wrongGrid = el('div', {}, [el('span', {}, ['Note']), el('span', {}, ['City']), el('input', { type: 'text' }, [])]);
  assert.equal(findField(wrongGrid, 'City', ['City', 'Note']), null, 'a group holding another label is refused rather than drawing on the wrong field');
});

test('the overlay draws asking / hearing / filled / pending on the field, never touches its value, and clears completely', () => {
  const doc = makeDoc();
  const root = form(doc);
  const confirms = [];
  const decorator = createFieldStateDecorator(doc, {
    badges: { asking: 'Asking', hearing: 'Listening', filled: 'Master' },
    confirm: { prompt: 'Save it?', yes: 'Yes', no: 'No' },
    onConfirm: (decision, path) => confirms.push([decision, path])
  });
  decorator.update(root, [
    { path: 'city', label: 'Trading session', state: 'filled' },
    { path: 'timeframe', label: 'Primary timeframe', state: 'hearing', heard: '15 minutes' },
    { path: 'instrument', label: 'Instrument', state: 'pending' },
    { path: 'loop', label: 'Loop / update interval (minutes)', state: 'asking' }
  ], all);
  const rings = decorator._overlays;
  assert.deepEqual([...rings.keys()], ['city', 'timeframe', 'instrument', 'loop']);
  const state = (path) => rings.get(path).ring.getAttribute('data-state');
  assert.deepEqual(['city', 'timeframe', 'instrument', 'loop'].map(state), ['filled', 'hearing', 'pending', 'asking']);
  assert.match(rings.get('city').ring.innerHTML, /Master/, 'filled carries the companion\'s tag');
  assert.match(rings.get('timeframe').ring.innerHTML, /15 minutes/, 'hearing shows the live words inside the field');
  assert.match(rings.get('timeframe').ring.innerHTML, /Listening/);
  assert.match(rings.get('instrument').ring.innerHTML, /Save it\?/);
  assert.match(rings.get('instrument').ring.innerHTML, /data-decision="confirm"/);
  assert.match(rings.get('instrument').ring.innerHTML, /data-decision="reject"/);
  assert.match(rings.get('loop').ring.innerHTML, /nvf-dot/, 'asking pulses');
  assert.equal(rings.get('timeframe').ring.getAttribute('data-menu'), 'true', 'a dropdown\'s badge leaves room for its chevron');
  // the overlay lives inside the field's own group, as a sibling of its content - the control is untouched
  assert.equal(root.children[1].children.length, 3);
  assert.equal(root.children[1].children[1].textContent, 'Tokyo');
  // the yes / no on a pending field report the decision and the field
  const handler = rings.get('instrument').ring.listeners.click[0];
  handler({ target: { closest: () => ({ getAttribute: () => 'confirm' }) } });
  assert.deepEqual(confirms, [['confirm', 'instrument']]);
  // a state that ends is redrawn, and an empty update removes everything
  decorator.update(root, [{ path: 'city', label: 'Trading session', state: 'asking' }], all);
  assert.deepEqual([...rings.keys()], ['city']);
  assert.equal(rings.get('city').ring.getAttribute('data-state'), 'asking');
  decorator.update(root, [], all);
  assert.equal(rings.size, 0);
  assert.equal(root.children[1].children.length, 2, 'every overlay is gone');
});

test('hearing on a control with no text to show (a slider, a dropdown) puts the words in the badge and never hides the control; a text input shows them inside the field', () => {
  const doc = makeDoc();
  const root = form(doc);
  const decorator = createFieldStateDecorator(doc, { badges: { asking: 'Asking', hearing: 'Listening', filled: 'Master' } });
  decorator.update(root, [
    { path: 'timeframe', label: 'Primary timeframe', state: 'hearing', heard: 'fifteen minutes' },
    { path: 'loop', label: 'Loop / update interval (minutes)', state: 'hearing', heard: 'thirty' }
  ], all);
  const dropdown = decorator._overlays.get('timeframe').ring;
  assert.equal(dropdown.getAttribute('data-textual'), 'false');
  assert.match(dropdown.innerHTML, /Listening: «fifteen minutes»/);
  assert.doesNotMatch(dropdown.innerHTML, /nvf-heard/, 'no opaque ghost text over a control that cannot show it');
  const input = decorator._overlays.get('loop').ring;
  assert.equal(input.getAttribute('data-textual'), 'true');
  assert.match(input.innerHTML, /class="nvf-heard" dir="auto">thirty</, 'a text field shows the words where the value goes');
});
