import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Voice Command Learning Profile addendum, section 8: the lightweight, non-blocking, dismissible
// post-action feedback row - Correct/Wrong action/Wrong target-value/Do this next time/Dismiss.
// Same static-source-regression convention as tests/settings-persona-action.test.mjs -
// navrya-src/ChatResponsePopover.jsx have no DOM test harness in this project; real-browser
// verification stays a reported UNKNOWN (see the final report).

const root = process.cwd();
const chatDockViewSrc = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');
const popoverSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatResponsePopover.jsx'), 'utf8');

test('ChatResponsePopover accepts feedback/feedbackLabels/five onFeedback* handlers, all optional - a caller that never supplies any of them (every pre-existing one) renders nothing new', () => {
  assert.match(popoverSrc, /feedback = null, feedbackLabels = \{\}/);
  assert.match(popoverSrc, /onFeedbackCorrect, onFeedbackWrongAction, onFeedbackWrongTarget, onFeedbackRemember, onFeedbackDismiss/);
});

// ChatDock capsule redesign: the feedback choices now share one quiet row with copy/regenerate.
// The gating condition lives in one named constant (showFeedback), the block runs from there to the
// copy button, and all five handlers are still wired - the two "wrong" intents as items of one small
// menu (WrongFeedbackMenu) instead of two more equal-weight pills.
function feedbackBlock() {
  const start = popoverSrc.indexOf('{showFeedback && (');
  const end = popoverSrc.indexOf('<CopyButton iconOnly', start);
  assert.ok(start > -1 && end > start, 'could not find the real feedback-row render block');
  return popoverSrc.slice(start, end);
}

test('the feedback row only renders for the LAST assistant message and only when `feedback` is truthy - never speculatively, never for a user message, never mid-thinking/safety/review', () => {
  assert.match(popoverSrc, /const settled = !thinking && !safety && !review;/);
  assert.match(popoverSrc, /const showFeedback = settled && effectiveMessages && lastMessage && lastMessage\.role === 'assistant' && feedback;/);
  assert.match(popoverSrc, /\{isLastAssistant && \(messageActionLabels\.copy \|\| onRegenerate \|\| feedback\) && \(/, 'the row lives inside the last assistant message, under its receipt');
  const block = feedbackBlock();
  assert.match(block, /onFeedbackCorrect && <MiniButton/);
  assert.match(block, /onFeedbackRemember && <MiniButton/);
  assert.match(block, /onFeedbackWrongAction && <MiniButton[^>]*onClick=\{\(\) => \{ setWrongMenuOpen\(false\); onFeedbackWrongAction\(\); \}\}/);
  assert.match(block, /onFeedbackWrongTarget && <MiniButton[^>]*onClick=\{\(\) => \{ setWrongMenuOpen\(false\); onFeedbackWrongTarget\(\); \}\}/);
  assert.match(block, /onFeedbackDismiss && <MiniButton/);
});

test('the feedback row reuses the existing MiniButton/ActionRow components - no new design system', () => {
  const block = feedbackBlock();
  assert.match(block, /<MiniButton iconOnly icon="check" label=\{feedbackLabels\.correct\}/);
  assert.match(block, /<WrongFeedbackMenu/);
  assert.doesNotMatch(block, /className="navrya-feedback|new-design/i);
  // The menu itself is built from the same MiniButton, not a second button style.
  const menu = popoverSrc.slice(popoverSrc.indexOf('function WrongFeedbackMenu'), popoverSrc.indexOf('export function ChatResponsePopover'));
  assert.match(menu, /<MiniButton iconOnly icon="x"/, 'the design\'s single "wrong" button (an X) opens the two real intents');
});

test('chatDockView.jsx tracks answered receipts per conversation (respondedReceiptIdsRef), resetting it on both New Chat and resume - the same isolation boundary every other per-conversation transient state in this file already uses', () => {
  assert.match(chatDockViewSrc, /const respondedReceiptIdsRef = React\.useRef\(new Set\(\)\);/);
  const startNewChat = /function startNewChat\(\) \{[\s\S]*?\n  \}/.exec(chatDockViewSrc);
  assert.ok(startNewChat);
  assert.match(startNewChat[0], /respondedReceiptIdsRef\.current = new Set\(\);/);
  const resume = /async function resumeConversation\(id\) \{[\s\S]*?abortActiveRequests\(\);/.exec(chatDockViewSrc);
  assert.ok(resume);
  assert.match(resume[0], /respondedReceiptIdsRef\.current = new Set\(\);/);
});

test('chatDockView.jsx listens for tradejournal:action-receipt-recorded and only ever merges feedback onto a popover currently in the "answer" state - never reopens a closed popover or hijacks a newer turn\'s own popover', () => {
  const match = /function onReceiptRecorded\(\) \{[\s\S]*?\n  \}/.exec(chatDockViewSrc);
  assert.ok(match, 'could not find the real onReceiptRecorded listener');
  const block = match[0];
  assert.match(block, /receipts\.lastEligibleReceipt\(\)/, 'must re-check eligibility fresh, never trust the event alone');
  assert.match(block, /respondedReceiptIdsRef\.current\.has\(receipt\.receiptId\)/);
  assert.match(block, /p && p\.state === 'answer'/);
  assert.match(chatDockViewSrc, /window\.addEventListener\('tradejournal:action-receipt-recorded', onReceiptRecorded\);/);
});

test('giveChatFeedback() sends the SAME canonical phrase text through the ordinary submit() path - never a second, separate learning mechanism - and marks the receipt answered (hides the row) before submit() even resolves', () => {
  const match = /function giveChatFeedback\(intent, receiptId\) \{[\s\S]*?\n  \}/.exec(chatDockViewSrc);
  assert.ok(match, 'could not find the real giveChatFeedback function');
  const block = match[0];
  assert.match(block, /respondedReceiptIdsRef\.current\.add\(receiptId\);/);
  assert.match(block, /canonicalFeedbackPhrase\(intent, i18n\.language\(\)\)/);
  assert.match(block, /if \(phrase\) submit\(phrase\);/);
});

test('dismissChatFeedback() marks the receipt answered and hides the row WITHOUT ever calling submit() - "Dismiss creates no mapping"', () => {
  const match = /function dismissChatFeedback\(receiptId\) \{[\s\S]*?\n  \}/.exec(chatDockViewSrc);
  assert.ok(match, 'could not find the real dismissChatFeedback function');
  const block = match[0];
  assert.match(block, /respondedReceiptIdsRef\.current\.add\(receiptId\);/);
  assert.doesNotMatch(block, /submit\(/);
});

test('the real <ChatResponsePopover> call wires all five feedback handlers to giveChatFeedback/dismissChatFeedback with the exact five section-8 intents', () => {
  assert.match(chatDockViewSrc, /onFeedbackCorrect=\{\(\) => giveChatFeedback\('correct', popover\.feedbackReceiptId\)\}/);
  assert.match(chatDockViewSrc, /onFeedbackWrongAction=\{\(\) => giveChatFeedback\('wrongAction', popover\.feedbackReceiptId\)\}/);
  assert.match(chatDockViewSrc, /onFeedbackWrongTarget=\{\(\) => giveChatFeedback\('wrongTargetOrValue', popover\.feedbackReceiptId\)\}/);
  assert.match(chatDockViewSrc, /onFeedbackRemember=\{\(\) => giveChatFeedback\('rememberThis', popover\.feedbackReceiptId\)\}/);
  assert.match(chatDockViewSrc, /onFeedbackDismiss=\{\(\) => dismissChatFeedback\(popover\.feedbackReceiptId\)\}/);
});
