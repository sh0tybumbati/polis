export default {
    id: 'spearman',
    hp: 18, atk: 5, speed: 38, range: 28,
    color: 0x6688cc,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillTriangle(ox, oy-11, ox-9, oy+6, ox+9, oy+6);
        gfx.lineStyle(2, 0x8899ff, 0.8).lineBetween(ox, oy-15, ox, oy+8);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(ox, oy-13, ox-11, oy+7, ox+11, oy+7);
    },
};
