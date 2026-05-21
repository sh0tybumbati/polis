export default {
    id: 'scrub',
    resource: 'Textile.Fiber.Wool',
    stock: 16,
    respawnDays: 2,
    large: true,
    role: 'shepherd',

    draw(gfx, _n, alpha) {
        gfx.fillStyle(0x7a8830, alpha).fillEllipse(-6, 2, 14, 8);
        gfx.fillStyle(0x6a7828, alpha).fillEllipse(4, 0, 12, 7);
        gfx.fillStyle(0x8a9838, alpha).fillEllipse(-2, -3, 10, 6);
        gfx.fillStyle(0x5a6820, alpha * 0.6).fillRect(-7, 4, 3, 5);
        gfx.fillStyle(0x5a6820, alpha * 0.6).fillRect(3, 3, 3, 4);
    },
};
