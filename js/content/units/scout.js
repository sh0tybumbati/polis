export default {
    id: 'scout',
    hp: 10, atk: 1, speed: 70, range: 0,
    color: 0x336655,
    isScout: true,
    vetLevels: false,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(0x1a3328).fillTriangle(ox, oy-9, ox-7, oy+4, ox+7, oy+4).fillTriangle(ox, oy+7, ox-7, oy+4, ox+7, oy+4);
        gfx.lineStyle(1, 0x33aa77, 0.9).strokeTriangle(ox, oy-9, ox-7, oy+4, ox+7, oy+4).strokeTriangle(ox, oy+7, ox-7, oy+4, ox+7, oy+4);
        gfx.fillStyle(0x55ffaa, 0.85).fillCircle(ox, oy, 2);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(ox, oy, 11);
    },
};
