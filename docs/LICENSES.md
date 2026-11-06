# Licencias

## Juego

Fulgor — Todos los derechos reservados. Titular: Danny Sivinta.

Todo el arte (geometría procedural y texturas dibujadas con Canvas) y el sonido son propios. El juego no usa modelos, texturas, fuentes, música ni sonidos de terceros.

## Dependencias de ejecución (se incluyen en `dist/`)

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| three | 0.187.0 | MIT | Render 3D con WebGL |

El aviso de licencia MIT de Three.js (Copyright © 2010-2026 three.js authors) se conserva en el empaquetado: Vite mantiene los comentarios de licencia `@license` del código de Three.js en `dist/`.

## Dependencias de desarrollo (no se incluyen en `dist/`)

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| @types/three | 0.187.0 | MIT | Tipos de Three.js |
| vite | 8.3.6 | MIT | Servidor de desarrollo y empaquetado |
| typescript | 6.0.3 | Apache-2.0 | Comprobación de tipos |
| vitest | 5.1.0 | MIT | Tests |
| eslint | 10.14.0 | MIT | Análisis estático |
| @eslint/js | 10.0.1 | MIT | Reglas base de ESLint |
| typescript-eslint | 8.72.1 | MIT | Reglas de ESLint para TypeScript |
| prettier | 3.9.10 | MIT | Formato de código |
| eslint-config-prettier | 10.1.8 | MIT | Evita conflictos entre ESLint y Prettier |
| globals | 17.14.0 | MIT | Listas de variables globales para ESLint |

## Auditoría

`npm audit` informa una única vulnerabilidad de severidad moderada en `minimatch` (que el informe cuenta 10 veces, una por cada paquete de ESLint que la arrastra) (GHSA-g3hv-75wg-m249, denegación de servicio con patrones glob), que llega solo a través de las herramientas de desarrollo ESLint y typescript-eslint. No se incluye en `dist/` y solo procesa patrones escritos en la configuración del propio proyecto. No hay vulnerabilidades altas ni críticas.
