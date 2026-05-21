export default {
    id: 'wild_garden',
    resource: 'Food.Produce.Olive',
    stock: 40,
    respawnDays: 2,
    role: 'forager',

    draw(gfx, _n, alpha) {
        gfx.fillStyle(0x3a6a18, alpha).fillEllipse(-4, 3, 16, 10);
        gfx.fillStyle(0x4a7a22, alpha).fillEllipse(5, 1, 14, 9);
        gfx.fillStyle(0x2a5a10, alpha * 0.8).fillEllipse(0, -2, 10, 7);
        [[-5,-1],[4,3],[0,0],[-2,5]].forEach(([fx,fy]) =>
            gfx.fillStyle(0xddcc44, alpha * 0.9).fillCircle(fx, fy, 2));
    },
};
