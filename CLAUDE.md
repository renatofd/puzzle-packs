# incremental-kit: guia para o Claude

Este repositório é um template de jogos incrementais. Quando ele for usado como base de um jogo novo, siga estas regras.

## Regras fixas

- Fale com o usuário em português do Brasil.
- **Tudo é desenhado em canvas com PixiJS v8.** O `index.html` só tem a tag `<canvas>`. Nunca crie botões, menus ou textos em HTML/DOM; use os componentes de `src/ui` ou crie novos componentes PixiJS lá.
- Desempenho é prioridade: use `BitmapText` para texto que muda todo frame, `Particles`/`ParticleContainer` para partículas e redesenhe `Graphics` só quando algo mudar.
- `src/core`, `src/modules` e `src/sim` não podem importar PixiJS. A lógica do jogo fica fora das cenas para rodar nos testes e no simulador.
- Conteúdo é dado: recursos, atributos, árvore, conquistas e prestígio ficam em `content.ts`, não espalhados no código.
- Ao mudar a estrutura do save, suba `version` na definição do jogo e adicione uma migração em `migrations`.

## Mapa do código

| Pasta | Conteúdo |
| --- | --- |
| `src/core` | Motor (`engine.ts`), números grandes (`num.ts`), modificadores, save/offline, loop de passo fixo, eventos |
| `src/modules` | Prestígio, runs curtas, automação, eventos aleatórios |
| `src/ui` | `KitApp`/`Scene`, `skin` (pele 9-slice opcional), `Button` (selo "!" com `badge`, `icon`), `Badge`, `Panel`, `ProgressBar`, `Tooltip`, `Toasts`, `TreeView`, `Particles`, `FloatingText`, `ScreenShake`, `ResourceBar`, `DebugPanel`, `GameMenu`, `Slider`, `audio`, `settings` |
| `src/sim` | Simulador headless de balanceamento, com perfis de jogador (`simulateProfiles`, `DEFAULT_PROFILES`) |
| `games/puzzle-packs` | **O jogo deste repositório.** Economia em `collection.ts` (sem Pixi), dados em `data/*.json`, textos em `i18n/*.json`, arte e corte das peças em `art.ts`, portais em `portal.ts` |
| `games/node-breaker` | Jogo de exemplo do template: use como referência |
| `tools/simulate.ts` | Bot que joga o Puzzle Packs e mede o tempo de cada série (`npm run sim`) |
| `tools/simulate-node-breaker.ts` | Simulador do exemplo (`npm run sim:node-breaker`) |
| `tools/zip.ts` | `npm run build:portal`: gera `dist/puzzlepacks-portal.zip` |

## Como criar um jogo novo a partir do template

1. Copie `games/node-breaker` para `games/<nome-do-jogo>` (ou renomeie, se o repositório for só desse jogo).
2. Reescreva `content.ts`: recursos, `stats` (valores base), `upgrades` (com `pos`, `parents`, `cost`, `effects`), `achievements`, `unlocks` e camadas de prestígio.
3. Monte os módulos em `game.ts` (`createGame`), incluindo só os que o jogo usa.
4. Substitua `arena.ts` pela mecânica principal do jogo, como um `GameModule` sem dependência de tela. Leia atributos com `engine.statNumber('...')` e dê recursos com `engine.gain(...)`.
5. Adapte as cenas (`hub-scene.ts`, `run-scene.ts`) e o `main.ts`; aponte o `index.html` para o `main.ts` do jogo.
6. Adapte `tools/simulate.ts` com um bot do novo jogo e rode `npm run sim`. A política do bot deve respeitar o perfil (`effort`, `idleSeconds`, `prestige`). Mire em nenhuma parede (3+ minutos sem compras) nos perfis com prestígio, paredes no perfil sem prestígio e na duração total que o usuário pediu.
7. Escreva testes em `tests/` para a lógica nova.

## Ganchos prontos

- **Selo "!"**: todo botão que leva a uma árvore mostra `button.badge = hasAffordable(engine, árvores)`, inclusive na tela de resultado da run.
- **Pausar a run**: `runs.hold = () => condição` congela o tempo da run (tutorial, popup esperando o jogador).
- **Save desligado**: `saves.enabled = false` em modos de teste ou debug que não podem tocar no save do jogador.
- **Juice da árvore**: `TreeView` já treme o tooltip ao abrir e solta uma onda no formato do nó a cada compra; desligue com `wobble: false` ou `buyWave: false`. Se mudar o formato dos nós, mude `nodePath` para a onda acompanhar.

## Antes de entregar

```bash
npm run typecheck
npm test
npm run sim
npm run build:portal
```

Teste no navegador (`npm run dev`, Chromium via Playwright em `/opt/pw-browsers` quando disponível) e verifique o console sem erros. F1 abre o painel de debug.

## Puzzle Packs

- Textos visíveis passam por `t()` de `games/puzzle-packs/i18n.ts`; adicione a chave nos 5 JSON (EN, RU, PT, ES, TR). O teste de localização falha se faltar alguma.
- Arte e sons só entram pelo `public/assets/manifest.json` (`"ready": true`; sons na lista `sounds`).
- GUI e sons vêm do acervo do Renato (`E:\Recursos`, skill game-assets). As ilustrações do álbum, os pacotes e o verso das cartas são gerados com sprite-gen (Grok) só porque o Renato pediu; não gere outra arte com IA sem ele pedir.
- A pele da interface (`src/ui/skin.ts`, montada em `games/puzzle-packs/gui.ts`) usa peças brancas 9-slice que recebem a cor por tint. Registre a origem de cada arquivo novo em `assets_manifest.json` e `CREDITS.md`.
- Ritmo alvo (perfil Humano do `npm run sim`): série 1 ~3 min, série 2 ~10 min, série 3 ~25 min, série 4 ~40 min, série 5 ~60 min, série 6 ~80 min (tempos acumulados).
