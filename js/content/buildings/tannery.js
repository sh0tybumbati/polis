import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'tannery',
    tick(b, delta, ctx) {
        const tanner = ctx.workerAt(b, 'tanner');
        if (!tanner) { b.tanTimer = 0; b.kitTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.tanTimer = (b.tanTimer ?? 0) + delta;
        if (b.tanTimer >= 8000 && (b.inbox.hide ?? 0) >= 3 && ctx.hasStorageSpace('leather')) {
            b.inbox.hide -= 3;
            b.tanTimer = 0;
            ctx.addResource('leather', 1);
            ctx.gainXp(tanner, 'tan');
            ctx.floatText(b, '🐾→leather', '#c0884c');
        }
        b.kitTimer = (b.kitTimer ?? 0) + delta;
        if (b.kitTimer >= 12000 && (ctx.resources.leather ?? 0) >= 4 && (ctx.resources.leatherKit ?? 0) < 10) {
            ctx.resources.leather -= 4;
            b.kitTimer = 0;
            ctx.resources.leatherKit = (ctx.resources.leatherKit ?? 0) + 1;
        }
    },
    draw(gfx, b) {
        const { px, py, s } = g(b);
        gfx.fillStyle(0x7a4422).fillRect(px+4, py+6, s-8, s-10);
        gfx.lineStyle(2, 0x5a3010, 0.9)
            .lineBetween(px+8, py+8, px+8, py+s-6)
            .lineBetween(px+s-8, py+8, px+s-8, py+s-6)
            .lineBetween(px+8, py+14, px+s-8, py+14)
            .lineBetween(px+8, py+s-12, px+s-8, py+s-12);
        gfx.fillStyle(0xcc9966, 0.6).fillRect(px+10, py+15, s-20, s-30);
    },
};
