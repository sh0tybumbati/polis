import { drawHuman } from './drawHuman.js';

const loadout = {};

export default {
    id: 'scout',
    hp: 10, atk: 1, speed: 70, range: 0,
    color: 0x336655,
    isScout: true,
    vetLevels: false,
    loadout,
    draw(gfx, u, ctx) { drawHuman(gfx, u, ctx, loadout); },
};
