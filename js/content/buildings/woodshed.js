import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'woodshed',
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        gfx.fillStyle(0x7a4c20).fillRect(px+3, py+18, s-6, s-20);
        gfx.fillStyle(0x5a3410).fillTriangle(px+2, py+18, px+s-2, py+18, px+s-2, py+6);
        gfx.fillStyle(0x6a3e18, 0.6).fillTriangle(px+2, py+18, cx, py+10, px+s-2, py+6);
        gfx.lineStyle(1, 0x5a3010, 0.45);
        for (let i = 1; i < 4; i++) gfx.lineBetween(px+3, py+18+i*((s-20)/4), px+s-3, py+18+i*((s-20)/4));
        gfx.fillStyle(0x6a3a10)
            .fillEllipse(cx-12, py+s-14, 22, 12)
            .fillEllipse(cx+2, py+s-14, 22, 12)
            .fillEllipse(cx-5, py+s-20, 22, 12);
        gfx.fillStyle(0x4a2208)
            .fillEllipse(px+8, py+s-14, 8, 12)
            .fillEllipse(px+s-8, py+s-14, 8, 12);
    },
};
