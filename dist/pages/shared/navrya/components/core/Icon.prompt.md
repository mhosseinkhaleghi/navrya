# Icon

The single stroke-icon family — 24×24 grid, 20px optical, 2px round strokes, colour always from currentColor.

```jsx
<span style={{ color: 'var(--char-accent)' }}>
  <Icon name="sessions" size={20} />
</span>
```

- Slugs follow the NAVRYA pack: `sessions dashboard strategies psychology subscription ai-assistant community settings more quote reward collapse expand scroll-down honour scenarios execution streak calendar globe clock edit`.
- Requires the Lucide UMD script on the page (`https://unpkg.com/lucide@0.454.0/dist/umd/lucide.min.js`) — a documented substitution for the unreleased NAVRYA master pack.
- Illustrated marks (crests, chests, landmarks) are raster assets, not Icon: use `assets/crests`, `assets/icons/reward-chest-*`, `assets/icons/landmark-*`.
