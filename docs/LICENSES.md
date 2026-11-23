# Licencias

## Juego

Fulgor — Todos los derechos reservados. Titular: Danny Sivinta.

Todo el arte (geometría procedural y texturas dibujadas con Canvas) y el sonido son propios. El juego no usa modelos, texturas, fuentes, música ni sonidos de terceros. El favicon (`public/favicon.png`) está dibujado con Canvas y la portada (`public/cover.png`) es una captura del propio juego con el título superpuesto.

## Dependencias de ejecución (se incluyen en `dist/`)

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| three | 0.187.0 | MIT | Render 3D con WebGL |

El aviso de licencia MIT de Three.js (Copyright © 2010-2026 three.js authors) se conserva en el empaquetado: el minificador de Vite elimina los comentarios `@license`, así que un plugin de `vite.config.ts` añade el texto completo de `node_modules/three/LICENSE` al principio de cada archivo JS de `dist/`.

## Dependencias de desarrollo (no se incluyen en `dist/`)

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| @types/three | 0.187.0 | MIT | Tipos de Three.js |
| @types/node | 24.19.2 | MIT | Tipos de Node.js para la configuración de Vite (`vite.config.ts`) |
| vite | 8.3.6 | MIT | Servidor de desarrollo y empaquetado |
| typescript | 6.0.3 | Apache-2.0 | Comprobación de tipos |
| vitest | 5.1.0 | MIT | Tests |
| eslint | 10.15.0 | MIT | Análisis estático |
| @eslint/js | 10.0.1 | MIT | Reglas base de ESLint |
| typescript-eslint | 8.73.0 | MIT | Reglas de ESLint para TypeScript |
| prettier | 3.9.10 | MIT | Formato de código |
| eslint-config-prettier | 10.1.8 | MIT | Evita conflictos entre ESLint y Prettier |
| globals | 17.14.0 | MIT | Listas de variables globales para ESLint |

## Publicación (GitHub Actions, no se incluyen en `dist/`)

El workflow `.github/workflows/deploy.yml` usa solo acciones oficiales de GitHub:

| Acción | Versión (fijada por hash del commit) | Licencia |
|---|---|---|
| actions/checkout | v5.1.0 | MIT |
| actions/setup-node | v5.0.0 | MIT |
| actions/upload-pages-artifact | v4.0.0 | MIT |
| actions/deploy-pages | v4.0.5 | MIT |

## Auditoría

`npm audit`: 0 vulnerabilidades, tanto en lo que se publica (`npm audit --omit=dev`) como en las herramientas de desarrollo. La vulnerabilidad moderada de `minimatch` (GHSA-g3hv-75wg-m249), que llegaba solo a través de ESLint y typescript-eslint, quedó corregida al actualizar esas dos herramientas. El workflow de publicación vuelve a auditar en cada push: falla con cualquier vulnerabilidad en lo que se publica y con cualquier vulnerabilidad alta o crítica en las herramientas de desarrollo. Última revisión: 2026-11-23.
