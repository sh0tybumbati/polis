import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'stonepile',
    tick: null,
    draw(gfx, b) {
        const { cx, cy } = g(b);
        gfx.fillStyle(0x444438, 0.3).fillEllipse(cx+2, cy+14, 38, 18);
        gfx.fillStyle(0x888878).fillEllipse(cx-10, cy+4, 34, 26);
        gfx.fillStyle(0x9a9a88).fillEllipse(cx+12, cy+6, 28, 22);
        gfx.fillStyle(0x777768).fillEllipse(cx-2, cy-6, 30, 22);
        gfx.fillStyle(0xaaaaA0).fillEllipse(cx+2, cy-8, 20, 15);
        gfx.lineStyle(1, 0x555548, 0.5)
            .lineBetween(cx-8, cy+2, cx-4, cy+10)
            .lineBetween(cx+10, cy+4, cx+14, cy+12);
    },
};
