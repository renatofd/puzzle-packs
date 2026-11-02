import { describe, expect, it } from 'vitest';
import {
  AutomationModule,
  D,
  Engine,
  PrestigeModule,
  RunModule,
  SaveManager,
  bulkCost,
  hasAffordable,
  deserialize,
  format,
  maxAffordable,
  memoryStorage,
  serialize,
  type GameDefinition,
} from '../src';

const def: GameDefinition = {
  id: 'test',
  version: 1,
  resources: [
    { id: 'gold', name: 'Ouro' },
    { id: 'gems', name: 'Gemas' },
  ],
  generators: [{ id: 'mine', name: 'Mina', produces: 'gold', baseProduction: 1, cost: { resource: 'gold', base: 10, growth: 1.15 } }],
  stats: { damage: 5 },
  upgrades: [
    { id: 'root', name: 'Raiz', description: '', cost: { resource: 'gold', base: 1 }, effects: [{ stat: 'damage', op: 'add', value: 1 }] },
    {
      id: 'dmg',
      name: 'Dano',
      description: '',
      parents: ['root'],
      maxLevel: 5,
      cost: { resource: 'gold', base: 10, growth: 2 },
      effects: [{ stat: 'damage', op: 'mult', value: 2 }],
    },
    {
      id: 'mine-boost',
      name: 'Mina+',
      description: '',
      parents: ['root'],
      requires: { generator: 'mine', owned: 1 },
      cost: { resource: 'gold', base: 5 },
      effects: [{ stat: 'gen.mine.prod', op: 'mult', value: 3 }],
    },
    {
      id: 'gem-boost',
      name: 'Gema',
      description: '',
      tree: 'ascend',
      cost: { resource: 'gems', base: 1 },
      effects: [{ stat: 'gold.gain', op: 'mult', value: 10 }],
    },
  ],
  achievements: [{ id: 'rich', name: 'Rico', description: '', when: { lifetime: 'gold', gte: 1000 }, effects: [{ stat: 'damage', op: 'add', value: 100 }] }],
  unlocks: [{ id: 'shop', when: { earned: 'gold', gte: 50 } }],
};

describe('números', () => {
  it('formata valores pequenos e grandes', () => {
    expect(format(12)).toBe('12');
    expect(format(1234)).toBe('1.23K');
    expect(format(D('1e9'))).toBe('1B');
    expect(format(D('1.5e100'))).toBe('1.5e100');
    expect(format(D('1e1000'))).toBe('1e1000');
  });

  it('serializa Decimals sem perder precisão', () => {
    const back = deserialize<{ a: any }>(serialize({ a: D('1e5000') }));
    expect(back.a.eq(D('1e5000'))).toBe(true);
  });
});

describe('custos', () => {
  it('soma em lote igual à soma unitária', () => {
    const c = { resource: 'gold', base: 10, growth: 1.15 };
    let sum = D(0);
    for (let i = 3; i < 13; i++) sum = sum.add(D(10).mul(D(1.15).pow(i)));
    expect(bulkCost(c, 3, 10).sub(sum).abs().lt(1e-6)).toBe(true);
  });

  it('calcula o máximo comprável', () => {
    const c = { resource: 'gold', base: 10, growth: 1.15 };
    const n = maxAffordable(c, 0, D(1000));
    expect(bulkCost(c, 0, n).lte(1000)).toBe(true);
    expect(bulkCost(c, 0, n + 1).gt(1000)).toBe(true);
  });
});

describe('motor', () => {
  it('aplica modificadores na ordem add, mult, pow', () => {
    const e = new Engine(def);
    e.add('gold', 500);
    expect(e.stat('damage').toNumber()).toBe(5);
    e.buyUpgrade('root');
    expect(e.stat('damage').toNumber()).toBe(6);
    e.buyUpgrade('dmg');
    e.buyUpgrade('dmg');
    expect(e.stat('damage').toNumber()).toBe(24);
  });

  it('esconde nós sem pai comprado e respeita requisitos', () => {
    const e = new Engine(def);
    e.add('gold', 100);
    expect(e.upgradeStatus('dmg')).toBe('hidden');
    e.buyUpgrade('root');
    expect(e.upgradeStatus('dmg')).toBe('affordable');
    expect(e.upgradeStatus('mine-boost')).toBe('locked');
    e.buyGenerator('mine');
    expect(e.upgradeStatus('mine-boost')).toBe('affordable');
  });

  it('para no nível máximo', () => {
    const e = new Engine(def);
    e.add('gold', 1e9);
    e.buyUpgrade('root');
    for (let i = 0; i < 10; i++) e.buyUpgrade('dmg');
    expect(e.upgradeLevel('dmg')).toBe(5);
    expect(e.upgradeStatus('dmg')).toBe('maxed');
  });

  it('produz com geradores e desbloqueia por condição', () => {
    const e = new Engine(def);
    e.add('gold', 10);
    e.buyGenerator('mine');
    const unlocked: string[] = [];
    e.events.on('unlock', ({ id }) => unlocked.push(id));
    e.simulate(60);
    expect(e.amount('gold').toNumber()).toBeCloseTo(60, 5);
    expect(unlocked).toEqual(['shop']);
  });

  it('conquistas aplicam efeitos', () => {
    const e = new Engine(def);
    e.add('gold', 1000);
    e.checkProgress();
    expect(e.state.achievements.rich).toBe(true);
    expect(e.stat('damage').toNumber()).toBe(105);
  });

  it('hasAffordable avisa quando há upgrade comprável na árvore', () => {
    const e = new Engine(def);
    expect(hasAffordable(e)).toBe(false);
    e.add('gold', 1);
    expect(hasAffordable(e)).toBe(true);
    expect(hasAffordable(e, 'ascend')).toBe(false);
    e.add('gems', 1);
    expect(hasAffordable(e, ['main', 'ascend'])).toBe(true);
  });

  it('respec devolve o que foi gasto', () => {
    const e = new Engine(def);
    e.add('gold', 100);
    e.buyUpgrade('root');
    e.buyUpgrade('dmg');
    e.buyUpgrade('dmg');
    expect(e.amount('gold').toNumber()).toBe(100 - 1 - 10 - 20);
    e.refundTree('main');
    expect(e.amount('gold').toNumber()).toBe(100);
    expect(e.upgradeLevel('dmg')).toBe(0);
  });
});

describe('módulos', () => {
  it('prestígio zera o progresso e mantém a própria árvore', () => {
    const prestige = new PrestigeModule([{ id: 'ascend', currency: 'gems', basedOn: 'gold', threshold: 100 }]);
    const e = new Engine(def, { modules: [prestige] });
    e.add('gold', 10000);
    e.buyUpgrade('root');
    expect(prestige.gain(e, 'ascend').toNumber()).toBe(10);
    prestige.prestige(e, 'ascend');
    expect(e.amount('gold').toNumber()).toBe(0);
    expect(e.amount('gems').toNumber()).toBe(10);
    expect(e.upgradeLevel('root')).toBe(0);
    e.buyUpgrade('gem-boost');
    expect(e.gain('gold', 1).toNumber()).toBe(10);
    expect(prestige.count(e, 'ascend')).toBe(1);
  });

  it('run termina no tempo e soma o que foi coletado', () => {
    const runs = new RunModule();
    const e = new Engine({ ...def, stats: { 'run.duration': 10 } }, { modules: [runs] });
    runs.start();
    e.gain('gold', 7);
    for (let i = 0; i < 300; i++) e.tick(0.05);
    expect(runs.active).toBe(false);
    expect(runs.last?.reason).toBe('time');
    expect(runs.last?.collected.gold.toNumber()).toBe(7);
  });

  it('run com hold não corre o tempo', () => {
    const runs = new RunModule();
    const e = new Engine({ ...def, stats: { 'run.duration': 10 } }, { modules: [runs] });
    let held = true;
    runs.hold = () => held;
    runs.start();
    for (let i = 0; i < 300; i++) e.tick(0.05);
    expect(runs.active).toBe(true);
    expect(runs.elapsed).toBe(0);
    held = false;
    for (let i = 0; i < 300; i++) e.tick(0.05);
    expect(runs.active).toBe(false);
  });

  it('autocomprador compra geradores quando desbloqueado', () => {
    const auto = new AutomationModule([
      { id: 'auto-mine', name: 'Auto', target: { generator: 'mine' }, unlockWhen: { upgrade: 'root' }, interval: 1 },
    ]);
    const e = new Engine(def, { modules: [auto] });
    e.add('gold', 101);
    e.tick(2);
    expect(e.generatorsOwned('mine')).toBe(0);
    e.buyUpgrade('root');
    e.tick(2);
    expect(e.generatorsOwned('mine')).toBeGreaterThan(0);
  });
});

describe('save', () => {
  it('salva, carrega e aplica progresso offline com limite', () => {
    let now = 1_000_000;
    const storage = memoryStorage();
    const e = new Engine({ ...def, offline: { maxSeconds: 100 } });
    const saves = new SaveManager(e, { storage, now: () => now });
    e.add('gold', 10);
    e.buyGenerator('mine');
    saves.save();

    const e2 = new Engine({ ...def, offline: { maxSeconds: 100 } });
    now += 3600 * 1000;
    const report = new SaveManager(e2, { storage, now: () => now }).load();
    expect(report?.seconds).toBe(100);
    expect(e2.generatorsOwned('mine')).toBe(1);
    expect(e2.amount('gold').toNumber()).toBeCloseTo(100, 5);
  });

  it('save desligado não grava', () => {
    const storage = memoryStorage();
    const saves = new SaveManager(new Engine(def), { storage });
    saves.enabled = false;
    saves.save();
    expect(saves.hasSave()).toBe(false);
    saves.enabled = true;
    saves.save();
    expect(saves.hasSave()).toBe(true);
  });

  it('migra saves antigos', () => {
    const storage = memoryStorage();
    const v0 = new Engine({ ...def, version: 0 });
    v0.add('gold', 5);
    new SaveManager(v0, { storage, now: () => 0 }).save();
    const v1 = new Engine({
      ...def,
      version: 1,
      migrations: [(s) => ({ ...s, flags: { ...s.flags, migrated: true } })],
    });
    new SaveManager(v1, { storage, now: () => 0 }).load();
    expect(v1.state.flags.migrated).toBe(true);
    expect(v1.amount('gold').toNumber()).toBe(5);
  });
});

describe('notação padrão', () => {
  it('format segue setDefaultNotation', async () => {
    const { format, setDefaultNotation } = await import('../src/core/num');
    setDefaultNotation('scientific');
    expect(format(1.5e6)).toContain('e6');
    setDefaultNotation('short');
    expect(format(1.5e6)).toBe('1.5M');
  });
});
