import { settings } from './settings';

/**
 * Áudio sintetizado com Web Audio: nenhum arquivo de som é necessário.
 * Efeitos são receitas curtas de osciladores e ruído; a música é um
 * lo-fi gerado na hora (acordes + arpejo). Troque por amostras quando o
 * jogo tiver sons próprios: basta registrar com `audio.define`.
 */

export interface SfxRecipe {
  /** Forma de onda; 'noise' usa ruído branco filtrado. */
  wave: OscillatorType | 'noise';
  /** Frequência inicial e final em Hz (glide). */
  from: number;
  to?: number;
  duration: number;
  volume?: number;
  attack?: number;
  /** Notas extras tocadas em sequência (múltiplos de `from`), para arpejos. */
  steps?: number[];
  stepTime?: number;
  /** Corte do filtro passa-baixa em Hz. */
  lowpass?: number;
}

const RECIPES: Record<string, SfxRecipe> = {
  click: { wave: 'triangle', from: 900, to: 700, duration: 0.05, volume: 0.25 },
  hit: { wave: 'noise', from: 3000, duration: 0.04, volume: 0.12, lowpass: 4000 },
  kill: { wave: 'square', from: 520, to: 1040, duration: 0.07, volume: 0.12, lowpass: 3000 },
  bigKill: { wave: 'sawtooth', from: 180, to: 60, duration: 0.25, volume: 0.25, lowpass: 1200 },
  zap: { wave: 'sawtooth', from: 1600, to: 400, duration: 0.09, volume: 0.1, lowpass: 5000 },
  buy: { wave: 'triangle', from: 523, duration: 0.09, volume: 0.3, steps: [1, 1.5], stepTime: 0.06 },
  deny: { wave: 'square', from: 140, to: 110, duration: 0.12, volume: 0.15, lowpass: 900 },
  achievement: { wave: 'triangle', from: 523, duration: 0.12, volume: 0.3, steps: [1, 1.25, 1.5, 2], stepTime: 0.08 },
  runStart: { wave: 'triangle', from: 330, to: 660, duration: 0.2, volume: 0.25 },
  runEnd: { wave: 'triangle', from: 660, duration: 0.14, volume: 0.25, steps: [1, 0.75, 0.5], stepTime: 0.1 },
  prestige: { wave: 'sine', from: 262, duration: 0.4, volume: 0.35, steps: [1, 1.5, 2, 3, 4], stepTime: 0.09 },
};

// Progressão lo-fi: Am7, Fmaj7, Cmaj7, G6 (frequências em Hz).
const CHORDS = [
  [220, 261.63, 329.63, 392],
  [174.61, 220, 261.63, 329.63],
  [130.81, 164.81, 196, 246.94],
  [196, 246.94, 293.66, 329.63],
];

class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private recipes = { ...RECIPES };
  private lastPlayed = new Map<string, { t: number; n: number }>();
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  private bar = 0;
  private wantMusic = false;

  constructor() {
    // Navegadores só liberam áudio depois de um gesto do jogador.
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    }
    settings.onChange(() => this.applyVolumes());
  }

  /** Registra ou substitui um efeito sonoro. */
  define(name: string, recipe: SfxRecipe): void {
    this.recipes[name] = recipe;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.wantMusic) this.startMusic();
    return ctx;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const s = settings.values;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.musicVolume * 0.5, t, 0.05);
  }

  /**
   * Toca um efeito. Sons repetidos no mesmo instante (dezenas de nós
   * destruídos juntos) são limitados para não virar ruído.
   */
  play(name: string, opts: { pitch?: number; volume?: number } = {}): void {
    const ctx = this.ctx;
    const r = this.recipes[name];
    if (!ctx || !r || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name);
    if (last && now - last.t < 0.05) {
      if (last.n >= 3) return;
      last.n++;
    } else {
      this.lastPlayed.set(name, { t: now, n: 1 });
    }
    const pitch = (opts.pitch ?? 1) * (0.97 + Math.random() * 0.06);
    const volume = (r.volume ?? 0.3) * (opts.volume ?? 1);
    const steps = r.steps ?? [1];
    steps.forEach((mult, i) => this.voice(r, now + i * (r.stepTime ?? 0), r.from * mult * pitch, (r.to ?? r.from) * mult * pitch, volume));
  }

  private voice(r: SfxRecipe, start: number, from: number, to: number, volume: number): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const attack = r.attack ?? 0.005;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + r.duration);
    let out: AudioNode = gain;
    if (r.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = r.lowpass;
      gain.connect(f);
      out = f;
    }
    out.connect(this.sfxBus);
    if (r.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.connect(gain);
      src.start(start);
      src.stop(start + r.duration);
    } else {
      const osc = ctx.createOscillator();
      osc.type = r.wave;
      osc.frequency.setValueAtTime(from, start);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + r.duration);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + r.duration + 0.02);
    }
  }

  /** Liga a música de fundo (começa assim que o áudio for liberado). */
  startMusic(): void {
    this.wantMusic = true;
    const ctx = this.ctx;
    if (!ctx || this.musicTimer) return;
    this.nextBar = ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 200);
  }

  stopMusic(): void {
    this.wantMusic = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx!;
    const barLen = (60 / 76) * 4;
    while (this.nextBar < ctx.currentTime + 1) {
      const chord = CHORDS[this.bar % CHORDS.length];
      const t = this.nextBar;
      // Pad
      for (const f of chord) this.musicNote(t, f / 2, barLen, 0.05, 'triangle', 0.6);
      // Arpejo em colcheias
      for (let i = 0; i < 8; i++) {
        if (Math.random() < 0.3) continue;
        const f = chord[Math.floor(Math.random() * chord.length)] * (Math.random() < 0.3 ? 2 : 1);
        this.musicNote(t + (i * barLen) / 8, f, barLen / 6, 0.04, 'sine', 0.01);
      }
      this.nextBar += barLen;
      this.bar++;
    }
  }

  private musicNote(t: number, freq: number, dur: number, vol: number, wave: OscillatorType, attack: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(filter).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

export const audio = new AudioManager();
