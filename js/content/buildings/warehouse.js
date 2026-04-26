import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'warehouse',
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        gfx.fillStyle(0x8a7050).fillRect(px+2, py+12, s-4, s-14);
        gfx.fillStyle(0x6a5030).fillRect(px+2, py+8, s-4, 6);
        gfx.fillStyle(0x5a3818).fillRect(px, py+6, s, 4);
        gfx.lineStyle(1, 0x4a3010, 0.6)
            .lineBetween(px+s*0.33, py+12, px+s*0.33, py+s-3)
            .lineBetween(px+s*0.66, py+12, px+s*0.66, py+s-3);
        gfx.fillStyle(0x3a2008).fillRect(cx-9, py+s-22, 18, 19);
        gfx.fillStyle(0x5a3818, 0.4).fillRect(cx-8, py+s-21, 8, 18);
        gfx.lineStyle(1, 0x4a3010, 0.5).strokeRect(px+2, py+12, s-4, s-14);
    },
};
