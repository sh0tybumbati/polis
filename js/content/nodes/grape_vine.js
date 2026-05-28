export default {
    id: 'grape_vine',
    resource: 'Food.Produce.WildGrapes',
    stock: 60,
    respawnDays: 2,
    role: 'forager',

    draw(gfx, _n, alpha) {
        // vine trunk
        gfx.lineStyle(2, 0x7a5c2e, alpha).lineBetween(0, 10, 0, -2);
        // leafy canopy
        gfx.fillStyle(0x3a7a20, alpha).fillEllipse(-6, -2, 14, 10);
        gfx.fillStyle(0x4a8a28, alpha).fillEllipse(6, -4, 12, 9);
        gfx.fillStyle(0x2e6a18, alpha * 0.85).fillEllipse(0, -6, 10, 8);
        // grape clusters
        [[-4, 2], [5, 0], [0, 4]].forEach(([gx, gy]) => {
            [[-2,-2],[0,-3],[2,-2],[-1,0],[1,0],[0,2]].forEach(([dx, dy]) =>
                gfx.fillStyle(0x6a2a9a, alpha * 0.9).fillCircle(gx + dx, gy + dy, 1.8));
        });
    },
};
