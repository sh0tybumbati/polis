import { drawHuman } from './drawHuman.js';

const loadout = { spear: true };

export default {
    id: 'spearman',
    hp: 18, atk: 5, speed: 38, range: 28,
    color: 0x6688cc,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
