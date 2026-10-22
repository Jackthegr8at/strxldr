import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export default defineConfig({
  plugins: [react(), {
    name: 'local-build-module-graph',
    apply: 'build',
    generateBundle(_options, bundle) {
      const normalize = (id: string) => {
        const clean = id.replaceAll('\\', '/');
        const root = process.cwd().replaceAll('\\', '/') + '/';
        return clean.replace(root, '').replace(/^\0/, 'virtual:');
      };
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(chunk => ({
        file: chunk.fileName, imports: chunk.imports, dynamicImports: chunk.dynamicImports,
        modules: Object.keys(chunk.modules).map(normalize).sort(),
      }));
      const directory = path.resolve('plan/audit-evidence');
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, 'build-module-graph.json'), JSON.stringify({ chunks }, null, 2));
    },
  }],
  build: { outDir: 'build', sourcemap: false, manifest: true },
  server: { port: 3000 },
});
