/**
 * Coloso: jefe con 3 fases según su vida. Entre ataques se mueve despacio para mantener la distancia y gira
 * hacia el objetivo. Cada ataque empieza con un aviso largo (nunca menor que BALANCE.boss.minWarnSeconds):
 * - Barrido: sector fijo en el suelo; al terminar el aviso, un haz recorre el sector de un borde al otro.
 * - Ráfaga: abanico fijo de líneas; al terminar, proyectiles lentos por esas líneas.
 * - Orbes (fase 2+, o en cualquier fase si no ve al objetivo): círculos en el suelo que caen al terminar su aviso.
 * - Llamada (fase 3): enemigos de apoyo por portales (con tope y recarga).
 * Al bajar de un umbral de vida hace una pausa estable (sin daño ni ataques) y pasa a la fase siguiente.
 */
import { distSq, normalizeInto, vec2, wrapAngle, yawFromDir } from '../../core/math';
import { BALANCE } from '../../data/balance';
import type { ColosoDef } from '../../data/enemies';
import {
  beginStep,
  chaseDirection,
  EnemyFlag,
  seesPlayer,
  steer,
  turnTowards,
  type EnemyContext,
} from './common';
import { EnemyKind, EnemyState, setState, type Enemy } from './types';

export const ColosoAttack = {
  None: 0,
  Sweep: 1,
  Volley: 2,
  Orbs: 3,
  Summon: 4,
} as const;
export type ColosoAttackId = (typeof ColosoAttack)[keyof typeof ColosoAttack];

const steerDir = vec2();
const away = vec2();

/** Duración de un aviso del jefe: nunca menor que el mínimo del jefe ni que el mínimo general. */
export function bossWarn(seconds: number): number {
  return Math.max(BALANCE.boss.minWarnSeconds, BALANCE.telegraph.minSeconds, seconds);
}

/** Fase que corresponde a una fracción de vida. */
export function phaseFor(def: ColosoDef, healthFraction: number): number {
  if (healthFraction <= def.phase3At) return 3;
  if (healthFraction <= def.phase2At) return 2;
  return 1;
}

/** Enemigos de apoyo vivos (todos los que no son el Coloso). */
export function supportAlive(ctx: EnemyContext): number {
  let n = 0;
  for (const o of ctx.enemies) if (o.active && o.kind !== EnemyKind.Coloso) n++;
  return n;
}

function recoverSeconds(def: ColosoDef, phase: number): number {
  return phase >= 3 ? def.recoverSecondsPhase3 : def.recoverSeconds;
}

/** Elige el siguiente ataque con el flujo de combate, sin repetir el anterior cuando hay alternativa. */
function chooseAttack(e: Enemy, ctx: EnemyContext, d2: number): ColosoAttackId {
  const def = ctx.tuning.coloso;
  const roll = ctx.combat.next();
  if (e.phase >= 3 && e.summonCooldown <= 0 && supportAlive(ctx) < def.supportCap) {
    return ColosoAttack.Summon;
  }
  const options: ColosoAttackId[] =
    e.phase >= 2
      ? [ColosoAttack.Sweep, ColosoAttack.Volley, ColosoAttack.Orbs]
      : [ColosoAttack.Sweep, ColosoAttack.Volley];
  // Fuera del alcance del barrido no tiene sentido barrer.
  const sweepReach = def.sweepRange - 1;
  const usable = d2 <= sweepReach * sweepReach ? options : options.slice(1);
  let pick = usable[Math.floor(roll * usable.length)] ?? ColosoAttack.Volley;
  if (pick === e.attack && usable.length > 1) {
    pick = usable[(usable.indexOf(pick) + 1) % usable.length] ?? pick;
  }
  return pick;
}

export function updateColoso(e: Enemy, ctx: EnemyContext, dt: number): number {
  const def = ctx.tuning.coloso;
  const t = ctx.target;
  let flags = 0;
  beginStep(e, dt);
  e.summonCooldown = Math.max(0, e.summonCooldown - dt);

  if (e.state === EnemyState.Materializing) {
    // Tras el portal espera un momento antes del primer ataque.
    if (e.stateTimer <= 0) setState(e, EnemyState.Recover, def.recoverSeconds);
    return 0;
  }

  // Cambio de fase: pausa estable; cancela el ataque en curso (sus zonas ya creadas siguen su aviso).
  const want = phaseFor(def, e.health / e.maxHealth);
  if (want > e.phase && e.state !== EnemyState.Shift) {
    e.phase = want;
    e.vel.x = 0;
    e.vel.z = 0;
    setState(e, EnemyState.Shift, def.phaseShiftSeconds);
    // La llamada de apoyo está lista nada más entrar en la fase 3.
    if (want >= 3) e.summonCooldown = 0;
    return EnemyFlag.PhaseShift;
  }

  switch (e.state) {
    case EnemyState.Shift:
      if (e.stateTimer <= 0) setState(e, EnemyState.Recover, recoverSeconds(def, e.phase) * 0.5);
      break;

    case EnemyState.Chase: {
      const d2 = distSq(e.pos.x, e.pos.z, t.pos.x, t.pos.z);
      if (t.alive) {
        const target = yawFromDir(t.pos.x - e.pos.x, t.pos.z - e.pos.z);
        e.yaw = turnTowards(e.yaw, target, def.turnRate * dt);
      }
      const los = seesPlayer(e, ctx);
      // Sin línea de visión usa los orbes (no la necesitan): así un cuerpo tan grande nunca se queda
      // atascado buscando un hueco por el que no cabe.
      if (t.alive) {
        startAttack(e, ctx, los ? chooseAttack(e, ctx, d2) : ColosoAttack.Orbs);
        if (e.attack === ColosoAttack.Orbs) flags |= EnemyFlag.Orbs;
        flags |= EnemyFlag.TelegraphStarted;
        break;
      }
      steer(e, ctx, 0, 0, 3, dt);
      break;
    }

    case EnemyState.Windup:
      // Quieto durante el aviso: lo avisado no cambia.
      steer(e, ctx, 0, 0, 8, dt);
      if (e.stateTimer > 0) break;
      if (e.attack === ColosoAttack.Sweep) {
        e.sweepAngle = e.sweepFrom;
        e.sweepPrev = e.sweepFrom;
        e.dashHit = false;
        setState(e, EnemyState.Dash, def.sweepSeconds);
        break;
      }
      if (e.attack === ColosoAttack.Volley) flags |= EnemyFlag.Volley;
      if (e.attack === ColosoAttack.Summon) {
        flags |= EnemyFlag.Summon;
        e.summonCooldown = def.summonCooldown;
      }
      setState(e, EnemyState.Recover, recoverSeconds(def, e.phase));
      break;

    case EnemyState.Dash: {
      // El haz recorre el sector avisado a velocidad constante.
      const progress = Math.min(1, 1 - Math.max(0, e.stateTimer) / def.sweepSeconds);
      e.sweepPrev = e.sweepAngle;
      e.sweepAngle = e.sweepFrom + wrapAngle(e.sweepTo - e.sweepFrom) * progress;
      flags |= EnemyFlag.Sweep;
      if (e.stateTimer <= 0) setState(e, EnemyState.Recover, recoverSeconds(def, e.phase));
      break;
    }

    case EnemyState.Recover: {
      // Entre ataques: mantiene la distancia preferida y gira hacia el objetivo.
      let vx = 0;
      let vz = 0;
      if (t.alive) {
        const d2 = distSq(e.pos.x, e.pos.z, t.pos.x, t.pos.z);
        const los = seesPlayer(e, ctx);
        e.yaw = turnTowards(
          e.yaw,
          yawFromDir(t.pos.x - e.pos.x, t.pos.z - e.pos.z),
          def.turnRate * dt,
        );
        if (d2 < def.preferMin * def.preferMin) {
          normalizeInto(away, e.pos.x - t.pos.x, e.pos.z - t.pos.z);
          vx = away.x * def.speed;
          vz = away.z * def.speed;
        } else if (
          (d2 > def.preferMax * def.preferMax || !los) &&
          chaseDirection(e, ctx, los, d2, steerDir)
        ) {
          vx = steerDir.x * def.speed;
          vz = steerDir.z * def.speed;
        }
      }
      steer(e, ctx, vx, vz, 3, dt);
      if (e.stateTimer <= 0) setState(e, EnemyState.Chase, 0);
      break;
    }

    default:
      setState(e, EnemyState.Recover, def.recoverSeconds);
      break;
  }
  return flags;
}

/** Fija lo que avisa el ataque (dirección, sector) y entra en el aviso. */
function startAttack(e: Enemy, ctx: EnemyContext, attack: ColosoAttackId): void {
  const def = ctx.tuning.coloso;
  const t = ctx.target;
  e.attack = attack;
  e.vel.x = 0;
  e.vel.z = 0;
  const aim = yawFromDir(t.pos.x - e.pos.x, t.pos.z - e.pos.z);
  e.yaw = aim;
  normalizeInto(e.dir, t.pos.x - e.pos.x, t.pos.z - e.pos.z);
  if (e.dir.x === 0 && e.dir.z === 0) e.dir.z = -1;
  switch (attack) {
    case ColosoAttack.Sweep: {
      // Sentido del barrido al azar (flujo de combate); el sector queda fijo durante el aviso.
      const sign = ctx.combat.next() < 0.5 ? -1 : 1;
      e.sweepFrom = wrapAngle(aim - sign * def.sweepHalfAngle);
      e.sweepTo = wrapAngle(aim + sign * def.sweepHalfAngle);
      e.sweepAngle = e.sweepFrom;
      e.sweepPrev = e.sweepFrom;
      setState(e, EnemyState.Windup, bossWarn(def.sweepWarnSeconds));
      break;
    }
    case ColosoAttack.Volley:
      setState(e, EnemyState.Windup, bossWarn(def.volleyWarnSeconds));
      break;
    case ColosoAttack.Orbs:
      // Los orbes llevan su propio aviso; el Coloso se queda quieto mientras caen.
      setState(e, EnemyState.Windup, bossWarn(def.orbWarnSeconds));
      break;
    default:
      setState(e, EnemyState.Windup, bossWarn(1));
      break;
  }
}

/**
 * ¿El haz del barrido pasó por el punto (x, z) de radio `r` en este paso (entre `sweepPrev` y `sweepAngle`)?
 * Solo cuenta dentro del alcance. No mira las coberturas (eso lo hace quien llama).
 */
export function sweepCrosses(e: Enemy, def: ColosoDef, x: number, z: number, r: number): boolean {
  const dx = x - e.pos.x;
  const dz = z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > def.sweepRange + r || dist < 1e-6) return false;
  const angle = yawFromDir(dx, dz);
  const step = wrapAngle(e.sweepAngle - e.sweepPrev);
  const rel = wrapAngle(angle - e.sweepPrev);
  // Margen angular por el tamaño del objetivo.
  const tol = Math.atan2(r, dist);
  if (step >= 0) return rel >= -tol && rel <= step + tol;
  return rel <= tol && rel >= step - tol;
}
