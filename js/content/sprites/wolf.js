/**
 * Directional grey-wolf rig (deer/boar-style). Four facing views (west auto-mirrors east);
 * standard limb-slot names so the convention walkPhase animation swings the legs/head/tail.
 * Lean canine build: elongated low torso, narrow head with a pointed snout and upright ears,
 * a bushy low-slung tail. $bodyCol is supplied per-frame (dims when hungry).
 */

const BODY  = 0x7a736a;   // grey coat
const RUFF  = 0x5e574e;   // darker shoulder/back shading
const SNOUT = 0x4a443c;   // muzzle / nose
const EYE   = 0x141008;
const EAR   = 0x3e382f;
const LEG   = 0x4a443c;
const PAW   = 0x241f18;
const TAIL  = 0x6a635a;

const legS  = { color: LEG, width: 2.2 };
const paw   = (x, y) => ({ type: 'circle', x, y, r: 1.4, fill: PAW });

export default {
    id: 'wolf',
    version: 1,
    origin: { x: 0, y: 16 },
    views: {
        // ── side profile (facing right) ──
        east: [
            { name: 'legR', z: -2, pivot: { x: -5, y: 6 }, shapes: [
                { type: 'line', x1: -8, y1: 4, x2: -9, y2: 16, stroke: legS },
                { type: 'line', x1: -3, y1: 4, x2: -3, y2: 16, stroke: legS },
                paw(-9, 16), paw(-3, 16),
            ] },
            { name: 'tail', z: -1, pivot: { x: -11, y: -2 }, shapes: [
                { type: 'line', x1: -11, y1: -2, x2: -16, y2: 1, stroke: { color: TAIL, width: 2 } },
                { type: 'ellipse', x: -16, y: 1, rx: 3, ry: 2, fill: TAIL },   // bushy tip
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: -1, y: 0, rx: 12, ry: 5, fill: '$bodyCol' },
                { type: 'ellipse', x: 4, y: -2, rx: 5, ry: 4, fill: RUFF },     // shoulder ruff
            ] },
            { name: 'legL', z: 1, pivot: { x: 5, y: 6 }, shapes: [
                { type: 'line', x1: 4, y1: 4, x2: 3, y2: 16, stroke: legS },
                { type: 'line', x1: 9, y1: 4, x2: 10, y2: 16, stroke: legS },
                paw(3, 16), paw(10, 16),
            ] },
            { name: 'head', z: 2, pivot: { x: 9, y: -2 }, shapes: [
                { type: 'ellipse', x: 11, y: -3, rx: 4, ry: 3.5, fill: '$bodyCol' },
                { type: 'triangle', x1: 8, y1: -7, x2: 10, y2: -3, x3: 11, y3: -8, fill: EAR },  // ear
                { type: 'triangle', x1: 14, y1: -2, x2: 14, y2: 1, x3: 19, y3: 0, fill: SNOUT },  // muzzle
                { type: 'circle', x: 19, y: 0, r: 0.9, fill: EYE },             // nose
                { type: 'circle', x: 12, y: -4, r: 0.9, fill: EYE },            // eye
            ] },
        ],
        // ── front ──
        south: [
            { name: 'legL', z: -1, pivot: { x: -4, y: 6 }, shapes: [
                { type: 'line', x1: -4, y1: 4, x2: -4, y2: 16, stroke: legS }, paw(-4, 16),
            ] },
            { name: 'legR', z: -1, pivot: { x: 4, y: 6 }, shapes: [
                { type: 'line', x1: 4, y1: 4, x2: 4, y2: 16, stroke: legS }, paw(4, 16),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: 0, y: 0, rx: 7, ry: 6, fill: '$bodyCol' },
                { type: 'ellipse', x: 0, y: -2, rx: 5, ry: 4, fill: RUFF },
            ] },
            { name: 'head', z: 2, pivot: { x: 0, y: -6 }, shapes: [
                { type: 'circle', x: 0, y: -7, r: 4.2, fill: '$bodyCol' },
                { type: 'triangle', x1: -5, y1: -12, x2: -2, y2: -8, x3: -1, y3: -13, fill: EAR },
                { type: 'triangle', x1: 5, y1: -12, x2: 2, y2: -8, x3: 1, y3: -13, fill: EAR },
                { type: 'circle', x: 0, y: -5, r: 2.4, fill: SNOUT },           // muzzle
                { type: 'circle', x: 0, y: -4, r: 0.8, fill: EYE },             // nose
                { type: 'circle', x: -1.6, y: -8, r: 0.8, fill: EYE },
                { type: 'circle', x: 1.6, y: -8, r: 0.8, fill: EYE },
            ] },
        ],
        // ── rear ──
        north: [
            { name: 'legL', z: -1, pivot: { x: -4, y: 6 }, shapes: [
                { type: 'line', x1: -4, y1: 4, x2: -4, y2: 16, stroke: legS }, paw(-4, 16),
            ] },
            { name: 'legR', z: -1, pivot: { x: 4, y: 6 }, shapes: [
                { type: 'line', x1: 4, y1: 4, x2: 4, y2: 16, stroke: legS }, paw(4, 16),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: 0, y: 0, rx: 7, ry: 6, fill: '$bodyCol' },
                { type: 'ellipse', x: 0, y: -2, rx: 5, ry: 4, fill: RUFF },
            ] },
            { name: 'tail', z: 2, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'line', x1: 0, y1: -1, x2: 0, y2: -7, stroke: { color: TAIL, width: 2 } },
                { type: 'ellipse', x: 0, y: -7, rx: 2, ry: 3, fill: TAIL },
            ] },
            { name: 'head', z: 1, pivot: { x: 0, y: -7 }, shapes: [
                { type: 'circle', x: 0, y: -8, r: 3.6, fill: '$bodyCol' },
                { type: 'triangle', x1: -4, y1: -12, x2: -1, y2: -9, x3: -1, y3: -13, fill: EAR },
                { type: 'triangle', x1: 4, y1: -12, x2: 1, y2: -9, x3: 1, y3: -13, fill: EAR },
            ] },
        ],
    },
};
