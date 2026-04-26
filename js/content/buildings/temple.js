import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'temple',
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        const deity = b?.deity ?? 'ares';
        const accentCol = deity === 'ares' ? 0xdd6644 : deity === 'athena' ? 0x6699cc : 0xddcc44;
        gfx.fillStyle(0xe8e4d8).fillRect(px+2, py+s*0.55, s-4, s*0.45-4);
        const colCount = 4;
        for (let i = 0; i < colCount; i++) {
            const cx2 = px + 8 + i * (s-16)/(colCount-1);
            gfx.fillStyle(0xf0ece0).fillRect(cx2-4, py+s*0.2, 8, s*0.38);
            gfx.lineStyle(1, 0xccccaa, 0.6).strokeRect(cx2-4, py+s*0.2, 8, s*0.38);
        }
        gfx.fillStyle(0xe8e4d8).fillTriangle(px+2, py+s*0.2+2, px+s-2, py+s*0.2+2, cx, py+2);
        gfx.lineStyle(2, 0xaaa888, 0.8).strokeTriangle(px+2, py+s*0.2+2, px+s-2, py+s*0.2+2, cx, py+2);
        gfx.fillStyle(accentCol, 0.4).fillTriangle(px+6, py+s*0.2, px+s-6, py+s*0.2, cx, py+6);
    },
};
