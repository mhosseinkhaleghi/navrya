# SearchField

Toolbar search input — 44px, trailing glyph, absorbs the remaining toolbar width.

```jsx
<SearchField value={query} onChange={setQuery} style={{ flex: '1 1 220px' }} />
```

- Focus takes the accent border plus the soft accent glow.
- Placeholder is always `Search sessions` in the ledger; keep it a real `<input type="search">`.
