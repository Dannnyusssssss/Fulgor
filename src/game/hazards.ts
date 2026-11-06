/**
 * Peligros de energía con ciclo fijo y lento: apagado → aviso → activo. Solo dañan mientras están activos.
 * El aviso siempre precede a la activación y el ciclo nunca baja del mínimo de fotosensibilidad.
 */
import type { HazardDef } from '../data/arenas';

export const HazardPhase = {
  Off: 0,
  Warn: 1,
  Active: 2,
} as const;
export type HazardPhaseId = (typeof HazardPhase)[keyof typeof HazardPhase];

export function hazardCycle(def: HazardDef): number {
  return def.offSeconds + def.warnSeconds + def.activeSeconds;
}

/** Tiempo dentro del ciclo, en [0, ciclo). */
function cycleTime(def: HazardDef, time: number): number {
  const cycle = hazardCycle(def);
  if (cycle <= 0) return 0;
  const t = (time + def.offsetSeconds) % cycle;
  return t < 0 ? t + cycle : t;
}

export function hazardPhaseAt(def: HazardDef, time: number): HazardPhaseId {
  const t = cycleTime(def, time);
  if (t < def.offSeconds) return HazardPhase.Off;
  if (t < def.offSeconds + def.warnSeconds) return HazardPhase.Warn;
  return HazardPhase.Active;
}

/** Progreso [0, 1] dentro de la fase actual (para que el aviso se intensifique sin parpadear). */
export function hazardProgressAt(def: HazardDef, time: number): number {
  const t = cycleTime(def, time);
  if (t < def.offSeconds) return def.offSeconds > 0 ? t / def.offSeconds : 1;
  if (t < def.offSeconds + def.warnSeconds) {
    return def.warnSeconds > 0 ? (t - def.offSeconds) / def.warnSeconds : 1;
  }
  const a = t - def.offSeconds - def.warnSeconds;
  return def.activeSeconds > 0 ? a / def.activeSeconds : 1;
}

/** ¿El punto está dentro del peligro (reducido `inset` metros por cada lado)? */
export function insideHazard(def: HazardDef, x: number, z: number, inset = 0): boolean {
  const hw = def.width / 2 - inset;
  const hd = def.depth / 2 - inset;
  return Math.abs(x - def.x) <= hw && Math.abs(z - def.z) <= hd;
}
