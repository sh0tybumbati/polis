import { drawHuman } from './drawHuman.js';

const loadout = { spear: true, shield: true };

export default {
    id: 'peltast',
    hp: 20, atk: 6, speed: 42, range: 30,
    color: 0xcc8844,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
