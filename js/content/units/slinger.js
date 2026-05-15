export default {
    id: 'slinger',
    hp: 14, atk: 4, speed: 50, range: 100,
    color: 0x775599,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillTriangle(ox, oy-9, ox-7, oy, ox+7, oy).fillTriangle(ox, oy+8, ox-7, oy, ox+7, oy);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(ox, oy-11, ox-9, oy+1, ox+9, oy+1).strokeTriangle(ox, oy+10, ox-9, oy+1, ox+9, oy+1);
    },
};
