import { useEffect, useMemo, useState } from 'react';

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

export default function App() {
  const [page, setPage] = useState(pageFromHash);
  const current = useMemo(() => pages[page], [page]);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    const onMessage = (event) => {
      if (event.data?.type === 'tradejournal:character-selected' && pages[event.data.character]) {
        window.location.hash = `/dashboard/${event.data.character}`;
      }
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('hashchange', onHashChange); window.removeEventListener('message', onMessage); };
  }, []);

  useEffect(() => { document.title = current.title; }, [current]);

  return <main className="app-frame"><iframe key={page} title={current.title} src={current.source} /></main>;
}
