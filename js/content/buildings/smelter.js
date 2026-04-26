import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'smelter',
    tick(b, delta, ctx) {
        const smelter = ctx.workerAt(b, 'smelter');
        if (!smelter) { b.smeltTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.smeltTimer = (b.smeltTimer ?? 0) + delta;
        if (b.smeltTimer >= 10000 && (b.inbox.ore ?? 0) >= 2 && ctx.hasStorageSpace('ingot')) {
            b.inbox.ore -= 2;
            b.smeltTimer = 0;
            ctx.addResource('ingot', 1);
            ctx.gainXp(smelter, 'smelt');
            ctx.floatText(b, '⛏→ingot', '#ffaa44');
        }
    },
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0x885533).fillRect(px+4, py+8, s-8, s-10);
        gfx.fillStyle(0x444433).fillRect(cx-8, py+4, 16, 12);
        gfx.fillStyle(0xff6600, 0.5).fillRect(cx-6, cy, 12, 10);
        gfx.fillStyle(0xffaa00, 0.4).fillRect(cx-4, cy-2, 8, 8);
        gfx.lineStyle(2, 0x554422, 0.8).strokeRect(px+4, py+8, s-8, s-10);
    },
};
