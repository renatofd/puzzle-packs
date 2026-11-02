import { createGame } from '../games/puzzle-packs/game';
const { engine, collection } = createGame(42);
for (const id of ['s1','s2']) collection.state.owned[id] = collection.state.owned[id].map(() => 1);
engine.checkProgress();
for (const u of ['collector','value','speed','luck','cards','pity','discount','auto']) { const m = engine.upgrade(u).maxLevel ?? 1; for (let i=0;i<m;i++){ engine.add('coins', 1e9); engine.buyUpgrade(u);} }
engine.state.resources.coins = engine.state.resources.coins.mul(0);
console.log('dupe', engine.statNumber('dupe.value'), 'cost series', collection.packCost('series'), 'premium', collection.packCost('premium'), 'cards', collection.cardsIn('basic'));
let c0 = 0; for (let i = 0; i < 50; i++) c0 += collection.openPack('basic').coins;
console.log('coins/basic', c0/50);
