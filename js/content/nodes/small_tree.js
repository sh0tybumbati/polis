export default {
    id: 'small_tree',
    resource: 'wood',
    stock: 10,
    respawnDays: 6,
    role: 'woodcutter',

    draw(gfx, n, alpha) {
        if (n.felled) {
            gfx.fillStyle(0x6a4422, alpha).fillEllipse(0, 4, 28, 10);
            gfx.fillStyle(0x8a5a30, alpha).fillEllipse(-6, 2, 10, 8).fillEllipse(6, 2, 10, 8);
            gfx.fillStyle(0x5a3318, alpha * 0.6).fillEllipse(0, 5, 22, 6);
        } else {
            gfx.fillStyle(0x6a4422, alpha).fillRect(-3, 7, 6, 13);
            gfx.fillStyle(0x1a5a12, alpha).fillCircle(0, -1, 14);
            gfx.fillStyle(0x2a7a1e, alpha).fillCircle(-5, 3, 10);
            gfx.fillStyle(0x2a7a1e, alpha).fillCircle(5, 3, 10);
            gfx.fillStyle(0x338a28, alpha).fillCircle(0, -5, 10);
        }
    },
};
