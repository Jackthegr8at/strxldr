let registered = false;
export function register() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || registered) return;
  registered = true;
  let disposed = false;
  let lifecycle = 0;
  let updateTimer: ReturnType<typeof setInterval> | undefined;
  let idleHandle: number | undefined;
  let fallbackHandle: ReturnType<typeof setTimeout> | undefined;
  let registration: ServiceWorkerRegistration | undefined;
  const discovered = () => { /* Updates wait for existing controlled documents to close. */ };
  const start = () => {
    if (disposed) return;
    const activeLifecycle = lifecycle;
    const swUrl = `${import.meta.env.BASE_URL || '/'}sw.js`;
    void navigator.serviceWorker.register(swUrl).then(result => {
      if (disposed || activeLifecycle !== lifecycle) return;
      registration = result;
      registration.addEventListener('updatefound', discovered);
      updateTimer = setInterval(() => { void result.update().catch(error => console.error('Service worker update failed:', error)); }, 30 * 60 * 1000);
    }).catch(error => console.error('Error during service worker registration:', error));
  };
  const schedule = () => {
    if (disposed) return;
    if ('requestIdleCallback' in window) idleHandle = window.requestIdleCallback(start, { timeout: 5000 });
    else fallbackHandle = setTimeout(start, 0);
  };
  const cleanup = () => {
    disposed = true;
    lifecycle += 1;
    window.removeEventListener('load', schedule);
    window.removeEventListener('pagehide', cleanup);
    if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
    if (fallbackHandle !== undefined) clearTimeout(fallbackHandle);
    if (updateTimer !== undefined) clearInterval(updateTimer);
    registration?.removeEventListener('updatefound', discovered);
    idleHandle = undefined;
    fallbackHandle = undefined;
    updateTimer = undefined;
    registration = undefined;
  };
  const resume = (event: PageTransitionEvent) => {
    if (!event.persisted || !disposed) return;
    disposed = false;
    window.addEventListener('pagehide', cleanup);
    schedule();
  };
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('pageshow', resume);
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}
export async function unregister() {
  if ('serviceWorker' in navigator) await (await navigator.serviceWorker.getRegistration())?.unregister();
}
// Explicit development-only helper; never called during registration or updates.
export async function clearCache() {
  if (!import.meta.env.DEV) return;
  if ('caches' in window) await Promise.all((await caches.keys()).map(name => caches.delete(name)));
  if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(registration => registration.unregister()));
  window.location.reload();
}
if (import.meta.env.DEV) Object.assign(window, { clearCache });
