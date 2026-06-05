/**
 * Directional wild-boar rig (deer-style). Four facing views (west auto-mirrors east); standard
 * limb-slot names so the convention walkPhase animation swings the legs/head. Low-slung, heavy
 * front shoulders, a bristled dorsal ridge and ivory tusks. $bodyCol is supplied per-frame
 * (dims when hungry); tusks grow larger on a `male` (boar) via `when`.
 */

const BODY   = 0x4a3826;
const SNOUT  = 0x6a5040;
const TUSK   = 0xe8e0d0;
const EYE    = 0x140a04;
const LEG    = 0x2a1e14;
const HOOF   = 0x18100a;
const BRISTLE = 0x241a10;
const legS    = { color: LEG, width: 2.5 };
const bristleS = { color: BRISTLE, width: 1.5 };
const tuskS    = { color: TUSK, width: 2 };

const hoof    = (x, y) => ({ type: 'circle', x, y, r: 1.5, fill: HOOF });
const bristle = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, stroke: bristleS });
// tusk — always present, but the second (larger) pair only on males (boars)
const tusk    = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, stroke: tuskS });
const bigTusk = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, stroke: tuskS, when: v => v.male });

export default {
    id: 'boar',
    version: 1,
    origin: { x: 0, y: 14 },
    views: {
        // ── side profile (facing right) ──
        east: [
            { name: 'legR', z: -2, pivot: { x: -5, y: 6 }, shapes: [
                { type: 'line', x1: -7, y1: 7, x2: -8, y2: 14, stroke: legS },
                { type: 'line', x1: -3, y1: 7, x2: -4, y2: 14, stroke: legS },
                hoof(-8, 14), hoof(-4, 14),
            ] },
            { name: 'tail', z: -1, pivot: { x: -11, y: -1 }, shapes: [
                { type: 'line', x1: -11, y1: -1, x2: -14, y2: -3, stroke: { color: BODY, width: 2 } },
                { type: 'circle', x: -14, y: -3, r: 1.6, fill: BRISTLE },
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: -1, y: 0, rx: 11, ry: 6, fill: '$bodyCol' },
                { type: 'circle', x: 5, y: -3, r: 5.5, fill: '$bodyCol' },   // shoulder hump
                bristle(-7, -5, -6, -8), bristle(-3, -6, -2, -9),
                bristle(1, -6, 2, -9), bristle(5, -7, 6, -10),
            ] },
            { name: 'legL', z: 1, pivot: { x: 5, y: 6 }, shapes: [
                { type: 'line', x1: 4, y1: 7, x2: 3, y2: 14, stroke: legS },
                { type: 'line', x1: 8, y1: 7, x2: 9, y2: 14, stroke: legS },
                hoof(3, 14), hoof(9, 14),
            ] },
            { name: 'head', z: 2, pivot: { x: 9, y: -1 }, shapes: [
                { type: 'ellipse', x: 12, y: -1, rx: 5, ry: 4.5, fill: '$bodyCol' },
                { type: 'triangle', x1: 9, y1: -6, x2: 11, y2: -3, x3: 13, y3: -6, fill: BRISTLE }, // ear
                { type: 'circle', x: 17, y: 1, r: 2.6, fill: SNOUT },        // snout
                { type: 'circle', x: 18, y: 1, r: 0.7, fill: EYE },          // nostril
                { type: 'circle', x: 13, y: -3, r: 1, fill: EYE },           // eye
                tusk(16, 2, 18, -1.5),
                bigTusk(15, 2.5, 17.5, -3),
            ] },
        ],
        // ── front ──
        south: [
            { name: 'legL', z: -1, pivot: { x: -5, y: 6 }, shapes: [
                { type: 'line', x1: -5, y1: 7, x2: -5, y2: 14, stroke: legS }, hoof(-5, 14),
            ] },
            { name: 'legR', z: -1, pivot: { x: 5, y: 6 }, shapes: [
                { type: 'line', x1: 5, y1: 7, x2: 5, y2: 14, stroke: legS }, hoof(5, 14),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: 0, y: 0, rx: 8.5, ry: 6.5, fill: '$bodyCol' },
                bristle(-4, -5, -4, -8), bristle(0, -6, 0, -9), bristle(4, -5, 4, -8),
            ] },
            { name: 'head', z: 2, pivot: { x: 0, y: -6 }, shapes: [
                { type: 'circle', x: 0, y: -7, r: 5, fill: '$bodyCol' },
                { type: 'triangle', x1: -6, y1: -11, x2: -3, y2: -8, x3: -2, y3: -12, fill: BRISTLE },
                { type: 'triangle', x1: 6, y1: -11, x2: 3, y2: -8, x3: 2, y3: -12, fill: BRISTLE },
                { type: 'circle', x: 0, y: -4, r: 3, fill: SNOUT },
                { type: 'circle', x: -1.2, y: -4, r: 0.7, fill: EYE },
                { type: 'circle', x: 1.2, y: -4, r: 0.7, fill: EYE },
                { type: 'circle', x: -2, y: -8, r: 1, fill: EYE },
                { type: 'circle', x: 2, y: -8, r: 1, fill: EYE },
                tusk(-3, -3, -5, -6), tusk(3, -3, 5, -6),
                bigTusk(-2.5, -2.5, -5.5, -7), bigTusk(2.5, -2.5, 5.5, -7),
            ] },
        ],
        // ── rear ──
        north: [
            { name: 'legL', z: -1, pivot: { x: -5, y: 6 }, shapes: [
                { type: 'line', x1: -5, y1: 7, x2: -5, y2: 14, stroke: legS }, hoof(-5, 14),
            ] },
            { name: 'legR', z: -1, pivot: { x: 5, y: 6 }, shapes: [
                { type: 'line', x1: 5, y1: 7, x2: 5, y2: 14, stroke: legS }, hoof(5, 14),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: 0, y: 0, rx: 8.5, ry: 6.5, fill: '$bodyCol' },
                bristle(-4, -5, -4, -8), bristle(0, -6, 0, -9), bristle(4, -5, 4, -8),
            ] },
            { name: 'tail', z: 2, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'line', x1: 0, y1: -1, x2: 0, y2: -6, stroke: { color: BODY, width: 2 } },
                { type: 'circle', x: 0, y: -6, r: 1.6, fill: BRISTLE },
            ] },
            { name: 'head', z: 1, pivot: { x: 0, y: -7 }, shapes: [
                { type: 'circle', x: 0, y: -8, r: 4, fill: '$bodyCol' },
                bristle(-2, -10, -2, -13), bristle(2, -10, 2, -13),
            ] },
        ],
    },
};
