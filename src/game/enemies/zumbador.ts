/**
 * Zumbador: dron rápido que persigue al jugador y embiste.
 * Antes de embestir se detiene y muestra una línea de aviso en el suelo con la dirección exacta del ataque;
 * esa dirección no cambia después, así que siempre se puede esquivar.
 */
import { damp, distSq, normalizeInto, vec2, yawFromDir, type Vec2 } from '../../core/math';
import type { Rng } from '../../core/rng';
import { BALANCE } from '../../data/balance';
import type { ZumbadorDef } from '../../data/enemies';
import type { Arena } from '../arena';
import { hasLineOfSight, moveCircle } from '../collision';
import type { NavField } from '../nav';
import type { PlayerState } from '../player';
import { EnemyState, type Enemy } from './types';

/** Lo que la IA necesita del mundo (así se puede probar sin crear un mundo completo). */
export interface ZumbadorContext {
  arena: Arena;
  nav: NavField;
  player: PlayerState;
  combat: Rng;
  def: ZumbadorDef;
}

/** Resultado del paso, como banderas de bits. */
export const ZumbadorFlag = {
  TelegraphStarted: 1,
  /** La embestida tocó al jugador: quien llama aplica el daño. */
  HitPlayer: 2,
} as const;

/** Hasta esta distancia, con línea de visión, persigue directo en vez de seguir el mapa de distancias. */
const DIRECT_CHASE_RANGE = 10;
const steer = vec2();

export function windupDuration(def: ZumbadorDef): number {
  // Ningún aviso puede ser más corto que el mínimo global.
  return Math.max(BALANCE.telegraph.minSeconds, def.windupSeconds);
}

export function dashLength(def: ZumbadorDef): number {
  return def.dashSpeed * def.dashSeconds;
}

export function updateZumbador(e: Enemy, ctx: ZumbadorContext, dt: number): number {
  const { arena, nav, player, def } = ctx;
  let flags = 0;
  e.prev.x = e.pos.x;
  e.prev.z = e.pos.z;
  e.sinceHurt += dt;
  e.stateTimer -= dt;
  e.chargeCooldown = Math.max(0, e.chargeCooldown - dt);

  switch (e.state) {
    case EnemyState.Materializing: {
      if (e.stateTimer <= 0) setState(e, EnemyState.Chase, 0);
      break;
    }

    case EnemyState.Chase: {
      const d2 = distSq(e.pos.x, e.pos.z, player.pos.x, player.pos.z);
      const los =
        player.alive &&
        hasLineOfSight(arena, e.pos.x, e.pos.z, player.pos.x, player.pos.z, e.radius * 0.6);
      // ¿Empezar el aviso de embestida?
      if (player.alive && los && e.chargeCooldown <= 0 && d2 <= def.chargeRange * def.chargeRange) {
        normalizeInto(e.dir, player.pos.x - e.pos.x, player.pos.z - e.pos.z);
        if (e.dir.x === 0 && e.dir.z === 0) e.dir.z = -1;
        e.vel.x = 0;
        e.vel.z = 0;
        e.yaw = yawFromDir(e.dir.x, e.dir.z);
        setState(e, EnemyState.Windup, windupDuration(def));
        flags |= ZumbadorFlag.TelegraphStarted;
        break;
      }
      // Dirección de persecución: directa si lo ve de cerca, si no por el mapa de distancias.
      let hasDir = false;
      if (player.alive && los && d2 <= DIRECT_CHASE_RANGE * DIRECT_CHASE_RANGE) {
        normalizeInto(steer, player.pos.x - e.pos.x, player.pos.z - e.pos.z);
        hasDir = steer.x !== 0 || steer.z !== 0;
      } else if (player.alive) {
        hasDir = nav.direction(e.pos.x, e.pos.z, steer);
      }
      const tx = hasDir ? steer.x * def.speed : 0;
      const tz = hasDir ? steer.z * def.speed : 0;
      e.vel.x = damp(e.vel.x, tx, 8, dt);
      e.vel.z = damp(e.vel.z, tz, 8, dt);
      moveCircle(arena, e.pos, e.radius, e.vel.x * dt, e.vel.z * dt);
      if (e.vel.x * e.vel.x + e.vel.z * e.vel.z > 0.01) e.yaw = yawFromDir(e.vel.x, e.vel.z);
      break;
    }

    case EnemyState.Windup: {
      // Quieto mientras avisa: la dirección ya está fijada.
      if (e.stateTimer <= 0) {
        e.dashHit = false;
        setState(e, EnemyState.Dash, def.dashSeconds);
      }
      break;
    }

    case EnemyState.Dash: {
      e.vel.x = e.dir.x * def.dashSpeed;
      e.vel.z = e.dir.z * def.dashSpeed;
      const touchedWall = moveCircle(arena, e.pos, e.radius, e.vel.x * dt, e.vel.z * dt);
      if (!e.dashHit && player.alive && touches(e.pos, e.radius, player)) {
        flags |= ZumbadorFlag.HitPlayer;
      }
      if (touchedWall || e.stateTimer <= 0) {
        const jitter = ctx.combat.next() * def.recoverJitter;
        setState(e, EnemyState.Recover, def.recoverSeconds + jitter);
      }
      break;
    }

    case EnemyState.Recover: {
      e.vel.x = damp(e.vel.x, 0, 10, dt);
      e.vel.z = damp(e.vel.z, 0, 10, dt);
      moveCircle(arena, e.pos, e.radius, e.vel.x * dt, e.vel.z * dt);
      if (e.stateTimer <= 0) {
        e.chargeCooldown = def.chargeCooldown;
        setState(e, EnemyState.Chase, 0);
      }
      break;
    }
  }
  return flags;
}

function touches(pos: Vec2, radius: number, player: PlayerState): boolean {
  const r = radius + player.radius;
  return distSq(pos.x, pos.z, player.pos.x, player.pos.z) <= r * r;
}

function setState(e: Enemy, state: Enemy['state'], duration: number): void {
  e.state = state;
  e.stateTimer = duration;
  e.stateDuration = duration;
}
