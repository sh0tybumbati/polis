import { drawHuman } from './drawHuman.js';

const loadout = { bow: true, helmet: true };

export default {
    id: 'toxotes',
    hp: 18, atk: 7, speed: 65, range: 140,
    color: 0xddaa44,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
