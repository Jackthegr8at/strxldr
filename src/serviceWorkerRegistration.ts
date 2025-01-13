export function register() {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js`;
        console.log('Attempting to register service worker from:', swUrl);
        
        navigator.serviceWorker.register(swUrl)
          .then(registration => {
            console.log('Service Worker registered successfully:', registration);
            
            registration.addEventListener('updatefound', () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.addEventListener('statechange', () => {
                  if (installingWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                      console.log('New content is available; please refresh.');
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
 