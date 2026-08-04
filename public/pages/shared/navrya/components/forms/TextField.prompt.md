# TextField

Labelled 44px input — the dialog form control.

```jsx
<TextField label="Gregorian date" value={date} onChange={setDate} />
<TextField label="Jalali date" value={jalali} onChange={setJalali} dir="rtl" />
```

- Label is 12px sentence case above the field; focus takes the character accent border.
- Use `dir="rtl"` for Jalali / Persian / Arabic values.
