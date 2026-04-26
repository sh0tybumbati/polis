import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'palisade',
    tick: null,
    draw(gfx, b) {
        const { px, py, s } = g(b);
        gfx.fillStyle(0x7a5030).fillRect(px+2, py+4, s-4, s-8);
        gfx.lineStyle(2, 0x5a3818, 0.9)
            .lineBetween(px+s*0.25, py+2, px+s*0.25, py+s-2)
            .lineBetween(px+s*0.5, py+2, px+s*0.5, py+s-2)
            .lineBetween(px+s*0.75, py+2, px+s*0.75, py+s-2);
        gfx.fillStyle(0x9a7040)
            .fillTriangle(px+s*0.25-4, py+4, px+s*0.25+4, py+4, px+s*0.25, py)
            .fillTriangle(px+s*0.5-4, py+4, px+s*0.5+4, py+4, px+s*0.5, py)
            .fillTriangle(px+s*0.75-4, py+4, px+s*0.75+4, py+4, px+s*0.75, py);
    },
};
