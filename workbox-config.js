module.exports = {
  globDirectory: 'build/',
  globPatterns: [
    '**/*.{html,js,css,png,jpg,jpeg,gif,ico,json,webp}'
  ],
  swDest: 'build/sw.js',
  clientsClaim: true,
  skipWaiting: true,
  inlineWorkboxRuntime: true,
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        expiration: {
          maxEntries: 50
        }
      }
    },
    {
      urlPattern: ({ url }) => 
        url.href.includes('api-xprnetwork-main.saltant.io') ||
        url.href.includes('proton.eosusa.io') ||
        url.href.includes('api-v3.raydium.io') ||
        url.href.includes('api.bloks.io') ||
        url.href.includes('api.dexscreener.com') ||
        url.href.includes('nfts.jessytremblay.com') ||
        url.href.includes('raw.githubusercontent.com/'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60
        }
      }
    }
  ]
}; 