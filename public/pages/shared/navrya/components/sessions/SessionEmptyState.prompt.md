# SessionEmptyState

The Session Library empty field — icon → title → helper, with three decorative ghost cards.

```jsx
<SessionEmptyState />
```

- 314px minimum height, 24px padding, dashed gold frame with a 2px character-accent left rail — the only accent in the field.
- Ghost cards are `aria-hidden` decoration at 3 × 1fr, 82px tall. Never put real content in them.
- Message hierarchy is fixed: icon, then title, then helper. One primary CTA stays visible in the toolbar above.
