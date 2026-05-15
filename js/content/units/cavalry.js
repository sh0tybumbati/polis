export default {
    id: 'cavalry',
    hp: 25, atk: 7, speed: 80, range: 36,
    color: 0xaa8833,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillTriangle(ox, oy-13, ox-11, oy, ox+11, oy).fillTriangle(ox, oy+11, ox-11, oy, ox+11, oy);
        gfx.lineStyle(2, 0xffee88, 0.7).strokeTriangle(ox, oy-13, ox-11, oy, ox+11, oy);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(ox, oy-15, ox-13, oy+1, ox+13, oy+1).strokeTriangle(ox, oy+13, ox-13, oy+1, ox+13, oy+1);
    },
};
