/**
 * Arenas como datos tipados. Coordenadas en metros sobre el plano (x, z), con el origen en el centro de la arena.
 * El orden de ARENAS es el orden de desbloqueo.
 */
export type CoverDef =
  | { kind: 'box'; x: number; z: number; width: number; depth: number; height: number }
  | {
      kind: 'pillar';
      x: number;
      z: number;
      radius: number;
      height: number;
      /** Aspecto: columna normal o cristal (la colisión es la misma). */
      style?: 'column' | 'crystal';
    };

export interface SpawnPoint {
  x: number;
  z: number;
}

/**
 * Peligro de energía rectangular con ciclo fijo: apagado → aviso → activo → apagado…
 * El ciclo completo dura al menos BALANCE.hazards.minCycleSeconds y el aviso al menos minWarnSeconds.
 */
export interface HazardDef {
  x: number;
  z: number;
  width: number;
  depth: number;
  offSeconds: number;
  warnSeconds: number;
  activeSeconds: number;
  /** Desfase dentro del ciclo, para que no se activen todos a la vez. */
  offsetSeconds: number;
  damagePerSecond: number;
}

export interface ArenaPalette {
  background: number;
  fog: number;
  floor: number;
  grid: number;
  wall: number;
  wallTrim: number;
  cover: number;
  coverTrim: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  hazard: number;
}

export interface ArenaDef {
  id: string;
  /** Ancho (eje x) y fondo (eje z) del área jugable, entre las caras interiores de las paredes. */
  width: number;
  depth: number;
  wallThickness: number;
  wallHeight: number;
  covers: readonly CoverDef[];
  hazards: readonly HazardDef[];
  playerSpawn: { x: number; z: number; yaw: number };
  enemySpawns: readonly SpawnPoint[];
  /** Dónde puede aparecer el Coloso (se elige el más lejano al jugador). Caben su radio y un margen. */
  bossSpawns: readonly SpawnPoint[];
  /** Puntos donde aparecen objetos de vez en cuando. */
  pickupPoints: readonly SpawnPoint[];
  palette: ArenaPalette;
  fogNear: number;
  fogFar: number;
}

export const HANGAR_COBALTO: ArenaDef = {
  id: 'hangar-cobalto',
  width: 36,
  depth: 36,
  wallThickness: 1,
  wallHeight: 5,
  covers: [
    // Cajas bajas en las cuatro diagonales: cobertura para el jugador.
    { kind: 'box', x: -8, z: -8, width: 4, depth: 1.2, height: 1.4 },
    { kind: 'box', x: 8, z: 8, width: 4, depth: 1.2, height: 1.4 },
    { kind: 'box', x: -8, z: 8, width: 1.2, depth: 4, height: 1.4 },
    { kind: 'box', x: 8, z: -8, width: 1.2, depth: 4, height: 1.4 },
    // Bloques junto a las paredes.
    { kind: 'box', x: -13, z: 0, width: 1.5, depth: 5, height: 1.4 },
    { kind: 'box', x: 13, z: 0, width: 1.5, depth: 5, height: 1.4 },
    { kind: 'box', x: 0, z: -13, width: 5, depth: 1.5, height: 1.4 },
    { kind: 'box', x: 0, z: 13, width: 5, depth: 1.5, height: 1.4 },
    // Columnas altas cerca del centro (tapan la cámara y la línea de visión).
    { kind: 'pillar', x: -4.5, z: 0, radius: 0.9, height: 5 },
    { kind: 'pillar', x: 4.5, z: 0, radius: 0.9, height: 5 },
  ],
  hazards: [],
  playerSpawn: { x: 0, z: 4, yaw: 0 },
  enemySpawns: [
    { x: -15, z: -15 },
    { x: 15, z: -15 },
    { x: -15, z: 15 },
    { x: 15, z: 15 },
    { x: -16, z: -4 },
    { x: 16, z: 4 },
  ],
  bossSpawns: [
    { x: 0, z: -9 },
    { x: 0, z: 9 },
  ],
  pickupPoints: [
    { x: 0, z: -4 },
    { x: -12, z: -12 },
    { x: 12, z: 12 },
    { x: 0, z: 10 },
  ],
  palette: {
    background: 0x05070f,
    fog: 0x070b1a,
    floor: 0x0b1226,
    grid: 0x2f6bff,
    wall: 0x111a33,
    wallTrim: 0x3fa9ff,
    cover: 0x18223f,
    coverTrim: 0x5fd4ff,
    hemiSky: 0x3a5cff,
    hemiGround: 0x0a0d18,
    sun: 0xc8d8ff,
    hazard: 0xff3b6b,
  },
  fogNear: 18,
  fogFar: 60,
};

/** Ciclo de los campos de energía de la Fundición: 3 s apagado, 1,2 s de aviso, 2 s activo. */
const FORGE_CYCLE = { offSeconds: 3, warnSeconds: 1.2, activeSeconds: 2, damagePerSecond: 14 };

export const FUNDICION_AMBAR: ArenaDef = {
  id: 'fundicion-ambar',
  width: 40,
  depth: 32,
  wallThickness: 1,
  wallHeight: 5,
  covers: [
    { kind: 'box', x: -10, z: -6, width: 3, depth: 1.4, height: 1.4 },
    { kind: 'box', x: 10, z: 6, width: 3, depth: 1.4, height: 1.4 },
    { kind: 'box', x: -10, z: 6, width: 1.4, depth: 3, height: 1.4 },
    { kind: 'box', x: 10, z: -6, width: 1.4, depth: 3, height: 1.4 },
    // Horno central: alto, tapa la visión.
    { kind: 'box', x: 0, z: -2, width: 4, depth: 3, height: 3 },
    { kind: 'pillar', x: -16, z: -10, radius: 0.8, height: 5 },
    { kind: 'pillar', x: 16, z: -10, radius: 0.8, height: 5 },
    { kind: 'pillar', x: -16, z: 10, radius: 0.8, height: 5 },
    { kind: 'pillar', x: 16, z: 10, radius: 0.8, height: 5 },
  ],
  hazards: [
    { x: -5, z: 2, width: 2.5, depth: 10, offsetSeconds: 0, ...FORGE_CYCLE },
    { x: 5, z: 2, width: 2.5, depth: 10, offsetSeconds: 3.1, ...FORGE_CYCLE },
    { x: 0, z: -11, width: 12, depth: 2.5, offsetSeconds: 1.5, ...FORGE_CYCLE },
    { x: 0, z: 12, width: 12, depth: 2.5, offsetSeconds: 4.6, ...FORGE_CYCLE },
  ],
  playerSpawn: { x: 0, z: 6, yaw: 0 },
  enemySpawns: [
    { x: -18, z: -14 },
    { x: 18, z: -14 },
    { x: -18, z: 14 },
    { x: 18, z: 14 },
    { x: -18.5, z: 0 },
    { x: 18.5, z: 0 },
  ],
  bossSpawns: [
    { x: -13, z: 0 },
    { x: 13, z: 0 },
  ],
  pickupPoints: [
    { x: -13, z: 0 },
    { x: 13, z: 0 },
    { x: 0, z: -14.5 },
    { x: 0, z: 15 },
  ],
  palette: {
    background: 0x0d0703,
    fog: 0x1a0d05,
    floor: 0x1a1008,
    grid: 0xff9a2e,
    wall: 0x2a170a,
    wallTrim: 0xffb347,
    cover: 0x33200f,
    coverTrim: 0xffc46b,
    hemiSky: 0xff9a40,
    hemiGround: 0x120a05,
    sun: 0xffd8b0,
    hazard: 0xff3b6b,
  },
  fogNear: 18,
  fogFar: 62,
};

export const JARDIN_CRISTAL: ArenaDef = {
  id: 'jardin-cristal',
  width: 34,
  depth: 34,
  wallThickness: 1,
  wallHeight: 5,
  covers: [
    // Muros en molinete: pasillos y recodos.
    { kind: 'box', x: -9, z: -5, width: 8, depth: 1, height: 3 },
    { kind: 'box', x: 9, z: 5, width: 8, depth: 1, height: 3 },
    { kind: 'box', x: -5, z: 9, width: 1, depth: 8, height: 3 },
    { kind: 'box', x: 5, z: -9, width: 1, depth: 8, height: 3 },
    // Recovecos en las esquinas.
    { kind: 'box', x: -12, z: -12, width: 4, depth: 1, height: 3 },
    { kind: 'box', x: 12, z: 12, width: 4, depth: 1, height: 3 },
    { kind: 'box', x: -12, z: 12, width: 1, depth: 4, height: 3 },
    { kind: 'box', x: 12, z: -12, width: 1, depth: 4, height: 3 },
    // Cristales.
    { kind: 'pillar', x: -2.5, z: -2.5, radius: 0.7, height: 3.5, style: 'crystal' },
    { kind: 'pillar', x: 2.8, z: -2.8, radius: 0.6, height: 3.5, style: 'crystal' },
    { kind: 'pillar', x: -8, z: 2, radius: 0.8, height: 3.5, style: 'crystal' },
    { kind: 'pillar', x: 8, z: -2, radius: 0.8, height: 3.5, style: 'crystal' },
    { kind: 'pillar', x: 2, z: 10, radius: 0.6, height: 3.5, style: 'crystal' },
    { kind: 'pillar', x: -2, z: -10, radius: 0.6, height: 3.5, style: 'crystal' },
    { kind: 'pillar', x: 14, z: 0, radius: 0.7, height: 3.5, style: 'crystal' },
    { kind: 'pillar', x: -14, z: 0, radius: 0.7, height: 3.5, style: 'crystal' },
  ],
  hazards: [],
  playerSpawn: { x: 0, z: 2, yaw: 0 },
  enemySpawns: [
    { x: -15, z: -6 },
    { x: 15, z: 6 },
    { x: -6, z: 15 },
    { x: 6, z: -15 },
    { x: -15, z: 15 },
    { x: 15, z: -15 },
  ],
  bossSpawns: [
    { x: -9.5, z: 9 },
    { x: 9.5, z: -9 },
  ],
  pickupPoints: [
    { x: -9, z: 0 },
    { x: 9, z: 0 },
    { x: 0, z: -8 },
    { x: 0, z: 8 },
  ],
  palette: {
    background: 0x04090c,
    fog: 0x061418,
    floor: 0x07161a,
    grid: 0x2fe0c8,
    wall: 0x0d1f26,
    wallTrim: 0x7affe8,
    cover: 0x1a1033,
    coverTrim: 0xc58bff,
    hemiSky: 0x5fd8ff,
    hemiGround: 0x06080e,
    sun: 0xd0f4ff,
    hazard: 0xff3b6b,
  },
  fogNear: 16,
  fogFar: 55,
};

export const ARENAS: readonly ArenaDef[] = [HANGAR_COBALTO, FUNDICION_AMBAR, JARDIN_CRISTAL];

export function arenaById(id: string): ArenaDef | undefined {
  return ARENAS.find((a) => a.id === id);
}
