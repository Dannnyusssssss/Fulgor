/**
 * Sistema de enemigos: IA por tipo, daño de las embestidas, separación entre enemigos y hash espacial.
 */
import { BALANCE } from '../../data/balance';
import { resolveCircle } from '../collision';
import { GameEvent } from '../events';
import {
  dashLength,
  updateZumbador,
  ZumbadorFlag,
  type ZumbadorContext,
} from '../enemies/zumbador';
import { EnemyKind } from '../enemies/types';
import { damagePlayer } from '../player';
import type { World } from '../world';

/** Contexto de IA por mundo, creado una sola vez (no se crean objetos en cada paso). */
const contexts = new WeakMap<World, ZumbadorContext>();

function contextFor(world: World): ZumbadorContext {
  let ctx = contexts.get(world);
  if (ctx === undefined) {
    ctx = {
      arena: world.arena,
      nav: world.nav,
      player: world.player,
      combat: world.rng.combat,
      def: world.tuning.zumbador,
    };
    contexts.set(world, ctx);
  }
  return ctx;
}

export function updateEnemySystem(world: World, dt: number): void {
  const ctx = contextFor(world);
  for (const e of world.enemies.items) {
    if (!e.active) continue;
    if (e.kind === EnemyKind.Zumbador) {
      const flags = updateZumbador(e, ctx, dt);
      if (flags & ZumbadorFlag.TelegraphStarted) {
        world.events.emit(GameEvent.TelegraphStart, e.pos.x, e.pos.z, e.index, dashLength(ctx.def));
      }
      if (flags & ZumbadorFlag.HitPlayer) {
        const dmg = ctx.def.dashDamage * BALANCE.difficulty.damageTakenMultiplier;
        if (damagePlayer(world.player, dmg, world.god) > 0) {
          e.dashHit = true;
          world.events.emit(
            GameEvent.PlayerHit,
            world.player.pos.x,
            world.player.pos.z,
            dmg,
            e.index,
          );
        }
      }
    }
  }
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
    const n = world.enemyHash.query(a.pos.x, a.pos.z, a.radius * 2, out);
    for (let i = 0; i < n; i++) {
      const b = items[out[i] ?? 0];
      if (b === undefined || !b.active || b.index <= a.index) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const rs = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rs * rs) continue;
      const d = Math.sqrt(d2);
      // Centros coincidentes: separación fija según el índice (determinista).
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
