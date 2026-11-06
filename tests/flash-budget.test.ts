import { describe, expect, it } from 'vitest';
import { FlashBudget } from '../src/core/flash-budget';

describe('FlashBudget', () => {
  it('concede como máximo 3 destellos en cualquier ventana de 1 s', () => {
    const fb = new FlashBudget(3, 1);
    expect(fb.request(0)).toBe('full');
    expect(fb.request(0.1)).toBe('full');
    expect(fb.request(0.2)).toBe('full');
    expect(fb.request(0.3)).toBe('dimmed');
    expect(fb.request(0.99)).toBe('dimmed');
    // Al salir el primero de la ventana se vuelve a conceder uno.
    expect(fb.request(1.0)).toBe('full');
    expect(fb.request(1.05)).toBe('dimmed');
  });

  it('con muchos efectos a la vez (60 enemigos disparando) nunca supera el tope', () => {
    const fb = new FlashBudget(3, 1);
    const grantedTimes: number[] = [];
    // 600 peticiones por segundo durante 10 s, sumando todos los emisores.
    for (let i = 0; i < 6000; i++) {
      const t = i / 600;
      if (fb.request(t) === 'full') grantedTimes.push(t);
    }
    // Ventana deslizante: para cada destello concedido, contar los de su segundo siguiente.
    for (let i = 0; i < grantedTimes.length; i++) {
      const start = grantedTimes[i] ?? 0;
      const inWindow = grantedTimes.filter((t) => t >= start && t < start + 1).length;
      expect(inWindow).toBeLessThanOrEqual(3);
    }
    expect(grantedTimes.length).toBeGreaterThan(0);
  });

  it('cuenta los destellos de la última ventana', () => {
    const fb = new FlashBudget(3, 1);
    fb.request(0);
    fb.request(0.5);
    expect(fb.grantedInWindow(0.6)).toBe(2);
    expect(fb.grantedInWindow(1.2)).toBe(1);
    expect(fb.grantedInWindow(3)).toBe(0);
  });

  it('"Reducir destellos" lo atenúa todo', () => {
    const fb = new FlashBudget(3, 1);
    fb.setReduced(true);
    expect(fb.isReduced()).toBe(true);
    for (let i = 0; i < 10; i++) expect(fb.request(i * 2)).toBe('dimmed');
    expect(fb.grantedInWindow(20)).toBe(0);
    fb.setReduced(false);
    expect(fb.request(30)).toBe('full');
  });

  it('reset vacía el historial', () => {
    const fb = new FlashBudget(3, 1);
    fb.request(0);
    fb.request(0);
    fb.request(0);
    fb.reset();
    expect(fb.request(0.1)).toBe('full');
  });
});
