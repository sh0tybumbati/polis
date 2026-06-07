import { TILE } from '../../config/gameConstants.js';
import { renderRig } from '../../engine/renderRig.js';
import { SPRITES } from '../sprites/index.js';
import { dim } from '../genetics.js';

export default {
    id:         'wolf',
    maxCount:   5,
    breedRadius: 4 * TILE,
    meat:       3,              // gamey wolf meat, plus a prized pelt
    meatKey:    'Food.Meat.Wolf',
    hide:       2,
    hideKey:    'Textile.Hide.Wolf',
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

    // Behaviour (entity-editor params, wired in NatureManager): nocturnal pack carnivore.
    diet: 'carnivore', fightOrFlight: 'fight', aggroChancePct: 100,
    packCohesion: 0.6, activeCycle: 'nocturnal', territorialRadius: 0,
    lifespanDays: 26, litterSize: 4, timeToAdulthoodDays: 6,
    tameable: false, tameCost: 6,

    // Genetics: pelt tint (grey→black→white), size gene, dark-back marking.
    genetics: { coat: 0x7a736a, coatJitter: 22, sizeVar: 0.13, markings: ['plain', 'darkback'], morphRate: 0.02 },

    // Rig-driven: directional grey-canine sprite (SPRITES.wolf) animated by walkPhase + facing.
    draw(g, a, ctx = {}) {
        if (a.isDead) {
            g.fillStyle(0x2e2a22, 0.9).fillEllipse(0, 2, 24, 9);
            if (a.meatLeft > 0) {   // meat remaining
                const r = a.meatLeft / this.meat;
                g.fillStyle(0x331010, 0.7).fillRect(-10, -5, 20, 4);
                g.fillStyle(0xcc4422, 0.9).fillRect(-10, -5, 20 * r, 4);
            }
            if (a.hideLeft > 0) {   // pelt remaining
                const r = a.hideLeft / this.hide;
                g.fillStyle(0x2a2418, 0.7).fillRect(-10, 0, 20, 4);
                g.fillStyle(0x8a8478, 0.9).fillRect(-10, 0, 20 * r, 4);
            }
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
            vars: { bodyCol: dim(a.pheno?.coat ?? 0x7a736a, hungry), marking: a.pheno?.marking ?? 'plain' },
        });
        if (a.aggroTarget != null) {   // hunting glint
            g.fillStyle(0xffdd33, 0.85).fillCircle(8 * sc, -3 * sc, 1.1 * sc);
        }
    },
};
