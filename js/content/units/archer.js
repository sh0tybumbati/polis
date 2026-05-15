export default {
    id: 'archer',
    hp: 12, atk: 5, speed: 62, range: 120,
    color: 0x558866,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillTriangle(ox, oy-12, ox-9, oy, ox+9, oy).fillTriangle(ox, oy+10, ox-9, oy, ox+9, oy);
        gfx.fillStyle(0x228855, 0.7).fillTriangle(ox, oy+10, ox-4, oy, ox+4, oy);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(ox, oy-14, ox-11, oy+1, ox+11, oy+1).strokeTriangle(ox, oy+13, ox-11, oy+1, ox+11, oy+1);
    },
};
