# CollapseControl

Pinned 44px control that toggles the sidebar between 256px and 72px.

```jsx
<CollapseControl collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
```

- Double chevrons: left to collapse, right to expand. 220ms ease.
- Always visible — it never scrolls with the navigation.
