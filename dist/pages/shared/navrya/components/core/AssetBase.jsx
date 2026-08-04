/* Resolves asset URLs relative to whatever page loaded the design system.
   Base is derived from the <link> to styles.css (or the _ds_bundle.js <script>),
   and can be overridden with window.NAVRYA_ASSET_BASE. */
export function assetBase() {
  if (typeof document === 'undefined') return '';
  if (window.NAVRYA_ASSET_BASE) return String(window.NAVRYA_ASSET_BASE).replace(/\/?$/, '/');
  const link = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((l) => l.getAttribute('href') || '')
    .find((h) => /styles\.css(\?|#|$)/.test(h));
  if (link) return link.replace(/styles\.css.*$/, '');
  const src = Array.prototype.slice.call(document.querySelectorAll('script[src]'))
    .map((s) => s.getAttribute('src') || '')
    .find((h) => /_ds_bundle\.js(\?|#|$)/.test(h));
  if (src) return src.replace(/_ds_bundle\.js.*$/, '');
  return '';
}

export function assetUrl(path) {
  return assetBase() + String(path).replace(/^\//, '');
}
