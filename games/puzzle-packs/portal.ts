import { localStorageAdapter, type StorageAdapter } from '../../src/core/save';

/**
 * Ponte com os portais (Poki e CrazyGames implementados; GamePush ainda é
 * stub). O jogo só fala com este arquivo, nunca com um SDK direto.
 *
 * Regras de anúncio do jogo: rewarded é sempre opcional (pacote grátis ou
 * 2× moedas por 2 min) e nunca há interstitial durante a abertura de um
 * pacote. Cada portal tem o seu ponto de interstitial (`commercialBreak`):
 * - Poki (`resume`): ao voltar de uma pausa (Álbum, Melhorias, menu) para a
 *   tela principal;
 * - CrazyGames (`milestone`): só ao completar uma série, a pausa natural
 *   entre "fases". O CrazyGames proíbe anúncio preso a botão de navegação, e
 *   o próprio SDK segura 3 min entre anúncios.
 *
 * No CrazyGames, os botões de rewarded só aparecem depois de o SDK mostrar
 * que há anúncio nesta conta: no Basic Launch os anúncios vêm desligados, e
 * botão de vídeo que não faz nada reprova o jogo.
 *
 * Estado de gameplay: o jogo diz só se *quer* estar jogando (`gameplayStart`
 * / `gameplayStop`). O portal decide quando avisar o SDK:
 * - nunca dois `gameplayStart` (ou dois `gameplayStop`) seguidos;
 * - o primeiro `gameplayStart` só sai no primeiro toque/tecla do jogador,
 *   não no fim do carregamento;
 * - nenhum evento do SDK sai durante um anúncio (gameplay e `measure`
 *   esperam o anúncio acabar);
 * - aba escondida conta como pausa.
 */

export type PortalId = 'none' | 'gamepush' | 'poki' | 'crazygames';

/** Onde o jogo oferece um interstitial; cada portal aceita o seu (veja o topo do arquivo). */
export type BreakReason = 'resume' | 'milestone';

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

/** `adError` do CrazyGames: `adsDisabled` (Basic Launch), `unfilled`, `adblock`, `adCooldown` ou `other`. */
export interface CrazyAdError {
  code?: string;
  message?: string;
}

export interface CrazyAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: CrazyAdError) => void;
}

export interface CrazySettings {
  muteAudio?: boolean;
  disableChat?: boolean;
}

/** Parte do SDK v3 do CrazyGames que o jogo usa (https://docs.crazygames.com/sdk/intro/). */
export interface CrazyGamesSDKApi {
  init(): Promise<void>;
  /** `crazygames`, `local` (localhost: anúncio vira um aviso na tela) ou `disabled` (outro site). */
  environment?: string;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings?: CrazySettings;
    addSettingsChangeListener?(listener: (settings: CrazySettings) => void): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks?: CrazyAdCallbacks): unknown;
    hasAdblock?(): Promise<boolean>;
  };
  data?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  user?: { systemInfo?: { locale?: string; countryCode?: string; applicationType?: string } };
}

declare global {
  interface Window {
    PokiSDK?: PokiSDKApi;
    CrazyGames?: { SDK?: CrazyGamesSDKApi };
    gp?: unknown;
  }
}

export const POKI_SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';
export const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/** Portal fixado no build (`vite build --mode poki|crazygames` injeta o script do SDK no index.html). */
function buildPortal(): PortalId | null {
  try {
    const mode = import.meta.env?.MODE;
    return mode === 'poki' || mode === 'crazygames' ? mode : null;
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

function isCrazy(sdk: PokiSDKApi | CrazyGamesSDKApi): sdk is CrazyGamesSDKApi {
  const s = sdk as CrazyGamesSDKApi;
  return typeof s.ad === 'object' && typeof s.game === 'object';
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

/** CrazyGames: este aparelho já viu anúncio (`on`) ou o SDK disse que não há (`off`). */
type AdsState = 'unknown' | 'on' | 'off';
const ADS_KEY = 'puzzle-packs:ads';

function readAdsState(): AdsState {
  try {
    const v = globalThis.localStorage?.getItem(ADS_KEY);
    return v === 'on' || v === 'off' ? v : 'unknown';
  } catch {
    return 'unknown';
  }
}

function storeAdsState(v: AdsState): void {
  try {
    globalThis.localStorage?.setItem(ADS_KEY, v);
  } catch {
    /* sem localStorage */
  }
}

export interface AdHooks {
  /** Pediu um anúncio: trave a entrada do jogador até `onAdEnd`. */
  onAdRequest?: () => void;
  /** Chamado logo antes do anúncio aparecer: silencie o áudio aqui. */
  onAdStart?: () => void;
  /** Chamado quando o anúncio termina (ou não houve anúncio). */
  onAdEnd?: () => void;
  /** O portal mandou silenciar (ou liberar) o som, por cima das opções do jogo. */
  onMute?: (muted: boolean) => void;
}

export class Portal {
  id: PortalId = 'none';
  /** O SDK do portal respondeu ao `init` (falha = bloqueador de anúncio ou fora do portal). */
  sdkReady = false;
  hooks: AdHooks = {};
  /** Código do último anúncio que falhou (`unfilled`...), para o jogo avisar o jogador. */
  lastAdError: string | null = null;

  private poki: PokiSDKApi | null = null;
  private crazy: CrazyGamesSDKApi | null = null;
  /** CrazyGames: há anúncio para esta conta? Desconhecido até a primeira resposta do SDK. */
  private ads: AdsState = 'unknown';
  /** CrazyGames: já perguntou ao SDK nesta sessão (com `off`, pergunta só uma vez por sessão). */
  private probed = false;
  private adblock = false;
  private portalMuted = false;
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

  /** Antes de carregar: descobre o portal e inicializa o SDK. Nos testes, recebe um SDK falso. */
  async init(sdk?: PokiSDKApi | CrazyGamesSDKApi | null): Promise<void> {
    this.id = sdk ? (isCrazy(sdk) ? 'crazygames' : 'poki') : detect();
    if (this.id === 'poki') await this.initPoki(sdk && !isCrazy(sdk) ? sdk : null);
    else if (this.id === 'crazygames') await this.initCrazy(sdk && isCrazy(sdk) ? sdk : null);
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

  private async initPoki(sdk: PokiSDKApi | null): Promise<void> {
    if (!sdk && typeof window !== 'undefined' && !window.PokiSDK && buildPortal() !== 'poki') await loadScript(POKI_SDK_URL);
    this.poki = sdk ?? (typeof window !== 'undefined' ? window.PokiSDK ?? null : null);
    if (!this.poki) return;
    try {
      await this.poki.init();
      this.sdkReady = true;
    } catch {
      // Bloqueador de anúncio: o Poki pede para carregar o jogo mesmo assim.
      this.sdkReady = false;
    }
  }

  private async initCrazy(sdk: CrazyGamesSDKApi | null): Promise<void> {
    if (!sdk && typeof window !== 'undefined' && !window.CrazyGames?.SDK && buildPortal() !== 'crazygames') await loadScript(CRAZYGAMES_SDK_URL);
    const cg = sdk ?? (typeof window !== 'undefined' ? window.CrazyGames?.SDK ?? null : null);
    if (!cg) return;
    try {
      await cg.init();
    } catch {
      return; // fora do CrazyGames (ambiente `disabled`) ou bloqueado: o jogo segue sem SDK
    }
    if (cg.environment === 'disabled') return;
    this.crazy = cg;
    this.sdkReady = true;
    this.ads = readAdsState();
    this.cg('loadingStart', (c) => c.game.loadingStart());
    // Som desligado no site manda mais que as opções do jogo.
    this.applyMute(cg.game.settings);
    try {
      cg.game.addSettingsChangeListener?.((s) => this.applyMute(s ?? cg.game.settings));
    } catch {
      /* SDK antigo sem o listener */
    }
    try {
      void cg.ad
        .hasAdblock?.()
        .then((b) => {
          if (b) this.adblock = true;
        })
        .catch(() => {});
    } catch {
      /* idem */
    }
  }

  private applyMute(s: CrazySettings | undefined): void {
    const muted = !!s?.muteAudio;
    if (muted === this.portalMuted) return;
    this.portalMuted = muted;
    this.hooks.onMute?.(muted);
  }

  /** O portal pediu o jogo sem som (CrazyGames: som desligado no site). */
  get muted(): boolean {
    return this.portalMuted;
  }

  /** Idioma que o portal informa (CrazyGames: `systemInfo.locale`, ex. `pt-BR`), ou null. */
  lang(): string | null {
    try {
      const locale = this.crazy?.user?.systemInfo?.locale;
      return typeof locale === 'string' && locale ? locale : null;
    } catch {
      return null;
    }
  }

  /**
   * Onde guardar o save. No CrazyGames é o módulo Data: vai para a conta do
   * jogador logado e para o localStorage de quem joga sem conta. Se o módulo
   * falhar (opção "Progress Save" desligada no envio do jogo), usa o
   * localStorage. Fora do CrazyGames, null (o padrão do jogo, localStorage).
   */
  saveStorage(): StorageAdapter | null {
    const data = this.crazy?.data;
    if (!data) return null;
    return {
      read: (k) => {
        try {
          return data.getItem(k) ?? localStorageAdapter.read(k);
        } catch {
          return localStorageAdapter.read(k);
        }
      },
      write: (k, v) => {
        try {
          data.setItem(k, v);
        } catch {
          localStorageAdapter.write(k, v);
        }
      },
      remove: (k) => {
        try {
          data.removeItem(k);
        } catch {
          /* módulo desligado */
        }
        localStorageAdapter.remove(k);
      },
    };
  }

  private note(line: string): void {
    this.log.push(line);
    if (this.log.length > 300) this.log.splice(0, 100);
  }

  private call(name: keyof PokiSDKApi, ...args: unknown[]): void {
    this.note(name === 'measure' ? `measure:${args.join('/')}` : name);
    if (!this.poki) return;
    try {
      (this.poki[name] as (...a: unknown[]) => unknown)(...args);
    } catch (e) {
      console.warn(`PokiSDK.${name} falhou`, e);
    }
  }

  /** Chamada ao SDK do CrazyGames; um erro do SDK nunca para o jogo. */
  private cg(name: string, fn: (sdk: CrazyGamesSDKApi) => void): void {
    this.note(name);
    if (!this.crazy) return;
    try {
      fn(this.crazy);
    } catch (e) {
      console.warn(`CrazyGames SDK: ${name} falhou`, e);
    }
  }

  private sendGameplay(on: boolean): void {
    if (this.id === 'crazygames') this.cg(on ? 'gameplayStart' : 'gameplayStop', (c) => (on ? c.game.gameplayStart() : c.game.gameplayStop()));
    else this.call(on ? 'gameplayStart' : 'gameplayStop');
  }

  /** Manda ao SDK o estado de gameplay que vale agora, sem repetir eventos. */
  private sync(): void {
    if (this.adActive || !this.loaded) return;
    const should = this.want && this.hadInput && !this.hidden;
    if (should === this.playing) return;
    this.playing = should;
    this.sendGameplay(should);
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
    if (this.id === 'crazygames') this.cg('loadingStop', (c) => c.game.loadingStop());
    else this.call('gameLoadingFinished');
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
      this.sendGameplay(false);
    }
    this.adActive = true;
    this.hooks.onAdRequest?.();
  }

  private endAd(): void {
    this.adActive = false;
    this.hooks.onAdEnd?.();
    this.sync();
    this.flush();
  }

  /** CrazyGames: aprende se há anúncio para esta conta com a resposta do SDK. */
  private learnAds(error: CrazyAdError | null): void {
    const code = error ? error.code ?? 'other' : null;
    this.lastAdError = code;
    let next = this.ads;
    if (code === null || code === 'unfilled' || code === 'adCooldown') next = 'on';
    else if (code === 'adsDisabled' || code === 'adsDisabledBasicLaunch') next = 'off';
    else if (code === 'adblock') this.adblock = true;
    if (next !== this.ads) {
      this.ads = next;
      storeAdsState(next);
    }
  }

  /** Pede um anúncio ao CrazyGames; resolve `true` só no `adFinished`. */
  private crazyAd(type: 'midgame' | 'rewarded'): Promise<boolean> {
    const cg = this.crazy;
    if (!cg) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const end = (ok: boolean) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      try {
        cg.ad.requestAd(type, {
          adStarted: () => {
            this.learnAds(null);
            this.hooks.onAdStart?.();
          },
          adFinished: () => {
            this.learnAds(null);
            end(true);
          },
          adError: (e) => {
            this.learnAds(e ?? {});
            end(false);
          },
        });
      } catch {
        end(false);
      }
    });
  }

  /** O portal mostraria um interstitial neste ponto do jogo? */
  breaksAt(reason: BreakReason): boolean {
    if (this.adActive) return false;
    if (this.id === 'poki') return reason === 'resume' && !!this.poki;
    if (this.id === 'crazygames') return reason === 'milestone' && !!this.crazy && !this.adblock && (this.ads !== 'off' || !this.probed);
    return false;
  }

  /**
   * Interstitial num ponto de pausa natural. O portal decide se mostra algo;
   * nem toda chamada vira anúncio (veja `breaksAt`).
   */
  async commercialBreak(reason: BreakReason = 'resume'): Promise<void> {
    if (!this.breaksAt(reason)) return;
    this.beginAd();
    try {
      if (this.poki) {
        this.note('commercialBreak');
        await this.poki.commercialBreak(() => this.hooks.onAdStart?.());
      } else if (this.crazy) {
        this.probed = true;
        this.note('midgame');
        await this.crazyAd('midgame');
      }
    } catch {
      /* sem anúncio */
    } finally {
      this.endAd();
    }
    // TODO(gamepush): await gp.ads.showFullscreen()
  }

  /** Há rewarded para oferecer? (Poki com bloqueador não tem; CrazyGames, só com anúncio confirmado.) */
  rewardedAvailable(): boolean {
    if (this.id === 'poki') return !!this.poki && this.sdkReady;
    if (this.id === 'crazygames') return !!this.crazy && this.ads === 'on' && !this.adblock;
    return true;
  }

  /**
   * Rewarded: resolve `true` se o jogador assistiu até o fim. Sem portal
   * (desenvolvimento), simula um anúncio de 1 segundo que sempre paga.
   */
  async rewarded(): Promise<boolean> {
    if (this.adActive) return false;
    this.lastAdError = null;
    if (this.id === 'poki') {
      if (!this.poki) return false;
      this.beginAd();
      try {
        this.note('rewardedBreak');
        return !!(await this.poki.rewardedBreak(() => this.hooks.onAdStart?.()));
      } catch {
        return false;
      } finally {
        this.endAd();
      }
    }
    if (this.id === 'crazygames') {
      if (!this.crazy) return false;
      this.beginAd();
      try {
        this.note('rewarded');
        return await this.crazyAd('rewarded');
      } finally {
        this.endAd();
      }
    }
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

  /** Conquista que merece festa (série completa). O CrazyGames pede uso raro. */
  happytime(): void {
    if (this.id !== 'crazygames' || this.adActive) return;
    this.cg('happytime', (c) => c.game.happytime());
  }

  /**
   * Game event (https://developers.poki.com/guide/game-events). Durante um
   * anúncio ou antes do fim do carregamento, fica na fila. Só o Poki recebe.
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

  /**
   * Link externo: no Poki tem de passar pelo SDK. O jogo hoje não tem nenhum
   * (o CrazyGames proíbe links para fora, salvo exceções da regra deles).
   */
  openExternalLink(url: string): void {
    if (this.id === 'poki' && this.poki?.openExternalLink) this.poki.openExternalLink(url);
    else if (this.id !== 'poki') globalThis.open?.(url, '_blank', 'noopener');
  }
}

export const portal = new Portal();
