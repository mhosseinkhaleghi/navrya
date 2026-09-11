# NavRow

One sidebar navigation row with its connected icon-rail node.

```jsx
<NavRow icon="sessions" label="Sessions" active />
<NavRow icon="more" label="More tools" disabled />
<NavRow icon="support" label="Support" count={3} countLabel="3 unread" />
```

- Active = framed accent node + 8px arrowhead + accent-tinted row + "ACTIVE" label. Shape, label and colour all differentiate.
- `first`/`last` trim the vertical rail connector at the ends of the list.
- Row height 52px; the 46px rail column keeps every icon on one axis.
- `count` is a numeric unread badge, hidden at 0/falsy, capped "99+" above 99 - a small pill at the icon's corner (collapsed) or trailing the label (expanded). Distinct from the pre-existing boolean `badge` prop (CollapsedRail's own active-state dot). `countLabel` (e.g. "3 unread") is appended to the row's `aria-label` whenever the badge shows.
