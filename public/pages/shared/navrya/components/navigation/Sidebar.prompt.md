# Sidebar

The whole compact sidebar — use it for any NAVRYA app shell instead of assembling rows yourself.

```jsx
<Sidebar character="hunter" activeId="sessions" collapsed={collapsed}
  onNavigate={setActive} onToggle={() => setCollapsed(!collapsed)} height={900} />
```

- Nav scrolls · lower modules stay pinned. The scroll viewport uses the 3px accent scrollbar (`.navrya-scroll`) and a bottom fade with a partially visible "More tools" row.
- `collapsed` renders the 72px rail: icon nodes, pinned quote button, reward ring with percentage, expand control.
- Skinning is data-only: set `data-character` on an ancestor and pass `character` for the art.
- Below 1100px it becomes the 72px icon rail to preserve the main workspace. Below 720px it is
  a full-screen themed overlay opened from the header hamburger and dismissed by its close button,
  backdrop, Escape, or navigation.
