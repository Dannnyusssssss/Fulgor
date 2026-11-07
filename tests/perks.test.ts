import { describe, expect, it } from 'vitest';
import { emptyCommand } from '../src/core/input';
import { Rng } from '../src/core/rng';
import { HANGAR_COBALTO } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { PERK_CAPS, PERKS, type PerkStat } from '../src/data/perks';
import { TEXTS } from '../src/data/texts';
import { PULSADOR } from '../src/data/weapons';
import { DirectorPhase } from '../src/game/director';
import { GameEvent } from '../src/game/events';
import { createModifiers } from '../src/game/modifiers';
import {
  choosePerk,
  computeModifiers,
  createPerkState,
  isEligible,
  makeOffer,
  type PerkContext,
} from '../src/game/perks';
import { damageEnemy } from '../src/game/systems/damage';
import { applyPerks, createWorld, stepWorld, type World } from '../src/game/world';

const ALL: PerkContext = { unlockedWeapons: [true, true, true], ability: 'onda' };
const ONLY_PULSADOR: PerkContext = { unlockedWeapons: [true, false, false], ability: 'onda' };

function indexOf(id: string): number {
  return PERKS.findIndex((p) => p.id === id);
}

describe('datos de mejoras', () => {
  it('hay al menos 20 mejoras con id único, textos, niveles y topes', () => {
    expect(PERKS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(PERKS.map((p) => p.id));
    expect(ids.size).toBe(PERKS.length);
    for (const p of PERKS) {
      expect(TEXTS.perks[p.id]?.name, p.id).toBeTruthy();
      expect(TEXTS.perks[p.id]?.description, p.id).toBeTruthy();
      expect(p.maxLevel).toBeGreaterThanOrEqual(1);
      for (const fx of p.effects) expect(PERK_CAPS[fx.stat], fx.stat).toBeDefined();
      for (const ex of p.excludes ?? []) expect(ids.has(ex), ex).toBe(true);
    }
  });

  it('los topes contienen el valor neutro de cada modificador', () => {
    const neutral = createModifiers();
    for (const stat of Object.keys(PERK_CAPS) as PerkStat[]) {
      const cap = PERK_CAPS[stat];
      expect(neutral[stat]).toBeGreaterThanOrEqual(cap.min);
      expect(neutral[stat]).toBeLessThanOrEqual(cap.max);
    }
  });
});

describe('ofertas', () => {
  it('ofrece 3 mejoras distintas y es reproducible con la misma semilla', () => {
    const a = createPerkState();
    const b = createPerkState();
    const ra = new Rng(42);
    const rb = new Rng(42);
    for (let round = 0; round < 8; round++) {
      expect(makeOffer(a, ra, ALL)).toBe(3);
      makeOffer(b, rb, ALL);
      const offer = [...a.offer];
      expect(new Set(offer).size).toBe(3);
      expect(offer).toEqual([...b.offer]);
      choosePerk(a, round % 3);
      choosePerk(b, round % 3);
    }
  });

  it('otra semilla da otras ofertas', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createPerkState();
      makeOffer(s, new Rng(seed), ALL);
      seen.add([...s.offer].join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('no ofrece mejoras al máximo, incompatibles ni de armas bloqueadas', () => {
    const s = createPerkState();
    const nucleo = indexOf('nucleo-afilado');
    s.levels[nucleo] = PERKS[nucleo]?.maxLevel ?? 0;
    s.levels[indexOf('placas')] = 1;
    expect(isEligible(s, nucleo, ALL)).toBe(false);
    expect(isEligible(s, indexOf('canon-cristal'), ALL)).toBe(false);
    expect(isEligible(s, indexOf('perdigones-extra'), ONLY_PULSADOR)).toBe(false);
    expect(isEligible(s, indexOf('perdigones-extra'), ALL)).toBe(true);
    // La incompatibilidad vale en los dos sentidos.
    const t = createPerkState();
    t.levels[indexOf('canon-cristal')] = 1;
    expect(isEligible(t, indexOf('placas'), ALL)).toBe(false);
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      makeOffer(s, rng, ONLY_PULSADOR);
      for (let k = 0; k < s.offerCount; k++) {
        const id = PERKS[s.offer[k] ?? -1]?.id;
        expect([
          'nucleo-afilado',
          'canon-cristal',
          'perdigones-extra',
          'rayo-concentrado',
        ]).not.toContain(id);
      }
    }
  });

  it('con pocas mejoras disponibles ofrece menos opciones, y ninguna si no queda nada', () => {
    const s = createPerkState();
    PERKS.forEach((p, i) => (s.levels[i] = p.maxLevel));
    const last = indexOf('servos');
    s.levels[last] = 0;
    expect(makeOffer(s, new Rng(1), ALL)).toBe(1);
    expect(s.offer[0]).toBe(last);
    s.levels[last] = PERKS[last]?.maxLevel ?? 0;
    expect(makeOffer(s, new Rng(1), ALL)).toBe(0);
  });
});

describe('aplicación y acumulación', () => {
  it('los niveles se acumulan y elegir una opción inválida no hace nada', () => {
    const s = createPerkState();
    const m = createModifiers();
    const nucleo = indexOf('nucleo-afilado');
    for (let i = 0; i < 2; i++) {
      s.offer[0] = nucleo;
      s.offerCount = 1;
      expect(choosePerk(s, 0)).toBe(nucleo);
    }
    computeModifiers(s, m);
    expect(m.damageMul).toBeCloseTo(1.24);
    s.offerCount = 1;
    s.offer[0] = nucleo;
    expect(choosePerk(s, 2)).toBe(-1);
    expect(s.levels[nucleo]).toBe(2);
  });

  it('con todas las mejoras al máximo ningún valor sale de sus topes', () => {
    const s = createPerkState();
    // Todas al máximo (incluso las incompatibles a la vez, el peor caso).
    PERKS.forEach((p, i) => (s.levels[i] = p.maxLevel));
    const m = computeModifiers(s, createModifiers());
    for (const stat of Object.keys(PERK_CAPS) as PerkStat[]) {
      expect(m[stat], stat).toBeGreaterThanOrEqual(PERK_CAPS[stat].min);
      expect(m[stat], stat).toBeLessThanOrEqual(PERK_CAPS[stat].max);
    }
    // Equilibrio mínimo: el daño recibido nunca baja de 3/4, ni la cadencia sube más de un 30 %.
    expect(m.damageTakenMul).toBeGreaterThanOrEqual(0.75);
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    PERKS.forEach((p, i) => (w.perks.levels[i] = p.maxLevel));
    applyPerks(w);
    const def = w.weaponDefs[0];
    expect(def?.fireInterval ?? 0).toBeGreaterThanOrEqual(PULSADOR.fireInterval / 1.3 - 1e-9);
    expect(w.playerStats.speed).toBeLessThanOrEqual(BALANCE.player.speed * 1.16 + 1e-9);
    expect(w.player.maxHealth).toBeLessThanOrEqual(BALANCE.player.maxHealth + 45);
  });

  it('subir la vida máxima también la recupera; los datos base no cambian', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    w.player.health = 50;
    w.perks.levels[indexOf('chasis-reforzado')] = 1;
    applyPerks(w);
    expect(w.player.maxHealth).toBe(BALANCE.player.maxHealth + 15);
    expect(w.player.health).toBe(65);
    expect(w.tuning.player.maxHealth).toBe(BALANCE.player.maxHealth);
  });
});

/** Lleva el mundo a la oferta de mejoras tras superar la oleada 1. */
function toPerkChoice(w: World): void {
  const c = emptyCommand();
  for (let i = 0; i < 60 * 30 && w.director.phase !== DirectorPhase.Fighting; i++) stepWorld(w, c);
  for (const e of w.enemies.items) if (e.active) e.state = 1;
  for (const e of w.enemies.items) if (e.active) damageEnemy(w, e, 9999);
  stepWorld(w, c);
}

describe('elección entre oleadas', () => {
  it('tras superar una oleada la simulación espera la elección y luego sigue', () => {
    const w = createWorld({ seed: 5, arena: HANGAR_COBALTO, god: true });
    toPerkChoice(w);
    expect(w.director.phase).toBe(DirectorPhase.PerkChoice);
    expect(w.perks.offerCount).toBe(3);
    const tick = w.tick;
    for (let i = 0; i < 120; i++) stepWorld(w, emptyCommand());
    expect(w.tick).toBe(tick);
    const chosen = w.perks.offer[1] ?? -1;
    w.events.clear();
    stepWorld(w, { ...emptyCommand(), perk: 2 });
    let event = -1;
    w.events.drain((e) => {
      if (e.type === GameEvent.PerkChosen) event = e.a;
    });
    expect(event).toBe(chosen);
    expect(w.perks.levels[chosen]).toBe(1);
    expect(w.director.phase).toBe(DirectorPhase.Rest);
    stepWorld(w, emptyCommand());
    expect(w.tick).toBe(tick + 1);
  });

  it('las mejoras elegidas no cambian la composición de las oleadas siguientes', () => {
    const compose = (choice: number): number[] => {
      const w = createWorld({ seed: 77, arena: HANGAR_COBALTO, god: true });
      toPerkChoice(w);
      stepWorld(w, { ...emptyCommand(), perk: choice });
      const c = emptyCommand();
      while (w.director.wave < 2) stepWorld(w, c);
      return [...w.director.queue.slice(0, w.director.queueLength)];
    };
    expect(compose(1)).toEqual(compose(3));
  });
});
