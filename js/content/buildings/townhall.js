import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'townhall',
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        const marble = 0xf0ece0, stone = 0xc4bca0, shadow = 0xa8a080, terra = 0xcc5533, azure = 0x224488;
        gfx.fillStyle(shadow).fillRect(px, py+62, s, 2);
        gfx.fillStyle(marble).fillRect(px+2, py+58, s-4, 4).fillRect(px+5, py+54, s-10, 4).fillRect(px+7, py+50, s-14, 4);
        for (let i = 0; i < 6; i++) {
            const cx_ = px + 3 + i * 11;
            gfx.fillStyle(marble).fillRect(cx_, py+22, 5, 29);
            gfx.fillStyle(shadow, 0.45).fillRect(cx_+3, py+22, 2, 29);
            gfx.fillStyle(marble).fillRect(cx_-2, py+17, 9, 6).fillRect(cx_-1, py+50, 7, 2);
        }
        gfx.fillStyle(marble).fillRect(px+2, py+12, s-4, 11);
        gfx.fillStyle(azure, 0.55).fillRect(px+3, py+14, s-6, 5);
        gfx.fillStyle(shadow).fillRect(px+2, py+22, s-4, 1);
        gfx.fillStyle(marble).fillTriangle(px+2, py+12, px+s-2, py+12, cx, py+2);
        gfx.fillStyle(terra, 0.4).fillTriangle(px+7, py+12, px+s-7, py+12, cx, py+5);
        gfx.lineStyle(1, stone, 0.9).strokeTriangle(px+2, py+12, px+s-2, py+12, cx, py+2);
        gfx.fillStyle(terra).fillTriangle(cx-4, py+4, cx+4, py+4, cx, py);
        gfx.fillStyle(terra).fillTriangle(px+2, py+11, px+8, py+11, px+5, py+7);
        gfx.fillStyle(terra).fillTriangle(px+s-8, py+11, px+s-2, py+11, px+s-5, py+7);
        gfx.fillStyle(0x140e06, 0.55).fillRect(px+8, py+22, s-16, 29);
        gfx.fillStyle(0x221408).fillRect(cx-7, py+34, 14, 17);
        gfx.fillStyle(0x4a2c12, 0.45).fillRect(cx-6, py+35, 6, 16);
    },
};
