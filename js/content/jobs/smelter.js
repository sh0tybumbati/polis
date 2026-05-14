import { workshopScore } from './workshopScore.js';
export default {
    id: 'smelter',
    construct: 'forge',
    input: 'Materials.Metal.Copper.Ore',
    output: 'Materials.Metal.Copper.Ingot',
    carryQty: 6,
    skill: 'smelt',
    needKey: 'Materials.Metal.Copper.Ingot',
    baseScore: 35,
    fetchSources: ['mine', 'storageshelf', 'townhall'],
    selfSupply: { nodes: ['ore_vein'], depositTypes: ['storageshelf', 'townhall'] },
    depositTypes: ['storageshelf', 'townhall'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
