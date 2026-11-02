import type { GameDefinition, UpgradeDef } from '../../src/core/types';
import type { PrestigeLayerDef } from '../../src/modules/prestige';

/**
 * Conteúdo do jogo de exemplo. Tudo aqui é dado: recursos, atributos,
 * árvore, conquistas. Para criar outro jogo, comece copiando este arquivo.
 */

export const COLORS = {
  bits: 0x4cc9f0,
  cores: 0xf5c249,
  prisms: 0xd16cf5,
};

const killCount = (s: { flags: Record<string, unknown> }) => Number(s.flags.kills ?? 0);

// Atalhos para declarar nós da árvore com menos repetição.
const bits = (base: number, growth?: number) => ({ resource: 'bits', base, growth });
const cores = (base: number, growth?: number) => ({ resource: 'cores', base, growth });
const prisms = (base: number, growth?: number) => ({ resource: 'prisms', base, growth });

const pct = (v: number) => `${Math.round(v * 100)}%`;

const mainTree: UpgradeDef[] = [
  {
    id: 'core', name: 'Núcleo', icon: 'CORE', pos: { x: 0, y: 0 },
    description: 'Seu cursor causa +1 de dano.',
    cost: bits(3), effects: [{ stat: 'cursor.damage', op: 'add', value: 1 }],
  },

  // Ramo de dano (para cima)
  {
    id: 'dmg1', name: 'Dano', icon: 'DMG', pos: { x: 0, y: -1 }, parents: ['core'], maxLevel: 10,
    description: '+1 de dano por nível.',
    cost: bits(10, 1.5), effects: [{ stat: 'cursor.damage', op: 'add', value: 1 }],
  },
  {
    id: 'rate1', name: 'Frequência', icon: 'SPD', pos: { x: -1, y: -2 }, parents: ['dmg1'], maxLevel: 10,
    description: 'Ataques 15% mais rápidos por nível.',
    cost: bits(25, 1.6), effects: [{ stat: 'cursor.rate', op: 'mult', value: 1.15 }],
  },
  {
    id: 'crit', name: 'Crítico', icon: 'CRT', pos: { x: 1, y: -2 }, parents: ['dmg1'], maxLevel: 6,
    description: '+5% de chance de acerto crítico por nível.',
    cost: bits(60, 1.8), effects: [{ stat: 'crit.chance', op: 'add', value: 0.05 }],
  },
  {
    id: 'critm', name: 'Crítico Forte', icon: 'CRx', pos: { x: 2, y: -3 }, parents: ['crit'], maxLevel: 5,
    description: 'Críticos causam +50% de dano por nível.',
    cost: bits(300, 2), effects: [{ stat: 'crit.mult', op: 'add', value: 0.5 }],
  },
  {
    id: 'dmg2', name: 'Dano Ampliado', icon: 'DMG+', pos: { x: 0, y: -3 }, parents: ['rate1', 'crit'], maxLevel: 8,
    description: 'Dano ×1,5 por nível.',
    cost: bits(500, 2.2), effects: [{ stat: 'cursor.damage', op: 'mult', value: 1.5 }],
  },
  {
    id: 'chain', name: 'Corrente', icon: 'CHN', pos: { x: -1, y: -3 }, parents: ['rate1'], maxLevel: 5,
    description: '+10% de chance de um raio pular para um nó próximo ao destruir.',
    cost: bits(400, 2), effects: [{ stat: 'chain.chance', op: 'add', value: 0.1 }],
  },
  {
    id: 'chaind', name: 'Raio Forte', icon: 'CH+', pos: { x: -2, y: -4 }, parents: ['chain'], maxLevel: 4,
    description: 'O raio causa +25% do seu dano por nível.',
    cost: bits(2000, 2.5), effects: [{ stat: 'chain.damage', op: 'add', value: 0.25 }],
  },
  {
    id: 'dmg3', name: 'Sobrecarga', icon: 'DMG3', pos: { x: 0, y: -4 }, parents: ['dmg2'], maxLevel: 5,
    description: 'Dano ×2 por nível.',
    cost: bits(1.2e4, 3), effects: [{ stat: 'cursor.damage', op: 'mult', value: 2 }],
  },

  // Ramo de área e drones (esquerda)
  {
    id: 'area1', name: 'Área', icon: 'AREA', pos: { x: -1, y: 0 }, parents: ['core'], maxLevel: 8,
    description: '+8 de raio do cursor por nível.',
    cost: bits(15, 1.5), effects: [{ stat: 'cursor.radius', op: 'add', value: 8 }],
  },
  {
    id: 'area2', name: 'Área Ampla', icon: 'AR+', pos: { x: -2, y: 0 }, parents: ['area1'], maxLevel: 5,
    description: 'Raio ×1,15 por nível.',
    cost: bits(800, 2), effects: [{ stat: 'cursor.radius', op: 'mult', value: 1.15 }],
  },
  {
    id: 'drones', name: 'Drones', icon: 'DRN', pos: { x: -2, y: 1 }, parents: ['area1'], maxLevel: 5,
    description: '+1 drone que atira sozinho em nós aleatórios.',
    cost: bits(150, 3), effects: [{ stat: 'drones', op: 'add', value: 1 }],
  },
  {
    id: 'dronerate', name: 'Drones Rápidos', icon: 'DR+', pos: { x: -3, y: 1 }, parents: ['drones'], maxLevel: 5,
    description: 'Drones atiram 30% mais rápido por nível.',
    cost: bits(600, 2.2), effects: [{ stat: 'drone.rate', op: 'mult', value: 1.3 }],
  },
  {
    id: 'dronedmg', name: 'Drones Fortes', icon: 'DRD', pos: { x: -3, y: 2 }, parents: ['drones'], maxLevel: 5,
    description: 'Dano dos drones ×1,5 por nível.',
    cost: bits(1500, 2.5), effects: [{ stat: 'drone.damage', op: 'mult', value: 1.5 }],
  },

  // Ramo de tempo e chefes (para baixo)
  {
    id: 'time1', name: 'Tempo', icon: 'TIME', pos: { x: 0, y: 1 }, parents: ['core'], maxLevel: 10,
    description: '+1 segundo por run, por nível.',
    cost: bits(20, 1.6), effects: [{ stat: 'run.duration', op: 'add', value: 1 }],
  },
  {
    id: 'time2', name: 'Tempo Estendido', icon: 'T+', pos: { x: 0, y: 2 }, parents: ['time1'], maxLevel: 5,
    description: '+2 segundos por run, por nível.',
    cost: bits(1000, 2.5), effects: [{ stat: 'run.duration', op: 'add', value: 2 }],
  },
  {
    id: 'boss', name: 'Sinal do Chefe', icon: 'BOSS', pos: { x: 1, y: 2 }, parents: ['time1'],
    description: 'Um chefe aparece na metade de cada run. Ele dá Núcleos.',
    cost: bits(300), effects: [{ stat: 'boss.enabled', op: 'add', value: 1 }],
  },
  {
    id: 'bossrew', name: 'Espólio', icon: 'B$', pos: { x: 2, y: 2 }, parents: ['boss'], maxLevel: 3,
    description: 'Chefes dão o dobro de Núcleos por nível.',
    cost: cores(5, 2), effects: [{ stat: 'boss.reward', op: 'mult', value: 2 }],
  },
  {
    id: 'reboot', name: 'Reinicialização', icon: 'RBT', pos: { x: 0, y: 3 }, parents: ['time2'],
    description: 'Libera o Reboot: recomece do zero em troca de Prismas permanentes.',
    cost: [bits(1e4), cores(10)], effects: [],
  },

  // Ramo de economia (direita)
  {
    id: 'value1', name: 'Valor', icon: 'VAL', pos: { x: 1, y: 0 }, parents: ['core'], maxLevel: 10,
    description: '+1 Bit por nó destruído, por nível.',
    cost: bits(12, 1.55), effects: [{ stat: 'node.value', op: 'add', value: 1 }],
  },
  {
    id: 'spawn1', name: 'Geração', icon: 'SPN', pos: { x: 2, y: 0 }, parents: ['value1'], maxLevel: 8,
    description: 'Nós aparecem 20% mais rápido por nível.',
    cost: bits(40, 1.7), effects: [{ stat: 'spawn.rate', op: 'mult', value: 1.2 }],
  },
  {
    id: 'maxn', name: 'Densidade', icon: 'MAX', pos: { x: 2, y: -1 }, parents: ['spawn1'], maxLevel: 6,
    description: '+4 nós na tela ao mesmo tempo, por nível.',
    cost: bits(120, 1.9), effects: [{ stat: 'spawn.max', op: 'add', value: 4 }],
  },
  {
    id: 'big', name: 'Nós Grandes', icon: 'BIG', pos: { x: 3, y: 0 }, parents: ['spawn1'], maxLevel: 4,
    description: '+5% de chance de nós grandes, que valem 6× mais.',
    cost: bits(250, 2), effects: [{ stat: 'big.chance', op: 'add', value: 0.05 }],
  },
  {
    id: 'gold', name: 'Nós Dourados', icon: 'GLD', pos: { x: 2, y: 1 }, parents: ['value1'], maxLevel: 5,
    description: '+1% de chance de nós dourados, que dão Núcleos.',
    cost: bits(200, 2), effects: [{ stat: 'gold.chance', op: 'add', value: 0.01 }],
  },
  {
    id: 'mining', name: 'Mineração', icon: 'MIN', pos: { x: 3, y: 1 }, parents: ['gold'],
    description: 'Libera Mineradores: geram Bits mesmo com o jogo fechado.',
    cost: cores(3), effects: [],
  },
  {
    id: 'minerp', name: 'Mineração Pesada', icon: 'MN+', pos: { x: 4, y: 1 }, parents: ['mining'], maxLevel: 5,
    description: 'Mineradores produzem o dobro por nível.',
    cost: cores(10, 2.5), effects: [{ stat: 'gen.miner.prod', op: 'mult', value: 2 }],
  },
  {
    id: 'value2', name: 'Valor Ampliado', icon: 'VAL+', pos: { x: 3, y: -2 }, parents: ['maxn', 'big'], maxLevel: 8,
    description: 'Valor dos nós ×1,5 por nível.',
    cost: bits(3000, 2.3), effects: [{ stat: 'node.value', op: 'mult', value: 1.5 }],
  },
  {
    id: 'singularity', name: 'Singularidade', icon: 'END', pos: { x: 2, y: -4 }, parents: ['dmg3', 'value2'],
    requires: { all: [{ upgrade: 'dmg3', level: 2 }, { upgrade: 'value2', level: 4 }] },
    description: 'O fim da rede. Precisa de Sobrecarga 2 e Valor Ampliado 4.',
    cost: [bits(1.5e6), cores(80)], effects: [],
  },
];

const rebootTree: UpgradeDef[] = [
  {
    id: 'p-gain', name: 'Eco', icon: 'ECO', tree: 'reboot', pos: { x: 0, y: 0 }, maxLevel: 10,
    description: 'Bits ×2 por nível. Permanente.',
    cost: prisms(1, 1.8), effects: [{ stat: 'bits.gain', op: 'mult', value: 2 }],
  },
  {
    id: 'p-dmg', name: 'Memória de Combate', icon: 'MEM', tree: 'reboot', pos: { x: -1, y: -1 }, parents: ['p-gain'], maxLevel: 10,
    description: 'Dano ×1,25 por nível. Permanente.',
    cost: prisms(2, 1.8), effects: [{ stat: 'cursor.damage', op: 'mult', value: 1.25 }],
  },
  {
    id: 'p-time', name: 'Relógio Interno', icon: 'CLK', tree: 'reboot', pos: { x: 1, y: -1 }, parents: ['p-gain'], maxLevel: 5,
    description: '+2 segundos por run, por nível. Permanente.',
    cost: prisms(3, 2), effects: [{ stat: 'run.duration', op: 'add', value: 2 }],
  },
  {
    id: 'p-cores', name: 'Cristalização', icon: 'CRS', tree: 'reboot', pos: { x: 1, y: 0 }, parents: ['p-gain'], maxLevel: 3,
    description: 'Núcleos ×2 por nível. Permanente.',
    cost: prisms(5, 3), effects: [{ stat: 'cores.gain', op: 'mult', value: 2 }],
  },
  {
    id: 'p-auto', name: 'Piloto Automático', icon: 'AUTO', tree: 'reboot', pos: { x: -1, y: 0 }, parents: ['p-gain'],
    description: 'A próxima run começa sozinha 2 segundos depois da anterior.',
    cost: prisms(4), effects: [{ stat: 'auto.run', op: 'add', value: 1 }],
  },
  {
    id: 'p-head', name: 'Vantagem', icon: 'HEAD', tree: 'reboot', pos: { x: 0, y: -2 }, parents: ['p-dmg', 'p-time'], maxLevel: 5,
    description: 'Nós valem ×2 por nível. Permanente.',
    cost: prisms(6, 2.5), effects: [{ stat: 'node.value', op: 'mult', value: 2 }],
  },
];

export const definition: GameDefinition = {
  id: 'node-breaker',
  version: 1,
  resources: [
    { id: 'bits', name: 'Bits', color: COLORS.bits },
    { id: 'cores', name: 'Núcleos', color: COLORS.cores },
    { id: 'prisms', name: 'Prismas', color: COLORS.prisms },
  ],
  stats: {
    'run.duration': 8,
    'cursor.radius': 45,
    'cursor.damage': 1,
    'cursor.rate': 3,
    'spawn.rate': 1.5,
    'spawn.max': 10,
    'node.hp': 3,
    'node.value': 1,
    'crit.chance': 0,
    'crit.mult': 2,
    'chain.chance': 0,
    'chain.damage': 0.5,
    drones: 0,
    'drone.rate': 1,
    'drone.damage': 0.5,
    'big.chance': 0,
    'gold.chance': 0.01,
    'boss.enabled': 0,
    'boss.reward': 1,
    'auto.run': 0,
  },
  generators: [
    {
      id: 'miner', name: 'Minerador', produces: 'bits', baseProduction: 1,
      cost: cores(2, 1.6), unlockWhen: { upgrade: 'mining' },
      description: 'Gera Bits sozinho, inclusive offline.',
    },
  ],
  upgrades: [...mainTree, ...rebootTree],
  achievements: [
    { id: 'first-run', name: 'Primeira conexão', description: 'Complete uma run. Bits +5%.', when: (s) => (s.modules.runs?.count ?? 0) >= 1 && !s.modules.runs?.active, effects: [{ stat: 'bits.gain', op: 'mult', value: 1.05 }] },
    { id: 'bits-100', name: 'Byte', description: 'Ganhe 100 Bits no total. Bits +5%.', when: { lifetime: 'bits', gte: 100 }, effects: [{ stat: 'bits.gain', op: 'mult', value: 1.05 }] },
    { id: 'bits-10k', name: 'Megabyte', description: 'Ganhe 10 mil Bits no total. Bits +5%.', when: { lifetime: 'bits', gte: 1e4 }, effects: [{ stat: 'bits.gain', op: 'mult', value: 1.05 }] },
    { id: 'bits-1m', name: 'Gigabyte', description: 'Ganhe 1 milhão de Bits no total. Bits +10%.', when: { lifetime: 'bits', gte: 1e6 }, effects: [{ stat: 'bits.gain', op: 'mult', value: 1.1 }] },
    { id: 'kills-500', name: 'Quebra-nós', description: 'Destrua 500 nós. Dano +5%.', when: (s) => killCount(s) >= 500, effects: [{ stat: 'cursor.damage', op: 'mult', value: 1.05 }] },
    { id: 'kills-5k', name: 'Exterminador', description: 'Destrua 5.000 nós. Dano +10%.', when: (s) => killCount(s) >= 5000, effects: [{ stat: 'cursor.damage', op: 'mult', value: 1.1 }] },
    { id: 'gold-1', name: 'Pepita', description: 'Destrua um nó dourado.', when: { lifetime: 'cores', gte: 1 } },
    { id: 'boss-1', name: 'Matador de Chefes', description: 'Derrote um chefe. Núcleos +10%.', when: { flag: 'bossKilled' }, effects: [{ stat: 'cores.gain', op: 'mult', value: 1.1 }] },
    { id: 'reboot-1', name: 'Recomeço', description: 'Faça seu primeiro Reboot.', when: { lifetime: 'prisms', gte: 1 } },
    { id: 'win', name: 'Singularidade', description: 'Termine o jogo.', when: { upgrade: 'singularity' } },
  ],
  unlocks: [
    { id: 'reboot', when: { upgrade: 'reboot' } },
    { id: 'miners', when: { upgrade: 'mining' } },
    { id: 'victory', when: { upgrade: 'singularity' } },
  ],
  offline: { maxSeconds: 8 * 3600, efficiency: 1 },
};

export const prestigeLayers: PrestigeLayerDef[] = [
  { id: 'reboot', currency: 'prisms', basedOn: 'bits', threshold: 2000, exponent: 0.5, unlockWhen: { unlock: 'reboot' } },
];

export { pct };
