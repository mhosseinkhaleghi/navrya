import { useEffect, useMemo, useRef, useState } from 'react';

const pages = {
  select: { title: 'NAVRYA · Choose Your Character', source: 'pages/select/index.html' },
  hunter: { title: 'NAVRYA · Hunter', source: 'pages/hunter/index.html' },
  engineer: { title: 'NAVRYA · Engineer', source: 'pages/engineer/index.html' },
  commander: { title: 'NAVRYA · Commander', source: 'pages/commander/index.html' },
  sage: { title: 'NAVRYA · Market Sage', source: 'pages/sage/index.html' }
};

function pageFromHash() {
  const match = window.location.hash.match(/^#\/dashboard\/(hunter|engineer|commander|sage)$/);
  return match ? match[1] : 'select';
}

// A `file://` document's own origin is not a meaningful security boundary to check against
// (browsers report it inconsistently) - this app explicitly supports being opened directly as a
// file, so origin validation is skipped only in that one mode. Kept aligned with
// src/release.js's own equivalent, since this file is a parallel shell implementation.
function isTrustedOrigin(origin) {
  if (window.location.protocol === 'file:') return true;
  return origin === window.location.origin;
}

function isValidCharacterSelectedMessage(data) {
  return Boolean(data) && data.type === 'tradejournal:character-selected'
    && typeof data.character === 'string' && Object.prototype.hasOwnProperty.call(pages, data.character);
}

export default function App() {
  const [page, setPage] = useState(pageFromHash);
  const current = useMemo(() => pages[page], [page]);
  const iframeRef = useRef(null);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    const onMessage = (event) => {
      if (!isTrustedOrigin(event.origin)) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (!isValidCharacterSelectedMessage(event.data)) return;
      window.location.hash = `/dashboard/${event.data.character}`;
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('hashchange', onHashChange); window.removeEventListener('message', onMessage); };
  }, []);

  useEffect(() => { document.title = current.title; }, [current]);

  return <main className="app-frame"><iframe key={page} ref={iframeRef} title={current.title} src={current.source} /></main>;
}
