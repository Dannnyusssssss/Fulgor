import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { META } from './src/data/meta.ts';

// Inserta el título del juego en index.html desde la constante única de meta.ts.
function injectTitle(): Plugin {
  return {
    name: 'inject-title',
    transformIndexHtml(html) {
      return html.replace('%GAME_TITLE%', META.title);
    },
  };
}

// base relativa: el juego funciona bajo cualquier ruta de GitHub Pages y dentro de un iframe.
export default defineConfig({
  base: './',
  plugins: [injectTitle()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // El paquete es casi todo Three.js (unos 600 kB sin comprimir, 160 kB con gzip). El objetivo de peso de dist/
    // es menos de 3 MB, así que el aviso genérico de 500 kB no aplica; se sube el umbral para que siga avisando
    // si el paquete crece de verdad.
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
