import React from 'react';

/* NAVRYA icon slugs → Lucide icon names. One shared family, 24×24 grid, 2px round strokes.
   Lucide is a documented substitution for the unreleased NAVRYA master pack (see readme.md → ICONOGRAPHY). */
export const NAVRYA_ICONS = {
  sessions: 'Clock', dashboard: 'LayoutGrid', strategies: 'Waypoints', psychology: 'Brain',
  subscription: 'Crown', 'ai-assistant': 'Briefcase', community: 'MessagesSquare', settings: 'Settings',
  more: 'MoreHorizontal', quote: 'Quote', reward: 'Package', collapse: 'ChevronsLeft', expand: 'ChevronsRight',
  'scroll-down': 'ChevronDown', chevron: 'ChevronDown', 'active-arrow': 'ChevronRight', progress: 'CircleDashed',
  status: 'Circle', calendar: 'Calendar', globe: 'Globe', clock: 'Clock', edit: 'Pencil',
  honour: 'Shield', scenarios: 'Map', execution: 'Target', streak: 'Zap', sparkle: 'Sparkles',
  close: 'X', search: 'Search', bell: 'Bell', logout: 'LogOut', check: 'Check',
  filter: 'ListFilter', sort: 'ArrowUpDown', list: 'List', grid: 'LayoutGrid', plus: 'Plus',
  trash: 'Trash2', copy: 'Copy', report: 'ChartColumn', open: 'FolderOpen', 'new-session': 'CalendarPlus',
  upload: 'ArrowUp', image: 'Image', calendarPlus: 'CalendarPlus',
  mic: 'Mic', waveform: 'AudioLines', 'arrow-up': 'ArrowUp', assistant: 'Sparkles', stop: 'Square'
};

function pascal(name) {
  return name.replace(/(^\w|-\w)/g, (m) => m.replace('-', '').toUpperCase());
}

function lookup(name) {
  const lib = typeof window !== 'undefined' && window.lucide;
  if (!lib || !lib.icons) return null;
  const key = NAVRYA_ICONS[name] || pascal(name);
  return lib.icons[key] || lib.icons[pascal(name)] || null;
}

function toChildren(node) {
  // lucide IconNode is either [ [tag, attrs], … ] or ['svg', attrs, [ [tag, attrs], … ]]
  const list = Array.isArray(node) && node[0] === 'svg' ? node[2] : node;
  if (!Array.isArray(list)) return [];
  return list.map((entry, i) => {
    const [tag, attrs] = entry;
    const props = { key: i };
    for (const k in attrs) {
      const camel = k.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
      props[camel] = attrs[k];
    }
    return React.createElement(tag, props);
  });
}

/* Stroke icon on the shared 24×24 grid. Colour always comes from currentColor. */
export function Icon({ name, size = 20, strokeWidth = 2, title, style, ...rest }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (lookup(name)) return;
    let n = 0;
    const id = setInterval(() => { if (lookup(name) || ++n > 40) { clearInterval(id); force(); } }, 50);
    return () => clearInterval(id);
  }, [name]);
  const node = lookup(name);
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : 'true'}
      style={{ display: 'block', flex: 'none', ...style }} {...rest}
    >
      {title ? <title>{title}</title> : null}
      {toChildren(node)}
    </svg>
  );
}
