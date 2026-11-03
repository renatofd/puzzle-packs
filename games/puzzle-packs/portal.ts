/**
 * Ponte com os portais (Poki implementado; GamePush e CrazyGames ainda são
 * stubs). O jogo só fala com este arquivo, nunca com um SDK direto.
 *
 * Regras de anúncio do jogo: rewarded é sempre opcional (pacote grátis ou
 * 2× moedas por 2 min) e nunca há interstitial durante a abertura de um
 * pacote; `commercialBreak` só é chamado ao voltar de uma pausa (Álbum,
 * Melhorias, menu) para a tela principal.
 *
 * Estado de gameplay: o jogo diz só se *quer* estar jogando (`gameplayStart`
 * / `gameplayStop`). O portal decide quando avisar o SDK, seguindo as regras
 * do Poki:
 * - nunca dois `gameplayStart` (ou dois `gameplayStop`) seguidos;
 * - o primeiro `gameplayStart` só sai no primeiro toque/tecla do jogador,
 *   não no fim do carregamento;
 * - nenhum evento do SDK sai durante um anúncio (gameplay e `measure`
 *   esperam o anúncio acabar);
 * - aba escondida conta como pausa.
 */

export type PortalId = 'none' | 'gamepush' | 'poki' | 'crazygames';

/** Parte do PokiSDK v2 que o jogo usa (https://developers.poki.com/guide/sdk-html5). */
export interface PokiSDKApi {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(before?: () => void): Promise<void>;
  rewardedBreak(before?: () => void): Promise<boolean>;
  measure(category: string, what: string, action: string): void;
  openExternalLink?(url: string): void;
}

declare global {
  interface Window {
    PokiSDK?: PokiSDKApi;
    CrazyGames?: { SDK?: unknown };
    gp?: unknown;
  }
}

export const POKI_SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/** Portal fixado no build (`vite build --mode poki` injeta o script do SDK no index.html). */
function buildPortal(): PortalId | null {
  try {
    return import.meta.env?.MODE === 'poki' ? 'poki' : null;
  } catch {
    return null;
  }
}

function detect(): PortalId {
  const forced = new URLSearchParams(globalThis.location?.search ?? '').get('portal');
  if (forced === 'gamepush' || forced === 'poki' || forced === 'crazygames' || forced === 'none') return forced;
  const built = buildPortal();
  if (built) return built;
  if (typeof window === 'undefined') return 'none';
  if (window.PokiSDK) return 'poki';
  if (window.CrazyGames?.SDK) return 'crazygames';
  if (window.gp) return 'gamepush';
  return 'none';
}

/** Carrega o script do SDK quando ele não veio no index.html (ex.: `?portal=poki` no dev). */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => resolve(); // bloqueador de anúncio: o jogo segue sem SDK
    document.head.appendChild(s);
  });
}

/** Tira `/` e `^` (reservados pelo Poki) e limita o tamanho. */
export function cleanMeasure(v: string | number): string {
  return String(v)
    .replace(/[/^]/g, '-')
    .trim()
    .slice(0, 64);
}

export interface AdHooks {
  /** Chamado logo antes do anúncio aparecer: silencie o áudio aqui. */
  onAdStart?: () => void;
  /** Chamado quando o anúncio termina (ou não houve anúncio). */
  onAdEnd?: () => void;
}

export class Portal {
  id: PortalId = 'none';
  /** O SDK do portal respondeu ao `init` (falha = bloqueador de anúncio). */
  sdkReady = false;
  hooks: AdHooks = {};

  private sdk: PokiSDKApi | null = null;
  /** O jogo quer estar em gameplay. */
  private want = false;
  /** O que o SDK sabe agora (último evento enviado). */
  private playing = false;
  /** Já houve o primeiro toque ou tecla do jogador. */
  private hadInput = false;
  private adActive = false;
  private hidden = false;
  private loaded = false;
  private queued: Array<[string, string, string]> = [];
  /** Registro de chamadas (testes e painel de debug). */
  readonly log: string[] = [];

  /** Antes de carregar: descobre o portal e inicializa o SDK. */
  async init(sdk?: PokiSDKApi | null): Promise<void> {
    this.id = sdk ? 'poki' : detect();
    if (this.id === 'poki') {
      if (!sdk && typeof window !== 'undefined' && !window.PokiSDK && buildPortal() !== 'poki') await loadScript(POKI_SDK_URL);
      this.sdk = sdk ?? (typeof window !== 'undefined' ? window.PokiSDK ?? null : null);
      if (this.sdk) {
        try {
          await this.sdk.init();
          this.sdkReady = true;
        } catch {
          // Bloqueador de anúncio: o Poki pede para carregar o jogo mesmo assim.
          this.sdkReady = false;
        }
      }
    }
    // TODO(crazygames): await window.CrazyGames.SDK.init()
    // TODO(gamepush): o SDK chama window.onGPInit; aguardar gp.player.ready
    if (typeof window !== 'undefined' && !sdk) {
      const first = () => {
        window.removeEventListener('pointerdown', first, true);
        window.removeEventListener('keydown', first, true);
        this.firstInput();
      };
      window.addEventListener('pointerdown', first, true);
      window.addEventListener('keydown', first, true);
    }
  }

  private note(line: string): void {
    this.log.push(line);
    if (this.log.length > 300) this.log.splice(0, 100);
  }

  private call(name: keyof PokiSDKApi, ...args: unknown[]): void {
    this.note(name === 'measure' ? `measure:${args.join('/')}` : name);
    if (!this.sdk) return;
    try {
      (this.sdk[name] as (...a: unknown[]) => unknown)(...args);
    } catch (e) {
      console.warn(`PokiSDK.${name} falhou`, e);
    }
  }

  /** Manda ao SDK o estado de gameplay que vale agora, sem repetir eventos. */
  private sync(): void {
    if (this.adActive || !this.loaded) return;
    const should = this.want && this.hadInput && !this.hidden;
    if (should === this.playing) return;
    this.playing = should;
    this.call(should ? 'gameplayStart' : 'gameplayStop');
  }

  /** Primeiro toque/tecla do jogador: libera o primeiro `gameplayStart`. */
  firstInput(): void {
    if (this.hadInput) return;
    this.hadInput = true;
    this.sync();
  }

  /** Aba escondida ou visível de novo. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.sync();
  }

  /** Está em gameplay para o SDK (testes). */
  get isPlaying(): boolean {
    return this.playing;
  }

  get isAdActive(): boolean {
    return this.adActive;
  }

  /** Assets carregados e primeira tela pronta. */
  loadingFinished(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.call('gameLoadingFinished');
    // TODO(crazygames): SDK.game.loadingStop()
    // TODO(gamepush): gp.gameStart()
    this.sync();
    this.flush();
  }

  /** O jogador está jogando (tela principal, abrindo pacotes). Idempotente. */
  gameplayStart(): void {
    this.want = true;
    this.sync();
  }

  /** Pausa (menu, álbum, melhorias, painel final). Idempotente. */
  gameplayStop(): void {
    this.want = false;
    this.sync();
  }

  private beginAd(): void {
    // Sai do gameplay antes do anúncio: gameplayStop → break → gameplayStart.
    if (this.playing && this.loaded) {
      this.playing = false;
      this.call('gameplayStop');
    }
    this.adActive = true;
  }

  private endAd(): void {
    this.adActive = false;
    this.hooks.onAdEnd?.();
    this.sync();
    this.flush();
  }

  /**
   * Interstitial num ponto de pausa natural, logo antes de voltar ao jogo.
   * O Poki decide se mostra algo; nem toda chamada vira anúncio.
   */
  async commercialBreak(): Promise<void> {
    if (this.id !== 'poki' || !this.sdk || this.adActive) return;
    this.beginAd();
    try {
      this.note('commercialBreak');
      await this.sdk.commercialBreak(() => this.hooks.onAdStart?.());
    } catch {
      /* sem anúncio */
    } finally {
      this.endAd();
    }
    // TODO(crazygames): SDK.ad.requestAd('midgame', callbacks)
    // TODO(gamepush): await gp.ads.showFullscreen()
  }

  /** Há rewarded para oferecer (no Poki com bloqueador, não há). */
  rewardedAvailable(): boolean {
    if (this.id === 'poki') return !!this.sdk && this.sdkReady;
    return true;
  }

  /**
   * Rewarded: resolve `true` se o jogador assistiu até o fim. Sem portal
   * (desenvolvimento), simula um anúncio de 1 segundo que sempre paga.
   */
  async rewarded(): Promise<boolean> {
    if (this.adActive) return false;
    if (this.id === 'poki') {
      if (!this.sdk) return false;
      this.beginAd();
      try {
        this.note('rewardedBreak');
        return !!(await this.sdk.rewardedBreak(() => this.hooks.onAdStart?.()));
      } catch {
        return false;
      } finally {
        this.endAd();
      }
    }
    // TODO(crazygames): SDK.ad.requestAd('rewarded', callbacks)
    // TODO(gamepush): return await gp.ads.showRewardedVideo()
    this.beginAd();
    this.hooks.onAdStart?.();
    try {
      await new Promise((r) => setTimeout(r, 1000));
      return true;
    } finally {
      this.endAd();
    }
  }

  /**
   * Game event (https://developers.poki.com/guide/game-events). Durante um
   * anúncio ou antes do fim do carregamento, fica na fila.
   */
  measure(category: string, what: string | number, action: string): void {
    const ev: [string, string, string] = [cleanMeasure(category), cleanMeasure(what), cleanMeasure(action)];
    if (this.adActive || !this.loaded) {
      this.queued.push(ev);
      if (this.queued.length > 200) this.queued.shift();
      return;
    }
    if (import.meta.env?.DEV) console.debug('[measure]', ev.join(' / '));
    if (this.id === 'poki') this.call('measure', ...ev);
    else this.note(`measure:${ev.join('/')}`);
  }

  private flush(): void {
    const q = this.queued;
    this.queued = [];
    for (const [c, w, a] of q) this.measure(c, w, a);
  }

  /** Link externo: no Poki tem de passar pelo SDK. O jogo hoje não tem nenhum. */
  openExternalLink(url: string): void {
    if (this.id === 'poki' && this.sdk?.openExternalLink) this.sdk.openExternalLink(url);
    else if (this.id !== 'poki') globalThis.open?.(url, '_blank', 'noopener');
  }

  /** Save na nuvem do portal. Sem portal, não faz nada (o save local continua valendo). */
  cloudSave = {
    async load(): Promise<string | null> {
      // TODO(gamepush): gp.player.get('save')
      // TODO(crazygames): SDK.data.getItem('save')
      return null;
    },
    async save(_data: string): Promise<void> {
      // TODO(gamepush): gp.player.set('save', data); await gp.player.sync()
      // TODO(crazygames): SDK.data.setItem('save', data)
    },
  };
}

export const portal = new Portal();
