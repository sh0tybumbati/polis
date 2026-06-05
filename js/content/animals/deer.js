import { TILE } from '../../config/gameConstants.js';
import { renderRig } from '../../engine/renderRig.js';
import { SPRITES } from '../sprites/index.js';

export default {
    id:         'deer',
    maxCount:   16,
    breedRadius: 4 * TILE,
    meat:       8,
    hide:       2,
    speed:      52,
    fleeRadius: 3.5 * TILE,
    atkRange:   0.9 * TILE,

    // Rig-driven: a directional body-part sprite (SPRITES.deer) animated by walkPhase + facing.
    draw(g, d, ctx = {}) {
        if (d.isDead) {
            g.fillStyle(0x5a3010, 0.9).fillEllipse(0, 2, 26, 10);
            if (d.meatLeft > 0) {
                const r = d.meatLeft / this.meat;
                g.fillStyle(0x331010, 0.7).fillRect(-10, -5, 20, 4);
                g.fillStyle(0xdd3311, 0.9).fillRect(-10, -5, 20 * r, 4);
            }
            return;
        }
        const sc = d.scale ?? 1.0;
        const hungry = (d.hungryDays ?? 0) > 0;
        g.fillStyle(0x000000, 0.12).fillEllipse(0, 10 * sc, 22 * sc, 7 * sc);   // shadow
        renderRig(g, SPRITES.deer, {
            scale: sc, ox: 0, oy: 0,
            walkPhase: d._walkPhase ?? 0,
            moving: ctx.moving ?? false,
            facing: d.facing ?? 'south',
            vars: { male: d.gender === 'male', bodyCol: hungry ? 0x806020 : 0xb07030 },
        });
    },
};
