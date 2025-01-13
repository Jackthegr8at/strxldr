module.exports = {
  globDirectory: 'build/',
  globPatterns: [
    ...(process.env.NODE_ENV === 'production' ? [
      '**/*.{html,js,css}', // Core web assets
      'static/**/*.{png,jpg,jpeg,gif,webp,svg}', // Static images
      'assets/**/*.{png,jpg,jpeg,gif,webp,svg}', // Asset images
      'icons/*.{png,webp}', // Icons
      'manifest.json',
      'favicon*.{ico,webp,png}' // Favicons
    ] : [
      // In development, only cache static assets
      'static/**/*.{png,jpg,jpeg,gif,webp,svg}',
      'assets/**/*.{png,jpg,jpeg,gif,webp,svg}',
      'icons/*.{png,webp}',
      'manifest.json',
      'favicon*.{ico,webp,png}'
    ]),
  ],
  globIgnores: [
    '**/service-worker.js',
    '**/*.map',
    '**/asset-manifest.json',
    'robots.txt',
    '.DS_Store'
  ],
  swDest: 'build/sw.js',
  clientsClaim: true,
  skipWaiting: true,
  inlineWorkboxRuntime: true,
  runtimeCaching: [
    // Navigation routes with different strategies for dev/prod
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: process.env.NODE_ENV === 'production' ? 'NetworkFirst' : 'NetworkOnly',
      options: {
        cacheName: 'pages',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: process.env.NODE_ENV === 'production' ? 24 * 60 * 60 : 5 * 60 // 24 hours in prod, 5 minutes in dev
        }
      }
    },
    // API endpoints with shorter cache times in dev
    {
      urlPattern: ({ url }) => {
        const apiEndpoints = [
          'api-xprnetwork-main.saltant.io',
          'proton.eosusa.io',
          'api-v3.raydium.io',
          'api.bloks.io',
          'api.dexscreener.com',
          'nfts.jessytremblay.com',
          'raw.githubusercontent.com'
        ];
        return apiEndpoints.some(endpoint => url.href.includes(endpoint));
      },
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: process.env.NODE_ENV === 'production' ? 5 * 60 : 60 // 5 minutes in prod, 1 minute in dev
        },
        cacheableResponse: {
          statuses: [0, 200]
        }
      }
    },
    // Static assets
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        }
      }
    },
    // Web fonts
    {
      urlPattern: /\.(?:woff|woff2|eot|ttf|otf)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'fonts',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 24 * 60 * 60 // 60 days
        }
      }
    }
  ]
}; 