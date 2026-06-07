import { TILE } from '../../config/gameConstants.js';
import { renderRig } from '../../engine/renderRig.js';
import { SPRITES } from '../sprites/index.js';
import { dim } from '../genetics.js';

export default {
    id:         'sheep',
    maxCount:   14,
    breedRadius: 4 * TILE,
    meat:       4,
    speed:      38,
    fleeRadius: 2.5 * TILE,
    tameCost:   1,
    woolMs:     35000,

    // Behaviour (entity-editor params, wired in NatureManager): flocking, tameable grazer.
    diet: 'herbivore', fightOrFlight: 'flee', aggroChancePct: 0,
    packCohesion: 0.6, activeCycle: 'diurnal', territorialRadius: 0,
    lifespanDays: 28, litterSize: 1, timeToAdulthoodDays: 5,
    tameable: true,

    // Genetics: fleece tint varies (white→tan→grey→brown), size gene, patched marking.
    genetics: { coat: 0xe8e0d0, coatJitter: 26, sizeVar: 0.12, markings: ['plain', 'patched'], morphRate: 0.012 },

    // Rig-driven: a directional fleece sprite (SPRITES.sheep) animated by walkPhase + facing.
    // $woolCol carries the state colour (hungry dims it, wool-ready brightens it); rams gate
    // horns on `male` and tamed sheep gate a collar on `tamed`.
    draw(g, s, ctx = {}) {
        const sc = s.scale ?? 1.0;
        const hungry    = !s.isTamed && (s.hungryDays ?? 0) > 0;
        const woolReady = s.woolReady;
        const base      = s.pheno?.coat ?? 0xe8e0d0;             // per-individual fleece tint
        const woolCol   = hungry ? dim(base, true, 0.82) : base;  // wool-ready shimmer overlays below

        g.fillStyle(0x000000, 0.10).fillEllipse(0, 12 * sc, 24 * sc, 7 * sc);   // shadow
        renderRig(g, SPRITES.sheep, {
            scale: sc, ox: 0, oy: 0,
            walkPhase: s._walkPhase ?? 0,
            moving: ctx.moving ?? false,
            facing: s.facing ?? 'south',
            alpha: hungry ? 0.78 : 1.0,
            vars: { woolCol, tamed: !!s.isTamed, male: s.gender === 'male', marking: s.pheno?.marking ?? 'plain' },
        });

        // wool-ready shimmer (drawn over the fleece, in body space)
        if (woolReady) {
            for (const [sx, sy, sr] of [[-3, -6, 5], [6, -4, 4], [-7, 0, 4], [0, -9, 4]]) {
                g.fillStyle(0xffffff, 0.25).fillCircle(sx * sc, sy * sc, sr * sc);
            }
        }
    },
};
