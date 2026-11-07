import { describe, expect, it } from 'vitest';
import { META } from '../src/data/meta';

describe('meta', () => {
  it('la clave de guardado usa el prefijo declarado', () => {
    expect(META.saveKey.startsWith(META.storagePrefix)).toBe(true);
    expect(META.storagePrefix).toBe('fulgor:');
  });

  it('la frase corta cabe en el catálogo (máximo 90 caracteres) y los metadatos no están vacíos', () => {
    expect(META.tagline.length).toBeGreaterThan(0);
    expect(META.tagline.length).toBeLessThanOrEqual(90);
    expect(META.description.length).toBeGreaterThan(META.tagline.length);
    // Los metadatos se insertan en un atributo HTML: no deben llevar comillas ni signos de etiqueta.
    expect(META.description).not.toMatch(/["<>]/);
  });
});
