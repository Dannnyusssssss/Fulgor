/**
 * Zumbador: dron rápido que persigue al jugador y embiste.
 * Antes de embestir se detiene y muestra una línea de aviso en el suelo con la dirección exacta del ataque;
 * esa dirección no cambia después, así que siempre se puede esquivar.
 */
import { distSq, vec2, yawFromDir } from '../../core/math';
import type { ZumbadorDef } from '../../data/enemies';
import { moveCircle } from '../collision';
import {
  beginStep,
  chaseDirection,
  dirToPlayer,
  EnemyFlag,
  seesPlayer,
  steer,
  telegraphDuration,
  type EnemyContext,
} from './common';
import { EnemyState, setState, type Enemy } from './types';

const steerDir = vec2();

export function windupDuration(def: ZumbadorDef): number {
  return telegraphDuration(def.windupSeconds);
}

export function dashLength(def: ZumbadorDef): number {
  return def.dashSpeed * def.dashSeconds;
}

export function updateZumbador(e: Enemy, ctx: EnemyContext, dt: number): number {
  const def = ctx.tuning.zumbador;
  const player = ctx.player;
  let flags = 0;
  beginStep(e, dt);

  switch (e.state) {
    case EnemyState.Materializing:
      if (e.stateTimer <= 0) setState(e, EnemyState.Chase, 0);
      break;

    case EnemyState.Chase: {
      const d2 = distSq(e.pos.x, e.pos.z, player.pos.x, player.pos.z);
      const los = seesPlayer(e, ctx);
      // ¿Empezar el aviso de embestida?
      if (los && e.attackCooldown <= 0 && d2 <= def.chargeRange * def.chargeRange) {
        dirToPlayer(e, ctx, e.dir);
        e.vel.x = 0;
        e.vel.z = 0;
        e.yaw = yawFromDir(e.dir.x, e.dir.z);
        setState(e, EnemyState.Windup, windupDuration(def));
        flags |= EnemyFlag.TelegraphStarted;
        break;
      }
      const has = chaseDirection(e, ctx, los, d2, steerDir);
      steer(e, ctx, has ? steerDir.x * def.speed : 0, has ? steerDir.z * def.speed : 0, 8, dt);
      if (e.vel.x * e.vel.x + e.vel.z * e.vel.z > 0.01) e.yaw = yawFromDir(e.vel.x, e.vel.z);
      break;
    }

    case EnemyState.Windup:
      // Quieto mientras avisa: la dirección ya está fijada.
      if (e.stateTimer <= 0) {
        e.dashHit = false;
        setState(e, EnemyState.Dash, def.dashSeconds);
      }
      break;

    case EnemyState.Dash: {
      e.vel.x = e.dir.x * def.dashSpeed;
      e.vel.z = e.dir.z * def.dashSpeed;
      const touchedWall = moveCircle(ctx.arena, e.pos, e.radius, e.vel.x * dt, e.vel.z * dt);
      const r = e.radius + player.radius;
      if (
        !e.dashHit &&
        player.alive &&
        distSq(e.pos.x, e.pos.z, player.pos.x, player.pos.z) <= r * r
      ) {
        flags |= EnemyFlag.HitPlayer;
      }
      if (touchedWall || e.stateTimer <= 0) {
        const jitter = ctx.combat.next() * def.recoverJitter;
        setState(e, EnemyState.Recover, def.recoverSeconds + jitter);
      }
      break;
    }

    case EnemyState.Recover:
      steer(e, ctx, 0, 0, 10, dt);
      if (e.stateTimer <= 0) {
        e.attackCooldown = def.chargeCooldown;
        setState(e, EnemyState.Chase, 0);
      }
      break;

    default:
      setState(e, EnemyState.Chase, 0);
      break;
  }
  return flags;
}
