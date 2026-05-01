export default {
    id: 'berserker',
    hp: 30, atk: 10, speed: 50, range: 36,
    color: 0xbb5533,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillCircle(0, 0, 13);
        gfx.lineStyle(2, 0xff8844, 0.9).strokeCircle(0, 0, 13);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 16);
    },
};
