import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'mill',
    tick(b, delta, ctx) {
        const miller = ctx.workerAt(b, 'miller');
        if (!miller) { b.millTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.millTimer = (b.millTimer ?? 0) + delta;
        if (b.millTimer >= 10000 && (b.inbox.wheat ?? 0) >= 1 && ctx.hasStorageSpace('flour')) {
            b.inbox.wheat -= 1;
            b.millTimer = 0;
            ctx.addResource('flour', 3);
            const home = ctx.buildings.find(h => h.id === miller.homeBldgId && h.built && h.inventory);
            if (home) home.inventory.flour = (home.inventory.flour ?? 0) + 1;
            ctx.gainXp(miller, 'mill');
            ctx.floatText(b, '🌾→flour ×4', '#ddcc88');
        }
    },
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0x998866).fillRect(px+4, py+6, s-8, s-10);
        gfx.lineStyle(2, 0x665533, 0.8).strokeRect(px+4, py+6, s-8, s-10);
        gfx.fillStyle(0xccbbaa).fillCircle(cx, cy-4, s*0.28);
        gfx.fillStyle(0x998877).fillCircle(cx, cy-4, s*0.10);
        gfx.lineStyle(1, 0x776655, 0.7).lineBetween(cx-s*0.28, cy-4, cx+s*0.28, cy-4).lineBetween(cx, cy-4-s*0.28, cx, cy-4+s*0.28);
        gfx.fillStyle(0x7a6644).fillRect(cx-8, cy+6, 16, 10);
    },
};
