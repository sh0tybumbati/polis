import { drawHuman } from './drawHuman.js';

const loadout = { club: true };

export default {
    id: 'clubman',
    hp: 16, atk: 4, speed: 40, range: 24,
    color: 0x886644,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
