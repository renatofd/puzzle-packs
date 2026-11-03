import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const POKI_SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/** `vite build --mode poki`: põe o script do PokiSDK no <head>, como o Poki pede. */
function pokiSdk(mode: string): Plugin {
  return {
    name: 'poki-sdk',
    transformIndexHtml(html) {
      if (mode !== 'poki') return html;
      return html.replace('</title>', `</title>\n    <script src="${POKI_SDK_URL}"></script>`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Caminhos relativos: o build roda em qualquer subpasta de portal.
  base: './',
  plugins: [pokiSdk(mode)],
  resolve: {
    alias: { '@kit': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
