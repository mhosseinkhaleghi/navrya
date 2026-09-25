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
- Creating is server-confirmed. `onCreate(values)` returns a Promise that resolves once the session is really saved and
  **rejects when the server refuses it**. While it is pending the primary shows its loading state and a second submit is
  ignored; on a refusal the dialog stays open, the primary is usable again, and one warning `Notice` sits at the top of the
  body - the plan-limit sentence (the server's own limit/used numbers, localized) with an optional small secondary
  **View plans** action (`onUpgrade`), or a plain "nothing was saved" line for any other failure. The footer keeps its one
  primary and one ghost button; the action lives in the notice, never as a second filled footer button.
