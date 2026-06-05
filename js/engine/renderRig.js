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
 * Directional rigs: instead of a flat `parts`, supply `views` keyed by facing —
 *   views: { south:[parts], north:[parts], east:[parts], west:[parts] }
 * renderRig picks the view from ctx.facing; a missing west/east is rendered by
 * horizontally mirroring the opposite side. Clips/convention animate by part name and
 * are shared across views (same part names ⇒ the walk cycle plays in every direction).
 *
 *   renderRig(gfx, rig, ctx)
 *     ctx — { scale=1, ox=0, oy=0, alpha=1, vars={},
 *             walkPhase, moving, working, facing, clip, clipTime }
 */

import { renderShapes } from './renderShapes.js';
import { resolvePartTransform } from './rigAnim.js';

export function renderRig(gfx, rig, ctx = {}) {
    if (!rig) return;
    const scale = ctx.scale ?? 1;
    const ox = ctx.ox ?? 0;
    const oy = ctx.oy ?? 0;
    const vars = ctx.vars ?? {};
    const origin = rig.origin ?? { x: 0, y: 0 };

    // Resolve the part list for this facing (directional rigs) or the flat list (simple rigs).
    let parts = rig.parts;
    let signX = 1;
    if (rig.views) {
        const f = ctx.facing || 'south';
        let view = rig.views[f];
        if (!view) {
            if (f === 'west' && rig.views.east) { view = rig.views.east; signX = -1; }
            else if (f === 'east' && rig.views.west) { view = rig.views.west; signX = -1; }
            else view = rig.views.south ?? rig.views.east ?? rig.views.north ?? rig.views.west;
        }
        parts = view;
    }
    if (!parts) return;

    // Painter's order: low z first.
    const sorted = [...parts].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

    for (const part of sorted) {
        const t = resolvePartTransform(rig, part, ctx);
        const pivot = part.pivot ?? { x: 0, y: 0 };

        gfx.save();
        // Screen anchor = rig origin; then scale the whole rig (signX mirrors for flipped views).
        gfx.translateCanvas(ox, oy);
        gfx.scaleCanvas(scale * signX * (t.sx ?? 1), scale * (t.sy ?? 1));
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
