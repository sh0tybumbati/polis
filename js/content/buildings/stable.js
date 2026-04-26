import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'stable',
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        gfx.fillStyle(0x8a6030).fillRect(px+3, py+16, s-6, s-18);
        gfx.fillStyle(0x6a4818).fillTriangle(px+2, py+16, px+s-2, py+16, cx, py+4);
        gfx.lineStyle(1, 0x4a3010, 0.7).strokeTriangle(px+2, py+16, px+s-2, py+16, cx, py+4);
        gfx.lineStyle(2, 0x5a3810, 0.8)
            .lineBetween(cx, py+16, cx, py+s-4)
            .lineBetween(px+3, py+s*0.55, px+s-3, py+s*0.55);
        gfx.fillStyle(0x4a2808).fillRect(cx-8, py+s-20, 16, 17);
        gfx.fillStyle(0x7a5020, 0.4).fillRect(cx-7, py+s-19, 7, 16);
        gfx.fillStyle(0xddcc88, 0.3).fillRect(px+6, py+s*0.55+2, cx-px-8, py+s-4-(py+s*0.55+2));
    },
};
