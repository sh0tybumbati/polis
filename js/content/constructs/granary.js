import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.width*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'granary',
    placement: 'tile',
    width: 2, height: 2,
    label: "🌾 Granary",
    color: 13408563,
    cost: {},
    materialQty: 10,
    desc: "Stores large quantities of food and grain.",
    stores: {"Food.Grain.Wheat":200},
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0xd4a830).fillEllipse(cx, cy+4, s-8, s-12);
        gfx.fillStyle(0x8a5820).fillEllipse(cx, py+14, s-10, 22);
        gfx.fillStyle(0xaa7030, 0.6).fillEllipse(cx, py+10, s-18, 14);
        gfx.fillStyle(0x4a2808).fillRect(cx-7, py+s-22, 14, 20);
        gfx.fillStyle(0xcc9930, 0.4)
            .fillEllipse(cx-10, cy+8, 16, 20)
            .fillEllipse(cx+10, cy+8, 16, 20)
            .fillEllipse(cx, cy+2, 16, 20);
        gfx.lineStyle(1, 0x7a5010, 0.5).strokeEllipse(cx, cy+4, s-8, s-12);
    },
};
