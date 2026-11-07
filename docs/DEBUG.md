# Depuración

Parámetros de URL solo para desarrollo. Están ocultos por defecto, se validan y no consumen CPU cuando están desactivados. No se enlazan desde el juego.

| Parámetro | Valores | Efecto |
|---|---|---|
| `?debug` | sin valor, `1` o `true` | Muestra el overlay: FPS, enemigos vivos, proyectiles vivos, destellos permitidos en el último segundo, draw calls y controles para ajustar en vivo los parámetros de combate. |
| `?god` | sin valor, `1` o `true` | El jugador no recibe daño. |
| `?arena=` | `hangar-cobalto`, `fundicion-ambar`, `jardin-cristal` | Arena inicial (aunque esté bloqueada). |
| `?wave=` | `1` a `99` | Oleada inicial de cada partida. En el modo Oleadas se limita a `10` (la del Coloso); en Resistencia el Coloso sale en las múltiplos de 10. |
| `?mode=` | `resistencia` | Empieza las partidas en el modo Resistencia, aunque no esté desbloqueado en la arena. |
| `?stress` | sin valor, `1` o `true` | Prueba de rendimiento: 60 enemigos de los 5 tipos y unos 200 proyectiles vivos; el jugador es invulnerable y el director de oleadas se desactiva. |

Se pueden combinar: `?arena=fundicion-ambar&wave=6&god&debug`. Cualquier otro valor se ignora, igual que una cadena de búsqueda de más de 200 caracteres.

Las partidas con `?god`, `?wave`, `?mode` o `?stress` no cuentan para el progreso (ni marcas ni desbloqueos).

Los cambios hechos en el overlay solo duran hasta recargar la página; los valores definitivos se pasan a mano a `src/data/`.
