module.exports = {
  globDirectory: 'build/',
  globPatterns: ['**/*.{html,js,css,png,jpg,jpeg,gif,webp,svg,woff,woff2,eot,ttf,otf}', 'manifest.json', 'favicon*.ico'],
  globIgnores: ['**/sw.js', '**/workbox-*.js', '**/*.map', '.vite/**'],
  swDest: 'build/sw.js',
  clientsClaim: true,
  skipWaiting: false,
  inlineWorkboxRuntime: true,
  navigateFallback: 'index.html',
  runtimeCaching: [
    {
      // Exact origins and endpoint paths; query strings cannot impersonate APIs.
      urlPattern: ({ url }) => {
        const paths = {
          'https://proton.eosusa.io': ['/v1/chain/get_table_rows', '/v1/chain/get_currency_balance', '/v2/history/get_actions'],
          'https://proton.greymass.com': ['/v1/chain/get_table_rows', '/v1/chain/get_currency_balance', '/v2/history/get_actions'],
          'https://api-xprnetwork-main.saltant.io': ['/v1/chain/get_table_rows', '/v1/chain/get_currency_balance', '/v2/history/get_actions'],
          'https://api-v3.raydium.io': ['/pools/info/ids'],
          'https://api.dexscreener.com': ['/latest/dex/pairs/solana/5XVsERryqVvKPDMUh851H4NsSiK68gGwRg9Rpqf9yMmf'],
          'https://www.api.bloks.io': ['/proton/tokens/XSOL-proton-xtokens'],
          'https://nfts.jessytremblay.com': ['/STRX/stakes.json', '/STRX/newstakers.json'],
        };
        return (paths[url.origin] || []).includes(url.pathname);
      },
      handler: 'NetworkOnly',
      method: 'GET',
    },
    { urlPattern: ({ request, url }) => request.destination === 'image' && /\.(?:png|jpg|jpeg|svg|gif|webp)$/i.test(url.pathname), handler: 'CacheFirst', method: 'GET', options: { cacheName: 'images', expiration: { maxEntries: 60, maxAgeSeconds: 86400 } } },
    { urlPattern: ({ request, url }) => request.destination === 'font' && /\.(?:woff|woff2|eot|ttf|otf)$/i.test(url.pathname), handler: 'CacheFirst', method: 'GET', options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 86400 } } },
  ],
};
