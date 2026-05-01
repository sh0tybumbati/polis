export default {
    id: 'slinger',
    hp: 14, atk: 4, speed: 50, range: 100,
    color: 0x775599,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillTriangle(0, -9, -7, 0, 7, 0).fillTriangle(0, 8, -7, 0, 7, 0);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -11, -9, 1, 9, 1).strokeTriangle(0, 10, -9, 1, 9, 1);
    },
};
