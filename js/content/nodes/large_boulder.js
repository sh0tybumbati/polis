export default {
    id: 'large_boulder',
    resource: 'Materials.Stone.Limestone',
    stock: 24,
    respawnDays: 0,
    large: true,
    role: 'miner',

    draw(gfx, _n, alpha) {
        gfx.fillStyle(0x776655, alpha).fillEllipse(2, 4, 44, 30);
        gfx.fillStyle(0x887766, alpha).fillEllipse(-6, -3, 22, 14);
        gfx.fillStyle(0x665544, alpha).fillEllipse(8, 6, 14, 10);
        gfx.lineStyle(1, 0x554433, alpha * 0.6)
            .lineBetween(-8, 2, -2, 12).lineBetween(4, -4, 10, 6);
    },
};
