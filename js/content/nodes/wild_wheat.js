export default {
    id: 'wild_wheat',
    resource: 'Food.Grain.Wheat',
    stock: 60,
    respawnDays: 3,
    role: 'forager',

    draw(gfx, _n, alpha) {
        // stalks
        [[0,8],[-4,6],[4,6],[-2,4],[3,2]].forEach(([sx, sy]) => {
            gfx.lineStyle(1, 0xc8a228, alpha)
                .lineBetween(sx, sy + 4, sx + (sx < 0 ? -2 : 2), sy - 8);
        });
        // grain heads
        [[-4,-4],[0,-6],[4,-4],[-2,-10],[3,-9]].forEach(([hx, hy]) => {
            gfx.fillStyle(0xe8c040, alpha).fillEllipse(hx, hy, 4, 8);
            gfx.fillStyle(0xf0d060, alpha * 0.8).fillEllipse(hx, hy - 2, 2, 4);
        });
        // ground grass
        gfx.fillStyle(0x7a9a30, alpha * 0.7).fillEllipse(0, 10, 24, 8);
    },
};