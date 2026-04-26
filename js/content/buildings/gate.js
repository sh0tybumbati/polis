import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'gate',
    tick: null,
    draw(gfx, b) {
        const { px, py, s } = g(b);
        const open = b?.isOpen ?? true;
        gfx.fillStyle(0xa08858).fillRect(px+2, py+4, s-4, s-6);
        if (open) {
            gfx.fillStyle(0x7a6030, 0.7).fillRect(px+2, py+4, 4, s-8).fillRect(px+s-6, py+4, 4, s-8);
            gfx.fillStyle(0x222200, 0.5).fillRect(px+6, py+4, s-12, s-8);
        } else {
            gfx.fillStyle(0x8a7040).fillRect(px+3, py+5, s-6, s-8);
            gfx.lineStyle(2, 0x5a4820, 0.9)
                .lineBetween(px+s*0.5, py+5, px+s*0.5, py+s-4)
                .lineBetween(px+3, py+s*0.5, px+s-3, py+s*0.5);
        }
        gfx.lineStyle(2, 0x888070, 0.8).strokeRect(px+2, py+4, s-4, s-6);
    },
};
