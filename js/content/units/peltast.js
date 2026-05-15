export default {
    id: 'peltast',
    hp: 20, atk: 6, speed: 42, range: 30,
    color: 0xcc8844,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillCircle(ox, oy, 9);
        gfx.lineStyle(2, 0xcc8844, 0.9).strokeCircle(ox, oy, 9);
        gfx.fillStyle(0xaa7733, 0.8).fillRect(ox+6, oy-2, 6, 4);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(ox, oy, 12);
    },
};
