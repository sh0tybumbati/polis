import { workshopScore } from './workshopScore.js';
export default {
    id: 'tanner',
    construct: 'tanningrack',
    input: 'Textile.Hide.Deer',
    output: 'Textile.Hide.Deer.Leather',
    carryQty: 6,
    skill: 'tan',
    needKey: 'Textile.Hide.Deer.Leather',
    baseScore: 35,
    fetchSources: ['butcher', 'tannery', 'warehouse'],
    depositTypes: ['tannery', 'warehouse'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
