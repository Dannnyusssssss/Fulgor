/**
 * Síntesis de los efectos de sonido con WebAudio (osciladores, ruido y envolventes). Sin archivos externos.
 * Todos los sonidos usan frecuencias por encima de ~70 Hz y envolventes con ataque corto pero no instantáneo,
 * para evitar chasquidos. El volumen de cada uno viene de SOUND_SPECS.
 */
import { Sound, type SoundId } from './sfx-map';

/** Búfer de ruido blanco reutilizable (se crea una vez por contexto). */
export function createNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let s = 0x1234567;
  for (let i = 0; i < data.length; i++) {
    // Generador propio (el ruido no necesita calidad estadística).
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    data[i] = (s / 4294967296) * 2 - 1;
  }
  return buffer;
}

interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  t: number;
  gain: number;
  noise: AudioBuffer;
}

/** Envolvente de volumen: subida corta y caída exponencial. */
function env(v: Voice, attack: number, decay: number, peak = 1): GainNode {
  const g = v.ctx.createGain();
  const p = Math.max(0.0001, v.gain * peak);
  g.gain.setValueAtTime(0.0001, v.t);
  g.gain.linearRampToValueAtTime(p, v.t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, v.t + attack + decay);
  g.connect(v.out);
  return g;
}

/** Tono con barrido de frecuencia. */
function tone(
  v: Voice,
  type: OscillatorType,
  f0: number,
  f1: number,
  attack: number,
  decay: number,
  peak = 1,
  delay = 0,
): void {
  const voice = { ...v, t: v.t + delay };
  const g = env(voice, attack, decay, peak);
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(70, f0), voice.t);
  o.frequency.exponentialRampToValueAtTime(Math.max(70, f1), voice.t + attack + decay);
  o.connect(g);
  o.start(voice.t);
  o.stop(voice.t + attack + decay + 0.05);
}

/** Ruido filtrado (paso banda) con envolvente. */
function noise(
  v: Voice,
  freq: number,
  q: number,
  attack: number,
  decay: number,
  peak = 1,
  delay = 0,
  freqEnd = freq,
): void {
  const voice = { ...v, t: v.t + delay };
  const g = env(voice, attack, decay, peak);
  const f = v.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(Math.max(70, freq), voice.t);
  f.frequency.exponentialRampToValueAtTime(Math.max(70, freqEnd), voice.t + attack + decay);
  f.Q.value = q;
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  src.connect(f);
  f.connect(g);
  src.start(voice.t);
  src.stop(voice.t + attack + decay + 0.05);
}

/** Reproduce el sonido `id` en `out` a partir de `t`. */
export function playSound(
  ctx: AudioContext,
  out: AudioNode,
  id: SoundId,
  t: number,
  gain: number,
  noiseBuffer: AudioBuffer,
): void {
  const v: Voice = { ctx, out, t, gain, noise: noiseBuffer };
  switch (id) {
    case Sound.ShotPulsador:
      tone(v, 'square', 880, 330, 0.004, 0.08, 0.6);
      noise(v, 3000, 1.2, 0.002, 0.04, 0.4);
      break;
    case Sound.ShotDispersor:
      noise(v, 1800, 0.8, 0.003, 0.18, 0.9, 0, 500);
      tone(v, 'sawtooth', 300, 110, 0.004, 0.14, 0.5);
      break;
    case Sound.Beam:
      tone(v, 'sawtooth', 520, 500, 0.01, 0.09, 0.5);
      tone(v, 'sine', 1040, 1000, 0.01, 0.09, 0.3);
      break;
    case Sound.Hit:
      tone(v, 'triangle', 1400, 700, 0.002, 0.06, 0.7);
      break;
    case Sound.WallHit:
      noise(v, 2400, 2, 0.002, 0.05, 0.6);
      break;
    case Sound.Blocked:
      tone(v, 'square', 2000, 1800, 0.002, 0.05, 0.4);
      tone(v, 'square', 2600, 2400, 0.002, 0.05, 0.3, 0.04);
      break;
    case Sound.Destroyed:
      // Se deshace en luz: barrido descendente con brillo.
      noise(v, 2500, 0.9, 0.005, 0.35, 0.8, 0, 400);
      tone(v, 'triangle', 660, 180, 0.005, 0.3, 0.6);
      tone(v, 'sine', 1320, 1760, 0.01, 0.25, 0.25, 0.05);
      break;
    case Sound.Dodge:
      noise(v, 900, 1.5, 0.02, 0.18, 0.7, 0, 2400);
      break;
    case Sound.Overheat:
      // Alarma de dos tonos, media altura (no estridente).
      tone(v, 'triangle', 620, 620, 0.01, 0.16, 0.8);
      tone(v, 'triangle', 460, 460, 0.01, 0.2, 0.8, 0.2);
      break;
    case Sound.Vent:
      noise(v, 3500, 0.6, 0.05, 0.6, 0.7, 0, 700);
      break;
    case Sound.PlayerHit:
      tone(v, 'sawtooth', 240, 120, 0.005, 0.18, 0.8);
      noise(v, 700, 1, 0.005, 0.12, 0.5);
      break;
    case Sound.WaveStart:
      tone(v, 'triangle', 440, 440, 0.02, 0.3, 0.7);
      tone(v, 'triangle', 660, 660, 0.02, 0.4, 0.7, 0.18);
      break;
    case Sound.WaveCleared:
      tone(v, 'triangle', 523, 523, 0.02, 0.3, 0.7);
      tone(v, 'triangle', 659, 659, 0.02, 0.3, 0.7, 0.14);
      tone(v, 'triangle', 784, 784, 0.02, 0.5, 0.7, 0.28);
      break;
    case Sound.EnemyFire:
      tone(v, 'sine', 300, 180, 0.01, 0.2, 0.8);
      break;
    case Sound.Telegraph:
      tone(v, 'sine', 360, 720, 0.03, 0.3, 0.6);
      break;
    case Sound.EnemyBeam:
      tone(v, 'sawtooth', 1200, 300, 0.005, 0.3, 0.7);
      break;
    case Sound.Shockwave:
      tone(v, 'sine', 180, 80, 0.01, 0.4, 0.9);
      noise(v, 400, 0.7, 0.01, 0.3, 0.5);
      break;
    case Sound.Pickup:
      tone(v, 'sine', 660, 990, 0.01, 0.15, 0.7);
      tone(v, 'sine', 990, 1320, 0.01, 0.15, 0.5, 0.1);
      break;
    case Sound.Onda:
      tone(v, 'sine', 220, 90, 0.02, 0.5, 0.9);
      noise(v, 600, 0.6, 0.02, 0.4, 0.6, 0, 200);
      break;
    case Sound.BarrierUp:
      tone(v, 'triangle', 330, 660, 0.04, 0.5, 0.7);
      break;
    case Sound.BarrierEnd:
      tone(v, 'triangle', 660, 330, 0.02, 0.35, 0.6);
      break;
    case Sound.Decoy:
      tone(v, 'sine', 880, 880, 0.03, 0.2, 0.5);
      tone(v, 'sine', 1100, 1100, 0.03, 0.25, 0.5, 0.12);
      break;
    case Sound.BossPhase:
      // Bocina grave pero por encima de 70 Hz.
      tone(v, 'sawtooth', 110, 98, 0.15, 1.1, 0.8);
      tone(v, 'sawtooth', 165, 147, 0.15, 1.1, 0.5);
      break;
    case Sound.BossTelegraph:
      tone(v, 'sawtooth', 130, 260, 0.1, 0.7, 0.7);
      break;
    case Sound.ZoneWarn:
      tone(v, 'sine', 500, 500, 0.02, 0.3, 0.5);
      break;
    case Sound.ZoneImpact:
      tone(v, 'sine', 160, 75, 0.005, 0.4, 0.9);
      noise(v, 900, 0.8, 0.005, 0.3, 0.6, 0, 250);
      break;
    case Sound.PerkChosen:
      tone(v, 'triangle', 587, 587, 0.02, 0.25, 0.7);
      tone(v, 'triangle', 880, 880, 0.02, 0.4, 0.7, 0.12);
      break;
    case Sound.WeaponSwitch:
      tone(v, 'square', 400, 600, 0.004, 0.06, 0.4);
      break;
    case Sound.Victory:
      [523, 659, 784, 1047].forEach((f, i) => tone(v, 'triangle', f, f, 0.02, 0.6, 0.7, i * 0.18));
      break;
    case Sound.Defeat:
      [392, 330, 262, 196].forEach((f, i) =>
        tone(v, 'triangle', f, f * 0.98, 0.02, 0.5, 0.6, i * 0.25),
      );
      break;
    default:
      break;
  }
}

/** Notas de la música. */
export function playPad(
  ctx: AudioContext,
  out: AudioNode,
  freqs: readonly number[],
  t: number,
  dur: number,
): void {
  for (const f of freqs) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

export function playPluck(
  ctx: AudioContext,
  out: AudioNode,
  f: number,
  t: number,
  peak: number,
): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  g.connect(out);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(f * 6, t);
  lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.2);
  o.connect(lp);
  lp.connect(g);
  o.start(t);
  o.stop(t + 0.3);
}

export function playBass(
  ctx: AudioContext,
  out: AudioNode,
  f: number,
  t: number,
  dur: number,
): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = Math.max(70, f);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  o.connect(lp);
  lp.connect(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function playKick(ctx: AudioContext, out: AudioNode, t: number): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.18, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  g.connect(out);
  const o = ctx.createOscillator();
  o.type = 'sine';
  // Barrido de 150 a 75 Hz: pulso grave que se oye en portátiles.
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(75, t + 0.15);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.25);
}

export function playHat(
  ctx: AudioContext,
  out: AudioNode,
  noiseBuffer: AudioBuffer,
  t: number,
): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.035, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  g.connect(out);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.connect(f);
  f.connect(g);
  src.start(t);
  src.stop(t + 0.07);
}
