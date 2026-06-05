import { TILE } from '../../config/gameConstants.js';
import { renderRig } from '../../engine/renderRig.js';
import { SPRITES } from '../sprites/index.js';

export default {
    id:         'boar',
    maxCount:   8,
    breedRadius: 4 * TILE,
    meat:       6,
    hide:       1,
    meatKey:    'Food.Meat.Pork',
    hideKey:    'Textile.Hide.Boar',
    hp:         3,
    speed:      60,
    scale:      1.0,
    fleeRadius: 2 * TILE,        // territorial — doesn't spook easily
    atkRange:   0.9 * TILE,

    // Hostility: a boar is aggressive — it charges anyone who wanders within aggroRadius, and
    // always retaliates when struck (handled in NatureManager._tickBeast).
    aggressive: true,
    aggroRadius: 2.5 * TILE,
    atk:        2,

    // Rig-driven: directional bristly sprite (SPRITES.boar) animated by walkPhase + facing.
    draw(g, a, ctx = {}) {
        if (a.isDead) {
            g.fillStyle(0x3a2614, 0.9).fillEllipse(0, 2, 26, 10);
            if (a.meatLeft > 0) {
                const r = a.meatLeft / this.meat;
                g.fillStyle(0x331010, 0.7).fillRect(-10, -5, 20, 4);
                g.fillStyle(0xcc4422, 0.9).fillRect(-10, -5, 20 * r, 4);
            }
            return;
        }
        const sc = a.scale ?? 1.0;
        const hungry = (a.hungryDays ?? 0) > 0;
        g.fillStyle(0x000000, 0.12).fillEllipse(0, 10 * sc, 24 * sc, 7 * sc);   // shadow
        renderRig(g, SPRITES.boar, {
            scale: sc, ox: 0, oy: 0,
            walkPhase: a._walkPhase ?? 0,
            moving: ctx.moving ?? false,
            facing: a.facing ?? 'south',
            vars: { male: a.gender === 'male', bodyCol: hungry ? 0x3a2c1e : 0x4a3826 },
        });
        if (a.aggroTarget != null) {   // enraged glint
            g.fillStyle(0xff3322, 0.8).fillCircle(7 * sc, -3 * sc, 1.2 * sc);
        }
    },
};
