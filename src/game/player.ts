/**
 * Chispa: movimiento en 8 direcciones relativo a la cámara, esquiva con invulnerabilidad breve,
 * vida y escudo que se regenera.
 */
import { damp, forwardInto, normalizeInto, rightInto, vec2, type Vec2 } from '../core/math';
import type { PlayerCommand } from '../core/input';
import type { Arena } from './arena';
import { moveCircle } from './collision';
import type { PlayerTuning } from './tuning';

export interface PlayerState {
  pos: Vec2;
  /** Posición al inicio del paso (para interpolar el render). */
  prev: Vec2;
  vel: Vec2;
  yaw: number;
  radius: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  /** Segundos desde el último daño recibido. */
  sinceDamage: number;
  dodgeTimer: number;
  dodgeCooldown: number;
  invulnTimer: number;
  dodgeDir: Vec2;
  aiming: boolean;
  alive: boolean;
  /** Barrera (habilidad): daño que aún puede absorber, su valor inicial y el tiempo que le queda. */
  barrier: number;
  barrierMax: number;
  barrierTimer: number;
}

export function createPlayer(x: number, z: number, yaw: number, tune: PlayerTuning): PlayerState {
  return {
    pos: vec2(x, z),
    prev: vec2(x, z),
    vel: vec2(),
    yaw: Number.isFinite(yaw) ? yaw : 0,
    radius: tune.radius,
    health: tune.maxHealth,
    maxHealth: tune.maxHealth,
    shield: tune.maxShield,
    maxShield: tune.maxShield,
    sinceDamage: 0,
    dodgeTimer: 0,
    dodgeCooldown: 0,
    invulnTimer: 0,
    dodgeDir: vec2(0, -1),
    aiming: false,
    alive: true,
    barrier: 0,
    barrierMax: 0,
    barrierTimer: 0,
  };
}

const fwd = vec2();
const right = vec2();
const wish = vec2();

/** Avanza al jugador un paso. Devuelve true si empezó una esquiva en este paso. */
export function updatePlayer(
  p: PlayerState,
  arena: Arena,
  cmd: PlayerCommand,
  dt: number,
  tune: PlayerTuning,
): boolean {
  p.prev.x = p.pos.x;
  p.prev.z = p.pos.z;
  if (!p.alive) {
    p.vel.x = 0;
    p.vel.z = 0;
    return false;
  }

  p.yaw = Number.isFinite(cmd.yaw) ? cmd.yaw : p.yaw;
  p.aiming = cmd.aim;
  p.dodgeTimer = Math.max(0, p.dodgeTimer - dt);
  p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
  p.invulnTimer = Math.max(0, p.invulnTimer - dt);

  // Dirección deseada en el mundo: relativa a la cámara y normalizada (la diagonal no es más rápida).
  forwardInto(fwd, p.yaw);
  rightInto(right, p.yaw);
  const mx = clampAxis(cmd.moveX);
  const mz = clampAxis(cmd.moveZ);
  normalizeInto(wish, right.x * mx + fwd.x * mz, right.z * mx + fwd.z * mz);
  const hasInput = wish.x !== 0 || wish.z !== 0;

  let dodged = false;
  if (cmd.dodge && p.dodgeCooldown <= 0 && p.dodgeTimer <= 0) {
    // Sin dirección pulsada, la esquiva va hacia delante.
    p.dodgeDir.x = hasInput ? wish.x : fwd.x;
    p.dodgeDir.z = hasInput ? wish.z : fwd.z;
    p.dodgeTimer = tune.dodge.duration;
    p.dodgeCooldown = tune.dodge.cooldown;
    p.invulnTimer = tune.dodge.invulnerability;
    dodged = true;
  }

  if (p.dodgeTimer > 0) {
    p.vel.x = p.dodgeDir.x * tune.dodge.speed;
    p.vel.z = p.dodgeDir.z * tune.dodge.speed;
  } else {
    const speed = tune.speed * (p.aiming ? tune.aimSpeedMultiplier : 1);
    p.vel.x = damp(p.vel.x, wish.x * speed, tune.acceleration, dt);
    p.vel.z = damp(p.vel.z, wish.z * speed, tune.acceleration, dt);
  }

  moveCircle(arena, p.pos, p.radius, p.vel.x * dt, p.vel.z * dt);

  // El escudo se regenera tras un tiempo sin recibir daño.
  p.sinceDamage += dt;
  if (p.sinceDamage >= tune.shieldRegenDelay && p.shield < p.maxShield) {
    p.shield = Math.min(p.maxShield, p.shield + tune.shieldRegenRate * dt);
  }
  return dodged;
}

function clampAxis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

/**
 * Aplica daño al jugador: primero la barrera (si hay), luego el escudo y por último la vida. Durante la invulnerabilidad de la esquiva no hace nada.
 * Devuelve el daño aplicado realmente.
 */
export function damagePlayer(p: PlayerState, amount: number, god: boolean): number {
  if (!p.alive || amount <= 0 || !Number.isFinite(amount)) return 0;
  if (god || p.invulnTimer > 0) return 0;
  let rest = amount;
  if (p.barrier > 0) {
    const byBarrier = Math.min(p.barrier, rest);
    p.barrier -= byBarrier;
    rest -= byBarrier;
    // La barrera absorbe el golpe entero: el escudo no deja de regenerarse por ello.
    if (rest <= 0) return amount;
  }
  p.sinceDamage = 0;
  const absorbed = Math.min(p.shield, rest);
  p.shield -= absorbed;
  rest -= absorbed;
  p.health = Math.max(0, p.health - rest);
  if (p.health <= 0) p.alive = false;
  return amount;
}
