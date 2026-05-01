export default {
    id: 'worker',
    hp: 10, atk: 1, speed: 40, range: 0,
    color: 0xccccaa,
    vetLevels: false,
    draw(gfx, u, { totalCarrying }) {
        const age = u.age ?? 2;
        const bodyCol = u.phenotype?.skinHex ?? this.color;

        if (u.role === null && age >= 2 && !u.isEnemy)
            gfx.lineStyle(1, 0xddcc22, 0.5 + 0.4 * Math.sin(Date.now() / 400)).strokeCircle(0, 0, 12);

        if (age === 0) {
            gfx.fillStyle(bodyCol).fillCircle(0, 0, 5);
            if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 7);
        } else if (age === 1) {
            gfx.fillStyle(bodyCol).fillTriangle(0, -6, -5, 3, 5, 3);
            if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -8, -7, 4, 7, 4);
        } else {
            gfx.fillStyle(bodyCol).fillTriangle(0, -9, -8, 5, 8, 5);
            if (u.selected) gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -11, -10, 6, 10, 6);
        }

        if (u.role && age >= 1) {
            const rc = u.role === 'builder'  ? 0xffdd44
                     : u.role === 'farmer'   ? 0x66dd44
                     : u.role === 'forager'  ? 0xee4466
                     : u.role === 'miner'    ? 0x9999bb
                     : u.role === 'shepherd' ? 0xf0ece0
                     : u.role === 'hunter'   ? 0xdd8833
                     : 0xaa7733;
            gfx.fillStyle(rc).fillCircle(age === 1 ? 5 : 7, age === 1 ? -6 : -9, 2);
        }

        if (u.isArchon && age >= 2) {
            gfx.fillStyle(0xffdd00, 1);
            gfx.fillTriangle(-5, -11, -3, -11, -4, -15);
            gfx.fillTriangle(-1, -11,  1, -11,  0, -16);
            gfx.fillTriangle( 3, -11,  5, -11,  4, -15);
            gfx.lineStyle(0.5, 0xaa8800, 0.8);
            gfx.strokeTriangle(-5, -11, -3, -11, -4, -15);
            gfx.strokeTriangle(-1, -11,  1, -11,  0, -16);
            gfx.strokeTriangle( 3, -11,  5, -11,  4, -15);
        }

        if (u.carrying && totalCarrying(u) > 0) {
            const c = u.carrying;
            const cc = c['Food.Grain.Wheat.Bread'] > 0         ? 0xffdd88
                     : c['Food.Meat.Venison.Sausages'] > 0     ? 0xffaa44
                     : c['Food.Produce.Olive'] > 0             ? 0x88cc44
                     : c['Food.Meat.Venison'] > 0              ? 0xdd5533
                     : c['Food.Grain.Wheat'] > 0               ? 0xddcc66
                     : c['Materials.Stone.Limestone'] > 0      ? 0xaaaadd
                     : c['Materials.Stone.Limestone.Stones'] > 0 ? 0xbbbbcc
                     : c['Textile.Fiber.Wool'] > 0             ? 0xeeddcc
                     : c['Textile.Hide.Deer'] > 0              ? 0xcc8855
                     : c['Materials.Metal.Copper.Ore'] > 0     ? 0x55aa55
                     : c['Materials.Wood.Pine.Sticks'] > 0     ? 0xaa8844
                     : 0xcc9944;
            gfx.fillStyle(cc).fillCircle(age === 0 ? 4 : 6, age === 0 ? 3 : 5, 2);
        }

        const wp = u.workProgress || 0;
        if (wp > 0) {
            const ratio = Math.min(1, wp / 25);
            const by = age === 0 ? -10 : age === 1 ? -13 : -17;
            const col = u.taskType === 'build' ? 0xffdd44 : 0x55dd55;
            gfx.fillStyle(0x111111, 0.7).fillRect(-11, by, 22, 3);
            gfx.fillStyle(col).fillRect(-11, by, Math.round(22 * ratio), 3);
        }
    },
};
