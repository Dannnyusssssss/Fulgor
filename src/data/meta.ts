/**
 * Metadatos del juego. El título se lee siempre de aquí: nunca se escribe a mano en otros archivos.
 */
export const META = {
  title: 'Fulgor',
  slug: 'fulgor',
  /** Frase corta del juego (máximo 90 caracteres). */
  tagline: 'Sobrevive a las oleadas de máquinas, elige mejoras y derrota al jefe de la arena.',
  /** Descripción para los metadatos de la página. */
  description:
    'Shooter de arena en tercera persona con estilo neón: controla a Chispa, sobrevive a oleadas de máquinas, elige mejoras entre rondas y derrota al Coloso. Incluye modo Resistencia.',
  /** Prefijo de localStorage que declara el portal para su botón de borrar datos. */
  storagePrefix: 'fulgor:',
  /** Única clave de guardado. */
  saveKey: 'fulgor:v1',
  saveVersion: 1,
} as const;
