import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __TEST_WITNESS_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'TestWitness',
      formats: ['es', 'cjs', 'iife'],
      fileName: (format) => {
        if (format === 'cjs') return 'index.cjs';
        if (format === 'iife') return 'testwitness.min.js';
        return 'index.js';
      },
    },
    minify: 'oxc',
    sourcemap: true,
    target: 'es2020',
    copyPublicDir: false,
  },
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src'],
      insertTypesEntry: true,
    }),
  ],
});
