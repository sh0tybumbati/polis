/**
 * Directional deer rig — the flagship "real" rig-driven creature (replaces deer.js's
 * hand-coded draw). Four facing views (west auto-mirrors east); parts share the standard
 * limb-slot names so the convention walkPhase animation swings the legs/head/tail in every
 * direction. Colours: $bodyCol is supplied per-frame (dims when the deer is hungry); male
 * antlers gate on the `male` var via `when`.
 */

const BODY  = 0xb07030;
const EAR   = 0x8a5020;
const EYE   = 0x110800;
const ANT   = 0x7a4010;   // antler
const LEG    = 0x8a5020;
const legS  = { color: LEG, width: 2 };
const antS  = { color: ANT, width: 1.5 };
const antler = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, stroke: antS, when: v => v.male });

export default {
    id: 'deer',
    version: 1,
    origin: { x: 0, y: 14 },          // feet / ground line
    views: {
        // ── side profile (facing right); west mirrors this automatically ──
        east: [
            { name: 'legR', z: -2, pivot: { x: -4, y: 5 }, shapes: [
                { type: 'line', x1: -6, y1: 5, x2: -7, y2: 14, stroke: legS },
                { type: 'line', x1: -2, y1: 6, x2: -3, y2: 15, stroke: legS },
            ] },
            { name: 'tail', z: -1, pivot: { x: -9, y: -2 }, shapes: [
                { type: 'triangle', x1: -9, y1: -3, x2: -14, y2: -5, x3: -13, y3: 0, fill: BODY },
            ] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -2 }, shapes: [
                { type: 'ellipse', x: 0, y: 0, rx: 10, ry: 6.5, fill: '$bodyCol' },
                { type: 'circle', x: -4, y: -1, r: 1.1, fill: 0xe8d8b0, when: v => v.marking === 'spotted' },
                { type: 'circle', x: 1, y: 1, r: 1.1, fill: 0xe8d8b0, when: v => v.marking === 'spotted' },
                { type: 'circle', x: 5, y: -2, r: 1, fill: 0xe8d8b0, when: v => v.marking === 'spotted' },
            ] },
            { name: 'legL', z: 1, pivot: { x: 6, y: 4 }, shapes: [
                { type: 'line', x1: 4, y1: 5, x2: 3, y2: 14, stroke: legS },
                { type: 'line', x1: 8, y1: 4, x2: 9, y2: 13, stroke: legS },
            ] },
            { name: 'head', z: 2, pivot: { x: 9, y: -2 }, shapes: [
                { type: 'circle', x: 11, y: -4, r: 5, fill: '$bodyCol' },
                { type: 'ellipse', x: 14, y: -9, rx: 2, ry: 3.5, fill: EAR },
                antler(10, -9, 8, -16), antler(13, -9, 15, -16),
                { type: 'circle', x: 13, y: -5, r: 1, fill: EYE },
            ] },
        ],
        // ── front (toward camera) ──
        south: [
            { name: 'legL', z: 1, pivot: { x: -5, y: 5 }, shapes: [{ type: 'line', x1: -5, y1: 5, x2: -5, y2: 14, stroke: legS }] },
            { name: 'legR', z: 1, pivot: { x: 5, y: 5 }, shapes: [{ type: 'line', x1: 5, y1: 5, x2: 5, y2: 14, stroke: legS }] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -2 }, shapes: [
                { type: 'ellipse', x: 0, y: -1, rx: 8, ry: 7, fill: '$bodyCol' },
                { type: 'circle', x: -3, y: 0, r: 1.1, fill: 0xe8d8b0, when: v => v.marking === 'spotted' },
                { type: 'circle', x: 3, y: 2, r: 1.1, fill: 0xe8d8b0, when: v => v.marking === 'spotted' },
            ] },
            { name: 'head', z: 2, pivot: { x: 0, y: -8 }, shapes: [
                { type: 'circle', x: 0, y: -10, r: 5, fill: '$bodyCol' },
                { type: 'ellipse', x: -5, y: -13, rx: 2, ry: 3, fill: EAR },
                { type: 'ellipse', x: 5, y: -13, rx: 2, ry: 3, fill: EAR },
                antler(-3, -14, -6, -21), antler(3, -14, 6, -21),
                { type: 'circle', x: -2, y: -10, r: 1, fill: EYE },
                { type: 'circle', x: 2, y: -10, r: 1, fill: EYE },
                { type: 'ellipse', x: 0, y: -7, rx: 2, ry: 1.5, fill: ANT },
            ] },
        ],
        // ── rear (facing away) ──
        north: [
            { name: 'legL', z: 1, pivot: { x: -5, y: 5 }, shapes: [{ type: 'line', x1: -5, y1: 5, x2: -5, y2: 14, stroke: legS }] },
            { name: 'legR', z: 1, pivot: { x: 5, y: 5 }, shapes: [{ type: 'line', x1: 5, y1: 5, x2: 5, y2: 14, stroke: legS }] },
            { name: 'torso', z: 0, pivot: { x: 0, y: -2 }, shapes: [
                { type: 'ellipse', x: 0, y: -1, rx: 8, ry: 7, fill: '$bodyCol' },
                { type: 'circle', x: -3, y: 0, r: 1.1, fill: 0xe8d8b0, when: v => v.marking === 'spotted' },
                { type: 'circle', x: 3, y: 2, r: 1.1, fill: 0xe8d8b0, when: v => v.marking === 'spotted' },
            ] },
            { name: 'tail', z: 2, pivot: { x: 0, y: -2 }, shapes: [
                { type: 'triangle', x1: 0, y1: -9, x2: -2.5, y2: -2, x3: 2.5, y3: -2, fill: 0xc89060 },
            ] },
            { name: 'head', z: 1, pivot: { x: 0, y: -9 }, shapes: [
                { type: 'circle', x: 0, y: -11, r: 4, fill: '$bodyCol' },
                antler(-3, -14, -6, -21), antler(3, -14, 6, -21),
            ] },
        ],
    },
};
