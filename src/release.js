(function () {
  const pagePrefix = window.location.protocol === 'file:' ? 'public/pages/' : 'pages/';
  const pages = {
    select: { title: 'TradeJournal · Choose Your Character', source: pagePrefix + 'select/index.html' },
    hunter: { title: 'TradeJournal · Hunter', source: pagePrefix + 'hunter/index.html' },
    engineer: { title: 'TradeJournal · Engineer', source: pagePrefix + 'engineer/index.html' },
    commander: { title: 'TradeJournal · Commander', source: pagePrefix + 'commander/index.html' },
    sage: { title: 'TradeJournal · Market Sage', source: pagePrefix + 'sage/index.html' }
  };

  function pageFromHash() {
    const match = window.location.hash.match(/^#\/dashboard\/(hunter|engineer|commander|sage)$/);
    return match ? match[1] : 'select';
  }

  function App() {
    const state = React.useState(pageFromHash());
    const page = state[0];
    const setPage = state[1];
    const current = pages[page];

    React.useEffect(function () {
      function onHashChange() { setPage(pageFromHash()); }
      function onMessage(event) {
        if (event.data && event.data.type === 'tradejournal:character-selected' && pages[event.data.character]) {
          window.location.hash = '/dashboard/' + event.data.character;
        }
      }
      window.addEventListener('hashchange', onHashChange);
      window.addEventListener('message', onMessage);
      return function () {
        window.removeEventListener('hashchange', onHashChange);
        window.removeEventListener('message', onMessage);
      };
    }, []);

    React.useEffect(function () { document.title = current.title; }, [current]);
    return React.createElement('main', { className: 'app-frame' }, React.createElement('iframe', { key: page, title: current.title, src: current.source }));
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
}());
