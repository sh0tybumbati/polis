import { drawHuman } from './drawHuman.js';

const loadout = { club: true };

export default {
    id: 'berserker',
    hp: 30, atk: 10, speed: 50, range: 36,
    color: 0xbb5533,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
