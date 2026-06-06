import { drawHuman } from './drawHuman.js';

const loadout = { spear: true, shield: true, helmet: true };

export default {
    id: 'hoplite',
    hp: 25, atk: 8, speed: 40, range: 32,
    color: 0xddaa44,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
