import { useEffect } from 'react';

/**
 * Registers the PWA service worker on the client.
 * - Only runs in production builds (avoid caching churn during dev).
 * - Listens for updates and prompts the user to refresh.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Skip in dev — Next.js HMR + SW caching fight each other.
    if (!import.meta.env.PROD) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        // Check for updates every 60 minutes while the page is open.
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      } catch (err) {
        // SW registration is non-critical — fail silently.
        console.warn('SW registration failed:', err);
      }
    };
    register();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
