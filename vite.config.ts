import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Script do SDK de cada portal (os mesmos de games/puzzle-packs/portal.ts). */
const SDK_SCRIPTS: Record<string, string> = {
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
};

/**
 * `vite build --mode poki` ou `--mode crazygames`: põe o script do SDK no
 * <head>, antes do código do jogo, como os dois portais pedem.
 */
function portalSdk(mode: string): Plugin {
  return {
    name: 'portal-sdk',
    transformIndexHtml(html) {
      const src = SDK_SCRIPTS[mode];
      if (!src) return html;
      return html.replace('</title>', `</title>\n    <script src="${src}"></script>`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Caminhos relativos: o build roda em qualquer subpasta de portal.
  base: './',
  plugins: [portalSdk(mode)],
  resolve: {
    alias: { '@kit': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
