import { TILE } from '../../config/gameConstants.js';

export default {
    id:         'sheep',
    maxCount:   14,
    breedRadius: 4 * TILE,
    meat:       4,
    speed:      38,
    fleeRadius: 2.5 * TILE,
    tameCost:   1,
    woolMs:     35000,

    draw(g, s) {
        const hungry    = !s.isTamed && (s.hungryDays ?? 0) > 0;
        const woolReady = s.woolReady;
        const woolPuff  = woolReady ? 1.18 : 1.0;
        const damp      = woolReady ? 0.92 : 1.0;
        const col       = hungry  ? 0xb8a888
                        : woolReady  ? 0xf8f4e8
                        : s.isTamed   ? 0xf0e8d0
                        : 0xc8b890;
        const a         = hungry ? 0.6 : 1.0;
        const bodyA     = hungry ? a : damp;
        const dimCol    = this._dim(col, 0.72);
        const brightCol = this._bright(col, 1.08);

        // ── shadow ──
        g.fillStyle(0x000000, 0.08).fillCircle(0, 12, 14);

        // ═══ LAYER 1: back legs (behind body) ══
        g.lineStyle(2.5, dimCol, bodyA * 0.8);
        g.lineBetween(-9,  4, -10, 15);
        g.lineBetween(-5,  5, -5, 16);

        // back hooves
        g.fillStyle(0x3a2a1a, 0.7).fillCircle(-10, 15, 3);
        g.fillStyle(0x3a2a1a, 0.7).fillCircle(-5, 16, 3);

        // ═══ LAYER 2: tail ═══════════════════
        const tailCol = hungry ? 0x9a9080 : 0xe8e0d0;
        const tailF   = woolReady ? [6, -5] : [5.5, -4.5];
        g.fillStyle(tailCol, bodyA).fillCircle(-10, tailF[1], 4.5 * woolPuff);
        // tail tuft (fluffier)
        for (const [tx, ty] of [[-12, -7], [-9, -9], [-11, -3], [-8, -5]]) {
            g.fillStyle(tailCol, bodyA * 0.85).fillCircle(tailF[0]+tx, tailF[1]+ty, 2.8 * woolPuff);
        }

        // ═══ LAYER 3: body ─────────────────
        // base body shape
        g.fillStyle(brightCol, bodyA).fillCircle(0, 2, 17 * woolPuff);
        // shadow underbelly
        g.fillStyle(dimCol, bodyA * 0.6).fillCircle(2, 7, 15 * woolPuff);
        // volumetric wool bumps for fluffy texture
        const bumpA = woolReady ? a : a * 0.55;
        const bumpR = woolReady ? 1.35 : 0.6;
        const bumps = [
            [-11,  2,  8], [-6, -4, 11], [ 0, -7, 13], [ 6, -6, 12],
            [11, -2, 10], [13,  4,  8], [ 9,  8,  7], [-4,  9,  8],
            [-10,  8,  6], [-7, -1,  7], [ 4, -2,  8], [ 7,  2,  7],
        ];
        for (const [bx, by, br] of bumps) {
            g.fillStyle(brightCol, bumpA * bumpR).fillCircle(bx * woolPuff, (by + 2) * woolPuff, br * woolPuff);
        }
        // extra fluffy rim highlights
        g.fillStyle(col, bumpA * 0.5).fillCircle(0, 2, 18 * woolPuff);

        // ═══ LAYER 4: front legs ─────────────
        g.lineStyle(3, col, bodyA);
        g.lineBetween( 6,  6,  6, 16);
        g.lineBetween(11,  6, 11, 15);
        // front hooves
        g.fillStyle(0x3a2a1a).fillCircle(6, 16, 3);
        g.fillStyle(0x3a2a1a).fillCircle(11, 15, 3);

        // ═══ LAYER 5: head ═══════════════════
        const hBase = s.isTamed ? 0xe8d4a8 : 0xd8c4a0;
        const hHangry = hungry ? 0xa09880 : hBase;
        
        // snout shape (ellipse approximated with two circles)
        g.fillStyle(hHangry).fillCircle(14, 0, 8);
        g.fillStyle(hHangry).fillCircle(18, 0, 6.5);
        
        // forehead/nose bridge
        g.fillStyle(hHangry).fillCircle(17, -2, 6.5);
        
        // muzzle highlight (ellipse approximated)
        g.fillStyle(0xfaf4e0).fillCircle(17, 1, 5);
        
        // snout edge definition
        g.fillStyle(0xc8b088).fillCircle(14, 1, 8);

        // ── nostrils ──
        g.fillStyle(0x4a2810).fillCircle(19, -0.5, 1.2);
        g.fillStyle(0x4a2810).fillCircle(17.5, 0.5, 1);
        // nostril shine
        g.fillStyle(0x6a3820, 0.5).fillCircle(19.2, -0.8, 0.5);

        // ── eye bowl ──
        g.fillStyle(0x1a0a00).fillCircle(14, -4, 3.2);
        // sclera
        g.fillStyle(0xf8f0d8).fillCircle(14, -3.5, 2.8);
        // pupil
        g.fillStyle(0x0a0500).fillCircle(14.2, -3.8, 2);
        // eye highlight
        g.fillStyle(0xffffff, 0.8).fillCircle(14.8, -4.5, 0.9);
        g.fillStyle(0xffffff, 0.3).fillCircle(13.5, -3, 0.6);

        // ── ear ──
        g.fillStyle(hHangry).fillCircle(10, -7, 3.5);
        g.fillStyle(hHangry).fillCircle(10, -10, 3);
        // inner ear (pink)
        g.fillStyle(0xb07868).fillCircle(10.5, -7, 2);
        g.fillStyle(0xb07868, 0.8).fillCircle(10.5, -9, 1.5);

        // ═══ LAYER 7: tamed collar ───────────
        if (s.isTamed) {
            // collar wraps around neck (polygon approximation with lines)
            g.lineStyle(3, 0xcc4444, 0.9);
            g.lineBetween(-2, -9, 2, -10);
            g.lineBetween(2, -10, 6, -8);
            g.lineBetween(6, -8, 7, -5);
            g.lineBetween(7, -5, 6, -2);
            g.lineBetween(6, -2, 2, -1);
            g.lineBetween(2, -1, -2, -1);
            
            // buckle plate
            g.fillStyle(0xffcc00).fillCircle(-1, -6, 3);
            // buckle pin hole
            g.fillStyle(0x996600).fillCircle(-1, -5, 1);
            // buckle edge highlight
            g.fillStyle(0xffee80, 0.5).fillCircle(-0.5, -6.5, 1.5);
        }

        // ═══ LAYER 8: gender marker ══════════
        if (s.gender) {
            const markCol = s.gender === 'male' ? 0x5577bb : 0xdd88aa;
            g.fillStyle(markCol, 0.85).fillCircle(1, -12, 2.8);
            // outer ring
            g.lineStyle(1, markCol, 0.5).strokeCircle(1, -12, 3.2);
            if (s.gender === 'male') {
                // small horn hint
                g.lineStyle(1.8, markCol, 0.6);
                g.lineBetween(0, -11, -2, -16);
                g.lineBetween(1.5, -11, 0, -15.5);
            }
        }

        // ═══ LAYER 9: wool-ready shimmer ─────
        if (woolReady) {
            for (const [sx, sy, sr] of [[-2, -5, 6], [8, -3, 5], [-6, 1, 5], [10, 7, 4], [-10, 5, 3]]) {
                g.fillStyle(0xffffff, 0.3).fillCircle(sx, sy, sr);
            }
            // extra bright wool tips
            g.fillStyle(0xffffff, 0.2).fillCircle(0, -8, 4);
            g.fillStyle(0xffffff, 0.2).fillCircle(6, -8, 3.5);
        }

        // ═══ LAYER 10: hungry distress ───────
        if (hungry) {
            // slightly faded wool tips
            g.fillStyle(0xffffff, 0.15).fillCircle(0, -6, 3);
        }
    },

    _dim(hex, f) {
        let r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
        return (((r * f) >> 0) << 16) | (((g * f) >> 0) << 8) | ((b * f) >> 0);
    },
    _bright(hex, f) {
        let r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
        return (Math.min(255, ((r * f) >> 0)) << 16) | (Math.min(255, ((g * f) >> 0)) << 8) | Math.min(255, ((b * f) >> 0));
    },
};
