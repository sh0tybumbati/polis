// Slot positions as [xFrac, yFrac] within a tile (0-1 coords)
const SLOT_POS = {
    1: [[0.50, 0.50]],
    2: [[0.33, 0.50], [0.67, 0.50]],
    3: [[0.25, 0.33], [0.75, 0.33], [0.50, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
};

// Each crop's `wild` lists the wild node type(s) whose harvest unlocks cultivating it — a
// domestic crop stays locked in the grow-zone picker until its wild form has been discovered. (#22)
export const CROPS = {
    wheat: {
        key: 'wheat', label: 'Wheat',
        output: 'Food.Grain.Wheat',
        density: 4, growTime: 60000,
        zoneColor: 0x558833,
        slotPositions: SLOT_POS[4],
        wild: ['wild_wheat'],
    },
    barley: {
        key: 'barley', label: 'Barley',
        output: 'Food.Grain.Wheat', // same item for now — feeds brewer
        density: 4, growTime: 50000,
        zoneColor: 0x778822,
        slotPositions: SLOT_POS[4],
        wild: ['wild_wheat'],
    },
    olives: {
        key: 'olives', label: 'Olives',
        output: 'Food.Produce.Olive',
        density: 2, growTime: 90000,
        zoneColor: 0x447733,
        slotPositions: SLOT_POS[2],
        wild: ['olive_grove'],
    },
    berries: {
        key: 'berries', label: 'Berries',
        output: 'Food.Produce.Berry',
        density: 3, growTime: 45000,
        zoneColor: 0x884466,
        slotPositions: SLOT_POS[3],
        wild: ['berry_bush'],
    },
    grapes: {
        key: 'grapes', label: 'Grapes',
        output: 'Food.Produce.WildGrapes',
        density: 3, growTime: 70000,
        zoneColor: 0x6a3a8a,
        slotPositions: SLOT_POS[3],
        wild: ['grape_vine'],
    },
    greens: {
        key: 'greens', label: 'Greens',
        output: 'Food.Produce.Greens',
        density: 4, growTime: 40000,
        zoneColor: 0x3a8a4a,
        slotPositions: SLOT_POS[4],
        wild: ['wild_garden'],
    },
};

// crops keyed by the wild node type that unlocks them (e.g. 'wild_wheat' → ['wheat','barley'])
export const CROPS_BY_WILD = Object.values(CROPS).reduce((m, c) => {
    for (const w of (c.wild ?? [])) (m[w] ??= []).push(c.key);
    return m;
}, {});
