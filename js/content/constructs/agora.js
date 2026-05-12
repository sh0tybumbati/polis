import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.width*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'agora',
    placement: 'tile',
    width: 2, height: 2,
    label: "🏪 Agora",
    color: 13934640,
    cost: {"Materials.Stone.Limestone":6,"Materials.Wood.Pine":3},
    desc: "Marketplace at the center of the polis. Set standing trade orders; caravans fulfill them.",
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        // Stone floor
        gfx.fillStyle(0xe0d0a0).fillRect(px + 2, py + 2, s - 4, s - 4);
        // Red-ochre awning band across top
        gfx.fillStyle(0xcc4422).fillRect(px + 2, py + 2, s - 4, 7);
        // Columns (left and right)
        gfx.fillStyle(0xf0e8c0)
            .fillRect(px + 5,      py + 9, 5, s - 13)
            .fillRect(px + s - 10, py + 9, 5, s - 13);
        // Column caps
        gfx.fillStyle(0xd4b870)
            .fillRect(px + 4,      py + 8, 7, 3)
            .fillRect(px + s - 11, py + 8, 7, 3);
        // Counter / stall table
        gfx.fillStyle(0xb89050).fillRect(cx - s * 0.22, py + s * 0.45, s * 0.44, 7);
        // Goods pile hint
        gfx.fillStyle(0xddaa44, 0.7)
            .fillCircle(cx - 8, py + s * 0.42, 5)
            .fillCircle(cx + 6, py + s * 0.40, 4);
        // Border
        gfx.lineStyle(1.5, 0xa07828, 0.8).strokeRect(px + 2, py + 2, s - 4, s - 4);
        // Active-order indicator dot (green = has orders)
        if (b.tradeOrders?.length > 0) {
            gfx.fillStyle(0x44cc44, 0.9).fillCircle(px + s - 7, py + 7, 3.5);
        }
    },
};
