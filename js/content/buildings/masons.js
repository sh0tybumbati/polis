import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'masons',
    tick(b, delta, ctx) {
        const worker = ctx.workerAt(b, 'mason');
        if (!worker) { b.masonsTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.masonsTimer = (b.masonsTimer ?? 0) + delta;
        if (b.masonsTimer >= 14000 && (b.inbox.stone ?? 0) >= 1 && ctx.hasStorageSpace('stoneBlocks')) {
            b.inbox.stone -= 1;
            b.masonsTimer = 0;
            ctx.addResource('stoneBlocks', 4);
            ctx.gainXp(worker, 'masonry');
            ctx.floatText(b, '🪨 blocks', '#aaaaa0');
        }
        ctx.processOrders(b, delta);
    },
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0x888870).fillRect(px+4, py+8, s-8, s-12);
        gfx.lineStyle(2, 0x555544, 0.9).strokeRect(px+4, py+8, s-8, s-12);
        gfx.lineStyle(1, 0x555544, 0.55);
        for (let i = 1; i < 5; i++) gfx.lineBetween(px+4, py+8+i*12, px+s-4, py+8+i*12);
        gfx.lineBetween(cx, py+8, cx, py+20);
        gfx.lineBetween(px+22, py+20, px+22, py+32);
        gfx.lineBetween(px+s-22, py+20, px+s-22, py+32);
        gfx.fillStyle(0xaaaaA0).fillRect(px+6, cy+2, 16, 9);
        gfx.fillStyle(0x9a9a90).fillRect(px+7, cy-6, 14, 9);
        gfx.lineStyle(1, 0x555544, 0.4).strokeRect(px+6, cy+2, 16, 9).strokeRect(px+7, cy-6, 14, 9);
        gfx.fillStyle(0x886644).fillRect(px+s-18, cy-4, 5, 10);
        gfx.fillStyle(0xcccccc, 0.9).fillRect(px+s-17, cy-10, 3, 7);
        gfx.fillStyle(0x222211, 0.7).fillRect(cx-8, py+s-28, 16, 24);
        gfx.lineStyle(1, 0x7a7060, 0.55).strokeRect(cx-8, py+s-28, 16, 24);
    },
};
