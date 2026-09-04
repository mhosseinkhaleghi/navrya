# SessionCard

A saved session — chart snapshot on the left, ledger detail and four actions on the right.

```jsx
<SessionCard title="London — 2026-08-01" city="London" timeframe="5m"
  instrument="BTCUSDT" lastUpdate="20:46 UTC" onOpen={open} onDelete={remove} />
```

- Actions are fixed and ordered: **Continue / open** (primary), **View report**, **Repeat / copy**, **Delete** (danger).
- Detail fields are INSTRUMENT and LAST UPDATE, split by a 1px gold divider, tabular numerals.
- `layout="compact"` is the grid card — 200px chart on top, detail below, several side by side at `minmax(340px, 1fr)`. `layout="row"` is the wide ledger card. SessionLibrary picks per view toggle.
- `edition` overlays the character badge on the chart, bottom-left.
- A real `thumbnail` is always rendered untouched. When no chart image exists, render the shared
  `assets/sessions/session-no-chart.svg` chart-empty artwork instead; never substitute
  a decorative or fabricated chart.
- Elevation is `0 18px 38px rgba(0,0,0,.34)` — the ledger card sits above the library surface.
