import { drawHuman } from './drawHuman.js';

const loadout = { bow: true };

export default {
    id: 'archer',
    hp: 12, atk: 5, speed: 62, range: 120,
    color: 0x558866,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
