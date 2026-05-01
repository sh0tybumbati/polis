export default {
    id: 'scout',
    hp: 10, atk: 1, speed: 70, range: 0,
    color: 0x336655,
    isScout: true,
    vetLevels: false,
    draw(gfx, u) {
        gfx.fillStyle(0x1a3328).fillTriangle(0, -9, -7, 4, 7, 4).fillTriangle(0, 7, -7, 4, 7, 4);
        gfx.lineStyle(1, 0x33aa77, 0.9).strokeTriangle(0, -9, -7, 4, 7, 4).strokeTriangle(0, 7, -7, 4, 7, 4);
        gfx.fillStyle(0x55ffaa, 0.85).fillCircle(0, 0, 2);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 11);
    },
};
