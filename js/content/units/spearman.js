export default {
    id: 'spearman',
    hp: 18, atk: 5, speed: 38, range: 28,
    color: 0x6688cc,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillTriangle(0, -11, -9, 6, 9, 6);
        gfx.lineStyle(2, 0x8899ff, 0.8).lineBetween(0, -15, 0, 8);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -13, -11, 7, 11, 7);
    },
};
