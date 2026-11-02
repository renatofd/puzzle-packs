import { audio } from '../../src/ui/audio';

/**
 * Sons sintetizados (sem arquivos). Ficam como reserva: quando o
 * manifest traz um arquivo pronto para o mesmo nome, `loadSounds` troca
 * a receita pelo arquivo.
 */
export function defineSfx(): void {
  audio.define('rip', { wave: 'noise', from: 2500, duration: 0.28, volume: 0.35, lowpass: 6000 });
  audio.define('tear', { wave: 'noise', from: 1800, duration: 0.05, volume: 0.12, lowpass: 3500 });
  audio.define('deal', { wave: 'noise', from: 1200, duration: 0.06, volume: 0.15, lowpass: 2500 });
  audio.define('flip', { wave: 'triangle', from: 700, to: 1100, duration: 0.06, volume: 0.2 });
  audio.define('new', { wave: 'triangle', from: 523, duration: 0.1, volume: 0.3, steps: [1, 1.25, 1.5], stepTime: 0.06 });
  audio.define('rare', { wave: 'sine', from: 784, duration: 0.18, volume: 0.35, steps: [1, 1.25, 1.5, 2, 2.5], stepTime: 0.07 });
  audio.define('coin', { wave: 'square', from: 1318, to: 1760, duration: 0.06, volume: 0.1, lowpass: 5000 });
  audio.define('snap', { wave: 'triangle', from: 300, to: 180, duration: 0.08, volume: 0.3 });
  audio.define('complete', { wave: 'sine', from: 392, duration: 0.3, volume: 0.35, steps: [1, 1.25, 1.5, 2, 2.5, 3], stepTime: 0.09 });
}

export interface SoundEntry {
  id: string;
  file: string;
  volume?: number;
  ready: boolean;
}

/** Registra os sons do manifest marcados como prontos. */
export function loadSounds(sounds: SoundEntry[] = []): void {
  for (const s of sounds) if (s.ready) audio.sample(s.id, `assets/${s.file}`, s.volume ?? 1);
}
