/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { META } from './src/data/meta.ts';

// Inserta el título y la descripción del juego en index.html desde la constante única de meta.ts.
function injectMeta(): Plugin {
  return {
    name: 'inject-meta',
    transformIndexHtml(html) {
      return html
        .replaceAll('%GAME_TITLE%', META.title)
        .replaceAll('%GAME_DESCRIPTION%', META.description);
    },
  };
}

/**
 * Conserva el aviso de licencia MIT de Three.js en el paquete: el minificador elimina los comentarios `@license`,
 * así que se añade el texto completo de su archivo LICENSE al principio de cada archivo JS generado.
 */
function threeLicenseBanner(): Plugin {
  const text = readFileSync(new URL('./node_modules/three/LICENSE', import.meta.url), 'utf8')
    .trim()
    .replaceAll('*/', '* /');
  const banner = `/*! three.js (https://threejs.org) — licencia MIT
${text}
*/
`;
  return {
    name: 'three-license-banner',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') file.code = banner + file.code;
      }
    },
  };
}

/**
 * Política de seguridad de contenido por <meta>, solo en el build (en desarrollo Vite inyecta estilos en línea).
 * Todo el juego sale del propio origen: ni scripts ni estilos en línea, ni eval, ni recursos de terceros.
 * Por <meta> no se pueden fijar frame-ancestors, HSTS ni Permissions-Policy: GitHub Pages no permite cabeceras propias.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function securityMeta(): Plugin {
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      const charset = '<meta charset="UTF-8" />';
      if (!html.includes(charset))
        throw new Error('index.html: falta <meta charset> para colocar la CSP');
      const extra = [
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        '<meta name="referrer" content="no-referrer" />',
      ];
      return html.replace(charset, [charset, ...extra].join('\n    '));
    },
  };
}

// base relativa: el juego funciona bajo cualquier ruta de GitHub Pages y dentro de un iframe.
export default defineConfig({
  base: './',
  plugins: [injectMeta(), threeLicenseBanner(), securityMeta()],
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
