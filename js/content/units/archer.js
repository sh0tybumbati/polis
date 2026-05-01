export default {
    id: 'archer',
    hp: 12, atk: 5, speed: 62, range: 120,
    color: 0x558866,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillTriangle(0, -12, -9, 0, 9, 0).fillTriangle(0, 10, -9, 0, 9, 0);
        gfx.fillStyle(0x228855, 0.7).fillTriangle(0, 10, -4, 0, 4, 0);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -14, -11, 1, 11, 1).strokeTriangle(0, 13, -11, 1, 11, 1);
    },
};
