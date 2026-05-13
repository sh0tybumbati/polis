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
    fetchSources: ['mine', 'smelter', 'warehouse'],
    selfSupply: { nodes: ['ore_vein'], depositTypes: ['smelter', 'warehouse'] },
    depositTypes: ['smelter', 'warehouse'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
