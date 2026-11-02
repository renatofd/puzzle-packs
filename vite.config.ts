import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Caminhos relativos: o build roda em qualquer subpasta de portal.
  base: './',
  resolve: {
    alias: { '@kit': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
