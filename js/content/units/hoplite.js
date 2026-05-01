export default {
    id: 'hoplite',
    hp: 25, atk: 8, speed: 40, range: 32,
    color: 0xddaa44,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillCircle(0, 0, 11);
        gfx.lineStyle(2, 0xddaa44, 0.9).strokeCircle(0, 0, 11);
        gfx.fillStyle(0xddaa44, 0.5).fillEllipse(-4, 1, 10, 13);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 14);
    },
};
