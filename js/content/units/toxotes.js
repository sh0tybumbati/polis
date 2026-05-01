export default {
    id: 'toxotes',
    hp: 18, atk: 7, speed: 65, range: 140,
    color: 0xddaa44,
    draw(gfx, u) {
        gfx.fillStyle(this.color).fillTriangle(0, -13, -10, 0, 10, 0).fillTriangle(0, 11, -10, 0, 10, 0);
        gfx.lineStyle(2, 0xddaa44, 0.8).strokeTriangle(0, -13, -10, 0, 10, 0).strokeTriangle(0, 11, -10, 0, 10, 0);
        if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -15, -12, 1, 12, 1).strokeTriangle(0, 13, -12, 1, 12, 1);
    },
};
