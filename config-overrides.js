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

  // Ensure consistent Babel configuration
  const oneOfRule = config.module.rules.find(rule => rule.oneOf);
  if (oneOfRule) {
    const babelLoader = oneOfRule.oneOf.find(
      r => r.loader && r.loader.includes('babel-loader')
    );
    if (babelLoader) {
      // Ensure consistent loose mode configuration
      const loosePlugins = [
        '@babel/plugin-transform-class-properties',
        '@babel/plugin-transform-private-methods',
        '@babel/plugin-transform-private-property-in-object'
      ];

      babelLoader.options.plugins = (babelLoader.options.plugins || [])
        .filter(plugin => !loosePlugins.includes(Array.isArray(plugin) ? plugin[0] : plugin))
        .concat(loosePlugins.map(name => [name, { loose: true }]));
    }
  }

  return config;
};
