# SessionLibrary

The whole ledger module — heading + CTA, command toolbar, and the session field. Use this rather than assembling the toolbar yourself.

```jsx
<SessionLibrary sessions={sessions} onNewSession={create} />
```

- Toolbar order is fixed: **New session** → filter → search → sort → view toggle, 9px gaps, all controls 44px.
- Module padding 20px, R14 frame, `0 18px 38px black 34%` elevation.
- Filtering and sorting are wired locally; pass `sessions` as an array of SessionCard props. Empty array renders SessionEmptyState.
- The CTA only opens `NewSessionDialog`. `onNewSession(values)` fires when that dialog is confirmed — append the new session there, never on the button press.
