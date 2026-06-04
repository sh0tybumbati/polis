import { TILE } from '../../config/gameConstants.js';
import { renderRig } from '../../engine/renderRig.js';
import { SPRITES } from '../sprites/index.js';

/**
 * Opt-in demo animal that renders a part-rigged sprite (SPRITES.critter) instead of
 * hand-coded Phaser primitives. Proves the image→rig→animation pipeline in-game:
 * its legs/tail animate from the authored 'walk' clip while moving, and fall back to
 * convention walkPhase motion otherwise. Spawn with the K key (InputManager) or
 * NatureManager.spawnCritter. Worker/sheep are untouched.
 */
export default {
    id:    'critter',
    speed: 30,

    draw(g, c, ctx = {}) {
        renderRig(g, SPRITES.critter, {
            scale: 1,
            ox: 0, oy: 0,
            walkPhase: c._walkPhase ?? 0,
            moving:  ctx.moving  ?? false,
            working: false,
            facing:  c.facing ?? 'south',
            clip: (ctx.moving ?? false) ? 'walk' : null,
            clipTime: (c._walkPhase ?? 0) * 0.1,
        });
    },
};
