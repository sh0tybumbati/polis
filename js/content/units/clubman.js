export default {
    id: 'clubman',
    hp: 16, atk: 4, speed: 40, range: 24,
    color: 0x886644,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillCircle(0, 0, 8);
        gfx.fillStyle(0xaa8855, 0.9).fillRect(6, -3, 7, 5);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 11);
    },
};
