import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'garden',
    tick(b, delta, ctx) {
        b.growTimer = (b.growTimer ?? 0) + delta;
        if (b.growTimer >= 15000 && ctx.hasStorageSpace('olives')) {
            b.growTimer = 0;
            ctx.addResource('olives', 2);
            ctx.floatText(b, '🌿 harvest', '#44bb66');
            if (Math.random() < 0.4 && (ctx.resources.seeds ?? 0) >= 1) {
                ctx.resources.seeds -= 1;
            }
        }
    },
    draw(gfx, b) {
        const { px, py, s } = g(b);
        gfx.fillStyle(0x3a6020).fillRect(px+4, py+4, s-8, s-8);
        gfx.lineStyle(2, 0x557733, 0.9).strokeRect(px+4, py+4, s-8, s-8);
        const rowCount = 4;
        for (let i = 0; i < rowCount; i++) {
            const ry = py + 8 + i * ((s-16)/rowCount);
            gfx.lineStyle(1, 0x6a4422, 0.6).lineBetween(px+8, ry, px+s-8, ry);
            for (let j = 0; j < 3; j++) {
                const rx = px + 12 + j * ((s-24)/2);
                gfx.fillStyle(0x55aa33, 0.8).fillCircle(rx, ry-3, 3);
            }
        }
    },
};
