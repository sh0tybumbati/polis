export default {
    id: 'large_tree',
    resource: 'Materials.Wood.Pine',
    stock: 50,
    respawnDays: 5,
    role: 'woodcutter',

    draw(gfx, n, alpha) {
        if (n.felled) {
            gfx.fillStyle(0x5a3318, alpha).fillEllipse(0, 5, 40, 14);
            gfx.fillStyle(0x7a4a28, alpha).fillEllipse(-10, 2, 16, 11).fillEllipse(10, 2, 16, 11);
            gfx.fillStyle(0x4a2810, alpha * 0.6).fillEllipse(0, 6, 32, 8);
        } else {
            gfx.fillStyle(0x5a3318, alpha).fillRect(-5, 10, 10, 18);
            gfx.fillStyle(0x144a0e, alpha).fillCircle(0, -5, 22);
            gfx.fillStyle(0x1a6a12, alpha).fillCircle(-8, 4, 16);
            gfx.fillStyle(0x1a6a12, alpha).fillCircle(8, 4, 16);
            gfx.fillStyle(0x2a8020, alpha).fillCircle(0, -10, 16);
            gfx.fillStyle(0x338a28, alpha).fillCircle(0, -3, 12);
        }
    },
};
