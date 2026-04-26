import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'farm',
    tick(b, delta, _ctx) {
        if (b.stock > 0) return;
        b.replantTimer = (b.replantTimer ?? 0) + delta;
        if (b.replantTimer >= 45000) {
            b.replantTimer = 0;
            b.stock = b.maxStock ?? 32;
            b.drawnStock = b.stock;
            _ctx.redrawBuilding(b);
            _ctx.floatText(b, '🌱 ready', '#88cc44');
        }
    },
    draw(gfx, b, scene) {
        const { px, py, s, cx } = g(b);
        const day = scene?.day ?? 1;
        const seasonIdx = Math.floor((day - 1) / 8) % 4;
        const seasonColors = [0x66cc44, 0xc8a832, 0x997722, 0xccccaa];
        const seasonColor = seasonColors[seasonIdx];

        const ratio = b.maxStock > 0 ? Math.max(0, b.stock / b.maxStock) : 0;
        const lush = ratio > 0.6, mid = ratio > 0.25;
        gfx.fillStyle(lush ? 0x7a5c28 : mid ? 0x8a6630 : 0x6a4818).fillRect(px+3, py+3, s-6, s-10);
        const rowCount = Math.round(ratio * 5);
        for (let row = 0; row < 5; row++) {
            const ry = py + 6 + row * 10;
            if (row < rowCount) {
                // Shift colour based on season
                let clr = seasonColor;
                if (row % 2 === 1) {
                    // Slight variation for alternating rows
                    const c = Phaser.Display.Color.IntegerToColor(clr);
                    c.darken(10);
                    clr = c.color;
                }
                
                gfx.fillStyle(clr).fillRect(px+6, ry, s-12, 6);
                if (lush) for (let col=0;col<4;col++) gfx.fillStyle(seasonColor).fillTriangle(px+9+col*13,ry,px+12+col*13,ry-5,px+15+col*13,ry);
                else if (mid) for (let col=0;col<4;col++) gfx.fillStyle(seasonColor,0.7).fillTriangle(px+9+col*13,ry,px+12+col*13,ry-4,px+15+col*13,ry);
            } else {
                gfx.fillStyle(0x5a3c18,0.6).fillRect(px+6, ry, s-12, 6);
            }
        }
        if (ratio === 0) {
            gfx.fillStyle(0xaa8844,0.5).fillRect(px+8, py+10, s-16, s-18);
            gfx.lineStyle(1,0x7a5c28,0.4).strokeRect(px+8, py+10, s-16, s-18);
        }
        gfx.lineStyle(2,0xaa7733,0.9).strokeRect(px+3, py+3, s-6, s-10);
        gfx.fillStyle(0xaa7733)
            .fillRect(px+2, py+2, 4, 10).fillRect(px+s-6, py+2, 4, 10)
            .fillRect(px+2, py+s-16, 4, 8).fillRect(px+s-6, py+s-16, 4, 8);
    },
};
