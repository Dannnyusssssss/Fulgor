# Depuración

Parámetros de URL solo para desarrollo. Están ocultos por defecto, se validan y no consumen CPU cuando están desactivados. No se enlazan desde el juego.

| Parámetro | Valores | Efecto |
|---|---|---|
| `?debug` | sin valor, `1` o `true` | Muestra el overlay: FPS, enemigos vivos, proyectiles vivos, destellos permitidos en el último segundo y controles para ajustar en vivo los parámetros de combate. |
| `?god` | sin valor, `1` o `true` | El jugador no recibe daño. |

Se pueden combinar: `?debug&god`. Cualquier otro valor se ignora, igual que una cadena de búsqueda de más de 200 caracteres.

Los cambios hechos en el overlay solo duran hasta recargar la página; los valores definitivos se pasan a mano a `src/data/`.

Parámetros previstos para el Hito 2: `?arena=` y `?wave=`.
