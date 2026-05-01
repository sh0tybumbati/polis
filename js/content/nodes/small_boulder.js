export default {
    id: 'small_boulder',
    resource: 'Materials.Stone.Limestone',
    stock: 12,
    respawnDays: 12,
    role: 'miner',

    draw(gfx, _n, alpha) {
        gfx.fillStyle(0x887766, alpha).fillEllipse(2, 3, 28, 19);
        gfx.fillStyle(0x9a8877, alpha).fillEllipse(-3, -1, 14, 9);
        gfx.lineStyle(1, 0x665544, alpha * 0.5).lineBetween(-2, 1, 4, 8);
    },
};
