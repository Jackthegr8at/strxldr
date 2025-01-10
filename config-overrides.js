const WorkboxWebpackPlugin = require('workbox-webpack-plugin');

module.exports = function override(config, env) {
  // Remove any existing workbox plugins
  config.plugins = config.plugins.filter(
    plugin => !plugin.constructor.name.includes('Workbox')
  );

  if (env === 'production') {
    config.plugins.push(
      new WorkboxWebpackPlugin.GenerateSW({
        swDest: 'sw.js',
        clientsClaim: true,
        skipWaiting: true,
        include: [/\.html$/, /\.js$/, /\.css$/, /\.jpg$/, /\.png$/, /\.ico$/],
        exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
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
              url.href.includes('api.dexscreener.com'),
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
      })
    );
  }

  return config;
}