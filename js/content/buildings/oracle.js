import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'oracle',
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        gfx.fillStyle(0x3a2a4a).fillRect(px+4, py+4, s-8, s-8);
        gfx.lineStyle(2, 0x8866aa, 0.9).strokeRect(px+4, py+4, s-8, s-8);
        gfx.lineStyle(2, 0xaa99bb, 0.9)
            .lineBetween(cx, py+10, cx-14, py+s-10)
            .lineBetween(cx, py+10, cx+14, py+s-10)
            .lineBetween(cx-7, py+s*0.4, cx+7, py+s*0.4);
        gfx.fillStyle(0x9966bb, 0.8).fillEllipse(cx, py+10, 18, 10);
        gfx.lineStyle(1, 0xddbbff, 0.5)
            .lineBetween(cx-4, py+12, cx+4, py+18)
            .lineBetween(cx+4, py+18, cx-4, py+24);
    },
};
