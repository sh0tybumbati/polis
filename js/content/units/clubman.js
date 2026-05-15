export default {
    id: 'clubman',
    hp: 16, atk: 4, speed: 40, range: 24,
    color: 0x886644,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillCircle(ox, oy, 8);
        gfx.fillStyle(0xaa8855, 0.9).fillRect(ox+6, oy-3, 7, 5);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(ox, oy, 11);
    },
};
