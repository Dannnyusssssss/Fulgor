/**
 * Sistema de enemigos: IA por tipo y efectos de sus ataques (embestida, proyectil, onda y rayo),
 * separación entre enemigos y hash espacial.
 */
import { distSq, segmentCircleT } from '../../core/math';
import { BALANCE } from '../../data/balance';
import { resolveCircle, sweepObstacles } from '../collision';
import { inFrontArc, updateBlindado } from '../enemies/blindado';
import { updateCentinela } from '../enemies/centinela';
import { EnemyFlag, type EnemyContext } from '../enemies/common';
import { updateReparador } from '../enemies/reparador';
import { EnemyKind, type Enemy } from '../enemies/types';
import { updateVigia } from '../enemies/vigia';
import { dashLength, updateZumbador } from '../enemies/zumbador';
import { GameEvent } from '../events';
import { Team } from '../projectiles';
import type { World } from '../world';
import { hurtPlayer } from './damage';

/** Contexto de IA por mundo, creado una sola vez (no se crean objetos en cada paso). */
const contexts = new WeakMap<World, EnemyContext>();

function contextFor(world: World): EnemyContext {
  let ctx = contexts.get(world);
  if (ctx === undefined) {
    ctx = {
      arena: world.arena,
      navSmall: world.navSmall,
      navLarge: world.navLarge,
      player: world.player,
      combat: world.rng.combat,
      tuning: world.tuning,
      enemies: world.enemies.items,
    };
    contexts.set(world, ctx);
  }
  return ctx;
}

function runAi(e: Enemy, ctx: EnemyContext, dt: number): number {
  switch (e.kind) {
    case EnemyKind.Zumbador:
      return updateZumbador(e, ctx, dt);
    case EnemyKind.Centinela:
      return updateCentinela(e, ctx, dt);
    case EnemyKind.Blindado:
      return updateBlindado(e, ctx, dt);
    case EnemyKind.Reparador:
      return updateReparador(e, ctx, dt);
    case EnemyKind.Vigia:
      return updateVigia(e, ctx, dt);
    default:
      return 0;
  }
}

export function updateEnemySystem(world: World, dt: number): void {
  const ctx = contextFor(world);
  const t = world.tuning;
  for (const e of world.enemies.items) {
    if (!e.active) continue;
    const flags = runAi(e, ctx, dt);
    if (flags === 0) continue;

    if (flags & EnemyFlag.TelegraphStarted) {
      const len = e.kind === EnemyKind.Zumbador ? dashLength(t.zumbador) : 0;
      world.events.emit(GameEvent.TelegraphStart, e.pos.x, e.pos.z, e.index, e.kind, len);
    }
    if (flags & EnemyFlag.HitPlayer) {
      if (hurtPlayer(world, t.zumbador.dashDamage, e.index) > 0) e.dashHit = true;
    }
    if (flags & EnemyFlag.Fire) fireEnemyProjectile(world, e);
    if (flags & EnemyFlag.Shockwave) shockwave(world, e);
    if (flags & EnemyFlag.Beam) beam(world, e);
  }
}

/** Proyectil del Centinela: sale del cañón en la dirección fijada durante el aviso. */
function fireEnemyProjectile(world: World, e: Enemy): void {
  const def = world.tuning.centinela;
  const p = world.projectiles.acquire();
  if (p === null) return;
  p.team = Team.Enemy;
  p.x = e.pos.x;
  p.z = e.pos.z;
  p.prevX = p.x;
  p.prevZ = p.z;
  p.vx = e.dir.x * def.projectileSpeed;
  p.vz = e.dir.z * def.projectileSpeed;
  p.radius = def.projectileRadius;
  p.damage = def.projectileDamage;
  p.remaining = def.projectileRange;
  world.events.emit(GameEvent.EnemyFire, e.pos.x, e.pos.z, e.index);
}

/** Onda del Blindado: daña si el jugador está dentro del semicírculo avisado y no lo tapa una cobertura. */
function shockwave(world: World, e: Enemy): void {
  const def = world.tuning.blindado;
  const pl = world.player;
  world.events.emit(
    GameEvent.Shockwave,
    e.pos.x,
    e.pos.z,
    e.dir.x,
    e.dir.z,
    def.attackRange,
    def.attackHalfAngle,
  );
  const reach = def.attackRange + pl.radius;
  if (!pl.alive || distSq(e.pos.x, e.pos.z, pl.pos.x, pl.pos.z) > reach * reach) return;
  if (!inFrontArc(e, pl.pos.x, pl.pos.z, def.attackHalfAngle)) return;
  if (sweepObstacles(world.arena, e.pos.x, e.pos.z, pl.pos.x, pl.pos.z, 0.05) >= 0) return;
  hurtPlayer(world, def.attackDamage, e.index);
}

/** Rayo del Vigía: instantáneo a lo largo de la línea fijada, hasta la primera pared o cobertura. */
function beam(world: World, e: Enemy): void {
  const def = world.tuning.vigia;
  const pl = world.player;
  const bx = e.pos.x + e.dir.x * def.range;
  const bz = e.pos.z + e.dir.z * def.range;
  const wallT = sweepObstacles(world.arena, e.pos.x, e.pos.z, bx, bz, 0.05);
  const len = (wallT >= 0 ? wallT : 1) * def.range;
  world.events.emit(GameEvent.BeamFire, e.pos.x, e.pos.z, e.dir.x, e.dir.z, len);
  if (!pl.alive) return;
  const t = segmentCircleT(e.pos.x, e.pos.z, bx, bz, pl.pos.x, pl.pos.z, pl.radius);
  if (t >= 0 && (wallT < 0 || t <= wallT)) hurtPlayer(world, def.beamDamage, e.index);
}

export function rebuildEnemyHash(world: World): void {
  const hash = world.enemyHash;
  hash.clear();
  for (const e of world.enemies.items) {
    if (e.active) hash.insert(e.index, e.pos.x, e.pos.z, e.radius);
  }
}

/** Empuja a los enemigos que se solapan para que no se apilen (cada par una vez, en orden de índice). */
export function separateEnemies(world: World, dt: number): void {
  const items = world.enemies.items;
  const out = world.scratch;
  const strength = Math.min(1, BALANCE.separation.strength * dt);
  for (const a of items) {
    if (!a.active) continue;
    const n = world.enemyHash.query(a.pos.x, a.pos.z, a.radius * 2 + 0.5, out);
    for (let i = 0; i < n; i++) {
      const b = items[out[i] ?? 0];
      if (b === undefined || !b.active || b.index <= a.index) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const rs = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rs * rs) continue;
      const d = Math.sqrt(d2);
      // Centros coincidentes: separación fija (determinista).
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const push = (rs - d) * 0.5 * strength;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
    }
  }
  // Los enemigos tampoco se meten dentro de Chispa: solo se mueve el enemigo.
  const pl = world.player;
  for (const e of items) {
    if (!e.active) continue;
    const dx = e.pos.x - pl.pos.x;
    const dz = e.pos.z - pl.pos.z;
    const rs = e.radius + pl.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rs * rs) {
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      e.pos.x = pl.pos.x + nx * rs;
      e.pos.z = pl.pos.z + nz * rs;
    }
    // La separación no puede meter a nadie en una pared.
    resolveCircle(world.arena, e.pos, e.radius);
  }
}
