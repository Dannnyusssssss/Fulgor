/**
 * Metadatos del juego. El título se lee siempre de aquí: nunca se escribe a mano en otros archivos.
 */
export const META = {
  title: 'Fulgor',
  slug: 'fulgor',
  /** Prefijo de localStorage que declara el portal para su botón de borrar datos. */
  storagePrefix: 'fulgor:',
  /** Única clave de guardado. */
  saveKey: 'fulgor:v1',
  saveVersion: 1,
} as const;
