import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'archery',
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        gfx.fillStyle(0x1e5c30).fillRect(px+3, py+3, s-6, s-10);
        gfx.fillStyle(0x4a7a3a).fillRect(px+6, py+s-18, s-12, 8);
        gfx.fillStyle(0x6a4422).fillRect(cx-2, py+30, 4, 24);
        gfx.fillStyle(0x5a3818).fillRect(cx-10, py+52, 20, 4);
        gfx.fillStyle(0xcc3322).fillCircle(cx, py+22, 17);
        gfx.fillStyle(0xffffff).fillCircle(cx, py+22, 12);
        gfx.fillStyle(0xcc3322).fillCircle(cx, py+22, 7);
        gfx.fillStyle(0xffd700).fillCircle(cx, py+22, 3);
        gfx.lineStyle(1, 0x8a5a20, 0.9)
            .lineBetween(cx+5, py+8, cx+5, py+28)
            .lineBetween(cx-7, py+10, cx-7, py+26);
        gfx.fillStyle(0x666644)
            .fillTriangle(cx+5, py+7, cx+3, py+12, cx+7, py+12)
            .fillTriangle(cx-7, py+9, cx-9, py+14, cx-5, py+14);
    },
};
