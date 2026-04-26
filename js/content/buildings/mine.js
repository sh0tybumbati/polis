import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'mine',
    tick: null,
    draw(gfx, b) {
        const { px, py, s } = g(b);
        gfx.fillStyle(0x444433).fillRect(px+2, py+4, s-4, s-6);
        gfx.fillStyle(0x222211).fillRect(px+s/2-10, py+s/2-6, 20, s/2+2);
        gfx.lineStyle(3, 0x7a5830, 0.9)
            .lineBetween(px+s/2-10, py+s/2-6, px+s/2-10, py+s-4)
            .lineBetween(px+s/2+10, py+s/2-6, px+s/2+10, py+s-4)
            .lineBetween(px+s/2-10, py+s/2-6, px+s/2+10, py+s/2-6);
        gfx.fillStyle(0x446644, 0.7).fillRect(px+s/2-5, py+s*0.7, 10, 6);
    },
};
