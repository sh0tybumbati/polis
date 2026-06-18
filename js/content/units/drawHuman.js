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

// Default palette when a unit has no phenotype (matches the human rig's old constants).
const DEFAULT_PHENO = { skinHex: 0xc8a878, hairHex: 0x3a2a18, eyeHex: 0x140a04, tunicHex: 0x9a7850, hairStyle: 'short' };

export function drawHuman(gfx, u, ctx = {}, loadout = {}) {
    const ox = ctx.ox ?? 0, oy = ctx.oy ?? 0, s = ctx.ageScale ?? 1;
    if (ctx.isCorpse) {            // simple fallen marker
        gfx.fillStyle(0x3a2a1a, 0.85).fillEllipse(ox, oy, 13 * s, 5 * s);
        return;
    }
    const p = u.phenotype ?? DEFAULT_PHENO;
    renderRig(gfx, SPRITES.human, {
        scale: s, ox, oy,
        walkPhase: u._walkPhase ?? 0,
        moving: ctx.isMoving ?? false,
        working: ctx.isWorking ?? false,
        attacking: ctx.attacking ?? null,
        facing: ctx.facing ?? 'south',
        alpha: ctx.alpha ?? 1,
        // equipment loadout + phenotype palette / hair style (consumed by human.js $vars + when:)
        vars: { ...loadout,
            skin: p.skinHex ?? DEFAULT_PHENO.skinHex, hair: p.hairHex ?? DEFAULT_PHENO.hairHex,
            eye: p.eyeHex ?? DEFAULT_PHENO.eyeHex, tunic: p.tunicHex ?? DEFAULT_PHENO.tunicHex,
            hairStyle: p.hairStyle ?? DEFAULT_PHENO.hairStyle },
    });
    if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeRect(ox - 7 * s, oy - 13 * s, 14 * s, 24 * s);
}
