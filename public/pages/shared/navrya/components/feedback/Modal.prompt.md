# Modal

Dialog shell — scrim, R14 gold frame, header with accent icon tile, scrolling body, footer actions.

```jsx
<Modal open={open} title="New session" icon="new-session" onClose={close}
  footer={<><Button variant="primary">Create</Button><Button variant="ghost">Cancel</Button></>}>
  …
</Modal>
```

- **The dialog surface stays neutral ink (`--ink-900`)** — character identity appears only in the accent icon tile, focus rings and the primary action. Never tint the modal background with `--char-active-surface`.
- Borders follow the system: 1px antique gold outside, 1px parchment-8% hairlines between header / body / footer.
- Closes on Escape and scrim click. Body scrolls with the 3px accent scrollbar.
