# MarketSessionCard

A trading-session card for London, New York, Tokyo or Sydney with its landmark glyph.

```jsx
<MarketSessionCard market="london" state="open" />
<MarketSessionCard market="sydney" state="next" countdown="STARTS IN 01:35:40" />
```

- States: `default hover open next closed disabled`. Every state keeps the **same 64px box** and a **gold frame** — open is signalled by the accent highlight plus a green status dot, next by a clock glyph, disabled by a dashed frame. State is also exposed in the card's `title` for assistive tech.
- Minimum width 264; height matches the header metric tile (64px). The landmark art is supplied raster (`assets/icons/landmark-*.webp`).
