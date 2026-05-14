import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.width*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'camp',
    placement: 'tile',
    width: 2, height: 2,
    label: "⛺ Camp",
    color: 9138256,
    cost: {},
    materialQty: 4,
    allowedMaterials: ["Materials.Wood.Pine.Sticks","Materials.Wood.Pine","Materials.Stone.Limestone.Stones","Materials.Stone.Limestone"],
    desc: "Temporary shelter with basic storage. Upgrade to a house to establish an oikos.",
    outdoor: true,
    capacity: 4,
    stores: {"Food.Produce.Berry":40,"Materials.Wood.Pine.Sticks":30,"Materials.Stone.Limestone.Stones":20},
    tick: null,
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);

        // Ground patch
        gfx.fillStyle(0x7a6040, 0.45).fillEllipse(cx, py + s - 10, s - 6, 14);

        // Tent body — canvas triangle
        gfx.fillStyle(0xb8904a).fillTriangle(px + 6, py + s - 8, px + s - 6, py + s - 8, cx, py + 8);
        gfx.lineStyle(1, 0x7a5828, 0.8).strokeTriangle(px + 6, py + s - 8, px + s - 6, py + s - 8, cx, py + 8);

        // Centre ridge pole shadow line
        gfx.lineStyle(1, 0x5a3c18, 0.5).lineBetween(cx, py + 8, cx, py + s - 8);

        // Tent opening (dark arch at front)
        gfx.fillStyle(0x2a1a08).fillTriangle(cx - 10, py + s - 8, cx + 10, py + s - 8, cx, py + s - 24);

        // Guy ropes
        gfx.lineStyle(1, 0x8a7050, 0.4)
            .lineBetween(cx, py + 8, px + 2, py + s - 4)
            .lineBetween(cx, py + 8, px + s - 2, py + s - 4);

        // Small bundle of sticks to the side
        gfx.fillStyle(0x7a4a18)
            .fillRect(px + 4, py + s - 20, 10, 3)
            .fillRect(px + 5, py + s - 24, 8, 3)
            .fillRect(px + 6, py + s - 28, 6, 3);

        // Camp fire glow dot
        gfx.fillStyle(0xff8822, 0.9).fillCircle(cx + 14, py + s - 14, 3);
        gfx.fillStyle(0xffdd44, 0.7).fillCircle(cx + 14, py + s - 14, 1.5);
    },
};
