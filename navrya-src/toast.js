// Same .tj-toast CSS class every legacy module's own toast() helper already uses - reused here
// so React-mounted modals (which unmount immediately on close, so can't hold state for a
// post-close toast) can still show one, without a parallel toast implementation.
export function showToast(message, tone) {
  const node = document.createElement('div');
  node.className = 'tj-toast ' + (tone || '');
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 2600);
}
