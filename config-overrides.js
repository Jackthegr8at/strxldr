const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const path = require('path');

module.exports = function override(config, env) {
  // Remove any existing workbox plugins
  config.plugins = config.plugins.filter(
    plugin => !plugin.constructor.name.includes('Workbox')
  );

  // Add InjectManifest plugin with correct options
  config.plugins.push(
    new WorkboxWebpackPlugin.InjectManifest({
      swSrc: path.resolve(__dirname, 'src/service-worker.ts'),
      swDest: 'service-worker.js',
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      manifestTransforms: [
        (entries) => ({
          manifest: entries.map((entry) => ({
            url: entry.url,
            revision: entry.revision || null
          }))
        })
      ]
    })
  );

  return config;
};
