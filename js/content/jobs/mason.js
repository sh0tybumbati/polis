import { workshopScore } from './workshopScore.js';
export default {
    id: 'mason',
    construct: 'stonecutter',
    input: 'Materials.Stone.Limestone',
    output: 'Materials.Stone.Limestone.Block',
    carryQty: 4,
    skill: 'masonry',
    needKey: 'Materials.Stone.Limestone.Block',
    baseScore: 28,
    fetchSources: ['storageshelf', 'townhall'],
    selfSupply: { nodes: ['boulder', 'ore_vein'], depositTypes: ['storageshelf', 'townhall'] },
    depositTypes: ['storageshelf', 'townhall'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
