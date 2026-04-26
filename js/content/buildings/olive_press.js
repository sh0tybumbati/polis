import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'olive_press',
    tick(_b, _delta, _ctx) {},
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0x8a8a6a).fillRect(px+4, py+6, s-8, s-10);
        gfx.lineStyle(2, 0x667733, 0.9).strokeRect(px+4, py+6, s-8, s-10);
        gfx.fillStyle(0xaaa888).fillCircle(cx, cy, s*0.28);
        gfx.fillStyle(0x667733, 0.6).fillCircle(cx, cy, s*0.12);
        gfx.lineStyle(2, 0x888866, 0.8).strokeCircle(cx, cy, s*0.28);
        gfx.fillStyle(0x445522, 0.7).fillEllipse(cx-s*0.3, py+10, 12, 6).fillEllipse(cx+s*0.3, py+10, 12, 6);
    },
};
