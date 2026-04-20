// Import the version from package.json
import { version as APP_VERSION } from '../package.json';

export function register() {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swUrl = `${import.meta.env.BASE_URL || ''}sw.js`;
        
        // Use package.json version instead of Date.now()
        const swUrlWithVersion = `${swUrl}?v=${APP_VERSION}`;

        // Check if we need to clear old service worker
        if ('serviceWorker' in navigator) {
          // Get the currently active service worker
          navigator.serviceWorker.getRegistration().then(registration => {
            if (registration) {
              // Extract version from the existing service worker URL
              const currentVersion = new URL(registration.scope).searchParams.get('v');

              if (currentVersion && currentVersion !== APP_VERSION) {
                // Clear caches
                caches.keys().then(cacheNames => {
                  return Promise.all(
                    cacheNames.map(cacheName => caches.delete(cacheName))
                  );
                });
                // Unregister old service worker
                registration.unregister().then(() => {
                  window.location.reload();
                });
                return;
              }
            }
          });
        }

        navigator.serviceWorker.register(swUrlWithVersion)
          .then(registration => {
            // Check for updates every 30 minutes (conservative cadence)
            setInterval(() => {
              registration.update();
            }, 30 * 60 * 1000);

            // When a new SW finishes installing, it enters the "waiting" state.
            // Only activate it on the next navigation (controllerchange) rather
            // than forcing an immediate reload that can flash a blank screen.
            registration.addEventListener('updatefound', () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.addEventListener('statechange', () => {
                  if (installingWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                      // New content is available and will activate on next navigation.
                      console.log('[SW] New version available; will activate on next page load.');
                    }
                  }
                });
              }
            });

            // When the controlling SW changes (e.g. after user navigates),
            // reload once to pick up the new precache manifest.
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload();
            });
          })
          .catch(error => {
            console.error('Error during service worker registration:', error);
          });
      });
    }
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(registration => {
        registration.unregister();
      })
      .catch(error => {
        console.error(error.message);
      });
  }
}

// Add this function to help clear cache during development
export async function clearCache() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );

    // Also unregister the service worker
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(registration => registration.unregister())
      );
    }
    
    // Reload the page to ensure fresh content
    window.location.reload();
  }
}

// Add a development helper to clear cache when needed
if (import.meta.env.DEV) {
  // @ts-ignore
  window.clearCache = clearCache;
}
 