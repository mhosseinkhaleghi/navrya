# Select

Toolbar dropdown — 44px control with an accent-framed listbox.

```jsx
<Select value={filter} onChange={setFilter}
  options={['All sessions','London','New York','Tokyo','Sydney']} icon="more" width={190} />
```

- Open state swaps the border to the character accent and rotates the chevron 180°.
- Options accept `{ value, label, native }` — the language selector uses `native` to show the EN / FA / AR / ES code beside the endonym.
- Closes on outside click. Put it inside a container with `overflow: visible`.
