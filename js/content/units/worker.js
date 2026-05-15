import { renderShapes } from '../../engine/renderShapes.js';

// ── Shape data by LoD tier ────────────────────────────────────────────────────
// Age scaling is handled externally (UnitManager.ageScale) and passed via ctx.ageScale.
// These shapes are drawn at adult size (scale 1.0); children and youth are shrunk uniformly.

const SHAPES = {
    0: [
        // Minimap: single dot
        { type: 'circle', x: 0, y: 0, r: 3, fill: '$bodyCol', whenKey: 'always' },
    ],
    1: [
        // Silhouette
        { type: 'triangle', x1: 0, y1: -9, x2: -8, y2: 5, x3: 8, y3: 5, fill: '$bodyCol', whenKey: 'always' },
    ],
    2: [
        // Full sprite — one body shape (author more in the sprite editor)
        { type: 'triangle', x1: 0, y1: -9, x2: -8, y2: 5, x3: 8, y3: 5, fill: '$bodyCol', whenKey: 'always' },
    ],
    3: [
        { type: 'triangle', x1: 0, y1: -9, x2: -8, y2: 5, x3: 8, y3: 5, fill: '$bodyCol', whenKey: 'always' },
    ],
};

// ── Definition export ─────────────────────────────────────────────────────────

export default {
    id: 'worker',
    hp: 10, atk: 1, speed: 40, range: 0,
    color: 0xccccaa,
    vetLevels: false,
    shapes: SHAPES,

    draw(gfx, u, ctx) {
        const vars  = { bodyCol: u.phenotype?.skinHex ?? this.color };
        const lod   = ctx.lod ?? 2;
        const scale = ctx.ageScale ?? 1.0;
        renderShapes(gfx, SHAPES[lod] ?? SHAPES[2], vars, { scale, ox: ctx.ox ?? 0, oy: ctx.oy ?? 0 });
    },
};
