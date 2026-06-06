import { drawHuman } from './drawHuman.js';

const loadout = { sling: true };

export default {
    id: 'slinger',
    hp: 14, atk: 4, speed: 50, range: 100,
    color: 0x775599,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
