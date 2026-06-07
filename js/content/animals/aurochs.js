import { TILE } from '../../config/gameConstants.js';
import { renderRig } from '../../engine/renderRig.js';
import { SPRITES } from '../sprites/index.js';

export default {
    id:         'aurochs',
    maxCount:   6,
    breedRadius: 5 * TILE,
    meat:       14,
    hide:       4,
    meatKey:    'Food.Meat.Beef',
    hideKey:    'Textile.Hide.Aurochs',
    hp:         6,
    speed:      40,
    scale:      1.35,
    fleeRadius: 2.5 * TILE,
    atkRange:   1.0 * TILE,

    // Hostility: an aurochs is defensive — it grazes calmly and flees mild threats, but if struck
    // (or cornered within aggroRadius) it turns and gores, hitting hard (NatureManager._tickBeast).
    defensive:  true,
    aggroRadius: 1.8 * TILE,
    atk:        3,

    // Behaviour (entity-editor params, wired in NatureManager): herd grazer that defends hard.
    diet: 'herbivore', fightOrFlight: 'fight', aggroChancePct: 50,
    packCohesion: 0.5, activeCycle: 'diurnal', territorialRadius: 0,
    lifespanDays: 40, litterSize: 1, timeToAdulthoodDays: 8,
    tameable: false, tameCost: 4,

    // Rig-driven: directional ox sprite (SPRITES.aurochs) animated by walkPhase + facing.
    draw(g, a, ctx = {}) {
        if (a.isDead) {
            g.fillStyle(0x2a1c10, 0.9).fillEllipse(0, 3, 34, 13);
            if (a.meatLeft > 0) {
                const r = a.meatLeft / this.meat;
                g.fillStyle(0x331010, 0.7).fillRect(-13, -6, 26, 4);
                g.fillStyle(0xbb3322, 0.9).fillRect(-13, -6, 26 * r, 4);
            }
            return;
        }
        const sc = a.scale ?? 1.0;
        const hungry = (a.hungryDays ?? 0) > 0;
        g.fillStyle(0x000000, 0.14).fillEllipse(0, 11 * sc, 28 * sc, 8 * sc);   // shadow
        renderRig(g, SPRITES.aurochs, {
            scale: sc, ox: 0, oy: 0,
            walkPhase: a._walkPhase ?? 0,
            moving: ctx.moving ?? false,
            facing: a.facing ?? 'south',
            vars: { male: a.gender === 'male', bodyCol: hungry ? 0x2c2014 : 0x3a2a1a },
        });
        if (a.aggroTarget != null) {   // enraged glint
            g.fillStyle(0xff3322, 0.8).fillCircle(8 * sc, -5 * sc, 1.4 * sc);
        }
    },
};
