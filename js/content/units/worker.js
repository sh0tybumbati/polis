import { drawHuman } from './drawHuman.js';

// The base colonist — an unarmed human. Soldier types are this same human with an equipment loadout.
const loadout = {};

export default {
    id: 'worker',
    hp: 10, atk: 1, speed: 40, range: 0,
    color: 0xccccaa,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
