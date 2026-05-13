import { workshopScore } from './workshopScore.js';
export default {
    id: 'smith',
    construct: 'anvil',
    input: 'Materials.Metal.Copper.Ingot',
    output: 'Equipment.Bronze.Kit',
    carryQty: 3,
    skill: 'forge',
    needKey: 'Equipment.Bronze.Kit',
    baseScore: 30,
    fetchSources: ['smelter', 'blacksmith', 'warehouse'],
    depositTypes: ['blacksmith', 'warehouse'],
    score(u, ctx) { return workshopScore(u, ctx, this); },
};
