export default {
    id: 'ore_vein',
    resource: 'Materials.Metal.Copper.Ore',
    stock: 20,
    respawnDays: 25,
    large: true,
    role: 'miner',

    draw(gfx, _n, alpha) {
        gfx.fillStyle(0x554433, alpha).fillEllipse(0, 2, 46, 32);
        gfx.fillStyle(0x446644, alpha * 0.9).fillEllipse(-8, -2, 16, 10);
        gfx.fillStyle(0x447744, alpha * 0.8).fillEllipse(6, 4, 12, 8);
        gfx.lineStyle(2, 0x55aa55, alpha * 0.7)
            .lineBetween(-10, 0, -4, 8).lineBetween(2, -4, 8, 6).lineBetween(-2, 2, 4, -4);
    },
};
