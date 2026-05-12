// Slot positions as [xFrac, yFrac] within a tile (0-1 coords)
const SLOT_POS = {
    1: [[0.50, 0.50]],
    2: [[0.33, 0.50], [0.67, 0.50]],
    3: [[0.25, 0.33], [0.75, 0.33], [0.50, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
};

export const CROPS = {
    wheat: {
        key: 'wheat', label: 'Wheat',
        output: 'Food.Grain.Wheat',
        density: 4, growTime: 60000,
        zoneColor: 0x558833,
        slotPositions: SLOT_POS[4],
    },
    barley: {
        key: 'barley', label: 'Barley',
        output: 'Food.Grain.Wheat', // same item for now — feeds brewer
        density: 4, growTime: 50000,
        zoneColor: 0x778822,
        slotPositions: SLOT_POS[4],
    },
    olives: {
        key: 'olives', label: 'Olives',
        output: 'Food.Produce.Olive',
        density: 2, growTime: 90000,
        zoneColor: 0x447733,
        slotPositions: SLOT_POS[2],
    },
    berries: {
        key: 'berries', label: 'Berries',
        output: 'Food.Produce.Berry',
        density: 3, growTime: 45000,
        zoneColor: 0x884466,
        slotPositions: SLOT_POS[3],
    },
};
