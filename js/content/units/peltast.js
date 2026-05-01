export default {
    id: 'peltast',
    hp: 20, atk: 6, speed: 42, range: 30,
    color: 0xcc8844,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillCircle(0, 0, 9);
        gfx.lineStyle(2, 0xcc8844, 0.9).strokeCircle(0, 0, 9);
        gfx.fillStyle(0xaa7733, 0.8).fillRect(6, -2, 6, 4);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 12);
    },
};
