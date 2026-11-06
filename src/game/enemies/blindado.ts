/**
 * Blindado: lento, con escudo frontal que detiene los disparos. Gira despacio hacia el jugador, así que se le
 * puede rodear para dañarlo de lado o por detrás. De cerca avisa con un semicírculo en el suelo (fijo) y suelta
 * una onda frontal.
 */
import { distSq, forwardInto, vec2, wrapAngle, yawFromDir } from '../../core/math';
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
const fwd = vec2();

/** ¿El punto (x, z) está dentro del frente del enemigo (±halfAngle respecto a su yaw)? */
export function inFrontArc(e: Enemy, x: number, z: number, halfAngle: number): boolean {
  const angleTo = yawFromDir(x - e.pos.x, z - e.pos.z);
  return Math.abs(wrapAngle(angleTo - e.yaw)) <= halfAngle;
}

export function updateBlindado(e: Enemy, ctx: EnemyContext, dt: number): number {
  const def = ctx.tuning.blindado;
  const p = ctx.player;
  let flags = 0;
  beginStep(e, dt);

  switch (e.state) {
    case EnemyState.Materializing:
      if (e.stateTimer <= 0) setState(e, EnemyState.Chase, 0);
      break;

    case EnemyState.Chase: {
      const d2 = distSq(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
      const los = seesPlayer(e, ctx);
      // El cuerpo (y su escudo) gira despacio hacia el jugador.
      if (p.alive) {
        const target = yawFromDir(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        e.yaw = turnTowards(e.yaw, target, def.turnRate * dt);
      }
      const reach = def.attackRange + p.radius;
      if (
        los &&
        e.attackCooldown <= 0 &&
        d2 <= reach * reach &&
        inFrontArc(e, p.pos.x, p.pos.z, def.attackHalfAngle)
      ) {
        forwardInto(e.dir, e.yaw);
        e.vel.x = 0;
        e.vel.z = 0;
        setState(e, EnemyState.Windup, telegraphDuration(def.windupSeconds));
        flags |= EnemyFlag.TelegraphStarted;
        break;
      }
      // Avanza hacia el jugador; muy cerca solo gira (no se le mete encima).
      const has = d2 > 1.6 * 1.6 && chaseDirection(e, ctx, los, d2, steerDir);
      // Avanza más lento si el jugador no está delante: le cuesta girar.
      forwardInto(fwd, e.yaw);
      const facing = has ? Math.max(0.35, steerDir.x * fwd.x + steerDir.z * fwd.z) : 0;
      const speed = def.speed * facing;
      steer(e, ctx, has ? steerDir.x * speed : 0, has ? steerDir.z * speed : 0, 4, dt);
      break;
    }

    case EnemyState.Windup:
      // Quieto y sin girar: el área del semicírculo no cambia.
      if (e.stateTimer <= 0) {
        flags |= EnemyFlag.Shockwave;
        setState(e, EnemyState.Recover, def.recoverSeconds);
      }
      break;

    case EnemyState.Recover:
      steer(e, ctx, 0, 0, 8, dt);
      if (e.stateTimer <= 0) {
        e.attackCooldown = def.cooldown;
        setState(e, EnemyState.Chase, 0);
      }
      break;

    default:
      setState(e, EnemyState.Chase, 0);
      break;
  }
  return flags;
}
