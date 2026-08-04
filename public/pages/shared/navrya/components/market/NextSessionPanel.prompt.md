# NextSessionPanel

344×64 pinned panel counting down to the next market open.

```jsx
<NextSessionPanel city="SYDNEY" startsIn="01:35:40" />
```

- Ticks once per second and is announced with `aria-live="polite"`; pass `live={false}` for static mocks and screenshots.
- Countdown is 18/24 tabular.
