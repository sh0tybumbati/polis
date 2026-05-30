export default {
    id: 'scrub',
    resource: 'Textile.Fiber.Wool',
    stockMin: 3, stockMax: 8,
    respawnDays: 4,
    large: true,
    role: 'shepherd',

    draw(gfx, n, alpha) {
        const v = (n.id | 0) % 4;
        if (v === 0) {
            // Round leafy clumps
            gfx.fillStyle(0x7a8830, alpha).fillEllipse(-6, 2, 14, 8);
            gfx.fillStyle(0x6a7828, alpha).fillEllipse(4, 0, 12, 7);
            gfx.fillStyle(0x8a9838, alpha).fillEllipse(-2, -3, 10, 6);
            gfx.fillStyle(0x5a6820, alpha * 0.6).fillRect(-7, 4, 3, 5);
            gfx.fillStyle(0x5a6820, alpha * 0.6).fillRect(3, 3, 3, 4);
        } else if (v === 1) {
            // Dry thorn shrub — tan and sparse
            gfx.fillStyle(0xa09040, alpha * 0.6).fillEllipse(0, 3, 22, 9);
            gfx.lineStyle(1.5, 0x7a7030, alpha * 0.85)
               .lineBetween(-8, 4, -5, -3).lineBetween(-5, -3, -8, -7).lineBetween(-5, -3, -1, -6)
               .lineBetween(4, 4, 7, -2).lineBetween(7, -2, 5, -6).lineBetween(7, -2, 10, -5);
            gfx.fillStyle(0xb8a848, alpha * 0.5).fillEllipse(-3, 1, 10, 6);
            gfx.fillStyle(0x908838, alpha * 0.5).fillEllipse(6, 0, 8, 5);
        } else if (v === 2) {
            // Low wide ground cover — flat spreading
            gfx.fillStyle(0x6a8828, alpha * 0.75).fillEllipse(0, 5, 30, 9);
            gfx.fillStyle(0x7a9830, alpha).fillEllipse(-8, 2, 14, 7);
            gfx.fillStyle(0x8aaa38, alpha).fillEllipse(7, 1, 15, 8);
            gfx.fillStyle(0x5a7820, alpha * 0.45).fillEllipse(0, 6, 24, 5);
        } else {
            // Grass tufts with fine stems
            gfx.fillStyle(0x9aa040, alpha * 0.55).fillEllipse(-6, 4, 10, 5);
            gfx.fillStyle(0x8a9038, alpha * 0.55).fillEllipse(5, 4, 9, 5);
            gfx.fillStyle(0xaaaa50, alpha * 0.65).fillEllipse(0, 2, 8, 5);
            gfx.lineStyle(1, 0x8a8030, alpha * 0.75)
               .lineBetween(-6, 3, -8, -2).lineBetween(-6, 3, -4, -1)
               .lineBetween(5, 3, 7, -1).lineBetween(5, 3, 3, -2)
               .lineBetween(0, 1, 1, -3).lineBetween(0, 1, -2, -2);
        }
    },
};
