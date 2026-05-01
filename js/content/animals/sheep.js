import { TILE } from '../../config/gameConstants.js';

export default {
    id:         'sheep',
    maxCount:   10,
    meat:       4,
    speed:      38,
    fleeRadius: 2.5 * TILE,
    tameCost:   1,
    woolMs:     35000,

    draw(g, s) {
        const hungry = !s.isTamed && (s.hungryDays ?? 0) > 0;
        const col = hungry         ? 0xb0a888
                  : s.isTamed      ? 0xe8e0c0
                  : !s.woolReady   ? 0xb8a880
                  : 0xf0ece0;
        const bodyAlpha = hungry ? 0.5 : 1.0;
        g.fillStyle(0x000000, 0.10).fillEllipse(0, 10, 20, 6);
        g.fillStyle(col, bodyAlpha).fillCircle(-3, 0, 9);
        g.fillStyle(col, bodyAlpha).fillCircle(4,  1, 10);
        g.fillStyle(col, bodyAlpha).fillCircle(0, -4,  8);
        g.fillStyle(0xd0c4a0).fillCircle(12, -3, 5);
        g.fillStyle(0x221100).fillCircle(13, -4, 1.2);
        g.lineStyle(2, 0xb8a880, 0.9);
        g.lineBetween(-5, 7, -6, 14);
        g.lineBetween(-1, 8, -1, 15);
        g.lineBetween( 4, 8,  4, 15);
        g.lineBetween( 8, 7,  9, 14);
        if (s.isTamed) {
            g.fillStyle(0xcc4444, 0.85).fillRect(-2, -12, 10, 3);
        }
        if (s.gender) {
            g.fillStyle(s.gender === 'male' ? 0x6688cc : 0xdd88aa, 0.85).fillCircle(12, -9, 2);
        }
    },
};
