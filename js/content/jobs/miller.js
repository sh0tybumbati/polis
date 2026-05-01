import { workshopScore } from './workshopScore.js';
export default {
    id: 'miller',
    building: 'mill',
    input: 'Food.Grain.Wheat',
    output: 'Food.Grain.Wheat.Flour',
    carryQty: 5,
    skill: 'mill',
    needKey: 'Food.Grain.Wheat.Flour',
    baseScore: 50,
    fetchSources: ['granary', 'warehouse', 'townhall'],
    depositTypes: ['mill', 'granary', 'warehouse'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
