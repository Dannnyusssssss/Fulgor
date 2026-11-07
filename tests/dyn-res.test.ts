import { describe, expect, it } from 'vitest';
import { DynamicResolution } from '../src/core/dyn-res';
import { BALANCE } from '../src/data/balance';
import { parseSettings } from '../src/save/schema';

const CFG = BALANCE.dynamicResolution;

/** Simula `seconds` segundos a `fps` cuadros por segundo; devuelve cuántas veces cambió la escala. */
function run(d: DynamicResolution, fps: number, seconds: number): number {
  let changes = 0;
  const frames = Math.round(fps * seconds);
  for (let i = 0; i < frames; i++) if (d.frame(1 / fps)) changes++;
  return changes;
}

describe('resolución dinámica', () => {
  it('a 60 FPS no baja nunca', () => {
    const d = new DynamicResolution(CFG);
    expect(run(d, 60, 120)).toBe(0);
    expect(d.current).toBe(1);
  });

  it('baja un paso tras 3 s seguidos por debajo de 50 FPS, y no antes', () => {
    const d = new DynamicResolution(CFG);
    run(d, 40, CFG.windowSeconds * CFG.windowsToDrop - 0.5);
    expect(d.current).toBe(1);
    run(d, 40, 1);
    expect(d.current).toBe(0.9);
  });

  it('una caída breve no cuenta: las ventanas lentas deben ser seguidas', () => {
    const d = new DynamicResolution(CFG);
    for (let i = 0; i < 10; i++) {
      run(d, 40, 2);
      run(d, 55, 1); // ventana normal: corta la racha
    }
    expect(d.current).toBe(1);
  });

  it('nunca baja del mínimo', () => {
    const d = new DynamicResolution(CFG);
    run(d, 20, 600);
    expect(d.current).toBe(CFG.minScale);
  });

  it('sube de nuevo solo tras un rato largo holgado y nunca pasa del máximo', () => {
    const d = new DynamicResolution(CFG, 0.7);
    run(d, 60, CFG.windowSeconds * CFG.windowsToRaise - 0.5);
    expect(d.current).toBe(0.7);
    run(d, 60, 1);
    expect(d.current).toBe(0.8);
    run(d, 60, 600);
    expect(d.current).toBe(CFG.maxScale);
  });

  it('ignora los frames anómalos (pestaña en segundo plano) y los valores no válidos', () => {
    const d = new DynamicResolution(CFG);
    for (let i = 0; i < 100; i++) d.frame(2);
    d.frame(Number.NaN);
    d.frame(-1);
    d.frame(0);
    expect(d.current).toBe(1);
    expect(new DynamicResolution(CFG, Number.NaN).current).toBe(1);
    expect(new DynamicResolution(CFG, 0.1).current).toBe(CFG.minScale);
  });

  it('el ajuste guardado se valida: fuera de rango vuelve al valor por defecto', () => {
    expect(parseSettings({ dynamicResolution: true, renderScale: 0.8 }, false)).toMatchObject({
      dynamicResolution: true,
      renderScale: 0.8,
    });
    expect(parseSettings({ dynamicResolution: 'sí', renderScale: 7 }, false)).toMatchObject({
      dynamicResolution: false,
      renderScale: 1,
    });
  });
});
