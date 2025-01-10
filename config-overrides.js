const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const path = require('path');

module.exports = function override(config, env) {
  // Remove existing GenerateSW plugin
  config.plugins = config.plugins.filter(
    plugin => plugin.constructor.name !== 'GenerateSW'
  );

  // Add InjectManifest plugin
  config.plugins.push(
    new WorkboxWebpackPlugin.InjectManifest({
      swSrc: path.resolve(__dirname, 'src/service-worker.ts'),
      swDest: 'service-worker.js',
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
      // Remove manifestTransforms
    })
  );

  return config;
};
