/**
 * Directional "human" rig — the single person every colonist/soldier is drawn from. Four facing
 * views (west auto-mirrors east); standard limb-slot names (legL/legR/armL/armR/torso/head) so the
 * walk convention animates it. Origin at the hip (renderRig is called with { scale: ctx.ageScale }).
 *
 * Colour comes from the unit's phenotype via $vars ($skin/$hair/$eye/$tunic) supplied by
 * units/drawHuman.js (with safe defaults). Equipment AND hair STYLE are limb-gated `when:` layers:
 * weapons/shield/helmet from the loadout, hair shapes from `v.hairStyle` (curls/short/bald/long/bun),
 * hair hidden under a helmet. z-order (all views): legs 0 · torso 1 · armL 2 · armR 3 · head 4.
 */

const BELT   = 0x5a4530;
const LEG    = 0x6a5238;
const METAL  = 0xb8c0c8;   // helmet / spear tip
const BRONZE = 0xb08840;   // shield
const WOOD   = 0x8a6a3a;   // shafts / bow

const legS  = { color: LEG, width: 3 };
const armS  = { color: '$skin', width: 2.6 };
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

// Hair styles, gated on v.hairStyle and hidden under a helmet. `side` ∈ 'front' | 'back' | 'side'.
const HAIR = '$hair';
const hairFor = (cx, cy, side) => {
    const no = v => !v.helmet;                         // hidden under a helmet
    const is = (st) => v => no(v) && v.hairStyle === st;
    const sh = [];
    // short — neat cap (default)
    sh.push({ type: 'ellipse', x: cx, y: cy - 2, rx: 3.6, ry: side === 'back' ? 3 : 2.3, fill: HAIR, when: is('short') });
    // curls — a little cluster
    for (const [dx, dy] of [[-2.4, -2.4], [0, -3.2], [2.4, -2.4], [-1.2, -1], [1.2, -1]])
        sh.push({ type: 'circle', x: cx + dx, y: cy + dy, r: 1.5, fill: HAIR, when: is('curls') });
    // bald — bare scalp: no hair shapes (skin head shows)
    // long — cap plus length down the sides/back
    sh.push({ type: 'ellipse', x: cx, y: cy - 2, rx: 3.8, ry: 2.6, fill: HAIR, when: is('long') });
    if (side === 'side') sh.push({ type: 'ellipse', x: cx - 2.5, y: cy + 2, rx: 1.8, ry: 4, fill: HAIR, when: is('long') });
    else { sh.push({ type: 'ellipse', x: cx - 3, y: cy + 1, rx: 1.5, ry: 3.5, fill: HAIR, when: is('long') });
           sh.push({ type: 'ellipse', x: cx + 3, y: cy + 1, rx: 1.5, ry: 3.5, fill: HAIR, when: is('long') }); }
    // bun — cap plus a knot
    sh.push({ type: 'ellipse', x: cx, y: cy - 2, rx: 3.6, ry: 2.3, fill: HAIR, when: is('bun') });
    sh.push({ type: 'circle', x: cx + (side === 'side' ? -2.5 : 0), y: cy - (side === 'side' ? 3 : 5), r: 1.8, fill: HAIR, when: is('bun') });
    return sh;
};

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
                { type: 'ellipse', x: 0, y: -2, rx: 3.4, ry: 6, fill: '$tunic' },
                { type: 'line', x1: -3, y1: 1, x2: 3, y2: 1, stroke: { color: BELT, width: 1.5 } },
            ] },
            { name: 'armL', z: 2, pivot: { x: 1, y: -5 }, shapes: [{ type: 'line', x1: 1, y1: -5, x2: 2, y2: 1, stroke: armS }, ...shield(2.6)] },
            { name: 'armR', z: 3, pivot: { x: 1, y: -5 }, shapes: [{ type: 'line', x1: 1, y1: -5, x2: 3, y2: 1, stroke: armS }, ...weapon(3)] },
            { name: 'head', z: 4, pivot: { x: 1, y: -9 }, shapes: [
                { type: 'circle', x: 1, y: -9, r: 3.3, fill: '$skin' },
                ...hairFor(1, -9, 'side'),
                { type: 'circle', x: 3, y: -9, r: 0.7, fill: '$eye' },
                ...helmet(1, -10.5),
            ] },
        ],
        // ── front ──
        south: [
            { name: 'legL', z: 0, pivot: { x: -2, y: 2 }, shapes: [{ type: 'line', x1: -2, y1: 2, x2: -2, y2: 11, stroke: legS }] },
            { name: 'legR', z: 0, pivot: { x: 2, y: 2 }, shapes: [{ type: 'line', x1: 2, y1: 2, x2: 2, y2: 11, stroke: legS }] },
            { name: 'torso', z: 1, pivot: { x: 0, y: -2 }, shapes: [
                { type: 'ellipse', x: 0, y: -2, rx: 4.2, ry: 6, fill: '$tunic' },
                { type: 'line', x1: -4, y1: 1, x2: 4, y2: 1, stroke: { color: BELT, width: 1.5 } },
            ] },
            { name: 'armL', z: 2, pivot: { x: 4, y: -5 }, shapes: [{ type: 'line', x1: 4, y1: -5, x2: 5, y2: 1, stroke: armS }, ...shield(5)] },
            { name: 'armR', z: 3, pivot: { x: -4, y: -5 }, shapes: [{ type: 'line', x1: -4, y1: -5, x2: -5, y2: 1, stroke: armS }, ...weapon(-5)] },
            { name: 'head', z: 4, pivot: { x: 0, y: -9 }, shapes: [
                { type: 'circle', x: 0, y: -9, r: 3.4, fill: '$skin' },
                ...hairFor(0, -9, 'front'),
                { type: 'circle', x: -1.3, y: -9, r: 0.7, fill: '$eye' },
                { type: 'circle', x: 1.3, y: -9, r: 0.7, fill: '$eye' },
                ...helmet(0, -10.5),
            ] },
        ],
        // ── back ──
        north: [
            { name: 'legL', z: 0, pivot: { x: -2, y: 2 }, shapes: [{ type: 'line', x1: -2, y1: 2, x2: -2, y2: 11, stroke: legS }] },
            { name: 'legR', z: 0, pivot: { x: 2, y: 2 }, shapes: [{ type: 'line', x1: 2, y1: 2, x2: 2, y2: 11, stroke: legS }] },
            { name: 'torso', z: 1, pivot: { x: 0, y: -2 }, shapes: [{ type: 'ellipse', x: 0, y: -2, rx: 4.2, ry: 6, fill: '$tunic' }] },
            { name: 'armL', z: 2, pivot: { x: 4, y: -5 }, shapes: [{ type: 'line', x1: 4, y1: -5, x2: 5, y2: 1, stroke: armS }, ...shield(5)] },
            { name: 'armR', z: 3, pivot: { x: -4, y: -5 }, shapes: [{ type: 'line', x1: -4, y1: -5, x2: -5, y2: 1, stroke: armS }, ...weapon(-5)] },
            { name: 'head', z: 4, pivot: { x: 0, y: -9 }, shapes: [
                { type: 'circle', x: 0, y: -9, r: 3.4, fill: '$skin' },
                ...hairFor(0, -9, 'back'),
                ...helmet(0, -10.5),
            ] },
        ],
    },
};
