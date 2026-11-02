/**
 * Ponte com os portais (GamePush, Poki, CrazyGames). Por enquanto são
 * stubs: cada função tem o ponto exato onde a chamada do SDK entra.
 * O jogo só fala com este arquivo, nunca com um SDK direto.
 *
 * Regras de anúncio do jogo: rewarded é sempre opcional (pacote grátis ou
 * 2× moedas por 2 min) e nunca há interstitial durante a abertura de um
 * pacote; `commercialBreak` só é chamado ao voltar do Álbum/Melhorias.
 */

export type PortalId = 'none' | 'gamepush' | 'poki' | 'crazygames';

declare global {
  interface Window {
    PokiSDK?: unknown;
    CrazyGames?: { SDK?: unknown };
    gp?: unknown;
  }
}

function detect(): PortalId {
  const forced = new URLSearchParams(globalThis.location?.search ?? '').get('portal');
  if (forced === 'gamepush' || forced === 'poki' || forced === 'crazygames' || forced === 'none') return forced;
  if (typeof window === 'undefined') return 'none';
  if (window.PokiSDK) return 'poki';
  if (window.CrazyGames?.SDK) return 'crazygames';
  if (window.gp) return 'gamepush';
  return 'none';
}

let playing = false;

export const portal = {
  id: 'none' as PortalId,

  /** Antes de carregar: inicializa o SDK do portal. */
  async init(): Promise<void> {
    this.id = detect();
    // TODO(poki): await PokiSDK.init()
    // TODO(crazygames): await window.CrazyGames.SDK.init()
    // TODO(gamepush): o SDK chama window.onGPInit; aguardar gp.player.ready
  },

  /** Assets carregados e primeira tela pronta. */
  loadingFinished(): void {
    // TODO(poki): PokiSDK.gameLoadingFinished()
    // TODO(crazygames): SDK.game.loadingStop()
    // TODO(gamepush): gp.gameStart()
  },

  /** O jogador está jogando (abrindo pacotes). Idempotente. */
  gameplayStart(): void {
    if (playing) return;
    playing = true;
    // TODO(poki): PokiSDK.gameplayStart()
    // TODO(crazygames): SDK.game.gameplayStart()
    // TODO(gamepush): gp.gameplayStart()
  },

  /** Pausa (menu, álbum, anúncio, aba escondida). Idempotente. */
  gameplayStop(): void {
    if (!playing) return;
    playing = false;
    // TODO(poki): PokiSDK.gameplayStop()
    // TODO(crazygames): SDK.game.gameplayStop()
    // TODO(gamepush): gp.gameplayStop()
  },

  /** Interstitial num ponto de pausa natural. Resolve quando o jogo pode seguir. */
  async commercialBreak(): Promise<void> {
    // TODO(poki): await PokiSDK.commercialBreak()
    // TODO(crazygames): SDK.ad.requestAd('midgame', callbacks)
    // TODO(gamepush): await gp.ads.showFullscreen()
  },

  /**
   * Rewarded: resolve `true` se o jogador assistiu até o fim. Sem portal
   * (desenvolvimento), simula um anúncio de 1 segundo que sempre paga.
   */
  async rewarded(): Promise<boolean> {
    this.gameplayStop();
    try {
      // TODO(poki): return await PokiSDK.rewardedBreak()
      // TODO(crazygames): SDK.ad.requestAd('rewarded', callbacks)
      // TODO(gamepush): return await gp.ads.showRewardedVideo()
      await new Promise((r) => setTimeout(r, 1000));
      return true;
    } finally {
      this.gameplayStart();
    }
  },

  /** Save na nuvem do portal. Sem portal, não faz nada (o save local continua valendo). */
  cloudSave: {
    async load(): Promise<string | null> {
      // TODO(gamepush): gp.player.get('save')
      // TODO(crazygames): SDK.data.getItem('save')
      return null;
    },
    async save(_data: string): Promise<void> {
      // TODO(gamepush): gp.player.set('save', data); await gp.player.sync()
      // TODO(crazygames): SDK.data.setItem('save', data)
    },
  },
};
