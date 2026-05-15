export default {
    id: 'toxotes',
    hp: 18, atk: 7, speed: 65, range: 140,
    color: 0xddaa44,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillTriangle(ox, oy-13, ox-10, oy, ox+10, oy).fillTriangle(ox, oy+11, ox-10, oy, ox+10, oy);
        gfx.lineStyle(2, 0xddaa44, 0.8).strokeTriangle(ox, oy-13, ox-10, oy, ox+10, oy).strokeTriangle(ox, oy+11, ox-10, oy, ox+10, oy);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(ox, oy-15, ox-12, oy+1, ox+12, oy+1).strokeTriangle(ox, oy+13, ox-12, oy+1, ox+12, oy+1);
    },
};
