import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'barracks',
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        gfx.fillStyle(0x9a8060).fillRect(px+4, py+20, s-8, s-22);
        gfx.fillStyle(0xb8996c).fillTriangle(px+4, py+20, px+s-4, py+20, cx, py+6);
        gfx.lineStyle(1, 0x7a5838, 0.7).strokeTriangle(px+4, py+20, px+s-4, py+20, cx, py+6);
        gfx.fillStyle(0xdac898).fillRect(px+10, py+22, 9, s-26).fillRect(px+s-19, py+22, 9, s-26);
        gfx.fillStyle(0xa08860, 0.45).fillRect(px+17, py+22, 3, s-26).fillRect(px+s-12, py+22, 3, s-26);
        gfx.fillStyle(0xeedd99).fillRect(px+8, py+20, 13, 4).fillRect(px+s-21, py+20, 13, 4);
        gfx.fillStyle(0x3a2010).fillRect(cx-8, py+s-26, 16, 23);
        gfx.fillStyle(0x5a3820, 0.5).fillRect(cx-7, py+s-25, 7, 22);
        gfx.lineStyle(2, 0x999988, 0.7).lineBetween(cx-5, py+28, cx-5, py+s-30).lineBetween(cx+5, py+28, cx+5, py+s-30);
        gfx.fillStyle(0xbbaa66)
            .fillTriangle(cx-5, py+27, cx-3, py+32, cx-7, py+32)
            .fillTriangle(cx+5, py+27, cx+7, py+32, cx+3, py+32);
    },
};
