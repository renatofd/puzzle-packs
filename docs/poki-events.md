# Poki: SDK e game events

## Build

- `npm run build:poki` gera `dist/puzzlepacks-poki.zip`, com o script do PokiSDK no `<head>` (modo `poki` do Vite). É esse zip que sobe no Poki Inspector e no Poki for Developers.
- `npm run build:portal` continua gerando o zip genérico, sem SDK.
- No dev, `npm run dev:poki` (ou `?portal=poki` na URL) carrega o SDK de verdade.

## Como o jogo usa o SDK (`games/puzzle-packs/portal.ts`)

| Momento | Chamada |
| --- | --- |
| Antes de carregar | `PokiSDK.init()` (se falhar, o jogo carrega igual: bloqueador de anúncio) |
| Primeira tela pronta | `gameLoadingFinished()` |
| Primeiro toque ou tecla do jogador na tela principal | `gameplayStart()` |
| Abrir Álbum, Melhorias, menu (botão, M ou Esc), idioma, painel final, aba escondida | `gameplayStop()` |
| Voltar do Álbum, Melhorias ou menu para a tela principal | `commercialBreak()` → `gameplayStart()` |
| Botões "Ver anúncio" (pacote grátis, 2× moedas) | `gameplayStop()` → `rewardedBreak()` → `gameplayStart()`; recompensa só com `true` |

Regras garantidas pelo `Portal`:

- nunca dois `gameplayStart` ou dois `gameplayStop` seguidos;
- o primeiro `gameplayStart` só sai no primeiro toque ou tecla, não no fim do carregamento;
- nada sai para o SDK durante um anúncio (gameplay e `measure` esperam o fim);
- som mudo, loop do jogo parado e teclado bloqueado durante o anúncio;
- com bloqueador, os botões de rewarded somem e o jogo segue normal, sem mensagem.

Página: setas, espaço, PageUp/PageDown e a roda do mouse não rolam a página do portal; o canvas não abre menu de contexto. O jogo não tem links externos nem requisições externas além do próprio SDK (se um dia tiver, use `portal.openExternalLink`). Saves e opções usam `localStorage` dentro de `try/catch` (funciona em aba anônima).

Botões de rewarded: amarelos (nunca verdes), com ícone de claquete, sempre opcionais.

## Game events (`games/puzzle-packs/analytics.ts`)

Cada trio `category / what / action` sai no máximo uma vez por sessão (o Poki mostra a porcentagem de gameplays que chegou a cada evento). Contagens viram marcos: 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000.

### Funis de progresso (`start` → `complete`)

| category | what | quando |
| --- | --- | --- |
| `series` | `1` … `26` | `start` quando a série vira a atual (a 1 no primeiro jogo); `complete` ao fechar a série |
| `tutorial` | `all` | `start` no jogador novo; `complete` quando todos os passos acabam |
| `tutorial` | `rip`, `flip`, `board`, `dupes`, `shop`, `upgrades`, `tree`, `auto`, `album`, `albumView` | `start` quando o passo aparece; `complete` quando o jogador conclui; `skip` se pulou o tutorial nesse passo; `all / restart` no botão de ajuda |

### Interação (`visible` → `interact`)

| category | what | quando |
| --- | --- | --- |
| `button` | `reward-pack`, `reward-double` | `visible` quando os botões de anúncio aparecem; `interact` no toque (o resultado do anúncio o Poki já mede sozinho) |

### Outros eventos

| category | what | action | quando |
| --- | --- | --- | --- |
| `session` | `new` / `returning` | `start` | ao abrir o jogo |
| `time` | `15s`, `30s`, `60s`, `90s`, `120s`, `180s`, `240s`, `300s`, `420s`, `600s`, `900s`, `1200s`, `1800s` | `reached` | segundos com a aba visível desde que a página abriu |
| `session` | `offline` | `return` | voltou com ganhos offline (mais de 1 min) |
| `progress` | `series-<n>`, `packs-<marco>` | `resume` | onde está o jogador que volta |
| `pack` | `basic`, `series`, `premium` | `open` / `open-auto` | abriu pacote na mão / pelo auto-abridor |
| `packs` | marco | `reached` | total de pacotes abertos |
| `pieces` | marco | `reached` | total de peças novas colocadas no tabuleiro |
| `dupes` | marco | `reached` | total de cartas repetidas |
| `piece` | `common`, `uncommon`, `rare`, `pity` | `placed` | peça nova colocada (por raridade; `pity` = garantida) |
| `shop` | id do pacote | `buy` | comprou pacote na loja |
| `upgrade` | `<id>-<nível>` | `buy` | comprou melhoria |
| `auto` | `opener` | `unlocked` | liberou o auto-abridor |
| `auto` | `offline` | `opened` | o auto-abridor abriu pacotes com o jogo fechado |
| `achievement` | id | `unlocked` | conquista |
| `reward` | `pack` / `double` | `granted` | recompensa de anúncio entregue |
| `screen` | `album`, `upgrades`, `menu`, `language`, `image`, `end` | `open` | abriu a tela |
| `language` | `en`, `ru`, `pt`, `es`, `tr` | `selected` | trocou o idioma |
| `game` | `collection` | `complete` | fechou a última série |
| `game` | `victory` | `reached` | vitória registrada |
