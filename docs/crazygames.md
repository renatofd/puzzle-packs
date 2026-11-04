# CrazyGames

Integração do Puzzle Packs com o SDK v3 do CrazyGames
(<https://docs.crazygames.com/sdk/intro/>). O jogo só fala com o SDK por
`games/puzzle-packs/portal.ts`.

`npm run build:crazygames` gera `dist/puzzlepacks-crazygames.zip`, com o script
`https://sdk.crazygames.com/crazygames-sdk-v3.js` no `<head>`, antes do código
do jogo. `npm run dev:crazygames` roda o mesmo modo no navegador. Em `localhost`
o SDK entra no ambiente `local` e os anúncios viram um aviso na tela. Em
qualquer outro site ele fica `disabled` e o jogo segue sem SDK.

## O que o jogo chama

| Momento | Chamada |
| --- | --- |
| SDK pronto (antes de carregar os assets) | `init()`, `game.loadingStart()` |
| Primeira tela pronta | `game.loadingStop()` |
| Primeiro toque ou tecla, e cada volta de uma pausa | `game.gameplayStart()` |
| Menu, Álbum, Melhorias, painel final, aba escondida, antes de um anúncio | `game.gameplayStop()` |
| Série completa | `game.happytime()` |
| Série completa aberta à mão (pausa natural entre "fases") | `ad.requestAd('midgame')` |
| Botão "Ver anúncio" (pacote grátis ou 2× moedas por 2 min) | `ad.requestAd('rewarded')` |
| Save (a cada 10 s, ao sair da aba e depois de cada pacote) | `data.setItem` / `data.getItem` |
| Idioma, se o jogador não escolheu um | `user.systemInfo.locale` (sem o idioma dele no jogo, inglês) |
| Som desligado no site | `game.settings.muteAudio` e `addSettingsChangeListener` |

## Regras do CrazyGames e como o jogo as cumpre

- **Anúncio só em pausa natural.** O interstitial sai só quando o jogador
  completa uma série abrindo um pacote. Voltar do Álbum ou das Melhorias não
  pede anúncio: o CrazyGames proíbe anúncio preso a botão de navegação. O
  próprio SDK segura 3 min entre anúncios.
- **Entrada travada durante o anúncio.** Do pedido até `adFinished` ou
  `adError`, nenhum toque ou tecla chega ao jogo. O som só é silenciado quando
  o anúncio começa (`adStarted`), não no pedido.
- **Nenhum botão de vídeo que não faz nada.** No Basic Launch os anúncios vêm
  desligados (`adError` com `adsDisabled`). Os botões de rewarded só aparecem
  depois que o SDK mostra que há anúncio para o jogador: um anúncio começou, ou
  o erro foi `unfilled` ou `adCooldown`. O primeiro pedido de interstitial da
  sessão serve de teste. O resultado fica salvo no aparelho
  (`puzzle-packs:ads`). Com bloqueador de anúncio (`hasAdblock`), não há
  rewarded nem interstitial.
- **Sem vídeo agora.** Se o rewarded falhar com `unfilled`, o jogo avisa
  "Nenhum vídeo agora. Tente de novo mais tarde." e não paga a recompensa.
- **Funciona com bloqueador.** Sem o script do SDK, o jogo roda igual e salva
  no localStorage.
- **Progresso na conta.** O save vai pelo módulo Data, que guarda na conta de
  quem está logado e no localStorage de quem não está. Se o módulo estiver
  desligado, o save cai no localStorage. **No envio, ligue a opção
  "Progress Save"**, senão o módulo fica desligado.
- **Inglês e idioma do jogador.** O jogo tem 14 idiomas e usa o `locale` do
  SDK. Quando não tem o idioma dele, usa inglês.
- **Sem tela cheia própria, sem links para fora, sem outro portal.** O jogo não
  tem botão de tela cheia nem links externos.
- **Página.** Setas, espaço e roda do mouse não rolam a página. Não há menu de
  contexto e o texto não é selecionável. O toque no iOS retoma o áudio depois
  de uma interrupção. O canvas respeita a área segura do celular
  (`env(safe-area-inset-*)`), como o app do CrazyGames pede.
- **Tamanho.** 90 arquivos e cerca de 12 MB (limites: 1500 arquivos, 50 MB de
  download inicial e 20 MB para a home no celular). As ilustrações das séries
  carregam sob demanda.

## Envio (developer.crazygames.com)

1. Subir `puzzlepacks-crazygames.zip` (o `index.html` fica na raiz).
2. Ligar **Progress Save** (o jogo usa o módulo Data).
3. Orientação: paisagem e retrato funcionam. No celular, os dois cabem.
4. Capas obrigatórias, todas com a mesma arte: paisagem 1920×1080, retrato
   800×1200 e quadrada 800×800. Sem bordas, sem texto além do nome do jogo,
   sem ícones ou logos de loja.
5. Vídeos de prévia obrigatórios: 15 a 20 s, sem som, até 50 MB, um em
   1080p paisagem (16:9) e outro em 1080p retrato (2:3). O primeiro quadro é a
   capa. Não pode ter tela preta, barras pretas, cursor do mouse ou texto de
   propaganda.
6. Descrição, controles e categoria do jogo.

O Basic Launch dura de 7 a 21 dias e fecha com pelo menos 500 partidas. O
painel mostra o tempo médio por partida (bons jogos passam de 10 min), a
retenção do dia 1 (10 a 15% nos fortes) e a conversão (quem joga 1 min ou
mais; os melhores passam de 80%). Se o jogo for escolhido para o Full Launch,
os anúncios ligam sozinhos: o mesmo build já trata os dois casos.
