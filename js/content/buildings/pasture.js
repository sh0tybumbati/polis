import { TILE, MAP_OY, SHEEP_WOOL_MS } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'pasture',
    tick(b, delta, ctx) {
        const pastured = ctx.sheep?.filter(s => s.pastureId === b.id && s.isTamed && !s.isDead) ?? [];
        for (const s of pastured) {
            s.woolTimer = (s.woolTimer ?? 0) + delta;
            if (s.woolTimer >= SHEEP_WOOL_MS && s.woolReady !== false) {
                s.woolTimer = 0;
                if (ctx.hasStorageSpace('wool')) {
                    ctx.addResource('wool', 1);
                    ctx.floatText(b, '🧶 wool', '#e8e0c0');
                }
            }
        }
    },
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0x5a9a38).fillRect(px+4, py+4, s-8, s-8);
        gfx.lineStyle(3, 0x8a5820, 0.9)
            .lineBetween(px+2, py+s*0.3, px+s-2, py+s*0.3)
            .lineBetween(px+2, py+s*0.65, px+s-2, py+s*0.65);
        for (let i = 0; i <= 4; i++) {
            const fx = px + 2 + i * (s-4) / 4;
            gfx.fillStyle(0x7a4818).fillRect(fx-3, py+2, 6, s-4);
        }
        gfx.fillStyle(0x5a9a38).fillRect(cx-10, py+s-6, 20, 8);
        gfx.fillStyle(0xf0ece0, 0.55).fillCircle(cx-14, cy-6, 7).fillCircle(cx+14, cy+6, 7).fillCircle(cx, cy-4, 7);
    },
};
