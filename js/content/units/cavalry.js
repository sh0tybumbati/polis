import { drawHuman } from './drawHuman.js';

const loadout = { spear: true, helmet: true };

export default {
    id: 'cavalry',
    hp: 25, atk: 7, speed: 80, range: 36,
    color: 0xaa8833,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
