# CharacterPortrait

Circular editable portrait with the gold double ring and the accent edit control.

```jsx
<CharacterPortrait character="hunter" size={220} onEdit={openPicker} />
```

- 220px frame / 188px crop, `object-fit: cover`, safe face zone is the central 70%.
- Edit button is 36px with an 18px pencil, bottom-right, 8px inset, 2px accent border, +8% hover brightness.
- Drop `editable` for read-only contexts (leaderboards, community lists).
