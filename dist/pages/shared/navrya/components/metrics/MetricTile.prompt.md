# MetricTile

One 132×64 metric: 24px icon, 11px label, 20px tabular value.

```jsx
<MetricTile icon="execution" label="EXECUTION" value="68%" />
```

- Four tiles form the header metric row — use MetricRow rather than laying tiles out by hand.
- Labels are uppercase with .08em tracking; values use tabular numerals so columns align.
