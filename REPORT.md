# Puzzle Packs: relatório do MVP

Incremental de rasgar pacotes de cartas. Cada carta é uma peça de jigsaw de uma ilustração; completar a ilustração libera a próxima série (e, na primeira, o auto-abridor). Repetidas viram moedas para comprar pacotes melhores e melhorias. São 26 séries (3x3 a 10x10; as séries 4 a 26 entraram depois do MVP) e o jogo termina com uma tela de conclusão e estatísticas.

Feito sobre o template `incremental-kit` (PixiJS v8, tudo em canvas). O núcleo do kit quase não mudou; o jogo fica em `games/puzzle-packs/`.

## Como rodar

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # testes (núcleo do kit + Puzzle Packs)
npm run sim            # simulador de ritmo (3 perfis, mediana de 25 sementes)
npm run build          # build em dist/
npm run build:portal   # build + dist/puzzlepacks-portal.zip (index.html na raiz)
```

No jogo: toque/arraste no pacote para rasgar, toque (ou espaço) para virar as cartas mais rápido, **M** abre o menu. Em `npm run dev`, **F1** abre o painel de debug do kit (dar moedas, acelerar o tempo, pular 1 hora, apagar o save) e `game` fica acessível no console.

## O que foi feito

| Item do HANDOFF | Onde | Situação |
| --- | --- | --- |
| 1. Rasgar pacote: arrastar ou tocar, squash, partículas, som, cartas viram uma a uma | `main-scene.ts`, `views.ts`, `sfx.ts` | Feito. Arrastar na horizontal rasga seguindo o dedo; um toque também abre. 3 a 5 cartas conforme pacote e melhorias. |
| 2. Cartas = peças; série 1 3x3, série 2 4x4, série 3 5x5; nova encaixa no álbum, repetida vira moeda | `collection.ts`, `art.ts`, `views.ts` | Feito. A peça nova voa até o tabuleiro e encaixa; repetidas soltam moedas no contador. |
| 3. Raridade (borda comum, centro incomum, 1 a 2 raras) e pity | `data/rarity.json`, `data/series.json`, `collection.ts` | Feito. Pity de peça nova a cada 6 pacotes sem novidade (melhoria reduz) e pity próprio por série quando só faltam raras. |
| 4. Loja: básico, melhor, da série atual | `data/packs.json`, `main-scene.ts` | Feito. Básico grátis; Pacote da Série e Premium custam moedas e ficam numa fila. |
| 5. Skill tree do template | `data/upgrades.json`, `tree-scene.ts` | Feito: mais cartas, valor da repetida (2 nós), chance de rara (2 nós), desconto, velocidade de abertura, pity, auto-abridor turbo e Assinatura (auto-abre pacotes da série). |
| 6. Automação e offline | `collection.ts` (tick), `content.ts` (`offline`) | Feito. Série 1 completa libera o auto-abridor (1 pacote a cada 15 s, melhorável). Offline com teto de 3 h e aviso ao voltar. |
| 7. Álbum | `album-scene.ts` | Feito. 3 tabuleiros com % e botão "Ver imagem" (imagem inteira se completa; tabuleiro grande se não). |
| 8. Final | `end-panel.ts` | Feito. Tela de conclusão com as 3 ilustrações, tempo, pacotes, cartas, repetidas, moedas e o tempo de cada série. |
| Rewarded opcional (pacote grátis, 2× moedas por 2 min), sem interstitial na abertura | `portal.ts`, `collection.ts` | Feito. Botões aparecem a cada 2,5 min e ficam desligados durante a abertura. Interstitial só ao voltar do Álbum/Melhorias. |
| Stubs de portal (init, loading, gameplay start/stop, commercial break, rewarded, cloud save) | `portal.ts` | Feito, com o ponto exato de cada chamada de GamePush/Poki/CrazyGames marcado com `TODO`. Sem portal, o rewarded simula um anúncio de 1 s. |
| Save local automático | kit (`SaveManager`) | A cada 10 s, ao esconder a aba e ao fechar. |
| Celular e PC, toque e mouse, retrato e paisagem | `context.ts` (`layoutOf`), cenas | Layout próprio para retrato (base 560×960) e paisagem. Testado em 1280×760 e 540×960. |
| Build < 15 MB e zip de portal | `tools/zip.ts` | 0,75 MB sem compressão, 0,23 MB no zip. |
| Economia em módulo separado com testes | `collection.ts`, `tests/puzzle-packs.test.ts` | 14 testes do jogo (dados, pity, loja, auto, offline, vitória, localização). |
| Dados em JSON | `games/puzzle-packs/data/` | Séries, grade, raridades, pity, pacotes, upgrades e atributos base. |
| Localização EN, RU, PT, ES, TR | `games/puzzle-packs/i18n/*.json` | Feito, incluindo o menu e a árvore do kit. Detecta o idioma do navegador; o botão de idioma troca e recarrega. |
| Corte das ilustrações em código | `art.ts` | Uma imagem por série; o código recorta as peças com encaixes de jigsaw. Trocar a imagem não exige retrabalho. |

### Mudanças no núcleo do kit (mínimas)

- `src/ui/strings.ts` (novo): textos do menu e da árvore em um objeto que o jogo troca (`setKitText`). `menu.ts` e `tree-view.ts` passaram a ler dele; o padrão continua em português, então o Node Breaker não muda.
- `src/ui/app.ts`: `setPortraitBase()` e `isPortrait()`. Com uma base de retrato definida, `uiScale` (e com ele tooltips e toasts) usa essa base quando a tela está em pé. Sem chamar, nada muda.
- `vite.config.ts`: `base: './'` para o build rodar em subpasta de portal. `tsconfig.json`: `resolveJsonModule`.
- O simulador do Node Breaker virou `npm run sim:node-breaker`; `npm run sim` agora simula o Puzzle Packs.

## Números do simulador

`npm run sim` joga com três perfis (sem prestígio no MVP). O tempo de uma abertura manual é o mesmo da animação na tela (4,5 s no começo, até 1,7 s com Mãos Rápidas):

- **Bot ótimo**: abre o próximo pacote assim que a animação acaba.
- **Humano**: 1,5 s entre pacotes e abre 80% do tempo.
- **Casual**: abre um pacote de vez em quando (35% do tempo) e deixa o auto-abridor trabalhar.

Mediana de 25 sementes, em minutos desde o início (entre parênteses, de p10 a p90):

| Perfil | Série 1 | Série 2 | Série 3 (fim) | Pacotes |
| --- | --- | --- | --- | --- |
| Bot ótimo | 1,9 (0,6 a 2,2) | 7,2 (5,2 a 7,6) | 15,4 (13,3 a 16,6) | 466 |
| **Humano** | **2,9** (0,9 a 3,4) | **10,0** (8,1 a 11,1) | **22,3** (20,4 a 24,4) | 461 |
| Casual | 6,4 (1,9 a 7,4) | 18,0 (13,6 a 20,7) | 36,7 (32,8 a 42,1) | 473 |

Meta do HANDOFF: série 1 em ~3 min, série 2 em ~10 min, série 3 em ~25 min. O perfil Humano fica em 2,9 / 10,0 / 22,3 min. A série 3 está uns 2,5 min abaixo da meta; para alongar, suba o último número de `seriesCostMult` em `data/packs.json` (hoje 800).

Paredes (3 min ou mais sem peça nova nem melhoria): nenhuma para Bot ótimo e Humano. O Casual tem 1 parede de 3,5 min na semente 42, caçando a última rara da série 3.

Observação sobre sorte: a série 1 tem uma única rara e pode sair no primeiro pacote (p10 de 0,9 min). O pity de rara (22 pacotes na série 1, 8 na 2, 6 na 3) põe um teto.

## Assets (`public/assets/manifest.json`)

Nenhuma arte foi gerada com IA. Tudo é placeholder desenhado em código (gradientes, formas e números nas peças). Para trocar: salve o arquivo no caminho indicado dentro de `public/assets/` e mude `"ready"` para `true`.

| id | Arquivo | Tamanho | Uso |
| --- | --- | --- | --- |
| series-1 | `series/series-1.png` | 1024×1024 | Ilustração da Série 1 (Aurora), cortada em 3×3 |
| series-2 | `series/series-2.png` | 1024×1024 | Ilustração da Série 2 (Floresta), cortada em 4×4 |
| series-3 | `series/series-3.png` | 1024×1024 | Ilustração da Série 3 (Oceano), cortada em 5×5 |
| pack-basic | `packs/basic.png` | 400×560 | Frente do Pacote Básico (o nome é desenhado por cima) |
| pack-series | `packs/series.png` | 400×560 | Frente do Pacote da Série |
| pack-premium | `packs/premium.png` | 400×560 | Frente do Pacote Premium |
| card-back | `ui/card-back.png` | 240×336 | Verso das cartas |
| portal-icon | `ui/icon-512.png` | 512×512 | Ícone para as páginas dos portais (não carregado pelo jogo) |
| portal-cover | `ui/cover-1280x720.png` | 1280×720 | Capa/thumbnail dos portais (não carregada pelo jogo) |

Os nomes das séries (Aurora, Floresta, Oceano) são só dos placeholders e estão em `i18n/*.json` (`series.s1`...).

## Testes e verificação

- `npm run typecheck`, `npm test` (36 testes), `npm run sim` e `npm run build:portal` passam.
- Testado no Chromium (Playwright) em paisagem 1280×760 e retrato 540×960, em PT, EN e RU: rasgar arrastando e tocando, virar cartas, peça encaixando no tabuleiro, série completa com toasts, auto-abridor, rewarded, loja, álbum, árvore, menu e tela final. O build do zip também foi aberto num servidor estático.
- Console sem erros. O Chromium headless (renderização por software) imprime avisos de desempenho do driver ("GPU stall due to ReadPixels"); não aparecem com GPU real.
- Não testei num celular físico; o alvo de 60 fps em celular médio ainda precisa de uma checagem num aparelho.

## Próximos passos

Fora do MVP, anotados conforme o HANDOFF:

- Mais séries e temas (só adicionar entradas em `data/series.json`, imagens no manifest e textos no i18n).
- Eventos (séries por tempo limitado, fins de semana com 2× raras).
- Troca de cartas entre jogadores.
- Cartas brilhantes (variante rara da carta repetida, com valor maior).
- Prestígio (o kit já tem `PrestigeModule`: por exemplo, "nova edição" que zera o álbum em troca de um multiplicador permanente).

Também vale:

- Ligar os SDKs reais em `portal.ts` (cada `TODO` marca a chamada).
- Sons reais (hoje são sintetizados; `audio.define` troca por amostras).
- Testar num celular médio e ajustar a quantidade de partículas se precisar.
- Afinar a série 3 para ~25 min se o teste com pessoas confirmar o simulador.
