// The four voice states drawn on the REAL fields of an open form (ChatDock capsule design, plate XIV
// "four field states"), for every form that carries interview metadata - without touching any form's
// own markup:
//
//   asking   the field the assistant is asking about right now: the character's ring and a "asking" tag.
//   hearing  what the user is saying appears - dimmed, live - inside that field, with a "listening" tag.
//   filled   a value the assistant put in: an accent tint and the companion's tag (the user may still
//            change it by hand).
//   pending  "ask every field" mode: the value waits for the user's OK - a dashed gold edge and the
//            design's "Save it?" with a yes and a no.
//
// A field is found by its real rendered LABEL (the interview descriptor's `label` is by contract the
// real, rendered label text) inside the open dialog, and an overlay is laid over its control. The
// overlay is purely presentational: it never reads or writes the form's value, a failure to find a
// field simply draws nothing, and removing it changes nothing about the form. (The form-interview
// contract's "no DOM scraping" is about VALUES and ORDER, which come from the registry; this only
// decides where to paint.)

const STYLE_ID = 'navrya-field-states-style';

const CSS = `
.nvf-ring{position:absolute;box-sizing:border-box;pointer-events:none;z-index:3;border-radius:10px;transition:box-shadow 160ms ease,border-color 160ms ease,background 160ms ease}
.nvf-ring[data-state="asking"],.nvf-ring[data-state="hearing"]{border:1.5px solid var(--char-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--char-accent) 16%,transparent)}
.nvf-ring[data-state="hearing"][data-textual="true"]{background:#0A0E13}
.nvf-ring[data-state="asking"] .nvf-badge{background:color-mix(in srgb,var(--char-accent) 18%,transparent)}
.nvf-badge .nvf-words{max-width:220px;overflow:hidden;text-overflow:ellipsis}
.nvf-ring[data-state="filled"]{border:1px solid color-mix(in srgb,var(--char-accent) 45%,transparent);background:color-mix(in srgb,var(--char-accent) 6%,transparent)}
.nvf-ring[data-state="pending"]{border:1.5px dashed #D6AF6B;background:rgba(214,175,107,.05)}
.nvf-badge{position:absolute;top:50%;inset-inline-end:8px;transform:translateY(-50%);display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:999px;font-size:11px;line-height:1;white-space:nowrap;background:color-mix(in srgb,var(--char-accent) 16%,transparent);color:var(--char-accent-soft,#C98FF5);font-family:inherit;font-weight:400}
.nvf-ring[data-menu="true"] .nvf-badge{inset-inline-end:34px}
.nvf-badge svg{width:11px;height:11px;flex:none}
.nvf-dot{width:6px;height:6px;border-radius:50%;background:var(--char-accent);animation:navrya-cap-pulse 1.2s ease-in-out infinite}
.nvf-heard{position:absolute;top:0;bottom:0;inset-inline-start:14px;inset-inline-end:96px;display:flex;align-items:center;color:var(--char-accent-soft,#C98FF5);font-weight:600;font-size:14px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-family:inherit}
.nvf-confirm{position:absolute;top:50%;inset-inline-end:8px;transform:translateY(-50%);display:inline-flex;align-items:center;gap:6px;pointer-events:auto;font-family:inherit}
.nvf-confirm span{font-size:11.5px;color:#D6AF6B;white-space:nowrap}
.nvf-confirm button{width:28px;height:28px;flex:none;border-radius:9px;display:grid;place-items:center;padding:0;cursor:pointer}
.nvf-confirm svg{width:13px;height:13px}
.nvf-yes{background:rgba(214,175,107,.08);border:1px solid rgba(214,175,107,.6);color:#D6AF6B}
.nvf-no{background:transparent;border:1px solid rgba(244,234,215,.12);color:#ACA994}
@media (prefers-reduced-motion:reduce){.nvf-dot{animation:none}.nvf-ring{transition:none}}
`;

const ICON = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
};

const CONTROL_SELECTOR = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),textarea,select,[role="combobox"],[role="slider"],[role="radiogroup"],[role="group"],[aria-haspopup]';

export function normalizeLabel(text) {
  return String(text || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .replace(/[*:\uFF1A\u061F?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasControl(el) {
  return !!(el.matches && el.matches(CONTROL_SELECTOR)) || !!el.querySelector(CONTROL_SELECTOR);
}

function containsOtherLabel(el, others) {
  if (!others.length) return false;
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let node = walker.nextNode();
  while (node) {
    if (others.indexOf(normalizeLabel(node.nodeValue)) > -1) return true;
    node = walker.nextNode();
  }
  return false;
}

// The element right after the label text inside a <label> wrapper: the field's own box (an input-like
// <div> - a tag picker, a custom select - has no <input> to find).
function boxAfterLabel(wrapper, textEl) {
  let top = textEl;
  while (top && top.parentElement && top.parentElement !== wrapper) top = top.parentElement;
  if (!top || top.parentElement !== wrapper) return null;
  return top.nextElementSibling || null;
}

/* The field a label belongs to: { group, control, box } - the smallest element around the label that also
   holds the field's control. A <label> wrapping the text is taken as the group (its control, or the box
   after the label text); otherwise the group is the nearest ancestor holding a control. A group that would
   also hold ANOTHER field's label is never returned (`otherLabels`): drawing a state on the wrong field is
   worse than drawing none. */
export function findField(root, label, otherLabels) {
  const wanted = normalizeLabel(label);
  if (!wanted || !root) return null;
  const others = (otherLabels || []).map(normalizeLabel).filter((l) => l && l !== wanted);
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let node = walker.nextNode();
  while (node) {
    const textEl = node.parentElement;
    if (textEl && normalizeLabel(node.nodeValue) === wanted) {
      const wrapper = textEl.closest ? textEl.closest('label') : null;
      if (wrapper && root.contains(wrapper) && !containsOtherLabel(wrapper, others)) {
        const control = controlOf(wrapper);
        const box = control ? null : boxAfterLabel(wrapper, textEl);
        if (control || box) return { group: wrapper, control, box };
      }
      let group = textEl;
      while (group && group !== root) {
        if (hasControl(group)) {
          if (containsOtherLabel(group, others)) break;
          return { group, control: controlOf(group), box: null };
        }
        group = group.parentElement;
      }
    }
    node = walker.nextNode();
  }
  return null;
}

function controlOf(group) {
  if (group.matches && group.matches(CONTROL_SELECTOR)) return group;
  return group.querySelector(CONTROL_SELECTOR) || group.querySelector('button');
}

// The control's visible box: the nearest ancestor (a few levels) that draws a border, else the control.
function boxOf(group, control, win) {
  let el = control;
  for (let i = 0; i < 4 && el && el !== group; i += 1) {
    let border = 0;
    try { border = parseFloat(win.getComputedStyle(el).borderTopWidth) || 0; } catch (_e) { border = 0; }
    if (border > 0) return el;
    el = el.parentElement;
  }
  return control;
}

export function createFieldStateDecorator(doc, options) {
  const win = doc.defaultView || window;
  const opts = options || {};
  const overlays = new Map(); // path -> { group, box, ring }
  let observer = null;
  let lastRoot = null;

  function ensureStyle() {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function place(entry) {
    const group = entry.group;
    if (!group.isConnected) return;
    const g = group.getBoundingClientRect();
    const b = entry.box.getBoundingClientRect();
    entry.ring.style.left = (b.left - g.left) + 'px';
    entry.ring.style.top = (b.top - g.top) + 'px';
    entry.ring.style.width = b.width + 'px';
    entry.ring.style.height = b.height + 'px';
    entry.ring.style.borderRadius = (win.getComputedStyle(entry.box).borderRadius || '10px');
  }

  function badge(state, words) {
    const text = (opts.badges && opts.badges[state]) || '';
    if (!text) return '';
    if (state === 'asking') return '<span class="nvf-badge"><span class="nvf-dot"></span>' + escapeHtml(text) + '</span>';
    // A slider / choice / dropdown has no text to show the words in (and the ghost text would hide the control):
    // the badge itself carries what is being heard.
    if (state === 'hearing') return '<span class="nvf-badge">' + ICON.mic + '<span class="nvf-words">' + escapeHtml(words ? text + ': «' + words + '»' : text) + '</span></span>';
    if (state === 'filled') return '<span class="nvf-badge">' + ICON.sparkle + escapeHtml(text) + '</span>';
    return '';
  }

  function paint(entry, spec) {
    const ring = entry.ring;
    const state = spec.state;
    ring.setAttribute('data-state', state);
    const control = controlOf(entry.group) || entry.box;
    const textual = !!control && (control.tagName === 'TEXTAREA' || (control.tagName === 'INPUT' && ['range', 'button', 'submit', 'reset', 'image', 'file', 'color'].indexOf(control.getAttribute('type') || 'text') === -1));
    ring.setAttribute('data-textual', textual ? 'true' : 'false');
    const isMenu = !!control && (control.tagName === 'SELECT' || control.getAttribute('role') === 'combobox' || control.hasAttribute('aria-haspopup'));
    ring.setAttribute('data-menu', isMenu ? 'true' : 'false');
    let html = '';
    if (state === 'hearing' && textual) html += '<span class="nvf-heard" dir="auto">' + escapeHtml(spec.heard || '') + '</span>';
    html += badge(state, state === 'hearing' && !textual ? String(spec.heard || '').slice(0, 60) : '');
    if (state === 'pending' && opts.confirm) {
      html += '<span class="nvf-confirm"><span>' + escapeHtml(opts.confirm.prompt || '') + '</span>'
        + '<button type="button" class="nvf-yes" data-decision="confirm" aria-label="' + escapeAttr(opts.confirm.yes || '') + '" title="' + escapeAttr(opts.confirm.yes || '') + '">' + ICON.check + '</button>'
        + '<button type="button" class="nvf-no" data-decision="reject" aria-label="' + escapeAttr(opts.confirm.no || '') + '" title="' + escapeAttr(opts.confirm.no || '') + '">' + ICON.x + '</button></span>';
    }
    if (ring.getAttribute('data-html') !== html) { ring.innerHTML = html; ring.setAttribute('data-html', html); }
  }

  function remove(path) {
    const entry = overlays.get(path);
    if (entry && entry.ring.parentNode) entry.ring.parentNode.removeChild(entry.ring);
    overlays.delete(path);
  }

  function clear() {
    Array.from(overlays.keys()).forEach(remove);
    if (observer) { observer.disconnect(); observer = null; }
  }

  /* states: [{ path, label, state: 'asking'|'hearing'|'filled'|'pending', heard }] for the form in `root`;
     allLabels: every label of the form's interview fields (so a label is never matched to a neighbour). */
  function update(root, states, allLabels) {
    if (!root || !states || !states.length) { clear(); return; }
    ensureStyle();
    if (lastRoot !== root) { clear(); lastRoot = root; }
    const wanted = new Set();
    states.forEach((spec) => {
      const existing = overlays.get(spec.path);
      let entry = existing;
      if (!entry || !entry.group.isConnected) {
        if (entry) remove(spec.path);
        const found = findField(root, spec.label, allLabels);
        if (!found) return;
        const group = found.group;
        const box = found.box || boxOf(group, found.control, win);
        if (win.getComputedStyle(group).position === 'static') group.style.position = 'relative';
        const ring = doc.createElement('span');
        ring.className = 'nvf-ring';
        ring.setAttribute('data-navrya-field-state', spec.path);
        ring.addEventListener('click', (e) => {
          const button = e.target && e.target.closest ? e.target.closest('button[data-decision]') : null;
          if (button && opts.onConfirm) opts.onConfirm(button.getAttribute('data-decision'), spec.path);
        });
        group.appendChild(ring);
        entry = { group, box, ring };
        overlays.set(spec.path, entry);
      }
      wanted.add(spec.path);
      paint(entry, spec);
      place(entry);
    });
    Array.from(overlays.keys()).forEach((path) => { if (!wanted.has(path)) remove(path); });
    if (!observer && typeof win.ResizeObserver === 'function') {
      observer = new win.ResizeObserver(() => overlays.forEach(place));
      observer.observe(root);
    }
  }

  function reposition() { overlays.forEach(place); }

  function destroy() { clear(); lastRoot = null; }

  return { update, reposition, clear, destroy, _overlays: overlays };
}

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function escapeAttr(text) { return escapeHtml(text); }
