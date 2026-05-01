export default {
    id: 'berry_bush',
    resource: 'Food.Produce.Berry',
    stock: 24,
    respawnDays: 3,
    role: 'forager',

    draw(gfx, n, alpha) {
        gfx.fillStyle(0x338818, alpha).fillCircle(-5, 2, 9);
        gfx.fillStyle(0x44aa22, alpha).fillCircle(4, 1, 10);
        gfx.fillStyle(0x55bb33, alpha).fillCircle(-1, -4, 8);
        [[-3,-2],[3,1],[0,3],[-5,4],[5,-2]].forEach(([bx,by]) =>
            gfx.fillStyle(0xcc2244, Math.min(1, alpha + 0.2)).fillCircle(bx, by, 2.5));
    },
};
