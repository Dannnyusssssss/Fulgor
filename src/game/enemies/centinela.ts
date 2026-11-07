/**
 * Centinela: mantiene la distancia, se mueve de lado y dispara esferas lentas.
 * Antes de disparar se detiene y carga el cañón con una línea corta de aviso en la dirección del disparo (fija).
 */
import { distSq, vec2, yawFromDir } from '../../core/math';
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

const toPlayer = vec2();
const steerDir = vec2();

export function updateCentinela(e: Enemy, ctx: EnemyContext, dt: number): number {
  const def = ctx.tuning.centinela;
  // Objetivo actual: el jugador o, si está activo, el señuelo.
  const p = ctx.target;
  let flags = 0;
  beginStep(e, dt);

  switch (e.state) {
    case EnemyState.Materializing:
      if (e.stateTimer <= 0) {
        setState(e, EnemyState.Chase, 0);
        // Primer disparo con una espera: no ataca nada más llegar.
        e.attackCooldown = def.cooldown * 0.5;
      }
      break;

    case EnemyState.Chase: {
      const d2 = distSq(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
      const d = Math.sqrt(d2);
      const los = seesPlayer(e, ctx);
      if (los && e.attackCooldown <= 0 && d <= def.maxRange) {
        dirToPlayer(e, ctx, e.dir);
        e.yaw = yawFromDir(e.dir.x, e.dir.z);
        e.vel.x = 0;
        e.vel.z = 0;
        setState(e, EnemyState.Windup, telegraphDuration(def.windupSeconds));
        flags |= EnemyFlag.TelegraphStarted;
        break;
      }
      // Cambio de sentido lateral cada cierto tiempo (flujo de combate).
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafe = ctx.combat.next() < 0.5 ? -1 : 1;
        e.strafeTimer = def.strafeSwitchSeconds * (0.6 + ctx.combat.next() * 0.8);
      }
      let vx = 0;
      let vz = 0;
      if (!los || d > def.maxRange) {
        // Sin línea de visión o demasiado lejos: acercarse.
        if (chaseDirection(e, ctx, los, d2, steerDir)) {
          vx = steerDir.x * def.speed;
          vz = steerDir.z * def.speed;
        }
      } else {
        dirToPlayer(e, ctx, toPlayer);
        // Lateral: perpendicular a la línea hacia el jugador.
        vx = -toPlayer.z * e.strafe * def.strafeSpeed;
        vz = toPlayer.x * e.strafe * def.strafeSpeed;
        if (d < def.minRange) {
          // Demasiado cerca: retroceder.
          vx -= toPlayer.x * def.speed;
          vz -= toPlayer.z * def.speed;
        }
        e.yaw = yawFromDir(toPlayer.x, toPlayer.z);
      }
      if (steer(e, ctx, vx, vz, 6, dt)) e.strafe = -e.strafe;
      break;
    }

    case EnemyState.Windup:
      // Quieto y con la dirección fijada mientras carga.
      if (e.stateTimer <= 0) {
        flags |= EnemyFlag.Fire;
        e.attackCooldown = def.cooldown + ctx.combat.next() * def.cooldownJitter;
        setState(e, EnemyState.Chase, 0);
      }
      break;

    default:
      setState(e, EnemyState.Chase, 0);
      break;
  }
  return flags;
}
