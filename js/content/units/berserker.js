export default {
    id: 'berserker',
    hp: 30, atk: 10, speed: 50, range: 36,
    color: 0xbb5533,
    draw(gfx, u, ctx) {
        const ox = ctx?.ox ?? 0, oy = ctx?.oy ?? 0;
        gfx.fillStyle(this.color).fillCircle(ox, oy, 13);
        gfx.lineStyle(2, 0xff8844, 0.9).strokeCircle(ox, oy, 13);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(ox, oy, 16);
    },
};
