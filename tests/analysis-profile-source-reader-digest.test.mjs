import assert from 'node:assert/strict';
import test from 'node:test';
import { htmlToText, WEBSITE_DIGEST_MAX_LENGTH } from '../server/ai/source-reader.mjs';

// The website reader's digest is what a trader teaches the engine from, and what the Knowledge tab
// shows under "what was read". A real page a trader added (tradingsim.com) built its header and menus
// out of plain <div>/<ul> - no <nav>, no <header>, no <main> - so the menu text, twice (mobile and
// desktop), filled the first quarter of the digest: the article did not start until character ~1500 of
// 6000, and 78 of the first 123 lines were menu entries. These tests pin the fix and, just as
// importantly, the things it must NOT throw away.

const menu = (items) => `<div class="menu"><ul>${items.map((i) => `<li><a href="/${i.toLowerCase().replace(/\W+/g, '-')}">${i}</a></li>`).join('')}</ul></div>`;
const MENU_ITEMS = ['Pricing', 'Features', 'Trading Basics', 'Order Types', 'Money Management', 'Day Trading Salary', 'Contact Us'];

const PAGE = `<!doctype html><html><head><title>Price Action Strategies | TradingSim</title><meta charset="utf-8"></head><body>
  ${menu(MENU_ITEMS)}
  <div class="mobile">${menu(MENU_ITEMS)}</div>
  <div class="logo"><a href="/">TradingSim</a></div>
  <h1>Price Action Trading Strategies: 6 Patterns that Work</h1>
  <div class="byline">Written by: <a href="/authors/al">Al Hill</a> · Jul 21, 2026</div>
  <h2>Key Takeaways</h2>
  <ul><li>Price action reads raw price movement.</li><li>Support and resistance give context.</li></ul>
  <p>Traders who study <a href="/candlesticks">candlestick patterns</a> and <a href="/support">support levels</a> read the market directly, without indicators.</p>
  <p>The second paragraph explains stop placement and why a swept level often reverses.</p>
  ${menu(['About', 'Careers', 'Privacy', 'Terms', 'Sitemap'])}
</body></html>`;

test('the digest starts at the article, not at the site menu', () => {
  const digest = htmlToText(PAGE);
  assert.ok(digest.startsWith('Price Action Trading Strategies: 6 Patterns that Work'), 'starts at the main heading: ' + digest.slice(0, 80));
  for (const item of MENU_ITEMS) assert.ok(!digest.includes(item), 'menu item leaked into the digest: ' + item);
  for (const item of ['Careers', 'Privacy', 'Sitemap']) assert.ok(!digest.includes(item), 'footer menu leaked: ' + item);
});

test('the page title is not prepended to the digest a second time (it is captured as its own field)', () => {
  assert.ok(!htmlToText(PAGE).includes('TradingSim'), 'neither the <title> nor the header logo link');
});

test('everything the trader actually wants is kept, including the text of links inside a sentence', () => {
  const digest = htmlToText(PAGE);
  assert.match(digest, /Written by: Al Hill/, 'a byline with a link stays readable');
  assert.match(digest, /Key Takeaways/);
  assert.match(digest, /Price action reads raw price movement\./, 'short list items that are not links are content');
  assert.match(digest, /Support and resistance give context\./);
  assert.match(digest, /Traders who study candlestick patterns and support levels read the market directly/, 'link text inside prose survives, on one line');
  assert.match(digest, /swept level often reverses/);
});

test('the digest is bounded by the same cap and is mostly prose on a menu-heavy page', () => {
  const digest = htmlToText(PAGE).slice(0, WEBSITE_DIGEST_MAX_LENGTH);
  const lines = digest.split('\n');
  const shortLines = lines.filter((l) => l.split(/\s+/).length < 4).length;
  assert.ok(shortLines / lines.length < 0.4, 'menu-like lines dominate the digest: ' + shortLines + '/' + lines.length);
});

// ---- the things it must not throw away ------------------------------------------------------------

test('a few consecutive link-only lines are content, not a menu: below the run threshold they are kept', () => {
  const html = '<h1>Title</h1><p>Read next:</p><ul><li><a href="/a">First guide</a></li><li><a href="/b">Second guide</a></li><li><a href="/c">Third guide</a></li></ul><p>Then continue.</p>';
  const digest = htmlToText(html);
  assert.match(digest, /First guide/);
  assert.match(digest, /Second guide/);
  assert.match(digest, /Third guide/);
});

test('a run at the threshold (four link-only lines) is dropped as navigation', () => {
  const html = '<h1>Title</h1><ul><li><a href="/a">Alpha</a></li><li><a href="/b">Beta</a></li><li><a href="/c">Gamma</a></li><li><a href="/d">Delta</a></li></ul><p>Real sentence here.</p>';
  const digest = htmlToText(html);
  for (const word of ['Alpha', 'Beta', 'Gamma', 'Delta']) assert.ok(!digest.includes(word), word);
  assert.match(digest, /Real sentence here\./);
});

test('a long list of NON-link items is content and is never treated as a menu', () => {
  const items = ['Equal highs and lows', 'Stop clusters', 'Sweep and reverse', 'Order blocks', 'Fair value gaps', 'Premium and discount'];
  const html = '<h1>Concepts</h1><ul>' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';
  const digest = htmlToText(html);
  for (const item of items) assert.ok(digest.includes(item), 'lost a plain list item: ' + item);
});

test('a line that mixes link text with real words is prose, however many links it has', () => {
  const html = '<h1>Title</h1><p><a href="/a">Liquidity</a> is drawn to <a href="/b">stops</a> and <a href="/c">equal highs</a> before price reverses.</p>';
  assert.match(htmlToText(html), /Liquidity is drawn to stops and equal highs before price reverses\./);
});

test('separator-only lines between links (a breadcrumb or pipe menu) count as navigation', () => {
  const html = '<h1>Title</h1><div><a href="/1">Home</a> | <a href="/2">Blog</a> | <a href="/3">Guides</a></div><div><a href="/4">Shop</a> / <a href="/5">Cart</a></div><div><a href="/6">Login</a></div><div><a href="/7">Signup</a></div><p>The article.</p>';
  const digest = htmlToText(html);
  for (const word of ['Home', 'Blog', 'Guides', 'Shop', 'Cart', 'Login', 'Signup']) assert.ok(!digest.includes(word), word);
  assert.match(digest, /The article\./);
});

test('a page with no <h1> is still cleaned of menus and keeps everything else', () => {
  const html = '<body>' + menu(MENU_ITEMS) + '<p>An article with no main heading at all.</p></body>';
  const digest = htmlToText(html);
  assert.match(digest, /An article with no main heading at all\./);
  assert.ok(!digest.includes('Money Management'));
});

test('a stray <h1> near the END of the page (a footer logo) never throws the article away', () => {
  const article = '<p>' + 'A long paragraph of genuine article prose about liquidity. '.repeat(40) + '</p>';
  const html = '<body>' + article + '<div class="footer-brand"><h1>SiteName</h1></div></body>';
  const digest = htmlToText(html);
  assert.match(digest, /genuine article prose about liquidity/, 'the article before the late <h1> is kept');
});

test('scripts, styles, forms and the semantic furniture elements are still removed', () => {
  const html = '<h1>Title</h1><script>evil()</script><style>.x{color:red}</style><form><input value="q"><button>Go</button></form><aside>Sidebar ad</aside><nav>Nav words</nav><footer>Footer words</footer><p>Body text.</p>';
  const digest = htmlToText(html);
  for (const word of ['evil()', 'color:red', 'Sidebar ad', 'Nav words', 'Footer words', 'Go']) assert.ok(!digest.includes(word), word);
  assert.match(digest, /Body text\./);
});

test('entities are decoded and the marker characters never leak into the output', () => {
  const digest = htmlToText('<h1>T</h1><p>Fish &amp; chips &lt;3 <a href="/x">a link</a></p>');
  assert.match(digest, /Fish & chips <3 a link/);
  assert.ok(!/[\u0001\u0002]/.test(digest), 'internal link markers must be stripped');
});

test('empty and hostile input never throws', () => {
  for (const input of ['', '   ', '<', '<a', '<a href="/x">unclosed', '<h1>', '</a></a>', '<script>', '\u0001\u0002<a>x</a>']) {
    assert.doesNotThrow(() => htmlToText(input), JSON.stringify(input));
  }
  assert.equal(htmlToText(''), '');
});
