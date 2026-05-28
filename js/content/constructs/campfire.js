import { TILE, MAP_OY } from '../../config/gameConstants.js';

const g = b => {
    const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.width*TILE;
    return { px, py, s, cx: px+s/2, cy: py+s/2 };
};

const FUEL_MS    = 30000; // consume 1 log every 30s when burning
const FLICKER_MS = 400;   // ms between animated flame puffs

export default {
    id: 'campfire',
    placement: 'tile',
    width: 1, height: 1,
    label: 'Campfire', icon: '🔥', color: 0xcc4400,
    cat: 'Civil',
    zoneType: 'Leisure',
    buildWork: 3,
    cost: { 'Materials.Wood.Pine': 3 },
    outdoor: true,
    leisureSlots: 4,
    desc: 'Workers gather here for warmth and joy. Burns logs as fuel — goes cold without wood.',

    tick(b, delta, ctx) {
        // Initialise lit state on first tick
        if (b.isLit === undefined) {
            const res = ctx.resources;
            if ((res['Materials.Wood.Pine'] ?? 0) >= 1) {
                res['Materials.Wood.Pine'] -= 1;
                b.isLit = true;
            } else {
                b.isLit = false;
            }
            ctx.redrawConstruct(b);
        }

        // Periodically consume a log to keep burning
        b._fuelTimer = (b._fuelTimer ?? 0) + delta;
        if (b._fuelTimer >= FUEL_MS) {
            b._fuelTimer = 0;
            const res = ctx.resources;
            const wasLit = b.isLit;
            if ((res['Materials.Wood.Pine'] ?? 0) >= 1) {
                res['Materials.Wood.Pine'] -= 1;
                b.isLit = true;
            } else {
                b.isLit = false;
                if (wasLit) ctx.floatText(b, '🪵 out of fuel', '#ff6622');
            }
            if (b.isLit !== wasLit) ctx.redrawConstruct(b);
        }

        if (!b.isLit) return;

        // Animated flame puffs
        b._flickerTimer = (b._flickerTimer ?? 0) + delta;
        if (b._flickerTimer < FLICKER_MS) return;
        b._flickerTimer = 0;

        const { cx, cy } = g(b);
        const ox       = (Math.random() - 0.5) * 5;
        const baseSize = 3.5 + Math.random() * 2.5;

        const gfx = ctx.addGraphics();
        gfx.fillStyle(0xff3300, 0.85).fillCircle(cx + ox, cy, baseSize);
        gfx.fillStyle(0xff7700, 0.75).fillCircle(cx + ox * 0.6, cy - baseSize * 0.5, baseSize * 0.65);
        gfx.fillStyle(0xffcc44, 0.60).fillCircle(cx + ox * 0.3, cy - baseSize,       baseSize * 0.35);

        ctx.tween({
            targets:  gfx,
            alpha:    0,
            y:        -(baseSize * 3),
            duration: 300 + Math.floor(Math.random() * 150),
            ease:     'Sine.easeIn',
            onComplete: () => gfx.destroy(),
        });
    },

    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        // Ground scorch
        gfx.fillStyle(0x3a2a18, 0.50).fillEllipse(cx, cy + 4, 20, 12);
        // Stone ring
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            gfx.fillStyle(0x888070).fillCircle(cx + Math.cos(a) * 9, cy + 4 + Math.sin(a) * 6, 2.8);
        }
        // Crossed logs
        gfx.lineStyle(2.5, 0x5a3010, 0.9).lineBetween(cx - 8, cy + 8, cx + 6, cy - 2);
        gfx.lineStyle(2.5, 0x6a3818, 0.9).lineBetween(cx + 8, cy + 8, cx - 6, cy - 2);
        // Static ember glow when lit (animated puffs come from tick)
        if (b.isLit !== false) {
            gfx.fillStyle(0xff4400, 0.55).fillCircle(cx, cy + 2, 4.5);
            gfx.fillStyle(0xff8800, 0.45).fillCircle(cx, cy + 1, 2.5);
            gfx.fillStyle(0xffcc44, 0.35).fillCircle(cx, cy,     1.2);
        }
    },
};
