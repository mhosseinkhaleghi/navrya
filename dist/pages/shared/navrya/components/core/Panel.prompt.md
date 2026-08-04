# Panel

The ornamented frame every NAVRYA module sits in — use it instead of hand-rolling borders, corner brackets or textures.

```jsx
<Panel variant="active" radius={8} ornament glow>
  <div style={{ padding: 16 }}>Active module</div>
</Panel>
```

- `variant`: `base` (1px antique gold), `raised` (hairline + shadow), `prestige` (strong gold + panel shadow), `active` (character accent at 90% + 0 0 16 glow), `quiet` (no frame).
- `ornament` draws the four 12px corner brackets. Ornament defines hierarchy — never decorative noise.
- `texture` overlays the character atmosphere image; keep `textureOpacity` between .04 and .08.
