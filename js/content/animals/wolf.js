import { TILE } from '../../config/gameConstants.js';
import { renderRig } from '../../engine/renderRig.js';
import { SPRITES } from '../sprites/index.js';

export default {
    id:         'wolf',
    maxCount:   5,
    breedRadius: 4 * TILE,
    meat:       0,              // colonists kill wolves defensively — not farmed (no meat/hide SKU)
    hide:       0,
    hp:         5,
    speed:      72,             // faster than its prey
    scale:      1.0,
    fleeRadius: 0,              // apex predator — never flees

    // Predator AI (NatureManager._tickWolf): hunts wild herbivores and raids the colony, biting any
    // target within atkRange. Killing prey refills its food bar.
    predator:    true,
    huntRadius:  6 * TILE,      // how far it will spot/pursue prey when hungry
    aggroRadius: 3 * TILE,      // colonists within this are attacked even when not starving
    atkRange:    0.9 * TILE,
    atk:         3,

    // Rig-driven: directional grey-canine sprite (SPRITES.wolf) animated by walkPhase + facing.
    draw(g, a, ctx = {}) {
        if (a.isDead) {
            g.fillStyle(0x2e2a22, 0.9).fillEllipse(0, 2, 24, 9);
            return;
        }
        const sc = a.scale ?? 1.0;
        const hungry = (a.hungryDays ?? 0) > 0;
        g.fillStyle(0x000000, 0.12).fillEllipse(0, 10 * sc, 24 * sc, 6 * sc);   // shadow
        renderRig(g, SPRITES.wolf, {
            scale: sc, ox: 0, oy: 0,
            walkPhase: a._walkPhase ?? 0,
            moving: ctx.moving ?? false,
            facing: a.facing ?? 'south',
            vars: { bodyCol: hungry ? 0x5e5850 : 0x7a736a },
        });
        if (a.aggroTarget != null) {   // hunting glint
            g.fillStyle(0xffdd33, 0.85).fillCircle(8 * sc, -3 * sc, 1.1 * sc);
        }
    },
};
