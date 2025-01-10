const WorkboxWebpackPlugin = require('workbox-webpack-plugin');

module.exports = function override(config, env) {
  // Remove any existing workbox plugins
  config.plugins = config.plugins.filter(
    plugin => !plugin.constructor.name.includes('Workbox')
  );

  // Add GenerateSW plugin with all our custom caching strategies
  config.plugins.push(
    new WorkboxWebpackPlugin.GenerateSW({
      clientsClaim: true,
      skipWaiting: true,
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      runtimeCaching: [
        // Navigation routes
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
        // API routes
        {
          urlPattern: ({ url }) => 
            url.href.includes('api-xprnetwork-main.saltant.io') ||
            url.href.includes('proton.eosusa.io') ||
            url.href.includes('api-v3.raydium.io') ||
            url.href.includes('api.bloks.io') ||
            url.href.includes('api.dexscreener.com'),
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'api-cache',
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 5 * 60 // 5 minutes
            }
          }
        },
        // External images
        {
          urlPattern: ({ url }) => url.href.includes('raw.githubusercontent.com'),
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'external-images',
            expiration: {
              maxEntries: 60,
              maxAgeSeconds: 24 * 60 * 60 // 24 hours
            }
          }
        },
        // Static assets
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'images',
            expiration: {
              maxEntries: 60,
              maxAgeSeconds: 24 * 60 * 60 // 24 hours
            }
          }
        }
      ]
    })
  );

  return config;
};