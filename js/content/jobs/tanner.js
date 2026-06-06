import { workshopScore } from './workshopScore.js';
export default {
    id: 'tanner',
    construct: 'tanningrack',
    input: 'Textile.Hide.Deer',
    // Any raw hide tans into its matching leather (<hide>.Leather).
    inputs: ['Textile.Hide.Deer', 'Textile.Hide.Boar', 'Textile.Hide.Aurochs', 'Textile.Hide.Wolf'],
    outputFor: (k) => `${k}.Leather`,
    output: 'Textile.Hide.Deer.Leather',
    carryQty: 6,
    skill: 'tan',
    needKey: 'Textile.Hide.Deer.Leather',
    baseScore: 35,
    fetchSources: ['butchersblock', 'storageshelf', 'townhall'],
    depositTypes: ['storageshelf', 'townhall'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
