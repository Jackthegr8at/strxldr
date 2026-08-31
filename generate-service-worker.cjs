'use strict';

process.env.NODE_ENV = 'production';

const { generateSW } = require('workbox-build');
const config = require('./workbox-config.js');

generateSW(config)
  .then(({ count, size, warnings }) => {
    if (warnings.length > 0) {
      console.warn('Workbox warnings:');
      warnings.forEach((warning) => console.warn(`- ${warning}`));
    }

    console.log(`Generated service worker with ${count} precached URLs (${size} bytes).`);
  })
  .catch((error) => {
    console.error('Workbox generation failed:', error);
    process.exitCode = 1;
  });
