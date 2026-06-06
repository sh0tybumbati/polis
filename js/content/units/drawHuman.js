/**
 * Shared unit renderer: every unit is drawn as the one `human` rig (SPRITES.human) with equipment
 * layers toggled by its loadout. The former distinct soldier sprites are now the same person wearing
 * different gear (spear/bow/club/sling/shield/helmet). Reads SPRITES.human each call so live
 * entity-editor overrides apply immediately.
 *
 *   drawHuman(gfx, u, ctx, loadout)
 *     ctx — the UnitRender context: { ox, oy, ageScale, facing, walkPhase, isMoving, isWorking, alpha, isCorpse }
 *     loadout — equipment flags, e.g. { spear:true, shield:true, helmet:true }
 */

import { renderRig } from '../../engine/renderRig.js';
import { SPRITES } from '../sprites/index.js';

export function drawHuman(gfx, u, ctx = {}, loadout = {}) {
    const ox = ctx.ox ?? 0, oy = ctx.oy ?? 0, s = ctx.ageScale ?? 1;
    if (ctx.isCorpse) {            // simple fallen marker
        gfx.fillStyle(0x3a2a1a, 0.85).fillEllipse(ox, oy, 13 * s, 5 * s);
        return;
    }
    renderRig(gfx, SPRITES.human, {
        scale: s, ox, oy,
        walkPhase: u._walkPhase ?? 0,
        moving: ctx.isMoving ?? false,
        working: ctx.isWorking ?? false,
        facing: ctx.facing ?? 'south',
        alpha: ctx.alpha ?? 1,
        vars: loadout,
    });
    if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeRect(ox - 7 * s, oy - 13 * s, 14 * s, 24 * s);
}
