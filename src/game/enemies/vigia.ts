/**
 * Vigía: apunta con una línea láser visible que sigue al jugador con giro limitado; después la fija (ya no se mueve)
 * y, tras la pausa, dispara un rayo instantáneo a lo largo de esa línea. Apartarse o esquivar durante la fase fija lo evita.
 */
import { distSq, forwardInto, vec2, yawFromDir } from '../../core/math';
import {
  beginStep,
  chaseDirection,
  EnemyFlag,
  seesPlayer,
  steer,
  telegraphDuration,
  turnTowards,
  type EnemyContext,
} from './common';
import { EnemyState, setState, type Enemy } from './types';

const steerDir = vec2();

/** Pausa tras disparar. */
const RECOVER_SECONDS = 0.4;

export function updateVigia(e: Enemy, ctx: EnemyContext, dt: number): number {
  const def = ctx.tuning.vigia;
  const p = ctx.player;
  let flags = 0;
  beginStep(e, dt);

  switch (e.state) {
    case EnemyState.Materializing:
      if (e.stateTimer <= 0) {
        setState(e, EnemyState.Chase, 0);
        e.attackCooldown = def.cooldown * 0.5;
      }
      break;

    case EnemyState.Chase: {
      const d2 = distSq(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
      const los = seesPlayer(e, ctx);
      if (los && e.attackCooldown <= 0 && d2 <= def.range * def.range) {
        e.yaw = yawFromDir(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        forwardInto(e.dir, e.yaw);
        e.vel.x = 0;
        e.vel.z = 0;
        setState(e, EnemyState.Track, def.trackSeconds);
        flags |= EnemyFlag.TelegraphStarted;
        break;
      }
      // Se recoloca despacio hasta tener línea de visión.
      const has = !los && chaseDirection(e, ctx, los, d2, steerDir);
      steer(e, ctx, has ? steerDir.x * def.speed : 0, has ? steerDir.z * def.speed : 0, 5, dt);
      if (los) {
        const target = yawFromDir(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        e.yaw = turnTowards(e.yaw, target, def.trackTurnRate * dt);
      }
      break;
    }

    case EnemyState.Track:
      // La línea sigue al jugador, pero con giro limitado.
      if (p.alive) {
        const target = yawFromDir(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        e.yaw = turnTowards(e.yaw, target, def.trackTurnRate * dt);
      }
      forwardInto(e.dir, e.yaw);
      if (e.stateTimer <= 0) setState(e, EnemyState.Windup, telegraphDuration(def.lockSeconds));
      break;

    case EnemyState.Windup:
      // Línea fija: la dirección ya no cambia.
      if (e.stateTimer <= 0) {
        flags |= EnemyFlag.Beam;
        e.attackCooldown = def.cooldown + ctx.combat.next() * def.cooldownJitter;
        setState(e, EnemyState.Recover, RECOVER_SECONDS);
      }
      break;

    case EnemyState.Recover:
      if (e.stateTimer <= 0) setState(e, EnemyState.Chase, 0);
      break;

    default:
      setState(e, EnemyState.Chase, 0);
      break;
  }
  return flags;
}
