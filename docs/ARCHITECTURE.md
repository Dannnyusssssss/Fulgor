# Arquitectura de Fulgor

Este documento describe cómo está construido el juego y por qué. Está pensado para quien lee el repositorio por primera vez.

## Visión general

Fulgor es un shooter de arena en tercera persona. Chispa, una unidad robótica, se enfrenta a oleadas de máquinas en varias arenas, elige mejoras entre oleadas y se mide con un jefe de energía. Hay dos modos: oleadas con final y Resistencia.

Es una aplicación web estática: Vite, TypeScript en modo `strict` y Three.js con `WebGLRenderer`. No hay servidor, cuentas ni peticiones de red. El resultado de `npm run build` es la carpeta `dist/`, que usa rutas relativas (`base: './'` en `vite.config.ts`) y por eso funciona bajo cualquier ruta de un hosting estático, incluido GitHub Pages.

## Mapa de carpetas

```
src/
  main.ts        Arranque: lee ajustes guardados, crea la semilla y lanza la aplicación
  core/          Utilidades puras: bucle de paso fijo, RNG, matemáticas, entrada, presupuesto de destellos
  data/          Datos del juego: enemigos, armas, arenas, oleadas, mejoras, equilibrio, textos, metadatos
  game/          Simulación: mundo, sistemas, enemigos, proyectiles, jugador, director de oleadas
  game/enemies/  Comportamiento de cada tipo de enemigo (una función de actualización por tipo)
  game/systems/  Sistemas que se ejecutan en cada paso (jugador, armas, enemigos, proyectiles, peligros...)
  render/        Escena de Three.js: cámara, mallas de arena, enemigos, proyectiles, efectos
  ui/            Interfaz en DOM: pantallas, HUD, indicadores, aplicación que une todo
  audio/         Audio: la parte con WebAudio (mixer, engine, sfx) y la parte lógica (voices, music, sfx-map)
  save/          Guardado local: esquema, validación, lectura/escritura y progreso
tests/           Pruebas con Vitest sobre la lógica pura
public/          Recursos estáticos (icono y portada)
docs/            Documentación pública
```

## Capas y por qué se separan

La separación principal es entre una capa de lógica pura y las capas que tocan el navegador.

**Lógica pura y determinista:** `src/core`, `src/game` y `src/data`. No importan `three`, no usan el DOM ni `Math.random`. Esto no queda a la buena voluntad: la configuración de ESLint (`eslint.config.js`) prohíbe esos imports y globales en esas carpetas (y en `src/save` y en la parte lógica de `src/audio`, es decir `voices.ts`, `sfx-map.ts` y `music.ts`). Con esa frontera:

- la simulación se puede ejecutar en Node, sin navegador, y producir siempre el mismo resultado con la misma semilla;
- los tests no necesitan render ni audio;
- cambiar la forma de dibujar no puede alterar las reglas del juego.

**Render (`src/render`):** lee el estado del mundo y lo dibuja con Three.js. No decide nada de las reglas. Las clases principales son `GameRenderer` (`src/render/scene.ts`) y `EnemyMeshes` (`src/render/enemy-meshes.ts`).

**Interfaz (`src/ui`):** pantallas, HUD y menús se construyen con el DOM usando `textContent` (ESLint prohíbe `innerHTML`, `outerHTML` y `document.write`). `src/ui/app.ts` es el punto donde se conectan entrada, simulación, render, audio y guardado.

**Audio (`src/audio`):** los eventos del juego se traducen a sonidos. La parte que usa WebAudio está separada de la que decide qué suena, para poder probar esta última.

**Guardado (`src/save`):** `storage.ts` es el único archivo autorizado a usar `localStorage`; el resto trabaja con datos ya validados.

**Textos y título:** los textos visibles están en `src/data/texts.ts` y el título del juego en `src/data/meta.ts` (`META`). Vite inyecta el título y la descripción en `index.html` desde esa constante.

## Bucle de paso fijo e interpolación

La simulación avanza en pasos de duración constante de 60 Hz, sin depender de la tasa de imagen del dispositivo. La clase `FixedTimestep` (`src/core/loop.ts`) acumula el tiempo real de cada frame, limita ese tiempo a un máximo (para no encadenar pasos tras una pausa o un tirón) y devuelve cuántos pasos hay que simular. Su propiedad `alpha` indica qué fracción del siguiente paso ha transcurrido.

El render usa `alpha` para interpolar entre la posición anterior y la actual de cada objeto, de modo que el movimiento se ve fluido aunque la imagen no coincida con los pasos de simulación (por ejemplo, en `src/ui/app.ts` se interpola la posición de Chispa con `lerp`).

La función `stepWorld` (`src/game/world.ts`) ejecuta un paso y es el único lugar donde se declara el orden de los sistemas: valores efectivos, jugador, habilidad, armas, mapas de distancias, enemigos, separación, proyectiles, peligros de la arena, zonas del jefe, objetos, director de oleadas y comprobación de derrota. Declarar el orden en un solo sitio evita dependencias ocultas entre sistemas.

## Aleatoriedad con semilla

`src/core/rng.ts` implementa un generador con semilla (`Rng`) y una función de derivación (`deriveSeed`) que obtiene la semilla de cada flujo a partir de la semilla de la partida y un nombre. `createStreams` crea tres flujos independientes: oleadas, mejoras y combate. Así, lo que el jugador hace en combate no cambia qué enemigos tocan en la siguiente oleada ni qué mejoras se ofrecen.

La semilla de cada partida se obtiene una sola vez, en `src/main.ts` (`newSeed`, con `crypto.getRandomValues`). Es la única fuente aleatoria del navegador; la lógica solo usa el generador con semilla.

## Flujo principal

```
 teclado / ratón / mando            (src/core/input.ts, src/core/gamepad.ts)
          |
          v
   PlayerCommand por frame          (tipo en src/core/input.ts; lo arma src/ui/app.ts)
          |
          v
  FixedTimestep.advance(dt)  --->  N pasos de stepWorld(world, cmd)
                                         |
                                         |  estado del mundo + eventos (src/game/events.ts)
                                         v
              +--------------------------+--------------------------+
              |                          |                          |
        render (interpolado       HUD y pantallas             audio (sfx, música)
        con alpha, Three.js)      (DOM)                       (WebAudio)
              |
              v
          canvas
```

En cada frame, la aplicación recoge la entrada y la convierte en una orden (`PlayerCommand`), pide a `FixedTimestep` cuántos pasos corresponden, ejecuta `stepWorld` esas veces y después dibuja el estado resultante. La simulación publica eventos (impactos, desactivaciones, cambios de oleada...) que el audio y los efectos consumen sin que la lógica sepa nada de ellos.

Los enemigos tienen un aviso visible antes de cada ataque y su duración mínima se fija en los datos de equilibrio (`src/data/balance.ts`). Los destellos se reparten a través de un presupuesto común (`src/core/flash-budget.ts`) para limitar cuántos se producen por segundo.

## Guardado local

Todo el progreso y los ajustes se guardan en una única clave de `localStorage`. El texto leído se trata como no confiable: `parseSave` y `parseSettings` (`src/save/schema.ts`) lo analizan y validan campo a campo (tipos, rangos, identificadores conocidos de arenas, armas y modos) y lo que no es válido se sustituye por el valor por defecto en lugar de aceptarse. Si el guardado no existe o es ilegible, `defaultSave` devuelve uno nuevo. Además hay un límite al tamaño del texto que se acepta.

`loadSave` y `writeSave` (`src/save/storage.ts`) leen y escriben; si el almacenamiento no está disponible (por ejemplo, en un iframe con permisos restringidos o con cookies bloqueadas), `browserStorage` devuelve `null` y el juego sigue funcionando sin guardar. El progreso (arenas desbloqueadas, mejores resultados, armas) se actualiza en `src/save/progress.ts`. `clearSave` borra solo esa clave cuando el jugador usa «Borrar datos guardados en este navegador» en los ajustes, y un guardado escrito por una versión más nueva del juego no se sobrescribe.

Los parámetros que puede recibir la URL también se validan antes de usarse (`src/core/url-params.ts`).

## Embebido en un portal

El juego se puede cargar dentro de un `iframe` del mismo origen. Esa configuración no aísla el juego del resto de la página: comparte origen y, por tanto, almacenamiento con ella. Por eso el juego usa una sola clave, valida todo lo que lee y no depende de que el contenedor sea de confianza. Las rutas relativas del build permiten servirlo desde cualquier subruta, y el guardado tolera que el almacenamiento no esté disponible. El juego no navega fuera de su página.

## Seguridad, a alto nivel

- Las entradas externas (guardado, parámetros de URL, mando) se validan antes de usarse.
- El build añade, mediante un plugin de `vite.config.ts` (`securityMeta`), una política de seguridad de contenido estricta por `<meta>`: sin scripts ni estilos en línea, sin `eval` y con todos los recursos del propio origen. Como GitHub Pages no permite cabeceras propias, no se pueden fijar por esa vía otras cabeceras.
- No hay recursos de terceros (ni CDN, ni fuentes externas, ni analítica) y no se hacen peticiones de red: todo se empaqueta en `dist/`.
- ESLint prohíbe `eval`, `new Function`, `innerHTML` y similares.
- El flujo de publicación (`.github/workflows/deploy.yml`) instala con el lockfile, audita dependencias, ejecuta lint y tests, construye y publica `dist/`; las acciones están fijadas por hash de commit.
- La licencia de Three.js se conserva al principio de cada archivo JS generado (`threeLicenseBanner`).

## Cómo se prueba

Las pruebas usan Vitest y viven en `tests/` (`npm run test`). Se centran en la lógica pura:

- simulaciones con semilla fija que avanzan el mundo muchos pasos con un bot de prueba (`tests/bot.ts`, `tests/helpers.ts`) y comprueban que el resultado es reproducible (`tests/waves-sim.test.ts`, `tests/world.test.ts`);
- reglas concretas: colisiones, armas, mejoras, enemigos, jefe, modo Resistencia, presupuesto de destellos, entrada y mando, resolución dinámica;
- guardado: validación y recuperación ante datos incorrectos (`tests/save.test.ts`).

El render y el audio real no se prueban de forma automática; se revisan a mano en el navegador. Sí se prueba la parte lógica del audio (`tests/audio.test.ts`).

## Cómo se extiende

Los pasos siguientes salen de cómo está organizado el código hoy. Después de cualquiera de ellos conviene ejecutar `npm run lint && npm run test`.

**Agregar un enemigo**
1. Definir su tipo de datos y sus valores en `src/data/enemies.ts` (añadir el nombre a `EnemyKindName` y una interfaz y constante como `ZUMBADOR`).
2. Registrar su identificador en `src/game/enemies/types.ts` (`EnemyKind`, `kindName`, `kindFromName` y las listas de identificadores).
3. Escribir su comportamiento en un archivo nuevo de `src/game/enemies/`, con una función `update…` como `updateZumbador`, usando los ayudantes de `src/game/enemies/common.ts` (incluido `telegraphDuration` para el aviso del ataque).
4. Conectarlo en el `switch` de `src/game/systems/enemy-system.ts`.
5. Incluirlo en las oleadas (`src/data/waves.ts`), con su coste en el presupuesto.
6. Darle forma visual en `src/render/enemy-meshes.ts` y, si procede, sonido en `src/audio/sfx-map.ts`, e indicadores en `src/ui/indicators.ts`.
7. Añadir los textos en `src/data/texts.ts` y probar su comportamiento en `tests/enemies.test.ts`.

**Agregar un arma**
1. Definirla en `src/data/weapons.ts`: ampliar `WeaponId`, crear su `WeaponDef` (con su `FireMode`), añadirla a `WEAPON_ORDER` y a `WEAPON_UNLOCKS`.
2. Si necesita un modo de disparo nuevo, tratarlo en `src/game/systems/weapon-system.ts` (`fireWeapon`) y en `src/game/weapon.ts`.
3. Revisar el HUD (`src/ui/hud.ts`), que recorre `WEAPON_ORDER`, y el guardado (`src/save/schema.ts`), que valida los identificadores de arma contra esa misma lista.
4. Textos en `src/data/texts.ts` y pruebas en `tests/weapon.test.ts` o `tests/arsenal.test.ts`.

**Agregar una arena**
1. Crear su `ArenaDef` en `src/data/arenas.ts` (obstáculos, puntos de aparición, peligros y paleta) y añadirla a `ARENAS`, cuyo orden es el orden de desbloqueo.
2. Definir sus oleadas en `src/data/waves.ts`, clave de `WAVES` con el identificador de la arena.
3. El render la construye desde sus datos (`src/render/arena-mesh.ts`, `src/render/hazards.ts`); el guardado la reconoce a través de `arenaById`.
4. Textos en `src/data/texts.ts` y una simulación de semilla fija en `tests/waves-sim.test.ts`.

## Límites conocidos

- El rendimiento no se ha medido en todos los dispositivos ni navegadores. Existe una resolución dinámica (`src/core/dyn-res.ts`) para adaptarse a equipos más lentos, pero su efecto real depende del equipo.
- El aspecto visual, el sonido y el manejo con mando físico se comprueban a mano; no hay pruebas automáticas de ellos.
- Hay tres arenas, tres armas y un jefe; el número de contenidos está acotado por los datos actuales.
- Si el almacenamiento del navegador no está disponible, el progreso no se conserva entre sesiones.
- La política de seguridad de contenido va por `<meta>`, así que el hosting estático actual no permite cabeceras adicionales.
