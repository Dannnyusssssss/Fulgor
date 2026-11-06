/**
 * Oleadas por arena: presupuesto de puntos y composición (pesos, mínimos obligatorios y máximos por tipo).
 * El director gasta el presupuesto (multiplicado por la dificultad) eligiendo enemigos con el flujo de oleadas del RNG.
 * La oleada 10 es la más fuerte de cada arena (el jefe llega en el Hito 3).
 */
import type { EnemyKindName } from './enemies';

export type KindCounts = Partial<Record<EnemyKindName, number>>;

export interface WaveDef {
  budget: number;
  /** Probabilidad relativa de cada tipo al gastar el presupuesto que sobra tras los obligatorios. */
  weights: KindCounts;
  /** Enemigos que la oleada tiene sí o sí (presentan un tipo nuevo o le dan carácter). */
  required?: KindCounts;
  /** Máximo de cada tipo en la oleada. */
  max?: KindCounts;
}

const ALL: KindCounts = {
  zumbador: 1,
  centinela: 0.7,
  blindado: 0.3,
  reparador: 0.25,
  vigia: 0.35,
};

const HANGAR: readonly WaveDef[] = [
  { budget: 5, weights: { zumbador: 1 } },
  { budget: 8, weights: { zumbador: 1, centinela: 0.5 }, required: { centinela: 1 } },
  { budget: 10, weights: { zumbador: 1, centinela: 0.7 }, max: { centinela: 3 } },
  {
    budget: 12,
    weights: { zumbador: 1, centinela: 0.6, vigia: 0.3 },
    required: { vigia: 1 },
    max: { vigia: 2 },
  },
  {
    budget: 14,
    weights: { zumbador: 1, centinela: 0.6 },
    required: { blindado: 1 },
    max: { blindado: 1 },
  },
  {
    budget: 16,
    weights: { zumbador: 1, centinela: 0.7, vigia: 0.35, blindado: 0.25 },
    max: { blindado: 2, vigia: 2 },
  },
  {
    budget: 18,
    weights: { zumbador: 1, centinela: 0.6, blindado: 0.3 },
    required: { reparador: 1 },
    max: { reparador: 1, blindado: 2 },
  },
  { budget: 20, weights: ALL, max: { reparador: 1, blindado: 2, vigia: 3 } },
  { budget: 23, weights: ALL, max: { reparador: 2, blindado: 2, vigia: 3 } },
  {
    budget: 27,
    weights: ALL,
    required: { blindado: 2, reparador: 1 },
    max: { reparador: 2, blindado: 3, vigia: 3 },
  },
];

const FUNDICION: readonly WaveDef[] = [
  { budget: 7, weights: { zumbador: 1, centinela: 0.6 } },
  {
    budget: 9,
    weights: { zumbador: 1, centinela: 0.7 },
    required: { vigia: 1 },
    max: { vigia: 1 },
  },
  {
    budget: 12,
    weights: { zumbador: 1, centinela: 0.7, vigia: 0.3 },
    required: { blindado: 1 },
    max: { blindado: 1, vigia: 2 },
  },
  { budget: 14, weights: ALL, max: { reparador: 1, blindado: 1, vigia: 2 } },
  {
    budget: 16,
    weights: ALL,
    required: { reparador: 1 },
    max: { reparador: 1, blindado: 2, vigia: 2 },
  },
  { budget: 18, weights: ALL, max: { reparador: 1, blindado: 2, vigia: 3 } },
  {
    budget: 21,
    weights: ALL,
    required: { blindado: 2 },
    max: { reparador: 2, blindado: 3, vigia: 3 },
  },
  { budget: 23, weights: ALL, max: { reparador: 2, blindado: 3, vigia: 3 } },
  {
    budget: 26,
    weights: ALL,
    required: { vigia: 2 },
    max: { reparador: 2, blindado: 3, vigia: 4 },
  },
  {
    budget: 30,
    weights: ALL,
    required: { blindado: 2, reparador: 2 },
    max: { reparador: 2, blindado: 3, vigia: 4 },
  },
];

const JARDIN: readonly WaveDef[] = [
  {
    budget: 8,
    weights: { zumbador: 1, centinela: 0.5 },
    required: { blindado: 1 },
    max: { blindado: 1 },
  },
  { budget: 10, weights: { zumbador: 1, centinela: 0.6, vigia: 0.3 }, max: { vigia: 2 } },
  {
    budget: 13,
    weights: ALL,
    required: { reparador: 1 },
    max: { reparador: 1, blindado: 1, vigia: 2 },
  },
  { budget: 15, weights: ALL, max: { reparador: 1, blindado: 2, vigia: 2 } },
  {
    budget: 17,
    weights: ALL,
    required: { blindado: 2 },
    max: { reparador: 1, blindado: 2, vigia: 3 },
  },
  { budget: 20, weights: ALL, max: { reparador: 2, blindado: 2, vigia: 3 } },
  {
    budget: 23,
    weights: ALL,
    required: { vigia: 2 },
    max: { reparador: 2, blindado: 3, vigia: 3 },
  },
  { budget: 25, weights: ALL, max: { reparador: 2, blindado: 3, vigia: 4 } },
  {
    budget: 28,
    weights: ALL,
    required: { reparador: 2 },
    max: { reparador: 2, blindado: 3, vigia: 4 },
  },
  {
    budget: 32,
    weights: ALL,
    required: { blindado: 3, reparador: 2 },
    max: { reparador: 3, blindado: 4, vigia: 4 },
  },
];

export const WAVES: Readonly<Record<string, readonly WaveDef[]>> = {
  'hangar-cobalto': HANGAR,
  'fundicion-ambar': FUNDICION,
  'jardin-cristal': JARDIN,
};
