/** Full page navigation — avoids React Router / Suspense leaving stale route UI mounted. */
export function hardNavigate(path: string): void {
  const url = new URL(path, window.location.origin);
  const target = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (target === current) {
    window.location.reload();
    return;
  }

  window.location.assign(target);
}
