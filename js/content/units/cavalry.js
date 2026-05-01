export default {
    id: 'cavalry',
    hp: 25, atk: 7, speed: 80, range: 36,
    color: 0xaa8833,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillTriangle(0, -13, -11, 0, 11, 0).fillTriangle(0, 11, -11, 0, 11, 0);
        gfx.lineStyle(2, 0xffee88, 0.7).strokeTriangle(0, -13, -11, 0, 11, 0);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -15, -13, 1, 13, 1).strokeTriangle(0, 13, -13, 1, 13, 1);
    },
};
