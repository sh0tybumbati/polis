import { workshopScore } from './workshopScore.js';
export default {
    id: 'baker',
    construct: 'oven',
    input: 'Food.Grain.Wheat.Flour',
    output: 'Food.Grain.Wheat.Bread',
    carryQty: 7,
    skill: 'bake',
    needKey: 'Food.Grain.Wheat.Bread',
    baseScore: 45,
    fetchSources: ['grainsilo', 'storageshelf', 'townhall'],
    depositTypes: ['grainsilo', 'storageshelf', 'townhall'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
