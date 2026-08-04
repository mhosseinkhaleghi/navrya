# NavRow

One sidebar navigation row with its connected icon-rail node.

```jsx
<NavRow icon="sessions" label="Sessions" active />
<NavRow icon="more" label="More tools" disabled />
```

- Active = framed accent node + 8px arrowhead + accent-tinted row + "ACTIVE" label. Shape, label and colour all differentiate.
- `first`/`last` trim the vertical rail connector at the ends of the list.
- Row height 52px; the 46px rail column keeps every icon on one axis.
