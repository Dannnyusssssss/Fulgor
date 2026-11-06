/**
 * Generador pseudoaleatorio con semilla (sfc32) y flujos derivados.
 * Cada flujo (oleadas, mejoras, combate) tiene su propia secuencia, así lo que hace el jugador
 * en combate no cambia lo que sale en la siguiente oleada.
 */

/** Mezcla de 32 bits (splitmix32) para repartir bien semillas parecidas. */
function splitmix32(value: number): number {
  let z = (value + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/** Hash FNV-1a de un texto, para derivar flujos por nombre. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Devuelve la semilla de un flujo a partir de la semilla de la partida y el nombre del flujo. */
export function deriveSeed(seed: number, stream: string): number {
  return splitmix32((seed >>> 0) ^ hashString(stream));
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = splitmix32(seed);
    this.b = splitmix32(this.a);
    this.c = splitmix32(this.b);
    this.d = 1;
    // Descarta los primeros valores para alejarse del estado inicial.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  /** Entero sin signo de 32 bits. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Número en [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Número en [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entero en [min, max] (ambos incluidos). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Estado interno, para comparar en los tests de determinismo. */
  getState(): [number, number, number, number] {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }
}

export interface RngStreams {
  /** Composición y aparición de oleadas. */
  readonly waves: Rng;
  /** Ofertas de mejoras (Hito 3). */
  readonly perks: Rng;
  /** Variaciones de combate (tiempos de IA, etc.). */
  readonly combat: Rng;
}

export function createStreams(seed: number): RngStreams {
  return {
    waves: new Rng(deriveSeed(seed, 'waves')),
    perks: new Rng(deriveSeed(seed, 'perks')),
    combat: new Rng(deriveSeed(seed, 'combat')),
  };
}
