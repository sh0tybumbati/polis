import { workshopScore } from './workshopScore.js';
export default {
    id: 'carpenter',
    construct: 'workbench',
    input: 'Materials.Wood.Pine',
    output: 'Materials.Wood.Pine.Plank',
    carryQty: 6,
    skill: 'woodcutting',
    needKey: 'Materials.Wood.Pine.Plank',
    baseScore: 30,
    fetchSources: ['storageshelf', 'townhall'],
    selfSupply: { nodes: ['large_tree', 'small_tree'], depositTypes: ['storageshelf', 'townhall'] },
    depositTypes: ['storageshelf', 'townhall'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
