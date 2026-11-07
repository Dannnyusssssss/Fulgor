import { describe, expect, it } from 'vitest';
import { emptyCommand, type PlayerCommand } from '../src/core/input';
import { HANGAR_COBALTO } from '../src/data/arenas';
import { DISPERSOR, PULSADOR, RAYO } from '../src/data/weapons';
import { EnemyKind, EnemyState } from '../src/game/enemies/types';
import { GameEvent } from '../src/game/events';
import { createModifiers, effectiveWeapon } from '../src/game/modifiers';
import { PickupType } from '../src/game/pickups';
import { projectileDamage, Team } from '../src/game/projectiles';
import { hurtPlayer } from '../src/game/systems/damage';
import { spawnPickup } from '../src/game/systems/pickup-system';
import { BeamHit } from '../src/game/systems/weapon-system';
import { createWorld, stepWorld, type World, type WorldOptions } from '../src/game/world';
import { placeEnemy } from './helpers';

const ALL_WEAPONS = ['pulsador', 'dispersor', 'rayo'] as const;

/** Mundo sin oleadas en Hangar Cobalto (el jugador está en (0, 4) mirando hacia -z). */
function makeWorld(opts: Partial<WorldOptions> = {}): World {
  const w = createWorld({ seed: 3, arena: HANGAR_COBALTO, weapons: ALL_WEAPONS, ...opts });
  w.director.disabled = true;
  return w;
}

function cmdWith(patch: Partial<PlayerCommand>): PlayerCommand {
  return { ...emptyCommand(), ...patch };
}

function run(w: World, steps: number, patch: Partial<PlayerCommand> = {}): number[] {
  const seen: number[] = [];
  for (let i = 0; i < steps; i++) {
    stepWorld(w, cmdWith(patch));
    w.events.drain((e) => seen.push(e.type));
  }
  return seen;
}

function countPlayerProjectiles(w: World): number {
  let n = 0;
  for (const p of w.projectiles.items) if (p.active && p.team === Team.Player) n++;
  return n;
}

describe('cambio de arma y calor de cada arma', () => {
  it('cambia solo a ranuras desbloqueadas', () => {
    const w = makeWorld({ weapons: [] });
    run(w, 1, { weapon: 2 });
    expect(w.activeWeapon).toBe(0);
    const w2 = makeWorld();
    const seen = run(w2, 1, { weapon: 3 });
    expect(w2.activeWeapon).toBe(2);
    expect(seen).toContain(GameEvent.WeaponSwitch);
  });

  it('cada arma tiene su propio calor y la guardada se sigue enfriando', () => {
    const w = makeWorld();
    run(w, 30, { yaw: Math.PI, fire: true }); // dispara el Pulsador hacia +z
    const hot = w.weapons[0]?.heat ?? 0;
    expect(hot).toBeGreaterThan(20);
    run(w, 1, { weapon: 2 });
    expect(w.weapons[1]?.heat).toBe(0);
    run(w, 60);
    expect(w.weapons[0]?.heat ?? 0).toBeLessThan(hot - 20);
  });

  it('ventilar solo afecta al arma en la mano', () => {
    const w = makeWorld();
    for (const s of w.weapons) s.heat = 60;
    w.activeWeapon = 1;
    run(w, 1, { vent: true });
    expect(w.weapons[1]?.ventTimer ?? 0).toBeGreaterThan(0);
    expect(w.weapons[0]?.ventTimer).toBe(0);
  });

  it('el enfriador quita el calor de todas las armas', () => {
    const w = makeWorld();
    for (const s of w.weapons) {
      s.heat = 100;
      s.overheated = true;
    }
    spawnPickup(w, PickupType.Coolant, w.player.pos.x, w.player.pos.z);
    run(w, 1);
    for (const s of w.weapons) {
      expect(s.heat).toBe(0);
      expect(s.overheated).toBe(false);
    }
  });
});

describe('Dispersor', () => {
  it('dispara un abanico fijo y simétrico de perdigones', () => {
    const w = makeWorld();
    w.activeWeapon = 1;
    run(w, 1, { fire: true });
    expect(countPlayerProjectiles(w)).toBe(DISPERSOR.pellets);
    let sumX = 0;
    let maxAngle = 0;
    for (const p of w.projectiles.items) {
      if (!p.active) continue;
      sumX += p.vx;
      maxAngle = Math.max(maxAngle, Math.abs(Math.atan2(p.vx, -p.vz)));
    }
    expect(Math.abs(sumX)).toBeLessThan(1e-6);
    expect(maxAngle).toBeCloseTo(DISPERSOR.spreadAngle / 2, 5);
  });

  it('hace más daño de cerca que lejos', () => {
    const w = makeWorld();
    w.activeWeapon = 1;
    run(w, 1, { fire: true });
    const p = w.projectiles.items.find((x) => x.active);
    expect(p).toBeDefined();
    if (!p) return;
    p.remaining = p.range - 2;
    expect(projectileDamage(p)).toBe(DISPERSOR.damage);
    p.remaining = 0;
    expect(projectileDamage(p)).toBeCloseTo(DISPERSOR.damage * DISPERSOR.falloffMin);
    p.remaining =
      p.range - (DISPERSOR.falloffStart + (DISPERSOR.range - DISPERSOR.falloffStart) / 2);
    expect(projectileDamage(p)).toBeCloseTo((DISPERSOR.damage * (1 + DISPERSOR.falloffMin)) / 2);
  });

  it('de cerca, un disparo completo daña mucho más que un disparo del Pulsador', () => {
    const w = makeWorld();
    w.activeWeapon = 1;
    const e = placeEnemy(w, EnemyKind.Blindado, 0, 1.5);
    e.yaw = 0; // de espaldas: sin escudo
    run(w, 1);
    run(w, 6, { fire: true });
    expect(e.maxHealth - e.health).toBeGreaterThan(PULSADOR.damage * 3);
  });
});

describe('Rayo', () => {
  it('daña de forma continua al enemigo en la línea', () => {
    const w = makeWorld();
    w.activeWeapon = 2;
    const e = placeEnemy(w, EnemyKind.Blindado, 0, -4);
    e.yaw = 0;
    run(w, 1);
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      stepWorld(w, cmdWith({ fire: true }));
      w.events.drain((ev) => {
        if (ev.type === GameEvent.BeamPulse) seen.push(ev.d);
      });
    }
    // 0,5 s a 20 pulsos por segundo.
    expect(seen.length).toBeGreaterThanOrEqual(9);
    expect(seen.every((d) => d === BeamHit.Enemy)).toBe(true);
    expect(e.health).toBeLessThan(e.maxHealth - RAYO.damage * 8);
  });

  it('lo detienen las coberturas y el escudo frontal del Blindado', () => {
    const covered = makeWorld();
    covered.activeWeapon = 2;
    covered.player.pos.x = 4.5; // columna en (4.5, 0) entre el jugador y el enemigo
    covered.player.prev.x = 4.5;
    const e = placeEnemy(covered, EnemyKind.Zumbador, 4.5, -4);
    run(covered, 1);
    run(covered, 20, { fire: true });
    expect(e.health).toBe(e.maxHealth);

    const shielded = makeWorld();
    shielded.activeWeapon = 2;
    const b = placeEnemy(shielded, EnemyKind.Blindado, 0, -2);
    b.yaw = Math.PI; // mira al jugador
    run(shielded, 1);
    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      stepWorld(shielded, cmdWith({ fire: true }));
      shielded.events.drain((ev) => {
        if (ev.type === GameEvent.BeamPulse) results.push(ev.d);
      });
    }
    expect(b.health).toBe(b.maxHealth);
    expect(results).toContain(BeamHit.Blocked);
  });

  it('calienta rápido: se sobrecalienta en unos 1,6 s de disparo seguido', () => {
    const w = makeWorld();
    w.activeWeapon = 2;
    let steps = 0;
    while (!(w.weapons[2]?.overheated ?? true) && steps < 600) {
      run(w, 1, { yaw: Math.PI, fire: true });
      steps++;
    }
    expect(steps / 60).toBeGreaterThan(1.2);
    expect(steps / 60).toBeLessThan(2.2);
  });
});

describe('mejoras sobre las armas (valores efectivos)', () => {
  it('el arma efectiva combina los datos con los modificadores sin tocar los datos', () => {
    const m = createModifiers();
    m.damageMul = 1.5;
    m.fireRateMul = 2;
    m.extraPellets = 2;
    const out = { ...DISPERSOR };
    effectiveWeapon(out, DISPERSOR, m);
    expect(out.damage).toBeCloseTo(DISPERSOR.damage * 1.5);
    expect(out.fireInterval).toBeCloseTo(DISPERSOR.fireInterval / 2);
    expect(out.pellets).toBe(DISPERSOR.pellets + 2);
    expect(DISPERSOR.pellets).toBe(7);
  });
});

describe('Onda', () => {
  it('empuja a los cercanos, los daña e interrumpe su aviso; no afecta a los lejanos', () => {
    const w = makeWorld({ ability: 'onda' });
    const near = placeEnemy(w, EnemyKind.Zumbador, 0, 1, EnemyState.Windup, 1);
    const far = placeEnemy(w, EnemyKind.Zumbador, 0, -10);
    run(w, 1, { ability: true });
    expect(near.state).toBe(EnemyState.Chase);
    expect(near.attackCooldown).toBeGreaterThan(1);
    expect(near.health).toBe(near.maxHealth - w.tuning.abilities.onda.damage);
    // Durante el empuje (0,25 s) se aleja del jugador más de lo que avanza persiguiéndolo.
    run(w, 15);
    expect(near.pos.z).toBeLessThan(1 - 2);
    expect(far.health).toBe(far.maxHealth);
    expect(w.ability.cooldown).toBeGreaterThan(0);
  });

  it('el empuje nunca mete a un enemigo en una pared', () => {
    const w = makeWorld({ ability: 'onda' });
    // Jugador pegado a la caja de (0, 13); enemigo entre los dos y la pared.
    w.player.pos.z = 10.6;
    w.player.prev.z = 10.6;
    const e = placeEnemy(w, EnemyKind.Zumbador, 0, 11.5);
    run(w, 1, { ability: true });
    run(w, 30);
    // La caja ocupa z ∈ [12.25, 13.75]: el enemigo queda por fuera.
    expect(e.pos.z + e.radius).toBeLessThanOrEqual(12.25 + 1e-6);
  });

  it('no se puede usar durante la recarga', () => {
    const w = makeWorld({ ability: 'onda' });
    const seen = run(w, 1, { ability: true });
    expect(seen.filter((t) => t === GameEvent.AbilityOnda)).toHaveLength(1);
    const again = run(w, 60, { ability: true });
    expect(again).not.toContain(GameEvent.AbilityOnda);
  });
});

describe('Barrera', () => {
  it('absorbe el daño antes que el escudo y se rompe al agotarse', () => {
    const w = makeWorld({ ability: 'barrera' });
    run(w, 1, { ability: true });
    const absorb = w.tuning.abilities.barrera.absorb;
    expect(w.player.barrier).toBe(absorb);
    hurtPlayer(w, 30, 0);
    expect(w.player.shield).toBe(w.player.maxShield);
    expect(w.player.barrier).toBe(absorb - 30);
    hurtPlayer(w, 40, 0);
    expect(w.player.barrier).toBe(0);
    expect(w.player.shield).toBe(w.player.maxShield - 10);
    const seen = run(w, 1);
    expect(seen).toContain(GameEvent.BarrierEnd);
    expect(w.player.barrierTimer).toBe(0);
  });

  it('se apaga al terminar su duración', () => {
    const w = makeWorld({ ability: 'barrera' });
    run(w, 1, { ability: true });
    run(w, Math.ceil(w.tuning.abilities.barrera.duration * 60) + 1);
    expect(w.player.barrier).toBe(0);
  });
});

describe('Señuelo', () => {
  it('los enemigos persiguen al señuelo mientras dura y después vuelven al jugador', () => {
    const w = makeWorld({ ability: 'senuelo' });
    run(w, 1, { ability: true });
    const d = w.ability.decoy;
    expect(d.alive).toBe(true);
    // Delante del jugador (hacia -z).
    expect(d.pos.z).toBeCloseTo(4 - w.tuning.abilities.senuelo.distance);
    expect(w.aiTarget.pos.z).toBeCloseTo(d.pos.z);
    // Un Zumbador a la izquierda va hacia el señuelo, no hacia el jugador.
    const e = placeEnemy(w, EnemyKind.Zumbador, -9, d.pos.z, EnemyState.Chase, 0);
    e.attackCooldown = 100;
    run(w, 30);
    expect(Math.abs(e.pos.z - d.pos.z)).toBeLessThan(0.6);
    run(w, Math.ceil(w.tuning.abilities.senuelo.duration * 60));
    expect(d.alive).toBe(false);
    expect(w.aiTarget.pos.x).toBe(w.player.pos.x);
    expect(w.aiTarget.pos.z).toBe(w.player.pos.z);
  });

  it('no aparece dentro de una cobertura', () => {
    const w = makeWorld({ ability: 'senuelo' });
    // Jugador justo detrás de la columna de (4.5, 0), mirando hacia ella.
    w.player.pos.x = 4.5;
    w.player.pos.z = 2;
    run(w, 1, { ability: true });
    const d = w.ability.decoy;
    const dist = Math.hypot(d.pos.x - 4.5, d.pos.z - 0);
    expect(dist).toBeGreaterThanOrEqual(0.9 + d.radius - 1e-6);
  });
});

describe('determinismo con armas y habilidades', () => {
  it('la misma semilla y las mismas órdenes dan el mismo estado', () => {
    const play = (): string => {
      const w = createWorld({
        seed: 9,
        arena: HANGAR_COBALTO,
        weapons: ALL_WEAPONS,
        ability: 'onda',
      });
      const c = emptyCommand();
      for (let t = 0; t < 60 * 25; t++) {
        c.yaw = Math.sin(t / 70) * 3;
        c.fire = t % 90 < 60;
        c.weapon = t % 240 === 0 ? 1 + ((t / 240) % 3) : 0;
        c.ability = t % 300 === 10;
        c.moveX = Math.sin(t / 40);
        c.perk = 1;
        stepWorld(w, c);
        w.events.clear();
      }
      return JSON.stringify([w.player.pos, w.weapons.map((s) => s.heat), w.score.points, w.tick]);
    };
    expect(play()).toBe(play());
  });
});
