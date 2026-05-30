import { TILE } from '../../config/gameConstants.js';

export default {
    id:         'deer',
    maxCount:   16,
    breedRadius: 4 * TILE,
    meat:       8,
    hide:       2,
    speed:      52,
    fleeRadius: 3.5 * TILE,
    atkRange:   0.9 * TILE,

    draw(g, d) {
        if (d.isDead) {
            g.fillStyle(0x5a3010, 0.9).fillEllipse(0, 2, 26, 10);
            if (d.meatLeft > 0) {
                const r = d.meatLeft / this.meat;
                g.fillStyle(0x331010, 0.7).fillRect(-10, -5, 20, 4);
                g.fillStyle(0xdd3311, 0.9).fillRect(-10, -5, 20 * r, 4);
            }
        } else {
            const sc = d.scale ?? 1.0;
            const hungry = (d.hungryDays ?? 0) > 0;
            g.fillStyle(0x000000, 0.12).fillEllipse(0, 10, 22 * sc, 7 * sc);
            g.fillStyle(hungry ? 0x806020 : 0xb07030, hungry ? 0.5 : 1.0).fillEllipse(0, 0, 20 * sc, 13 * sc);
            g.fillStyle(0xb07030).fillCircle(11 * sc, -4 * sc, 6 * sc);
            if (d.gender === 'male') {
                g.lineStyle(1.5, 0x7a4010, 0.9);
                g.lineBetween(10 * sc, -9 * sc, 8 * sc, -16 * sc);
                g.lineBetween(13 * sc, -9 * sc, 15 * sc, -16 * sc);
            }
            g.fillStyle(0x8a5020).fillEllipse(14 * sc, -9 * sc, 4 * sc, 7 * sc);
            g.fillStyle(0x110800).fillCircle(13 * sc, -5 * sc, 1.5 * sc);
            g.lineStyle(2, 0x8a5020, 0.9);
            g.lineBetween(-6*sc,  5*sc, -7*sc, 14*sc);
            g.lineBetween(-2*sc,  6*sc, -3*sc, 15*sc);
            g.lineBetween( 4*sc,  5*sc,  3*sc, 14*sc);
            g.lineBetween( 8*sc,  4*sc,  9*sc, 13*sc);
        }
    },
};
