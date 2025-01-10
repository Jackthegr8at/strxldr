const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const path = require('path');

module.exports = function override(config, env) {
  // Remove any existing workbox plugins
  config.plugins = config.plugins.filter(
    plugin => !plugin.constructor.name.includes('Workbox')
  );

  // Add InjectManifest plugin
  config.plugins.push(
    new WorkboxWebpackPlugin.InjectManifest({
      swSrc: path.resolve(__dirname, 'src/service-worker.js'),
      swDest: 'service-worker.js',
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      exclude: [/\.map$/, /asset-manifest\.json$/, /LICENSE/],
    })
  );

  // Locate the Babel loader within the Webpack config
  const oneOfRule = config.module.rules.find(rule => rule.oneOf);
  if (oneOfRule) {
    const babelLoader = oneOfRule.oneOf.find(
      r => r.loader && r.loader.includes('babel-loader')
    );
    if (babelLoader) {
      babelLoader.options.plugins = babelLoader.options.plugins || [];

      // Remove the deprecated plugin if it's present
      babelLoader.options.plugins = babelLoader.options.plugins.filter(
        plugin => plugin !== '@babel/plugin-proposal-private-property-in-object'
      );

      // Add the transform plugin
      babelLoader.options.plugins.push('@babel/plugin-transform-private-property-in-object');
    }
  }

  return config;
};
