import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'carpenter',
    tick(b, delta, ctx) {
        const worker = ctx.workerAt(b, 'carpenter');
        if (!worker) { b.carpenterTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.carpenterTimer = (b.carpenterTimer ?? 0) + delta;
        if (b.carpenterTimer >= 12000 && (b.inbox.wood ?? 0) >= 3 && ctx.hasStorageSpace('planks')) {
            b.inbox.wood -= 3;
            b.carpenterTimer = 0;
            ctx.addResource('planks', 4);
            ctx.gainXp(worker, 'woodcutting');
            ctx.floatText(b, '🪵 planks', '#c0a050');
        }
        ctx.processOrders(b, delta);
    },
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0x8a5020).fillRect(px+4, py+8, s-8, s-12);
        gfx.lineStyle(2, 0x5a3010, 0.8).strokeRect(px+4, py+8, s-8, s-12);
        gfx.fillStyle(0x6a3a10).fillTriangle(px+2, py+22, px+s-2, py+22, cx, py+6);
        gfx.lineStyle(1, 0x4a2808, 0.7).strokeTriangle(px+2, py+22, px+s-2, py+22, cx, py+6);
        for (let i = 0; i < 3; i++) {
            gfx.fillStyle(i === 0 ? 0xc0a050 : i === 1 ? 0xb09040 : 0xa08030).fillRect(px+6, cy-4+i*6, 18, 5);
            gfx.lineStyle(1, 0x7a5010, 0.4).strokeRect(px+6, cy-4+i*6, 18, 5);
        }
        gfx.fillStyle(0xc88840).fillRect(cx-14, cy+4, 28, 10);
        gfx.fillStyle(0xa06828).fillRect(cx-12, cy+12, 24, 8);
        gfx.lineStyle(1, 0x7a5020, 0.5).strokeRect(cx-14, cy+4, 28, 10);
        gfx.fillStyle(0x886644).fillRect(px+s-22, cy-2, 14, 6);
        gfx.fillStyle(0xcccccc, 0.85).fillRect(px+s-20, cy-5, 10, 3);
        gfx.lineStyle(1, 0x888888, 0.6).strokeRect(px+s-20, cy-5, 10, 3);
        gfx.fillStyle(0x3a1c08).fillRect(cx-7, py+s-26, 14, 22);
        gfx.fillStyle(0x5a3010, 0.35).fillRect(cx-6, py+s-25, 6, 21);
    },
};
