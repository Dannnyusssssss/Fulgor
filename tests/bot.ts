/**
 * Jugador automático simple para los tests de superabilidad. No hace trampas: solo produce órdenes
 * (moverse, girar, disparar, esquivar, ventilar) a partir del estado visible del mundo.
 *
 * Estrategia: prioriza al Reparador y a quien esté avisando un ataque; dispara con adelanto; mantiene la distancia;
 * esquiva cuando una embestida, un rayo fijado, una onda o un proyectil lo van a alcanzar; sale de los peligros;
 * ventila al calentarse; busca objetos cuando le falta vida.
 */
import type { PlayerCommand } from '../src/core/input';
import {
  forwardInto,
  normalizeInto,
  rightInto,
  vec2,
  wrapAngle,
  yawFromDir,
} from '../src/core/math';
import { BALANCE } from '../src/data/balance';
import { sweepObstacles } from '../src/game/collision';
import { NavField } from '../src/game/nav';
import { inFrontArc } from '../src/game/enemies/blindado';
import { EnemyKind, EnemyState, isDamageable, type Enemy } from '../src/game/enemies/types';
import { dashLength } from '../src/game/enemies/zumbador';
import { HazardPhase, hazardPhaseAt, insideHazard } from '../src/game/hazards';
import { PickupType } from '../src/game/pickups';
import { Team } from '../src/game/projectiles';
import type { World } from '../src/game/world';

const fwd = vec2();
const right = vec2();
const dir = vec2();
const seek = vec2();

/** Mapa de distancias propio del bot hacia el enemigo que busca (para rodear coberturas). */
const botNavs = new WeakMap<World, { nav: NavField; tick: number }>();

function seekDirection(
  world: World,
  tx: number,
  tz: number,
  out: { x: number; z: number },
): boolean {
  let entry = botNavs.get(world);
  if (!entry) {
    entry = {
      nav: new NavField(world.arena, BALANCE.nav.cellSize, world.player.radius + 0.05),
      tick: -999,
    };
    botNavs.set(world, entry);
  }
  if (world.tick - entry.tick >= 20) {
    entry.nav.recompute(tx, tz);
    entry.tick = world.tick;
  }
  return entry.nav.direction(world.player.pos.x, world.player.pos.z, out);
}

/** Distancia perpendicular de (px, pz) a la semirrecta que sale de (ax, az) en dirección (dx, dz); Infinity si queda detrás o más allá. */
function lineDistance(
  ax: number,
  az: number,
  dx: number,
  dz: number,
  len: number,
  px: number,
  pz: number,
): number {
  const vx = px - ax;
  const vz = pz - az;
  const along = vx * dx + vz * dz;
  if (along < -0.5 || along > len + 1) return Infinity;
  return Math.abs(vx * dz - vz * dx);
}

export function botCommand(world: World, out: PlayerCommand): PlayerCommand {
  const p = world.player;
  const t = world.tuning;
  const px = p.pos.x;
  const pz = p.pos.z;
  let mx = 0;
  let mz = 0;
  let dodge = false;
  let dodgeX = 0;
  let dodgeZ = 0;
  let target: Enemy | null = null;
  let bestScore = Infinity;

  // Dirección del ataque más urgente; el lado de la esquiva se decide al final.
  const threat = (dx: number, dz: number): void => {
    dodge = true;
    dodgeX = dx;
    dodgeZ = dz;
  };

  for (const e of world.enemies.items) {
    if (!e.active) continue;
    const ex = e.pos.x - px;
    const ez = e.pos.z - pz;
    const d = Math.hypot(ex, ez) || 0.001;

    // Repulsión: mantener distancia según el tipo.
    const keep = e.kind === EnemyKind.Blindado ? 2.6 : e.kind === EnemyKind.Zumbador ? 7 : 5;
    if (d < keep && e.state !== EnemyState.Materializing) {
      const w = (keep - d) / keep;
      mx -= (ex / d) * w * 2;
      mz -= (ez / d) * w * 2;
    }

    // Amenazas inminentes.
    if (
      e.kind === EnemyKind.Zumbador &&
      (e.state === EnemyState.Windup || e.state === EnemyState.Dash)
    ) {
      const ld = lineDistance(e.pos.x, e.pos.z, e.dir.x, e.dir.z, dashLength(t.zumbador), px, pz);
      if (ld < e.radius + p.radius + 0.6) {
        if (e.state === EnemyState.Dash || e.stateTimer < 0.18) threat(e.dir.x, e.dir.z);
        mx += -e.dir.z;
        mz += e.dir.x;
      }
    }
    if (
      e.kind === EnemyKind.Vigia &&
      (e.state === EnemyState.Windup || e.state === EnemyState.Track)
    ) {
      const ld = lineDistance(e.pos.x, e.pos.z, e.dir.x, e.dir.z, t.vigia.range, px, pz);
      if (ld < p.radius + 0.8) {
        if (e.state === EnemyState.Windup && e.stateTimer < 0.15) threat(e.dir.x, e.dir.z);
        mx += -e.dir.z * 1.5;
        mz += e.dir.x * 1.5;
      }
    }
    if (e.kind === EnemyKind.Blindado && e.state === EnemyState.Windup) {
      if (
        d < t.blindado.attackRange + p.radius + 0.8 &&
        inFrontArc(e, px, pz, t.blindado.attackHalfAngle)
      ) {
        mx -= (ex / d) * 3;
        mz -= (ez / d) * 3;
        if (e.stateTimer < 0.15) threat(-ex / d, -ez / d);
      }
    }

    // Objetivo: el Reparador primero; luego quien avisa; los Blindados de frente cuentan menos.
    if (!isDamageable(e)) continue;
    if (sweepObstacles(world.arena, px, pz, e.pos.x, e.pos.z, t.weapon.projectileRadius) >= 0)
      continue;
    let score = d;
    if (e.kind === EnemyKind.Reparador) score -= 25;
    if (e.state === EnemyState.Windup || e.state === EnemyState.Track) score -= 6;
    if (e.kind === EnemyKind.Blindado && inFrontArc(e, px, pz, t.blindado.shieldHalfAngle))
      score += 18;
    if (score < bestScore) {
      bestScore = score;
      target = e;
    }
  }

  // Proyectiles enemigos que se acercan.
  for (const pr of world.projectiles.items) {
    if (!pr.active || pr.team !== Team.Enemy) continue;
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const ld = lineDistance(pr.x, pr.z, pr.vx / sp, pr.vz / sp, sp * 0.5, px, pz);
    if (ld < p.radius + pr.radius + 0.5) {
      const dist = Math.hypot(pr.x - px, pr.z - pz);
      if (dist < 2.2) threat(pr.vx / sp, pr.vz / sp);
      mx += (-pr.vz / sp) * 1.5;
      mz += (pr.vx / sp) * 1.5;
    }
  }

  // Peligros: salir si está activo o avisando.
  for (const h of world.arena.def.hazards) {
    const ph = hazardPhaseAt(h, world.time);
    if (ph === HazardPhase.Off) continue;
    if (insideHazard(h, px, pz, -p.radius - 0.6)) {
      // Salir por el lado más cercano.
      const dxL = px - (h.x - h.width / 2);
      const dxR = h.x + h.width / 2 - px;
      const dzT = pz - (h.z - h.depth / 2);
      const dzB = h.z + h.depth / 2 - pz;
      const m = Math.min(dxL, dxR, dzT, dzB);
      const k = 4;
      if (m === dxL) mx -= k;
      else if (m === dxR) mx += k;
      else if (m === dzT) mz -= k;
      else mz += k;
    }
  }

  // Objetos: ir a buscarlos si falta vida/escudo o el arma está muy caliente.
  const wantHealth = p.health < p.maxHealth * 0.7;
  for (const pk of world.pickups.items) {
    if (!pk.active) continue;
    const useful =
      (pk.type === PickupType.Health && wantHealth) ||
      (pk.type === PickupType.Shield && p.shield < p.maxShield * 0.5) ||
      (pk.type === PickupType.Coolant && world.weapon.overheated);
    if (!useful) continue;
    const dx = pk.x - px;
    const dz = pk.z - pz;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 14) {
      mx += (dx / d) * 1.2;
      mz += (dz / d) * 1.2;
    }
  }

  // Alejarse de las paredes exteriores para no quedar acorralado.
  const inner = world.arena.inner;
  const margin = 3;
  if (px - inner.minX < margin) mx += (margin - (px - inner.minX)) * 0.6;
  if (inner.maxX - px < margin) mx -= (margin - (inner.maxX - px)) * 0.6;
  if (pz - inner.minZ < margin) mz += (margin - (pz - inner.minZ)) * 0.6;
  if (inner.maxZ - pz < margin) mz -= (margin - (inner.maxZ - pz)) * 0.6;

  // Blindado de frente como mejor objetivo: ir a un punto detrás de él para dispararle por la espalda.
  const flanking =
    target !== null &&
    target.kind === EnemyKind.Blindado &&
    inFrontArc(target, px, pz, t.blindado.shieldHalfAngle);
  if (flanking && target !== null) {
    forwardInto(fwd, target.yaw);
    const gx = target.pos.x - fwd.x * 4;
    const gz = target.pos.z - fwd.z * 4;
    if (seekDirection(world, gx, gz, seek)) {
      mx += seek.x * 3;
      mz += seek.z * 3;
    } else {
      const d = Math.hypot(gx - px, gz - pz) || 1;
      mx += ((gx - px) / d) * 3;
      mz += ((gz - pz) / d) * 3;
    }
  } else if (target !== null) {
    // Rodear al objetivo despacio.
    const ex = target.pos.x - px;
    const ez = target.pos.z - pz;
    const d = Math.hypot(ex, ez) || 1;
    const orbit = 0.5;
    mx += (-ez / d) * orbit;
    mz += (ex / d) * orbit;
    if (d > 12) {
      mx += (ex / d) * 0.8;
      mz += (ez / d) * 0.8;
    }
  } else {
    // Nadie a tiro: ir a buscar al enemigo más cercano (o volver al centro si no queda ninguno).
    let sx = -px * 0.05;
    let sz = -pz * 0.05;
    let best = Infinity;
    let goal: Enemy | null = null;
    for (const e of world.enemies.items) {
      if (!e.active || e.state === EnemyState.Materializing) continue;
      const d = Math.hypot(e.pos.x - px, e.pos.z - pz);
      if (d < best) {
        best = d;
        goal = e;
      }
    }
    if (goal !== null) {
      if (seekDirection(world, goal.pos.x, goal.pos.z, seek)) {
        sx = seek.x * 2;
        sz = seek.z * 2;
      } else {
        sx = (goal.pos.x - px) / (best || 1);
        sz = (goal.pos.z - pz) / (best || 1);
      }
    }
    mx += sx;
    mz += sz;
  }

  // Apuntar con adelanto.
  let yaw = p.yaw;
  if (target !== null) {
    const ex = target.pos.x - px;
    const ez = target.pos.z - pz;
    const lead = Math.hypot(ex, ez) / t.weapon.projectileSpeed;
    yaw = yawFromDir(ex + target.vel.x * lead, ez + target.vel.z * lead);
  }

  // Órdenes en el marco de la cámara (yaw).
  forwardInto(fwd, yaw);
  rightInto(right, yaw);
  normalizeInto(dir, mx, mz);
  out.yaw = yaw;
  out.moveX = dir.x * right.x + dir.z * right.z;
  out.moveZ = dir.x * fwd.x + dir.z * fwd.z;
  const w = world.weapon;
  const aimed = target !== null && Math.abs(wrapAngle(yaw - p.yaw)) < 0.6;
  out.fire = aimed && !w.overheated && w.heat < t.weapon.maxHeat - t.weapon.heatPerShot * 1.5;
  out.vent = w.heat > t.weapon.maxHeat * 0.75 && w.ventCooldown <= 0;
  out.aim = false;
  out.dodge = false;
  if (dodge && p.dodgeCooldown <= 0) {
    // Esquivar perpendicular al ataque, hacia el lado al que ya quería moverse.
    const ax = dodgeX;
    const az = dodgeZ;
    const side = -az * mx + ax * mz >= 0 ? 1 : -1;
    dodgeX = -az * side;
    dodgeZ = ax * side;
    out.dodge = true;
    out.moveX = dodgeX * right.x + dodgeZ * right.z;
    out.moveZ = dodgeX * fwd.x + dodgeZ * fwd.z;
  }
  return out;
}
