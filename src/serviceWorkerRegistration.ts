export function register() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swUrl = `${process.env.PUBLIC_URL || ''}/service-worker.js`;
        navigator.serviceWorker.register(swUrl).catch(error => {
          console.error('Error during service worker registration:', error);
        });
      });
    }
  }
  
  export function unregister() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.unregister();
      });
    }
  }