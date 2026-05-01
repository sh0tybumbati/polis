export default {
    id: 'olive_grove',
    resource: 'olives',
    stock: 12,
    respawnDays: 5,
    role: 'forager',

    draw(gfx, _n, alpha) {
        gfx.fillStyle(0x7a6644, alpha).fillRect(-4, 6, 8, 16);
        gfx.fillStyle(0x3a4a1e, alpha * 0.9).fillEllipse(-10, -4, 24, 18);
        gfx.fillStyle(0x4a5a28, alpha).fillEllipse(8, -6, 22, 16);
        gfx.fillStyle(0x5a6a30, alpha * 0.85).fillEllipse(0, -10, 20, 14);
        [[-6,-2],[4,0],[-2,4],[8,-4]].forEach(([ox,oy]) =>
            gfx.fillStyle(0x224411, alpha).fillCircle(ox, oy, 2.5));
    },
};
