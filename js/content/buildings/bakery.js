import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'bakery',
    tick(b, delta, ctx) {
        const baker = ctx.workerAt(b, 'baker');
        if (!baker) { b.bakeTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.bakeTimer = (b.bakeTimer ?? 0) + delta;
        if (b.bakeTimer >= 12000 && (b.inbox.flour ?? 0) >= 6 && ctx.hasStorageSpace('bread')) {
            b.inbox.flour -= 6;
            b.bakeTimer = 0;
            ctx.addResource('bread', 3);
            const home = ctx.buildings.find(h => h.id === baker.homeBldgId && h.built && h.inventory);
            if (home) home.inventory.bread = (home.inventory.bread ?? 0) + 1;
            ctx.gainXp(baker, 'bake');
            ctx.floatText(b, '🍞 bread ×4', '#ffdd88');
        }
    },
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0xcc9944).fillRect(px+4, py+6, s-8, s-10);
        gfx.lineStyle(2, 0x996622, 0.8).strokeRect(px+4, py+6, s-8, s-10);
        gfx.fillStyle(0x332211).fillRect(cx-10, cy, 20, 14);
        gfx.fillStyle(0x664422, 0.9).fillRect(cx-8, cy+2, 16, 10);
        gfx.fillStyle(0xff9900, 0.4).fillRect(cx-6, cy+6, 12, 6);
        gfx.fillStyle(0x886644).fillRect(cx+4, py+2, 8, 8);
    },
};
