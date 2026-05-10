// Furniture & Appliance definitions.
// buildWork: work-ticks a builder needs to complete it (each tick = 5 units, 25ms progress interval).
// craftCost: materials deducted from commons when construction begins.
// craftedAt: zone type that produces this item (future — for now all orderable anywhere).

export const FURNITURE = {
    // ── Living ────────────────────────────────────────────────────────────────
    'Furniture.Bed': {
        label: 'Bed', icon: '🛏', color: 0x6a4a28, cat: 'Living',
        zoneType: 'Living', provides: { sleepSlots: 1 },
        buildWork: 8,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 3 },
        desc: 'Sleeping spot for one citizen.',
    },
    'Furniture.Hearth': {
        label: 'Hearth', icon: '🔥', color: 0xbb4422, cat: 'Living',
        zoneType: 'Living', provides: { warmth: 1 },
        buildWork: 10,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 3 },
        desc: 'Provides heat and enables cooking.',
    },
    'Furniture.Chest': {
        label: 'Chest', icon: '📦', color: 0x7a5a38, cat: 'Living',
        provides: { storageVolume: 40 },
        buildWork: 6,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 4 },
        desc: 'Stores up to 40 units of goods.',
    },

    // ── Food processing ───────────────────────────────────────────────────────
    'Appliance.Millstone': {
        label: 'Millstone', icon: '⚙', color: 0x8a8060, cat: 'Food',
        zoneType: 'Milling', job: 'miller', jobSlots: 1,
        buildWork: 16,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 6 },
        desc: 'Grinds wheat → flour.',
    },
    'Appliance.Oven': {
        label: 'Oven', icon: '🍞', color: 0xbb5522, cat: 'Food',
        zoneType: 'Baking', job: 'baker', jobSlots: 1,
        buildWork: 14,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 5 },
        desc: 'Bakes flour → bread.',
    },
    'Appliance.ButchersBlock': {
        label: "Butcher's Block", icon: '🥩', color: 0x993322, cat: 'Food',
        zoneType: 'Butchering', job: 'butcher', jobSlots: 1,
        buildWork: 8,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 4 },
        desc: 'Processes meat & hide.',
    },
    'Appliance.OlivePress': {
        label: 'Olive Press', icon: '🫒', color: 0x4a6630, cat: 'Food',
        zoneType: 'OlivePress', job: 'presser', jobSlots: 1,
        buildWork: 14,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 4 },
        desc: 'Presses olives.',
    },

    // ── Crafting ──────────────────────────────────────────────────────────────
    'Appliance.Workbench': {
        label: 'Workbench', icon: '🪚', color: 0x9a6030, cat: 'Craft',
        zoneType: 'Carpentry', job: 'carpenter', jobSlots: 1,
        buildWork: 10,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 6 },
        desc: 'Woodworking & plank cutting.',
    },
    'Appliance.Loom': {
        label: 'Loom', icon: '🧶', color: 0x7755aa, cat: 'Craft',
        zoneType: 'Weaving', job: 'weaver', jobSlots: 1,
        buildWork: 10,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 4 },
        desc: 'Weaves wool → cloth.',
    },
    'Appliance.TanningRack': {
        label: 'Tanning Rack', icon: '👞', color: 0x7a4a28, cat: 'Craft',
        zoneType: 'Tanning', job: 'tanner', jobSlots: 1,
        buildWork: 10,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 5 },
        desc: 'Cures hide → leather.',
    },
    'Appliance.StoneCutter': {
        label: 'Stone Cutter', icon: '🪨', color: 0x6a6858, cat: 'Craft',
        zoneType: 'Masonry', job: 'mason', jobSlots: 1,
        buildWork: 12,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 4 },
        desc: 'Cuts stone chunks → blocks.',
    },

    // ── Metalwork ─────────────────────────────────────────────────────────────
    'Appliance.Forge': {
        label: 'Forge', icon: '🔥', color: 0xaa3311, cat: 'Metal',
        zoneType: 'Smelting', job: 'smelter', jobSlots: 1,
        buildWork: 20,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 8 },
        desc: 'Smelts ore → ingots. Required for smithing.',
    },
    'Appliance.Anvil': {
        label: 'Anvil', icon: '🔨', color: 0x444455, cat: 'Metal',
        zoneType: 'Smithing', job: 'smith', jobSlots: 1,
        buildWork: 20,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 10 },
        desc: 'Forges ingots → kits. Requires Forge in same room. (Later: granite)',
    },
};

export const FURNITURE_CATS = {
    Living: ['Furniture.Bed', 'Furniture.Hearth', 'Furniture.Chest'],
    Food:   ['Appliance.Millstone', 'Appliance.Oven', 'Appliance.ButchersBlock', 'Appliance.OlivePress'],
    Craft:  ['Appliance.Workbench', 'Appliance.Loom', 'Appliance.TanningRack', 'Appliance.StoneCutter'],
    Metal:  ['Appliance.Forge', 'Appliance.Anvil'],
};

export const BLDG_TO_APPLIANCE = {
    mill:        'Appliance.Millstone',
    bakery:      'Appliance.Oven',
    butcher:     'Appliance.ButchersBlock',
    olive_press: 'Appliance.OlivePress',
    carpenter:   'Appliance.Workbench',
    tannery:     'Appliance.TanningRack',
    masons:      'Appliance.StoneCutter',
    smelter:     'Appliance.Forge',
    blacksmith:  'Appliance.Anvil',
    house:       'Furniture.Bed',
    camp:        'Furniture.Bed',
};
