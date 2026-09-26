import React from 'react';

/* The ChatDock's four shapes and the moves between them (artbook plate III "one body, four shapes"):

   seed     64px portrait in the corner. The resting shape while you work on the page.
   capsule  only the composer. The portrait is the open-conversation button; primary = voice / send.
   peek     a fresh reply in two lines, inside the same frame, with quick choices if it asked a question.
            Folds itself away after a few seconds of inattention.
   scroll   the conversation, only when the user opens it (at most 60% of the viewport height).
   (side is not a fourth shape of its own but a placement of the scroll - pinned to the side, or
   beside an open dialog - see dockSideLane.js.)

   This file is the pure state machine (reduceShape, unit-tested in tests/chatdock-shapes.test.mjs)
   plus the hook that keeps it and the two remembered preferences (pin, auto-collapse). It knows
   nothing about the DOM: ChatDock feeds it the events (idle, outside click, Ctrl K) and the app feeds
   it the conversation's (a reply arrived). */

export var IDLE_TO_SEED_MS = 8000;
export var PEEK_HOLD_MS = 12000;

export var SHAPES = ['seed', 'capsule', 'peek', 'scroll'];

export function initialShape(init) {
  return { shape: 'capsule', unseen: 0, pinned: !!(init && init.pinned) };
}

/* Events:
   open        the seed was clicked / Ctrl K - a reply that arrived meanwhile is shown as a peek.
   focus       the composer took focus (typing) - a seed can never stay collapsed under a caret.
   collapse    idle or a click on the page: capsule / peek -> seed.
   reply       a new assistant reply landed.
   peekTimeout the peek was ignored: fold to the capsule (the reply stays in the conversation).
   expand      capsule / peek -> scroll (peek's arrow, the up key, history).
   fold        scroll / peek -> capsule (the header's collapse button).
   close       the header's close button / the peek's close: -> capsule (the caller also dismisses the reply).
   pin/unpin   the side pin. Pinning opens the scroll.
   voice       a voice session started: a seed cannot be the shape of a live session. */
export function reduceShape(state, event) {
  var s = state || initialShape();
  switch (event && event.type) {
    case 'open':
      return s.shape === 'seed' ? { shape: s.unseen > 0 ? 'peek' : 'capsule', unseen: 0, pinned: s.pinned } : s;
    case 'focus':
    case 'voice':
      return s.shape === 'seed' ? { shape: 'capsule', unseen: s.unseen, pinned: s.pinned } : s;
    case 'collapse':
      return s.shape === 'capsule' || s.shape === 'peek' ? { shape: 'seed', unseen: s.unseen, pinned: s.pinned } : s;
    case 'reply':
      if (s.shape === 'seed') return { shape: 'seed', unseen: s.unseen + 1, pinned: s.pinned };
      if (s.shape === 'capsule') return { shape: 'peek', unseen: 0, pinned: s.pinned };
      return s;
    case 'peekTimeout':
      return s.shape === 'peek' ? { shape: 'capsule', unseen: s.unseen, pinned: s.pinned } : s;
    case 'expand':
      return s.shape === 'capsule' || s.shape === 'peek' ? { shape: 'scroll', unseen: 0, pinned: s.pinned } : s;
    case 'fold':
      return s.shape === 'scroll' || s.shape === 'peek' ? { shape: 'capsule', unseen: s.unseen, pinned: s.pinned } : s;
    case 'close':
      return s.shape === 'seed' ? s : { shape: 'capsule', unseen: s.unseen, pinned: s.pinned };
    case 'pin':
      return { shape: 'scroll', unseen: 0, pinned: true };
    case 'unpin':
      return { shape: s.shape, unseen: s.unseen, pinned: false };
    default:
      return s;
  }
}

var PIN_KEY = 'navrya.dock.pinned';
var AUTO_KEY = 'navrya.dock.autoCollapse';

function readFlag(key, fallback) {
  try {
    var raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch (_e) { /* private mode / blocked storage */ }
  return fallback;
}
function writeFlag(key, value) {
  try { window.localStorage.setItem(key, value ? '1' : '0'); } catch (_e) { /* private mode / blocked storage */ }
}

/* replyCount: how many assistant replies the current conversation holds (a NEW one is an increase);
   voiceActive: a voice session is live; canCollapse: false while the user is mid-input. */
export function useDockShape({ replyCount = 0, replyOpen = false, voiceActive = false }) {
  const [state, dispatch] = React.useReducer(reduceShape, null, () => initialShape({ pinned: typeof window !== 'undefined' && readFlag(PIN_KEY, false) }));
  const [autoCollapse, setAutoCollapseState] = React.useState(() => (typeof window === 'undefined' ? true : readFlag(AUTO_KEY, true)));

  const seenReplies = React.useRef(replyCount);
  React.useEffect(() => {
    if (replyCount > seenReplies.current && replyOpen) dispatch({ type: 'reply' });
    seenReplies.current = replyCount;
  }, [replyCount, replyOpen]);

  React.useEffect(() => { if (voiceActive) dispatch({ type: 'voice' }); }, [voiceActive]);

  // A pinned dock starts as the scroll on the side (its conversation is what was pinned).
  React.useEffect(() => { if (state.pinned && state.shape === 'capsule' && replyOpen) dispatch({ type: 'expand' }); }, [state.pinned, state.shape, replyOpen]);

  const setPinned = React.useCallback((on) => { writeFlag(PIN_KEY, on); dispatch({ type: on ? 'pin' : 'unpin' }); }, []);
  const setAutoCollapse = React.useCallback((on) => { writeFlag(AUTO_KEY, on); setAutoCollapseState(!!on); }, []);

  return { shape: state.shape, unseen: state.unseen, pinned: state.pinned, autoCollapse, dispatch, setPinned, setAutoCollapse };
}
