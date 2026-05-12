import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.width*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'house',
    placement: 'tile',
    width: 2, height: 2,
    label: "🏠 House",
    color: 13404228,
    cost: {},
    materialQty: 5,
    desc: "Provides housing for up to 6 citizens.",
    capacity: 6,
    spawnMs: 200000,
    stores: {"Food.Produce.Berry":120,"Food.Grain.Wheat.Bread":10,"Materials.Wood.Pine.Sticks":30,"Materials.Stone.Limestone.Stones":20},
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        gfx.fillStyle(0xd4a054).fillRect(px+4, py+20, s-8, s-22);
        gfx.fillStyle(0xaa4422).fillTriangle(px+2, py+20, px+s-2, py+20, cx, py+4);
        gfx.lineStyle(1, 0x7a2810, 0.8).strokeTriangle(px+2, py+20, px+s-2, py+20, cx, py+4);
        gfx.fillStyle(0x5a2a10).fillRect(cx-6, py+s-24, 12, 21);
        gfx.fillStyle(0x8a5030, 0.4).fillRect(cx-5, py+s-23, 5, 20);
        gfx.fillStyle(0xffeaa0, 0.85).fillRect(px+10, py+26, 11, 10).fillRect(px+s-21, py+26, 11, 10);
        gfx.lineStyle(1, 0x9a6430, 0.5)
            .lineBetween(px+15, py+26, px+15, py+36).lineBetween(px+10, py+31, px+21, py+31)
            .lineBetween(px+s-16, py+26, px+s-16, py+36).lineBetween(px+s-21, py+31, px+s-10, py+31);
        gfx.lineStyle(1, 0x8a6030, 0.35).strokeRect(px+4, py+20, s-8, s-22);
    },
};
