import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'wall',
    tick: null,
    draw(gfx, b) {
        const { px, py, s } = g(b);
        gfx.fillStyle(0x9a9888).fillRect(px+2, py+6, s-4, s-12);
        gfx.lineStyle(1, 0x666655, 0.7)
            .lineBetween(px+2, py+s/2, px+s-2, py+s/2)
            .lineBetween(px+s/2, py+6, px+s/2, py+s/2)
            .lineBetween(px+s/4, py+s/2, px+s/4, py+s-6)
            .lineBetween(px+3*s/4, py+s/2, px+3*s/4, py+s-6);
        gfx.fillStyle(0xb0a898).fillRect(px+2, py+1, 8, 7).fillRect(px+s-10, py+1, 8, 7);
        gfx.fillStyle(0x7a7868).fillRect(px+11, py+1, s-22, 7);
        gfx.lineStyle(1, 0x555544, 0.5).strokeRect(px+2, py+6, s-4, s-12);
    },
};
