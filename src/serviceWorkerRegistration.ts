// Import the version from package.json
const APP_VERSION = require('../package.json').version;

export function register() {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js`;
        
        // Use package.json version instead of Date.now()
        const swUrlWithVersion = `${swUrl}?v=${APP_VERSION}`;
        console.log('Attempting to register service worker from:', swUrlWithVersion);
        
        // Check if we need to clear old service worker
        if ('serviceWorker' in navigator) {
          // Get the currently active service worker
          navigator.serviceWorker.getRegistration().then(registration => {
            if (registration) {
              // Extract version from the existing service worker URL
              const currentVersion = new URL(registration.scope).searchParams.get('v');
              
              if (currentVersion && currentVersion !== APP_VERSION) {
                console.log('New version detected. Clearing cache and updating service worker...');
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
            console.log('Service Worker registered successfully:', registration);
            
            // Check for updates every minute
            setInterval(() => {
              registration.update();
            }, 60 * 1000);
            
            registration.addEventListener('updatefound', () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.addEventListener('statechange', () => {
                  if (installingWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                      // New content is available - force reload
                      window.location.reload();
                    } else {
                      console.log('Content is cached for offline use.');
                    }
                  }
                });
              }
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
    console.log('All caches cleared');
    
    // Also unregister the service worker
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(registration => registration.unregister())
      );
      console.log('Service workers unregistered');
    }
    
    // Reload the page to ensure fresh content
    window.location.reload();
  }
}

// Add a development helper to clear cache when needed
if (process.env.NODE_ENV === 'development') {
  // @ts-ignore
  window.clearCache = clearCache;
  console.log('Development helper: Call window.clearCache() to clear all caches');
}
 