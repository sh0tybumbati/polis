export default {
    id: 'fishing_spot',
    resource: 'Food.Fish.Fresh',
    stockMin: 18, stockMax: 30,
    respawnDays: 2,
    role: 'forager',

    draw(gfx, _n, alpha) {
        // water ripples
        gfx.lineStyle(1, 0x4488cc, alpha * 0.6).strokeEllipse(0, 4, 22, 8);
        gfx.lineStyle(1, 0x5599dd, alpha * 0.4).strokeEllipse(0, 4, 30, 11);
        // reeds
        gfx.lineStyle(2, 0x5a8a2a, alpha).lineBetween(-7, 8, -6, -8);
        gfx.lineStyle(2, 0x4a7a20, alpha).lineBetween(-4, 8, -3, -5);
        gfx.fillStyle(0x7ab040, alpha).fillEllipse(-6, -9, 5, 3);
        gfx.fillStyle(0x6aa030, alpha).fillEllipse(-3, -6, 4, 3);
        // fish silhouette just below surface
        gfx.fillStyle(0x88bbdd, alpha * 0.7).fillEllipse(5, 3, 10, 4);
        gfx.fillStyle(0x88bbdd, alpha * 0.7).fillTriangle(10, 3, 13, 1, 13, 5);
    },
};
