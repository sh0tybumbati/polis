/**
 * Directional sheep rig — redesigned to match the deer's rig-driven style. Four facing
 * views (west auto-mirrors east); parts share the standard limb-slot names (legL/legR/
 * torso/tail/head) so the convention walkPhase animation swings the legs/head in every
 * direction. The fleece is built from a base ellipse plus a cluster of "wool puff"
 * circles, all tinted by $woolCol (supplied per-frame: dimmer when hungry, brighter when
 * the wool is ready to shear). Rams gate a pair of curling horns on the `male` var via
 * `when` (the deer's antler trick); a tamed collar gates on `tamed`.
 */

const FACE   = 0xd8c4a0;   // tan face / ears
const SNOUT  = 0xeae0cc;   // muzzle highlight
const EYE    = 0x1a0a00;
const HOOF   = 0x3a2a1a;
const LEG    = 0x6a5848;
const HORN   = 0x9a8060;
const legS   = { color: LEG, width: 2.5 };
const hornS  = { color: HORN, width: 2 };
const collarS = { color: 0xcc4444, width: 2.5 };

// fleece puff — tinted by the per-frame $woolCol
const puff   = (x, y, r) => ({ type: 'circle', x, y, r, fill: '$woolCol' });
// ram horn segment — only drawn for males (cf. deer antlers)
const horn   = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, stroke: hornS, when: v => v.male });
// collar segment — only when tamed
const collar = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, stroke: collarS, when: v => v.tamed });
// hoof dot at a leg's foot
const hoof   = (x, y) => ({ type: 'circle', x, y, r: 1.6, fill: HOOF });

export default {
    id: 'sheep',
    version: 1,
    origin: { x: 0, y: 16 },          // feet / ground line
    views: {
        // ── side profile (facing right); west mirrors this automatically ──
        east: [
            { name: 'legR', z: -2, pivot: { x: -5, y: 6 }, shapes: [
                { type: 'line', x1: -7, y1: 6, x2: -8, y2: 16, stroke: legS },
                { type: 'line', x1: -3, y1: 6, x2: -4, y2: 16, stroke: legS },
                hoof(-8, 16), hoof(-4, 16),
            ] },
            { name: 'tail', z: -1, pivot: { x: -11, y: -2 }, shapes: [
                puff(-13, -3, 3.5), puff(-12, -6, 2.5),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: 0, y: 0, rx: 12, ry: 8, fill: '$woolCol' },
                puff(-9, -5, 5), puff(-3, -8, 6), puff(3, -8, 6), puff(9, -5, 5),
                puff(-11, 0, 5), puff(11, 0, 4.5),
                puff(-6, 5, 5), puff(2, 6, 5), puff(8, 4, 4.5),
                puff(-2, -2, 5),
                { type: 'ellipse', x: 5, y: -3, rx: 4, ry: 3.4, fill: 0x6a5a48, when: v => v.marking === 'patched' },
            ] },
            { name: 'legL', z: 1, pivot: { x: 5, y: 6 }, shapes: [
                { type: 'line', x1: 4, y1: 6, x2: 3, y2: 16, stroke: legS },
                { type: 'line', x1: 8, y1: 6, x2: 9, y2: 16, stroke: legS },
                hoof(3, 16), hoof(9, 16),
            ] },
            { name: 'head', z: 2, pivot: { x: 9, y: -2 }, shapes: [
                { type: 'ellipse', x: 12, y: -3, rx: 5, ry: 4.5, fill: FACE },
                { type: 'circle', x: 15, y: -1, r: 3, fill: SNOUT },
                { type: 'ellipse', x: 8, y: -7, rx: 2, ry: 3, fill: FACE },
                horn(9, -7, 6, -9), horn(6, -9, 7, -12),
                { type: 'circle', x: 13, y: -4, r: 1, fill: EYE },
                { type: 'circle', x: 16, y: -1.5, r: 0.7, fill: 0x4a2810 },
                collar(7, -6, 9, -3), collar(9, -3, 8, 0),
            ] },
        ],
        // ── front (toward camera) ──
        south: [
            { name: 'legL', z: -1, pivot: { x: -5, y: 6 }, shapes: [
                { type: 'line', x1: -5, y1: 6, x2: -5, y2: 16, stroke: legS }, hoof(-5, 16),
            ] },
            { name: 'legR', z: -1, pivot: { x: 5, y: 6 }, shapes: [
                { type: 'line', x1: 5, y1: 6, x2: 5, y2: 16, stroke: legS }, hoof(5, 16),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: 0, y: 0, rx: 9, ry: 8, fill: '$woolCol' },
                puff(-7, -5, 5), puff(0, -7, 6), puff(7, -5, 5),
                puff(-9, 1, 4.5), puff(9, 1, 4.5),
                puff(-4, 5, 5), puff(4, 5, 5), puff(0, 2, 5),
                { type: 'ellipse', x: 4, y: -2, rx: 3.4, ry: 3, fill: 0x6a5a48, when: v => v.marking === 'patched' },
            ] },
            { name: 'head', z: 2, pivot: { x: 0, y: -7 }, shapes: [
                { type: 'circle', x: 0, y: -9, r: 5, fill: FACE },
                { type: 'ellipse', x: -5, y: -11, rx: 2, ry: 3, fill: FACE },
                { type: 'ellipse', x: 5, y: -11, rx: 2, ry: 3, fill: FACE },
                { type: 'circle', x: 0, y: -6, r: 3, fill: SNOUT },
                horn(-4, -12, -7, -13), horn(-7, -13, -7, -10),
                horn(4, -12, 7, -13), horn(7, -13, 7, -10),
                { type: 'circle', x: -2, y: -9, r: 1, fill: EYE },
                { type: 'circle', x: 2, y: -9, r: 1, fill: EYE },
                collar(-4, -4, 0, -3), collar(0, -3, 4, -4),
            ] },
        ],
        // ── rear (facing away) ──
        north: [
            { name: 'legL', z: -1, pivot: { x: -5, y: 6 }, shapes: [
                { type: 'line', x1: -5, y1: 6, x2: -5, y2: 16, stroke: legS }, hoof(-5, 16),
            ] },
            { name: 'legR', z: -1, pivot: { x: 5, y: 6 }, shapes: [
                { type: 'line', x1: 5, y1: 6, x2: 5, y2: 16, stroke: legS }, hoof(5, 16),
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -1 }, shapes: [
                { type: 'ellipse', x: 0, y: 0, rx: 9, ry: 8, fill: '$woolCol' },
                puff(-7, -5, 5), puff(0, -7, 6), puff(7, -5, 5),
                puff(-9, 1, 4.5), puff(9, 1, 4.5),
                puff(-4, 5, 5), puff(4, 5, 5), puff(0, 2, 5),
                { type: 'ellipse', x: 4, y: -2, rx: 3.4, ry: 3, fill: 0x6a5a48, when: v => v.marking === 'patched' },
            ] },
            { name: 'tail', z: 2, pivot: { x: 0, y: -2 }, shapes: [
                puff(0, -7, 3.5), puff(0, -4, 3),
            ] },
            { name: 'head', z: 1, pivot: { x: 0, y: -8 }, shapes: [
                { type: 'circle', x: 0, y: -10, r: 4, fill: FACE },
                horn(-3, -12, -6, -13), horn(-6, -13, -6, -10),
                horn(3, -12, 6, -13), horn(6, -13, 6, -10),
            ] },
        ],
    },
};
