/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

clientsClaim();

// Add a try-catch block to handle the manifest
try {
  const manifest = self.__WB_MANIFEST || [];
  precacheAndRoute(manifest);
} catch (error) {
  console.error('Failed to load manifest:', error);
  precacheAndRoute([]);
}

const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
registerRoute(
  ({ request, url }: { request: Request; url: URL }) => {
    if (request.mode !== 'navigate') {
      return false;
    }
    if (url.pathname.startsWith('/_')) {
      return false;
    }
    if (url.pathname.match(fileExtensionRegexp)) {
      return false;
    }
    return true;
  },
  createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html')
);

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.png'),
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 50 })],
  })
);

registerRoute(
  ({ url }) => 
    url.href.includes('api-xprnetwork-main.saltant.io') ||
    url.href.includes('proton.eosusa.io') ||
    url.href.includes('api-v3.raydium.io') ||
    url.href.includes('api.bloks.io') ||
    url.href.includes('api.dexscreener.com'),
  new StaleWhileRevalidate({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60 // Cache for 5 minutes
      })
    ]
  })
);

registerRoute(
  ({ url }) => 
    url.href.includes('raw.githubusercontent.com'),
  new StaleWhileRevalidate({
    cacheName: 'external-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 24 * 60 * 60 // Cache for 24 hours
      })
    ]
  })
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});