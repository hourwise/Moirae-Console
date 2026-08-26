import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

const fixturePath = resolve('server/fixtures/demo-policy-001.txt');

export default defineConfig({
  build: {
    ssr: 'server/production-server.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      output: {
        entryFileNames: 'production-server.mjs',
      },
    },
  },
  plugins: [copyServerFixture()],
});

function copyServerFixture(): Plugin {
  return {
    name: 'copy-host-only-demo-fixture',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'fixtures/demo-policy-001.txt',
        source: readFileSync(fixturePath),
      });
    },
  };
}
