# CharacterHeader

The full 1920×320 character header — brand, portrait, identity, XP, level, rank, metrics, utilities and the market rail.

```jsx
<div data-character="hunter">
  <CharacterHeader character="hunter" name="RAYAN LAND" handle="@rayanland" />
</div>
```

- One component, four identities: everything below the API is token-driven, so `character` is the only visual switch.
- Region widths: brand 200 · portrait 236 · identity+XP 640 · level 104 · crest 152 · utilities 344 · market card min 264×72.
- Below 1280px reduce the portrait to 176px; below 768px collapse metrics and turn the market rail into a carousel.
