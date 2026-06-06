/**
 * Directional aurochs rig (deer-style) — the great wild ox. Four facing views (west auto-mirrors
 * east); standard limb-slot names so the convention walkPhase animation swings the legs/head. Tall,
 * heavy, with a shoulder hump, a pale dorsal stripe and forward-curving lyre horns on both sexes
 * (bulls get a heavier sweep via `male`). $bodyCol supplied per-frame (dims when hungry).
 */

const BODY   = 0x3a2a1a;
const MUZZLE = 0x241710;
const DORSAL = 0x6a5232;   // pale back stripe
const HORN   = 0xd8c2a0;
const HTIP   = 0x2a2018;
const EYE    = 0x0a0500;
const LEG    = 0x261a10;
const HOOF   = 0x140d07;
const legS   = { color: LEG, width: 3 };
const hornS  = { color: HORN, width: 2.5 };

const hoof   = (x, y) => ({ type: 'circle', x, y, r: 1.8, fill: HOOF });
const horn   = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, stroke: hornS });
const bullHorn = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, stroke: hornS, when: v => v.male });

export default {
    id: 'aurochs',
    version: 1,
    origin: { x: 0, y: 16 },
    views: {
        // ── side profile (facing right) ──
        east: [
            { name: 'legR', z: -2, pivot: { x: -6, y: 4 }, shapes: [
                { type: 'line', x1: -8, y1: 4, x2: -9, y2: 16, stroke: legS },
                { type: 'line', x1: -3, y1: 5, x2: -4, y2: 16, stroke: legS },
                hoof(-9, 16), hoof(-4, 16),
            ] },
            { name: 'tail', z: -1, pivot: { x: -13, y: -3 }, shapes: [
                { type: 'line', x1: -13, y1: -3, x2: -15, y2: 8, stroke: { color: BODY, width: 2 } },
                { type: 'circle', x: -15, y: 9, r: 2, fill: HTIP },
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -3 }, shapes: [
                { type: 'ellipse', x: -1, y: -2, rx: 13, ry: 8, fill: '$bodyCol' },
                { type: 'circle', x: 6, y: -7, r: 6, fill: '$bodyCol' },        // shoulder hump
                { type: 'line', x1: -11, y1: -8, x2: 9, y2: -9, stroke: { color: DORSAL, width: 2 } }, // dorsal stripe
            ] },
            { name: 'legL', z: 1, pivot: { x: 6, y: 4 }, shapes: [
                { type: 'line', x1: 5, y1: 4, x2: 4, y2: 16, stroke: legS },
                { type: 'line', x1: 10, y1: 4, x2: 11, y2: 16, stroke: legS },
                hoof(4, 16), hoof(11, 16),
            ] },
            { name: 'head', z: 2, pivot: { x: 10, y: -6 }, shapes: [
                { type: 'ellipse', x: 13, y: -5, rx: 5, ry: 5.5, fill: '$bodyCol' },
                { type: 'ellipse', x: 16, y: -2, rx: 3, ry: 3.5, fill: MUZZLE },  // muzzle
                { type: 'triangle', x1: 9, y1: -9, x2: 11, y2: -6, x3: 12, y3: -10, fill: BODY }, // ear
                horn(11, -9, 14, -14), horn(14, -14, 19, -13),                    // forward lyre horn
                bullHorn(11, -9, 9, -15), bullHorn(9, -15, 13, -17),
                { type: 'circle', x: 14, y: -6, r: 1.1, fill: EYE },
            ] },
        ],
        // ── front ──
        south: [
            { name: 'legL', z: -1, pivot: { x: -6, y: 4 }, shapes: [
                { type: 'line', x1: -6, y1: 4, x2: -6, y2: 16, stroke: legS }, hoof(-6, 16),
            ] },
            { name: 'legR', z: -1, pivot: { x: 6, y: 4 }, shapes: [
                { type: 'line', x1: 6, y1: 4, x2: 6, y2: 16, stroke: legS }, hoof(6, 16),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -3 }, shapes: [
                { type: 'ellipse', x: 0, y: -2, rx: 10, ry: 8, fill: '$bodyCol' },
                { type: 'circle', x: 0, y: -8, r: 5, fill: '$bodyCol' },          // hump
                { type: 'line', x1: 0, y1: -12, x2: 0, y2: 4, stroke: { color: DORSAL, width: 2 } },
            ] },
            { name: 'head', z: 2, pivot: { x: 0, y: -9 }, shapes: [
                { type: 'ellipse', x: 0, y: -10, rx: 5.5, ry: 5, fill: '$bodyCol' },
                { type: 'ellipse', x: 0, y: -6, rx: 3.5, ry: 3, fill: MUZZLE },
                horn(-5, -13, -10, -16), horn(-10, -16, -11, -11),               // forward-curving
                horn(5, -13, 10, -16), horn(10, -16, 11, -11),
                bullHorn(-5, -13, -11, -18), bullHorn(5, -13, 11, -18),
                { type: 'circle', x: -2.5, y: -10, r: 1.1, fill: EYE },
                { type: 'circle', x: 2.5, y: -10, r: 1.1, fill: EYE },
            ] },
        ],
        // ── rear ──
        north: [
            { name: 'legL', z: -1, pivot: { x: -6, y: 4 }, shapes: [
                { type: 'line', x1: -6, y1: 4, x2: -6, y2: 16, stroke: legS }, hoof(-6, 16),
            ] },
            { name: 'legR', z: -1, pivot: { x: 6, y: 4 }, shapes: [
                { type: 'line', x1: 6, y1: 4, x2: 6, y2: 16, stroke: legS }, hoof(6, 16),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -3 }, shapes: [
                { type: 'ellipse', x: 0, y: -2, rx: 10, ry: 8, fill: '$bodyCol' },
                { type: 'circle', x: 0, y: -8, r: 5, fill: '$bodyCol' },
                { type: 'line', x1: 0, y1: -12, x2: 0, y2: 4, stroke: { color: DORSAL, width: 2 } },
            ] },
            { name: 'tail', z: 2, pivot: { x: 0, y: -2 }, shapes: [
                { type: 'line', x1: 0, y1: -2, x2: 0, y2: 8, stroke: { color: BODY, width: 2 } },
                { type: 'circle', x: 0, y: 8, r: 2, fill: HTIP },
            ] },
            { name: 'head', z: 1, pivot: { x: 0, y: -10 }, shapes: [
                { type: 'ellipse', x: 0, y: -11, rx: 5, ry: 4.5, fill: '$bodyCol' },
                horn(-5, -13, -10, -16), horn(5, -13, 10, -16),
                bullHorn(-5, -13, -11, -18), bullHorn(5, -13, 11, -18),
            ] },
        ],
    },
};
