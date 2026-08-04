# MetricRow

The framed four-tile metric row from the character header.

```jsx
<MetricRow metrics={[
  { icon: 'honour', label: 'HONOUR', value: '1,850' },
  { icon: 'scenarios', label: 'SCENARIOS', value: '42' },
  { icon: 'execution', label: 'EXECUTION', value: '68%' },
  { icon: 'streak', label: 'STREAK', value: '11 DAYS' }
]} />
```

- Dividers are 1px antique gold at 28% opacity, inset 10px vertically.
- Keep four equal tiles on desktop; collapse to two rows below 768px.
