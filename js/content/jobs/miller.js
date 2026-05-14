import { workshopScore } from './workshopScore.js';
export default {
    id: 'miller',
    construct: 'millstone',
    input: 'Food.Grain.Wheat',
    output: 'Food.Grain.Wheat.Flour',
    carryQty: 5,
    skill: 'mill',
    needKey: 'Food.Grain.Wheat.Flour',
    baseScore: 50,
    fetchSources: ['grainsilo', 'storageshelf', 'townhall'],
    depositTypes: ['grainsilo', 'storageshelf', 'townhall'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
