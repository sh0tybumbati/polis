import { renderShapes } from '../../engine/renderShapes.js';

function partColor(base, hp) {
    if (hp === undefined || hp > 0.6) return base;
    const t = 1 - hp / 0.6;
    const r1 = (base >> 16) & 0xff, g1 = (base >> 8) & 0xff, b1 = base & 0xff;
    return (Math.round(r1 + (0xcc - r1) * t) << 16) |
           (Math.round(g1 + (0x33 - g1) * t) << 8)  |
            Math.round(b1 + (0x22 - b1) * t);
}

function limb(gfx, color, alpha, x1, y1, angle, len, thick) {
    const x2 = x1 + Math.cos(angle) * len;
    const y2 = y1 + Math.sin(angle) * len;
    const r  = thick / 2;
    gfx.lineStyle(thick, color, alpha);
    gfx.lineBetween(x1, y1, x2, y2);
    gfx.fillStyle(color, alpha);
    gfx.fillCircle(x1, y1, r);
    gfx.fillCircle(x2, y2, r);
}

// Darken a hex color by fraction f (0..1) — used for the tunic shoulder-strap fold.
function darken(col, f) {
    const r = (col >> 16) & 0xff, g = (col >> 8) & 0xff, b = col & 0xff;
    return (Math.round(r * (1 - f)) << 16) | (Math.round(g * (1 - f)) << 8) | Math.round(b * (1 - f));
}

// ── Hair styles ─────────────────────────────────────────────────────────────
// Each style's `back(p)` draws the hair mass BEFORE the head; optional `front(p)`
// draws over the head (buns, etc). `coversCrown` = the back of the head is hair
// (north view) rather than bald skin. p = { gfx, col, alpha, cx, cy, s, bias, ss }
// where (cx,cy) is the head centre and ss is the facing sign (0 front/back, ±1 side).

function hairCurls(p) {   // spiral coils (Greek default, unisex)
    const { gfx, col, alpha, cx, cy, s, bias } = p;
    gfx.fillStyle(col, alpha);
    gfx.fillCircle(cx + bias, cy, 3.5 * s);            // solid base, never hollow
    const R = 4.4 * s, cr = 1.9 * s, n = 7;
    for (let i = 0; i < n; i++) {
        const a = -2.95 + (2.7 * i) / (n - 1);          // arc over the top & sides
        gfx.fillCircle(cx + bias + Math.cos(a) * R, cy + Math.sin(a) * R, cr);
    }
    gfx.fillCircle(cx + bias - 3.6 * s, cy + 1.2 * s, cr * 0.8);
    gfx.fillCircle(cx + bias + 3.6 * s, cy + 1.2 * s, cr * 0.8);
}

function hairShort(p) {   // close-cropped cap sitting high on the head
    const { gfx, col, alpha, cx, cy, s, bias } = p;
    gfx.fillStyle(col, alpha);
    gfx.fillCircle(cx + bias, cy - 0.7 * s, 3.7 * s);
}

function hairBald(p) {    // bald crown, low rim of hair around the back/sides
    const { gfx, col, alpha, cx, cy, s, bias } = p;
    gfx.fillStyle(col, alpha);
    gfx.fillCircle(cx + bias, cy + 1.4 * s, 3.5 * s);
}

function hairLong(p) {    // full crown + hair falling to the shoulders
    const { gfx, col, alpha, cx, cy, s, bias, ss } = p;
    gfx.fillStyle(col, alpha);
    if (ss === 0) {                                     // front/back: panels both sides
        gfx.fillEllipse(cx - 3.0 * s, cy + 4.5 * s, 4.2 * s, 12 * s);
        gfx.fillEllipse(cx + 3.0 * s, cy + 4.5 * s, 4.2 * s, 12 * s);
    } else {                                            // profile: sheet down the back
        gfx.fillEllipse(cx - ss * 2.4 * s, cy + 4.5 * s, 4.6 * s, 12 * s);
    }
    gfx.fillCircle(cx + bias, cy, 3.9 * s);             // crown
}

function hairBun(p) {     // smooth pulled-back cap (knot added in front layer)
    const { gfx, col, alpha, cx, cy, s, bias } = p;
    gfx.fillStyle(col, alpha);
    gfx.fillCircle(cx + bias, cy - 0.3 * s, 3.7 * s);
}
function hairBunKnot(p) {
    const { gfx, col, alpha, cx, cy, s, ss } = p;
    gfx.fillStyle(col, alpha);
    gfx.fillCircle(cx - ss * 2.2 * s, cy - 3.4 * s, 2.1 * s);   // knot toward back/top
}

const HAIR = {
    curls: { back: hairCurls, coversCrown: true },
    short: { back: hairShort, coversCrown: true },
    bald:  { back: hairBald,  coversCrown: false },
    long:  { back: hairLong,  coversCrown: true },
    bun:   { back: hairBun, front: hairBunKnot, coversCrown: true },
};

// Brown sandal — sole ellipse + ankle strap — at a foot point (fx, fy).
function sandal(gfx, alpha, fx, fy, s) {
    gfx.fillStyle(0x6b4a2a, alpha);
    gfx.fillEllipse(fx, fy + 1.0 * s, 4.5 * s, 1.8 * s);
    gfx.lineStyle(0.8 * s, 0x6b4a2a, alpha);
    gfx.lineBetween(fx - 1.5 * s, fy - 1.0 * s, fx + 1.5 * s, fy - 0.5 * s);
}

const SHAPES_DOT = [{ type: 'circle', x: 0, y: 0, r: 3, fill: '$skinCol' }];
const SHAPES_SIL = [
    { type: 'circle', x: 0, y: -9, r: 4,   fill: '$skinCol'  },
    { type: 'circle', x: 0, y: -1, r: 3.5, fill: '$tunicCol' },
];

export default {
    id: 'worker',
    hp: 10, atk: 1, speed: 40, range: 0,
    color: 0xccccaa,
    vetLevels: false,

    draw(gfx, u, ctx) {
        const lod     = ctx.lod      ?? 2;
        const s       = ctx.ageScale ?? 1.0;
        const ox      = ctx.ox       ?? 0;
        const oy      = ctx.oy       ?? 0;
        const alpha   = ctx.alpha    ?? 1.0;
        const phase   = ctx.walkPhase ?? 0;
        const moving  = ctx.isMoving  ?? false;
        const working = ctx.isWorking ?? false;
        const facing  = ctx.facing   ?? 'south';

        const p  = u.phenotype ?? {};
        const bp = u.bodyParts ?? {};

        const headCol  = partColor(p.skinHex  ?? 0xc8a878, bp.head);
        const hairCol  = p.hairHex  ?? 0x2a1a08;
        const eyeCol   = p.eyeHex   ?? 0x5a6840;
        const tunicCol = partColor(p.tunicHex ?? 0xf0e8d0, bp.torso);
        const armLCol  = partColor(p.skinHex  ?? 0xc8a878, bp.armL);
        const armRCol  = partColor(p.skinHex  ?? 0xc8a878, bp.armR);
        const legLCol  = partColor(p.skinHex  ?? 0xc8a878, bp.legL);
        const legRCol  = partColor(p.skinHex  ?? 0xc8a878, bp.legR);
        const strapCol = darken(tunicCol, 0.2);   // exomis shoulder-drape fold
        const BAND     = 0x9a4a2a;                 // headband / fillet
        const BELT     = 0x6b4a2a;                 // waist belt

        if (lod === 0) {
            renderShapes(gfx, SHAPES_DOT, { skinCol: p.skinHex ?? 0xc8a878 }, { scale: s, ox, oy });
            return;
        }
        if (lod === 1) {
            renderShapes(gfx, SHAPES_SIL, { skinCol: headCol, tunicCol }, { scale: s, ox, oy });
            return;
        }

        // ── shared geometry ────────────────────────────────────────────────────
        const hw        = 2.5 * s;

        // ── SLEEPING (lying horizontal) ────────────────────────────────────────
        if (ctx.isCorpse) {
            const ly = oy - 7 * s;
            gfx.fillStyle(0x000000, 0.22 * alpha).fillEllipse(ox, ly + 3 * s, 24 * s, 6 * s);
            limb(gfx, legRCol, alpha * 0.8, ox - 7 * s, ly + 1.5 * s, 0, 5 * s, hw);
            limb(gfx, legLCol, alpha * 0.8, ox - 7 * s, ly - 0.5 * s, 0, 5 * s, hw);
            gfx.fillStyle(0x887766, alpha).fillEllipse(ox, ly, 18 * s, 7 * s);
            limb(gfx, armRCol, alpha * 0.8, ox, ly + 3 * s, 0, 4 * s, hw);
            limb(gfx, armLCol, alpha * 0.8, ox, ly - 3 * s, 0, 4 * s, hw);
            gfx.fillStyle(hairCol, alpha * 0.8).fillCircle(ox + 9 * s, ly - 0.5 * s, 3.5 * s);
            gfx.fillStyle(headCol, alpha * 0.8).fillCircle(ox + 9 * s, ly, 3 * s);
            return;
        }

        if (ctx.isSleeping) {
            const ly = oy - 7 * s;  // vertical centre of lying figure
            // Horizontal shadow
            gfx.fillStyle(0x000000, 0.18 * alpha).fillEllipse(ox, ly + 3 * s, 24 * s, 6 * s);
            // Legs (west / left end, slightly offset for depth)
            limb(gfx, legRCol, alpha, ox - 7 * s, ly + 1.5 * s, 0,  5 * s, hw);
            limb(gfx, legLCol, alpha, ox - 7 * s, ly - 0.5 * s, 0,  5 * s, hw);
            // Body / blanket
            gfx.fillStyle(tunicCol, alpha).fillEllipse(ox, ly, 18 * s, 7 * s);
            // Arms tucked along torso
            limb(gfx, armRCol, alpha, ox, ly + 3 * s, 0, 4 * s, hw);
            limb(gfx, armLCol, alpha, ox, ly - 3 * s, 0, 4 * s, hw);
            // Hair then head (east / right end)
            gfx.fillStyle(hairCol, alpha).fillCircle(ox + 9 * s, ly - 0.5 * s, 3.5 * s);
            gfx.fillStyle(headCol, alpha).fillCircle(ox + 9 * s, ly, 3 * s);
            return;
        }
        const armLen    = 6.5 * s;
        const legLen    = 5.5 * s;
        const shoulderY = oy - 5 * s;

        const isBack = facing === 'north';
        const isEast = facing === 'east';
        const isWest = facing === 'west';
        const isSide = isEast || isWest;
        const ss     = isEast ? 1 : -1;   // side sign: +1 east, -1 west

        // Gender-specific hair style (inheritable, stored on the phenotype). Falls back
        // to a sensible default if missing or invalid for the unit.
        const hairStyleId = HAIR[p.hairStyle] ? p.hairStyle
            : (u.gender === 'female' ? 'long' : 'curls');

        // helper — hair mass drawn BEFORE the head, then a crown that respects facing:
        // from the front/side the skin face shows with the fillet on the forehead; from
        // behind (north) full-hair styles cover the crown with the band across the back.
        // `bias` shifts the hair cluster horizontally (profile shifts it slightly back).
        const drawHairAndHead = ({ back = false, bias = 0 } = {}) => {
            const hy = oy - 9 * s;
            const ssH = isEast ? 1 : isWest ? -1 : 0;
            const style = HAIR[hairStyleId];
            const hp = { gfx, col: hairCol, alpha, cx: ox, cy: hy, s, bias, ss: ssH };
            style.back(hp);
            if (back && style.coversCrown) {
                // Back of the head — hair covers the whole crown, band across the back.
                gfx.fillStyle(hairCol, alpha);
                gfx.fillCircle(ox, hy, 3.4 * s);
                gfx.lineStyle(1.6 * s, BAND, alpha);
                gfx.lineBetween(ox - 3.2 * s, hy - 0.6 * s, ox + 3.2 * s, hy - 1.0 * s);
            } else {
                // Face / bald back-of-head — skin head with the fillet across the forehead.
                gfx.fillStyle(headCol, alpha);
                gfx.fillCircle(ox, hy, 3.5 * s);
                gfx.lineStyle(1.6 * s, BAND, alpha);
                gfx.lineBetween(ox - 3.2 * s, hy - 1.4 * s, ox + 3.2 * s, hy - 1.8 * s);
            }
            if (style.front) style.front(hp);
        };

        // ── SIDE PROFILE (east / west) ─────────────────────────────────────────
        if (isSide) {
            const sw = moving ? Math.sin(phase) * 0.15 : 0;
            let nearArmA, farArmA, frontLegA, backLegA;

            if (working) {
                const chop = 0.35 + Math.sin(phase * 1.4) * 0.30;
                nearArmA  = Math.PI / 2 - ss * chop;
                farArmA   = Math.PI / 2 - ss * chop;
                frontLegA = Math.PI / 2;
                backLegA  = Math.PI / 2;
            } else {
                // Arms counter-swing to legs
                nearArmA  = Math.PI / 2 + ss * sw;
                farArmA   = Math.PI / 2 - ss * sw;
                frontLegA = Math.PI / 2 - ss * sw;
                backLegA  = Math.PI / 2 + ss * sw;
            }

            // Far arm and legs behind body
            limb(gfx, isEast ? armRCol : armLCol, alpha, ox + ss * 1.5 * s, shoulderY, farArmA, armLen, hw);
            limb(gfx, legLCol, alpha, ox - 1 * s, oy + 3 * s, frontLegA, legLen, hw);
            limb(gfx, legRCol, alpha, ox + 1 * s, oy + 3 * s, backLegA,  legLen, hw);
            sandal(gfx, alpha, ox - 1 * s + Math.cos(frontLegA) * legLen, oy + 3 * s + Math.sin(frontLegA) * legLen, s);
            sandal(gfx, alpha, ox + 1 * s + Math.cos(backLegA)  * legLen, oy + 3 * s + Math.sin(backLegA)  * legLen, s);

            // Body — narrow profile
            gfx.fillStyle(tunicCol, alpha);
            gfx.fillEllipse(ox, oy - 1 * s, 5.5 * s, 11 * s);
            // Belt + one-shoulder drape
            gfx.lineStyle(1.3 * s, BELT, alpha);
            gfx.lineBetween(ox - 2.2 * s, oy + 2 * s, ox + 2.2 * s, oy + 2 * s);
            gfx.lineStyle(1.3 * s, strapCol, alpha);
            gfx.lineBetween(ox - ss * 1.0 * s, oy - 6 * s, ox + ss * 1.2 * s, oy - 1 * s);

            // Near arm in front
            limb(gfx, isEast ? armLCol : armRCol, alpha, ox - ss * 0.5 * s, shoulderY, nearArmA, armLen, hw);
            gfx.fillStyle(isEast ? armLCol : armRCol, alpha);
            gfx.fillCircle(ox - ss * 0.5 * s + Math.cos(nearArmA) * armLen, shoulderY + Math.sin(nearArmA) * armLen, 1.7 * s);

            drawHairAndHead({ bias: -ss * 0.6 * s });

            // Nose protruding on the face side
            gfx.fillStyle(headCol, alpha);
            gfx.fillTriangle(
                ox + ss * 3.0 * s, oy - 8.8 * s,
                ox + ss * 3.0 * s, oy - 7.3 * s,
                ox + ss * 4.7 * s, oy - 8.0 * s);
            // One eye + eyebrow on face side
            gfx.fillStyle(eyeCol, alpha);
            gfx.fillCircle(ox + ss * 2.0 * s, oy - 8.8 * s, 0.8 * s);
            gfx.lineStyle(0.8 * s, hairCol, alpha);
            gfx.lineBetween(ox + ss * 1.2 * s, oy - 9.9 * s, ox + ss * 2.8 * s, oy - 9.8 * s);
            return;
        }

        // ── FRONT / BACK ───────────────────────────────────────────────────────
        let armLA, armRA, legLA, legRA;
        if (working) {
            const chop = 0.35 + Math.sin(phase * 1.4) * 0.30;
            armLA = armRA = Math.PI / 2 - chop;
            legLA = Math.PI / 2 + Math.sin(phase * 0.5) * 0.12;
            legRA = Math.PI / 2 - Math.sin(phase * 0.5) * 0.12;
        } else {
            const sw = moving ? Math.sin(phase) * 0.13 : 0;
            armLA = Math.PI / 2 + sw;
            armRA = Math.PI / 2 - sw;
            legLA = Math.PI / 2 - sw;
            legRA = Math.PI / 2 + sw;
        }

        const shoulderX = 3.5 * s;

        if (isBack) {
            // Arms hidden behind body
            limb(gfx, armLCol, alpha, ox - shoulderX, shoulderY, armLA, armLen, hw);
            limb(gfx, armRCol, alpha, ox + shoulderX, shoulderY, armRA, armLen, hw);
        }

        limb(gfx, legLCol, alpha, ox - 2 * s, oy + 3 * s, legLA, legLen, hw);
        limb(gfx, legRCol, alpha, ox + 2 * s, oy + 3 * s, legRA, legLen, hw);
        sandal(gfx, alpha, ox - 2 * s + Math.cos(legLA) * legLen, oy + 3 * s + Math.sin(legLA) * legLen, s);
        sandal(gfx, alpha, ox + 2 * s + Math.cos(legRA) * legLen, oy + 3 * s + Math.sin(legRA) * legLen, s);

        gfx.fillStyle(tunicCol, alpha);
        gfx.fillEllipse(ox, oy - 1 * s, 7.5 * s, 11 * s);
        // Belt + one-shoulder drape (left shoulder covered, right bare)
        gfx.lineStyle(1.4 * s, BELT, alpha);
        gfx.lineBetween(ox - 3.4 * s, oy + 2 * s, ox + 3.4 * s, oy + 2 * s);
        if (!isBack) {
            gfx.lineStyle(1.4 * s, strapCol, alpha);
            gfx.lineBetween(ox - 2.8 * s, oy - 6 * s, ox + 1.4 * s, oy + 1 * s);
        }

        if (!isBack) {
            // Arms in front of body
            limb(gfx, armLCol, alpha, ox - shoulderX, shoulderY, armLA, armLen, hw);
            limb(gfx, armRCol, alpha, ox + shoulderX, shoulderY, armRA, armLen, hw);
            // Hands
            gfx.fillStyle(armLCol, alpha);
            gfx.fillCircle(ox - shoulderX + Math.cos(armLA) * armLen, shoulderY + Math.sin(armLA) * armLen, 1.7 * s);
            gfx.fillStyle(armRCol, alpha);
            gfx.fillCircle(ox + shoulderX + Math.cos(armRA) * armLen, shoulderY + Math.sin(armRA) * armLen, 1.7 * s);
        }

        drawHairAndHead({ back: isBack });

        // Forehead fringe (front view only) — a low arc of hair framing the hairline above the
        // fillet, so the crown reads as hair rather than a bare band. Skipped for bald (receded)
        // and bun (pulled smoothly back off the face).
        if (!isBack && hairStyleId !== 'bald' && hairStyleId !== 'bun') {
            const hy = oy - 9 * s;
            gfx.fillStyle(hairCol, alpha);
            for (let i = -2; i <= 2; i++) {
                gfx.fillCircle(ox + i * 1.4 * s, hy - 2.9 * s + (i * i) * 0.18 * s, 1.2 * s);
            }
        }

        if (!isBack) {
            gfx.fillStyle(eyeCol, alpha);
            gfx.fillCircle(ox - 1.4 * s, oy - 8.8 * s, 0.8 * s);
            gfx.fillCircle(ox + 1.4 * s, oy - 8.8 * s, 0.8 * s);
            // Eyebrows
            gfx.lineStyle(0.8 * s, hairCol, alpha);
            gfx.lineBetween(ox - 2.2 * s, oy - 10.0 * s, ox - 0.6 * s, oy - 9.9 * s);
            gfx.lineBetween(ox + 0.6 * s, oy - 9.9 * s, ox + 2.2 * s, oy - 10.0 * s);
        }
    },
};
