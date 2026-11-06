import { describe, expect, it } from 'vitest';
import { META } from '../src/data/meta';

describe('meta', () => {
  it('la clave de guardado usa el prefijo declarado', () => {
    expect(META.saveKey.startsWith(META.storagePrefix)).toBe(true);
    expect(META.storagePrefix).toBe('fulgor:');
  });
});
