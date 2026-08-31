import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/]react(?:-dom)?[\\/]/,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/]@radix-ui[\\/]react-dropdown-menu[\\/]/,
            },
            {
              name: 'charts-vendor',
              test: /node_modules[\\/]recharts[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
