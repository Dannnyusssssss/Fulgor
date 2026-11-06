/**
 * Arenas como datos tipados. Coordenadas en metros sobre el plano (x, z), con el origen en el centro de la arena.
 */
export type CoverDef =
  | { kind: 'box'; x: number; z: number; width: number; depth: number; height: number }
  | { kind: 'pillar'; x: number; z: number; radius: number; height: number };

export interface SpawnPoint {
  x: number;
  z: number;
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
}

export interface ArenaDef {
  id: string;
  /** Ancho (eje x) y fondo (eje z) del área jugable, entre las caras interiores de las paredes. */
  width: number;
  depth: number;
  wallThickness: number;
  wallHeight: number;
  covers: readonly CoverDef[];
  playerSpawn: { x: number; z: number; yaw: number };
  enemySpawns: readonly SpawnPoint[];
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
  playerSpawn: { x: 0, z: 4, yaw: 0 },
  enemySpawns: [
    { x: -15, z: -15 },
    { x: 15, z: -15 },
    { x: -15, z: 15 },
    { x: 15, z: 15 },
    { x: -16, z: -4 },
    { x: 16, z: 4 },
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
  },
  fogNear: 18,
  fogFar: 60,
};

export const ARENAS: readonly ArenaDef[] = [HANGAR_COBALTO];
