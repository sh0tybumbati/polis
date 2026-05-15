export default {
    id: 'hoplite',
    hp: 25, atk: 8, speed: 40, range: 32,
    color: 0xddaa44,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillCircle(ox, oy, 11);
        gfx.lineStyle(2, 0xddaa44, 0.9).strokeCircle(ox, oy, 11);
        gfx.fillStyle(0xddaa44, 0.5).fillEllipse(ox-4, oy+1, 10, 13);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(ox, oy, 14);
    },
};
