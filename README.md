# incremental-kit

Template reutilizável para jogos incrementais em TypeScript, desenhado 100% em canvas com [PixiJS](https://pixijs.com/) v8. A página tem só uma tag `<canvas>`: botões, painéis, árvore de upgrades, tooltips e textos são todos desenhados pelo PixiJS.

Inclui um jogo de exemplo completo, **Node Breaker** (no estilo de Nodebuster): runs curtas com tempo limitado, uma árvore de 28 upgrades, chefes, mineradores que produzem offline e uma camada de prestígio (Reboot) com árvore própria. O bot ótimo do simulador termina o jogo em uns 29 minutos e o bot "humano" em uns 39; uma pessoa deve levar entre 45 e 60.

## Como rodar

```bash
npm install
npm run dev        # abre o jogo em http://localhost:5173
npm test           # testes do núcleo e do jogo de exemplo
npm run sim        # simula o jogo com três perfis de bot e mostra o ritmo
npm run build      # build de produção em dist/
```

No jogo, **M** abre o menu (opções, estatísticas, conquistas e save) e **F1** (ou a tecla `) abre o painel de debug: dar recursos, acelerar o tempo, pular uma hora e apagar o save.

## Estrutura

```
src/
  core/        motor sem tela: números grandes, modificadores, árvore, save, loop
  modules/     módulos opcionais: prestígio, runs, automação, eventos aleatórios
  ui/          kit de interface em canvas: cenas, botões, árvore, partículas, HUD
  sim/         simulador de balanceamento headless
games/
  node-breaker/  jogo de exemplo (conteúdo, arena, cenas)
tools/
  simulate.ts    script do simulador para o jogo de exemplo
tests/
```

O núcleo (`src/core`, `src/modules`, `src/sim`) não importa o PixiJS. A mesma lógica roda no navegador, nos testes e no simulador.

## Núcleo

| Sistema | Arquivo | O que faz |
| --- | --- | --- |
| Números grandes | `core/num.ts` | `Decimal` do break_eternity.js (passa de 1e308) e `format()` com sufixos K, M, B… e notação científica |
| Motor | `core/engine.ts` | Estado, recursos, geradores com custo exponencial e compra em lote, upgrades, condições, conquistas, desbloqueios, reset. `hasAffordable(engine, árvores)` diz se há upgrade comprável (para o selo "!") |
| Modificadores | `core/modifiers.ts` | Cada atributo vale `(base + Σ add) × Π mult ^ Π pow`, juntando upgrades, conquistas, módulos e buffs |
| Árvore de upgrades | `core/types.ts` (`UpgradeDef`) | Nós com pais, posição, níveis, custos em várias moedas, requisitos extras e várias árvores |
| Save | `core/save.ts` | Salva em localStorage, migra versões antigas, exporta/importa texto e calcula o progresso offline. `saves.enabled = false` desliga a gravação (modo de teste) |
| Loop | `core/loop.ts` | Passo fixo (o jogo dá o mesmo resultado em qualquer FPS) e multiplicador de velocidade |
| Eventos | `core/events.ts` | O motor emite `upgradeBought`, `achievement`, `unlock`, `gain`… e a interface reage |

## Módulos opcionais

| Módulo | Arquivo | Uso |
| --- | --- | --- |
| Prestígio em camadas | `modules/prestige.ts` | Reset com moeda permanente; cada camada preserva sua própria árvore |
| Runs curtas | `modules/runs.ts` | Rodada com duração por atributo, soma o que foi coletado, resumo no fim. `runs.hold = () => true` congela o tempo (ex.: tutorial esperando o jogador) |
| Automação | `modules/automation.ts` | Compradores automáticos desbloqueáveis |
| Eventos aleatórios | `modules/random-events.ts` | Bônus raros e temporários no estilo golden cookie |

## Kit de interface (canvas)

| Peça | Arquivo |
| --- | --- |
| `KitApp` e `Scene` (camadas e troca de telas) | `ui/app.ts` |
| `Button` (com selo "!" opcional: `badge: true` ou `button.badge = ...`), `Badge`, `Panel`, `ProgressBar`, `Tooltip` (com `wobble()`), `Toasts`, textos | `ui/widgets.ts` |
| `TreeView`: arrastar, zoom, comprar, segurar para comprar vários níveis, nós "?" escondidos, tooltip que treme ao abrir (`wobble`) e onda no formato do nó a cada compra (`buyWave`) | `ui/tree-view.ts` |
| `Particles` (ParticleContainer), `FloatingText` (BitmapText com pool), `ScreenShake` | `ui/fx.ts` |
| `ResourceBar` e `DebugPanel` | `ui/hud.ts` |
| Tweens e easing sem dependências | `ui/tween.ts` |
| `audio`: efeitos e música sintetizados com Web Audio (sem arquivos), volumes por canal | `ui/audio.ts` |
| `settings`: volumes, intensidade de efeitos, tremida de tela e notação, salvos à parte do jogo | `ui/settings.ts` |
| `GameMenu`: opções, estatísticas, conquistas e save (exportar, importar, apagar) | `ui/menu.ts` |
| `Slider` | `ui/widgets.ts` |

Textos que mudam todo frame usam `BitmapText`, e partículas usam `ParticleContainer`, que são os caminhos mais rápidos do PixiJS.

## Como criar um jogo novo

1. Copie `games/node-breaker` para `games/meu-jogo`.
2. Edite `content.ts`: recursos, atributos base (`stats`), árvore (`upgrades`), conquistas e camadas de prestígio. Um upgrade é só dado:

   ```ts
   {
     id: 'dmg1', name: 'Dano', icon: 'DMG', pos: { x: 0, y: -1 }, parents: ['core'], maxLevel: 10,
     description: '+1 de dano por nível.',
     cost: { resource: 'bits', base: 10, growth: 1.5 },
     effects: [{ stat: 'cursor.damage', op: 'add', value: 1 }],
   }
   ```

3. Leia os atributos na lógica do jogo com `engine.statNumber('cursor.damage')`. Upgrades, conquistas e prestígio já entram no cálculo.
4. Escolha os módulos em `game.ts` e troque a lógica de `arena.ts` pela do seu jogo, mantendo-a sem dependência de tela.
5. Aponte o `index.html` para o `main.ts` do novo jogo.
6. Ajuste o ritmo com o simulador antes de testar com pessoas.

## Simulador de balanceamento

`npm run sim -- [minutos] [perfil]` joga o exemplo com três perfis de bot e imprime uma tabela de marcos por perfil. Todos miram nos grupos de nós e compram sempre o upgrade mais barato:

- **Bot ótimo**: mexe o mouse rápido, faz Reboot quando o ganho compensa e quase não para no hub.
- **Humano**: metade do esforço (mouse mais lento, troca de alvo menos vezes) e 6 segundos parado no hub entre runs.
- **Sem prestígio**: joga como o ótimo, mas nunca faz Reboot.

```
Perfil        | 1ª compra | Chefe | Mineração | 1º Reboot | Auto   | Fim    | Paredes
Bot ótimo     | 0m09s     | 5m27s | 4m13s     | 14m18s    | 24m17s | 28m54s | 0
Humano        | 0m14s     | 8m42s | 7m22s     | 19m37s    | 33m18s | 38m50s | 0
Sem prestígio | 0m09s     | 5m27s | 4m13s     | -         | -      | 45m28s | 2
```

Parede é um trecho de 3 minutos ou mais sem nenhuma compra. O objetivo é que nenhum perfil com prestígio encontre paredes e que, sem prestígio, elas apareçam: é isso que empurra o jogador para o reset. Passe um perfil (`optimal`, `human` ou `no-prestige`) para ver também o relatório dele compra a compra.

No seu jogo, use `simulateProfiles(policyFor, opções, perfis)` e `formatProfileTable(resultados, marcos)` de `src/sim/simulator.ts`. Cada `SimProfile` traz `effort` (fração dos cliques), `idleSeconds` (tempo parado no hub) e `prestige`; a política do jogo lê esses números. `buyCheapestUpgrade(engine, árvores, avoid)` ignora upgrades pagos com os recursos de `avoid`, para o bot poupar para uma compra maior.
