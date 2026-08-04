# NewSessionDialog

The New session popup — four optional chart uploads over the session settings grid.

```jsx
<NewSessionDialog open={open} onClose={close} onCreate={create}
  eyebrow={{ left: '01 HUNTER', right: 'HUNT SESSION' }} />
```

- Upload slots are fixed: 5m · 1h · 4h · 1D, in a 2 × 2 grid.
- Settings grid is two columns: Trading session / Primary timeframe, Gregorian date / Jalali date, Loop interval / Update grace period.
- Footer is one primary **Create without chart** plus a ghost **Cancel** — never two filled buttons.
- SessionLibrary opens it from the New session CTA; you rarely mount it yourself.
