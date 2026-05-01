import { workshopScore } from './workshopScore.js';
export default {
    id: 'butcher',
    building: 'butcher',
    input: 'Food.Meat.Venison',
    output: 'Food.Meat.Venison.Sausages',
    carryQty: 4,
    skill: 'butcher',
    needKey: 'Food.Meat.Venison.Sausages',
    baseScore: 40,
    fetchSources: ['butcher', 'warehouse', 'townhall'],
    depositTypes: ['butcher', 'warehouse'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
