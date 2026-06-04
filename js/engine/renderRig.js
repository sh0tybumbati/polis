/**
 * renderRig.js — draws a part-rigged sprite onto a Phaser Graphics object.
 *
 * A "rig" (authored in the sprite editor, see js/content/sprites/) is:
 *   { id, version, origin:{x,y}, parts:[ { name, pivot:{x,y}, z, shapes:[…] } … ],
 *     clips:{ name:{ fps, loop, length, tracks:{ part:[keys] } } } }
 *
 * Each part is a group of renderShapes-format shapes (js/engine/renderShapes.js) drawn
 * relative to the rig origin. Per frame, each part gets a transform (rotate/translate/
 * scale around its pivot) from rigAnim.resolvePartTransform — an authored clip if one
 * exists, else convention walkPhase motion, else rest. We use Phaser Graphics' matrix
 * stack (save/translateCanvas/rotateCanvas/scaleCanvas/restore) so the part's shapes
 * draw through the normal renderShapes path.
 *
 *   renderRig(gfx, rig, ctx)
 *     ctx — { scale=1, ox=0, oy=0, alpha=1, vars={},
 *             walkPhase, moving, working, facing, clip, clipTime }
 */

import { renderShapes } from './renderShapes.js';
import { resolvePartTransform } from './rigAnim.js';

export function renderRig(gfx, rig, ctx = {}) {
    if (!rig || !rig.parts) return;
    const scale = ctx.scale ?? 1;
    const ox = ctx.ox ?? 0;
    const oy = ctx.oy ?? 0;
    const vars = ctx.vars ?? {};
    const origin = rig.origin ?? { x: 0, y: 0 };

    // Painter's order: low z first.
    const parts = [...rig.parts].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

    for (const part of parts) {
        const t = resolvePartTransform(rig, part, ctx);
        const pivot = part.pivot ?? { x: 0, y: 0 };

        gfx.save();
        // Screen anchor = rig origin; then scale the whole rig.
        gfx.translateCanvas(ox, oy);
        gfx.scaleCanvas(scale * (t.sx ?? 1), scale * (t.sy ?? 1));
        // Author-space translation (e.g. limb bob), in rig units.
        gfx.translateCanvas(t.x ?? 0, t.y ?? 0);
        // Rotate around the part pivot.
        gfx.translateCanvas(pivot.x, pivot.y);
        gfx.rotateCanvas(t.rot ?? 0);
        gfx.translateCanvas(-pivot.x, -pivot.y);
        // Shapes are authored relative to the rig origin → shift so origin sits at (0,0).
        gfx.translateCanvas(-origin.x, -origin.y);

        renderShapes(gfx, part.shapes ?? [], vars, { scale: 1, alpha: ctx.alpha ?? 1 });
        gfx.restore();
    }
}

export default renderRig;
