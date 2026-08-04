# Button

The NAVRYA control — 44px tall, R8, gold frame; one primary CTA per module.

```jsx
<Button variant="primary" icon="edit">New session</Button>
<Button variant="secondary">All sessions</Button>
<Button variant="danger" size="sm" icon="close">Delete</Button>
```

- `primary` fills with the character accent and uses ink text — never more than one per module.
- `secondary` is the toolbar default: dark surface, 1px antique gold, parchment label.
- `danger` is reserved for destructive card actions (Delete). `ghost` for low-priority inline actions.
- Hover lightens the surface and steps the border to gold-90%; press takes the accent; focus shows the 2px accent ring. Disabled drops to 38% opacity.
