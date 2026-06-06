/**
 * Directional "human" rig — the single person every colonist/soldier is drawn from. Four facing
 * views (west auto-mirrors east); standard limb-slot names (legL/legR/armL/armR/torso/head) so the
 * walk convention animates it. Origin sits at the hip (matching the legacy worker draw, which keys
 * off oy as mid-body), so renderRig is called with { scale: ctx.ageScale, ox, oy, facing, walkPhase }.
 *
 * Equipment is drawn as limb-gated layers: shapes carry `when: v => v.<flag>` (the deer-antler trick)
 * and live in the arm that carries them (weapon in armR, shield in armL, helmet on head), with the
 * arms ordered ABOVE the torso so the gear shows in every view. The unit draw (units/drawHuman.js)
 * passes those flags from a loadout, so the former soldier types are the same human wearing different
 * gear — not distinct entities.
 *
 * z-order (all views): legs 0 · torso 1 · armL 2 · armR 3 · head 4
 */

const SKIN  = 0xc8a878;
const TUNIC = 0x9a7850;
const BELT  = 0x5a4530;
const HAIR  = 0x3a2a18;
const EYE   = 0x140a04;
const LEG   = 0x6a5238;
const METAL = 0xb8c0c8;   // helmet / spear tip
const BRONZE = 0xb08840;  // shield
const WOOD  = 0x8a6a3a;   // shafts / bow

const legS  = { color: LEG, width: 3 };
const armS  = { color: SKIN, width: 2.6 };
const shaftS = { color: WOOD, width: 2 };

// equipment shapes (gated on a loadout flag); `hx` = hand x in this view
const weapon = (hx) => ([
    { type: 'line', x1: hx, y1: -12, x2: hx, y2: 8, stroke: shaftS, when: v => v.spear },
    { type: 'triangle', x1: hx, y1: -15, x2: hx - 1.4, y2: -11, x3: hx + 1.4, y3: -11, fill: METAL, when: v => v.spear },
    { type: 'line', x1: hx, y1: -2, x2: hx, y2: 6, stroke: { color: WOOD, width: 2.6 }, when: v => v.club },
    { type: 'circle', x: hx, y: -3, r: 2.3, fill: 0x6a4a28, when: v => v.club },
    { type: 'line', x1: hx, y1: -7, x2: hx, y2: 5, stroke: { color: WOOD, width: 1.6 }, when: v => v.bow },
    { type: 'line', x1: hx - 2, y1: -7, x2: hx - 2, y2: 5, stroke: { color: 0xe8e0c8, width: 1 }, when: v => v.bow },
    { type: 'circle', x: hx, y: 2, r: 1.6, fill: 0x4a3a22, when: v => v.sling },
]);
const helmet = (cx, cy) => ([
    { type: 'ellipse', x: cx, y: cy, rx: 3.7, ry: 3, fill: METAL, when: v => v.helmet },
    { type: 'triangle', x1: cx - 3.7, y1: cy, x2: cx + 3.7, y2: cy, x3: cx, y3: cy - 5, fill: 0xcc4422, when: v => v.helmet },
]);
const shield = (hx) => ([
    { type: 'circle', x: hx, y: 0, r: 3.6, fill: BRONZE, when: v => v.shield },
    { type: 'circle', x: hx, y: 0, r: 1.3, fill: 0x6a5020, when: v => v.shield },
]);

export default {
    id: 'human',
    version: 1,
    origin: { x: 0, y: 0 },          // hip anchor (maps to the unit's ox,oy)
    views: {
        // ── side profile (facing right) ──
        east: [
            { name: 'legR', z: 0, pivot: { x: 0, y: 2 }, shapes: [{ type: 'line', x1: 0, y1: 2, x2: -1, y2: 11, stroke: legS }] },
            { name: 'legL', z: 0, pivot: { x: 1, y: 2 }, shapes: [{ type: 'line', x1: 1, y1: 2, x2: 2, y2: 11, stroke: legS }] },
            { name: 'torso', z: 1, pivot: { x: 0, y: -2 }, shapes: [
                { type: 'ellipse', x: 0, y: -2, rx: 3.4, ry: 6, fill: TUNIC },
                { type: 'line', x1: -3, y1: 1, x2: 3, y2: 1, stroke: { color: BELT, width: 1.5 } },
            ] },
            { name: 'armL', z: 2, pivot: { x: 1, y: -5 }, shapes: [{ type: 'line', x1: 1, y1: -5, x2: 2, y2: 1, stroke: armS }, ...shield(2.6)] },
            { name: 'armR', z: 3, pivot: { x: 1, y: -5 }, shapes: [{ type: 'line', x1: 1, y1: -5, x2: 3, y2: 1, stroke: armS }, ...weapon(3)] },
            { name: 'head', z: 4, pivot: { x: 1, y: -9 }, shapes: [
                { type: 'circle', x: 1, y: -9, r: 3.3, fill: SKIN },
                { type: 'ellipse', x: -0.6, y: -10.6, rx: 2.2, ry: 2.4, fill: HAIR },
                { type: 'circle', x: 3, y: -9, r: 0.7, fill: EYE },
                ...helmet(1, -10.5),
            ] },
        ],
        // ── front ──
        south: [
            { name: 'legL', z: 0, pivot: { x: -2, y: 2 }, shapes: [{ type: 'line', x1: -2, y1: 2, x2: -2, y2: 11, stroke: legS }] },
            { name: 'legR', z: 0, pivot: { x: 2, y: 2 }, shapes: [{ type: 'line', x1: 2, y1: 2, x2: 2, y2: 11, stroke: legS }] },
            { name: 'torso', z: 1, pivot: { x: 0, y: -2 }, shapes: [
                { type: 'ellipse', x: 0, y: -2, rx: 4.2, ry: 6, fill: TUNIC },
                { type: 'line', x1: -4, y1: 1, x2: 4, y2: 1, stroke: { color: BELT, width: 1.5 } },
            ] },
            { name: 'armL', z: 2, pivot: { x: 4, y: -5 }, shapes: [{ type: 'line', x1: 4, y1: -5, x2: 5, y2: 1, stroke: armS }, ...shield(5)] },
            { name: 'armR', z: 3, pivot: { x: -4, y: -5 }, shapes: [{ type: 'line', x1: -4, y1: -5, x2: -5, y2: 1, stroke: armS }, ...weapon(-5)] },
            { name: 'head', z: 4, pivot: { x: 0, y: -9 }, shapes: [
                { type: 'circle', x: 0, y: -9, r: 3.4, fill: SKIN },
                { type: 'ellipse', x: 0, y: -11, rx: 3.5, ry: 2, fill: HAIR },
                { type: 'circle', x: -1.3, y: -9, r: 0.7, fill: EYE },
                { type: 'circle', x: 1.3, y: -9, r: 0.7, fill: EYE },
                ...helmet(0, -10.5),
            ] },
        ],
        // ── back ──
        north: [
            { name: 'legL', z: 0, pivot: { x: -2, y: 2 }, shapes: [{ type: 'line', x1: -2, y1: 2, x2: -2, y2: 11, stroke: legS }] },
            { name: 'legR', z: 0, pivot: { x: 2, y: 2 }, shapes: [{ type: 'line', x1: 2, y1: 2, x2: 2, y2: 11, stroke: legS }] },
            { name: 'torso', z: 1, pivot: { x: 0, y: -2 }, shapes: [{ type: 'ellipse', x: 0, y: -2, rx: 4.2, ry: 6, fill: TUNIC }] },
            { name: 'armL', z: 2, pivot: { x: 4, y: -5 }, shapes: [{ type: 'line', x1: 4, y1: -5, x2: 5, y2: 1, stroke: armS }, ...shield(5)] },
            { name: 'armR', z: 3, pivot: { x: -4, y: -5 }, shapes: [{ type: 'line', x1: -4, y1: -5, x2: -5, y2: 1, stroke: armS }, ...weapon(-5)] },
            { name: 'head', z: 4, pivot: { x: 0, y: -9 }, shapes: [
                { type: 'circle', x: 0, y: -9, r: 3.4, fill: SKIN },
                { type: 'ellipse', x: 0, y: -10, rx: 3.6, ry: 3, fill: HAIR },
                ...helmet(0, -10.5),
            ] },
        ],
    },
};
