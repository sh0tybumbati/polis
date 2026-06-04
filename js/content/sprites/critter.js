/**
 * Sample rig — a small four-legged critter, hand-authored to prove the rig pipeline
 * end-to-end (editor → loader/registry → renderRig → convention + clip animation)
 * before any image-traced rig exists. Authored in rig units around an origin at the
 * feet (x:0, y:0 ground line); parts use the standard limb-slot names so they
 * auto-animate from walkPhase, and a 'walk' clip overrides the legs with keyframes.
 *
 * Shapes are renderShapes-format (js/engine/renderShapes.js). Colours support '$vars'
 * for tinting; here they're literal.
 */

const FUR   = 0x9a6b3f;
const FUR_D = 0x6e4a2a;
const BELLY = 0xc9a877;
const DARK  = 0x2a1a10;

export default {
    id: 'critter',
    version: 1,
    origin: { x: 0, y: 0 },          // feet / ground line
    parts: [
        // Back legs (drawn first, behind body)
        { name: 'legR', z: -2, pivot: { x: 5, y: -6 }, shapes: [
            { type: 'rect', x: 3.5, y: -6, w: 3, h: 6, fill: FUR_D },
            { type: 'circle', x: 5, y: 0, r: 1.6, fill: DARK },
        ] },
        { name: 'legL', z: -1, pivot: { x: -5, y: -6 }, shapes: [
            { type: 'rect', x: -6.5, y: -6, w: 3, h: 6, fill: FUR_D },
            { type: 'circle', x: -5, y: 0, r: 1.6, fill: DARK },
        ] },
        // Body
        { name: 'torso', z: 0, pivot: { x: 0, y: -11 }, shapes: [
            { type: 'ellipse', x: 0, y: -11, rx: 10, ry: 7, fill: FUR },
            { type: 'ellipse', x: 0, y: -8,  rx: 7,  ry: 4, fill: BELLY },
        ] },
        // Tail
        { name: 'tail', z: 0, pivot: { x: -9, y: -12 }, shapes: [
            { type: 'polygon', fill: FUR_D, points: [
                { x: -9, y: -13 }, { x: -16, y: -16 }, { x: -15, y: -11 },
            ] },
        ] },
        // Head
        { name: 'head', z: 1, pivot: { x: 10, y: -13 }, shapes: [
            { type: 'circle', x: 11, y: -14, r: 5, fill: FUR },
            { type: 'triangle', x1: 7,  y1: -19, x2: 9,  y2: -15, x3: 6,  y3: -15, fill: FUR_D }, // ear
            { type: 'triangle', x1: 14, y1: -19, x2: 15, y2: -15, x3: 12, y3: -15, fill: FUR_D }, // ear
            { type: 'circle', x: 13, y: -14, r: 1, fill: DARK },                                  // eye
            { type: 'circle', x: 15.5, y: -13, r: 1.2, fill: DARK },                              // nose
        ] },
    ],
    clips: {
        walk: {
            fps: 12, loop: true, length: 0.6,
            tracks: {
                legL: [ { t: 0, rot: 0.5 }, { t: 0.3, rot: -0.5 }, { t: 0.6, rot: 0.5 } ],
                legR: [ { t: 0, rot: -0.5 }, { t: 0.3, rot: 0.5 }, { t: 0.6, rot: -0.5 } ],
                tail: [ { t: 0, rot: -0.2 }, { t: 0.3, rot: 0.3 }, { t: 0.6, rot: -0.2 } ],
            },
        },
    },
};
