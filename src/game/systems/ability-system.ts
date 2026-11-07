/**
 * Sistema de habilidades: recarga, activación con Q y duración de la Barrera y el Señuelo.
 * También mantiene el objetivo de la IA (el jugador o el señuelo).
 */
import { forwardInto, vec2 } from '../../core/math';
import type { PlayerCommand } from '../../core/input';
import { sweepObstacles } from '../collision';
import { EnemyKind, EnemyState, isDamageable, setState, type Enemy } from '../enemies/types';
import { GameEvent } from '../events';
import type { World } from '../world';
import { damageEnemy } from './damage';

const fwd = vec2();

/** Espera mínima antes de que un enemigo interrumpido por la Onda pueda volver a atacar. */
const INTERRUPT_COOLDOWN = 1.2;

export function updateAbilitySystem(world: World, cmd: PlayerCommand, dt: number): void {
  const a = world.ability;
  const p = world.player;
  a.cooldown = Math.max(0, a.cooldown - dt);

  // Barrera: termina al acabar el tiempo o al absorber todo lo que podía.
  if (p.barrierTimer > 0) {
    p.barrierTimer = Math.max(0, p.barrierTimer - dt);
    const broken = p.barrier <= 0;
    if (broken || p.barrierTimer <= 0) {
      p.barrier = 0;
      p.barrierTimer = 0;
      world.events.emit(GameEvent.BarrierEnd, p.pos.x, p.pos.z, broken ? 1 : 0);
    }
  }

  const d = a.decoy;
  if (d.timer > 0) {
    d.timer = Math.max(0, d.timer - dt);
    if (d.timer <= 0) {
      d.alive = false;
      world.events.emit(GameEvent.DecoyEnd, d.pos.x, d.pos.z);
    }
  }

  if (cmd.ability && p.alive && a.cooldown <= 0) activate(world);
  syncTarget(world);
}

function activate(world: World): void {
  const a = world.ability;
  const p = world.player;
  const m = world.mods;
  const t = world.tuning.abilities;
  let cooldown = 0;
  switch (a.id) {
    case 'onda': {
      const def = t.onda;
      const radius = def.radius * m.abilityPowerMul;
      cooldown = def.cooldown;
      for (const e of world.enemies.items) {
        if (!isDamageable(e)) continue;
        const dx = e.pos.x - p.pos.x;
        const dz = e.pos.z - p.pos.z;
        const dist = Math.hypot(dx, dz);
        const reach = radius + e.radius;
        if (dist > reach) continue;
        if (canBePushed(e)) {
          const nx = dist > 1e-6 ? dx / dist : 1;
          const nz = dist > 1e-6 ? dz / dist : 0;
          // Más empuje cuanto más cerca (de 100 % pegado a 40 % en el borde).
          const amount = def.pushDistance * (1 - 0.6 * (dist / reach));
          e.pushX = (nx * amount) / def.pushSeconds;
          e.pushZ = (nz * amount) / def.pushSeconds;
          e.pushTimer = def.pushSeconds;
          // Interrumpe el aviso o el ataque en curso: vuelve a moverse y espera antes de atacar de nuevo.
          if (e.state !== EnemyState.Chase) setState(e, EnemyState.Chase, 0);
          e.attackCooldown = Math.max(e.attackCooldown, INTERRUPT_COOLDOWN);
        }
        damageEnemy(world, e, def.damage * m.damageMul);
      }
      world.events.emit(GameEvent.AbilityOnda, p.pos.x, p.pos.z, radius);
      break;
    }
    case 'barrera': {
      const def = t.barrera;
      cooldown = def.cooldown;
      p.barrier = def.absorb * m.abilityPowerMul;
      p.barrierMax = p.barrier;
      p.barrierTimer = def.duration;
      world.events.emit(GameEvent.BarrierUp, p.pos.x, p.pos.z, p.barrier);
      break;
    }
    case 'senuelo': {
      const def = t.senuelo;
      cooldown = def.cooldown;
      const d = a.decoy;
      forwardInto(fwd, p.yaw);
      // Delante del jugador, pero sin meterse en una pared o una cobertura.
      const bx = p.pos.x + fwd.x * def.distance;
      const bz = p.pos.z + fwd.z * def.distance;
      const hit = sweepObstacles(world.arena, p.pos.x, p.pos.z, bx, bz, def.radius);
      const k = hit >= 0 ? Math.max(0, hit - 0.02) : 1;
      d.pos.x = p.pos.x + (bx - p.pos.x) * k;
      d.pos.z = p.pos.z + (bz - p.pos.z) * k;
      d.radius = def.radius;
      d.alive = true;
      d.duration = def.duration * m.abilityPowerMul;
      d.timer = d.duration;
      world.events.emit(GameEvent.DecoyStart, d.pos.x, d.pos.z, d.duration);
      break;
    }
  }
  a.cooldownMax = cooldown * m.abilityCooldownMul;
  a.cooldown = a.cooldownMax;
}

/** El jefe no se empuja ni se interrumpe (sí recibe el daño); el resto, sí. */
function canBePushed(e: Enemy): boolean {
  return e.active && e.kind !== EnemyKind.Coloso;
}

/** El objetivo de la IA es el señuelo mientras dura y el jugador en otro caso. */
export function syncTarget(world: World): void {
  const t = world.aiTarget;
  const d = world.ability.decoy;
  const p = world.player;
  const useDecoy = d.alive && d.timer > 0 && p.alive;
  const src = useDecoy ? d : p;
  t.pos.x = src.pos.x;
  t.pos.z = src.pos.z;
  t.radius = src.radius;
  t.alive = useDecoy || p.alive;
}
