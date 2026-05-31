// Tech tree — the colony's research progression through the ages. Constructs NOT listed in any
// tech's `unlocks` are buildable from the start (stone-age basics); listed ones require their tech
// to be researched (gates the player AND the AI). Crops are gated separately (discoveredCrops).
//
// Start with Stone→Bronze content; Classical/Medieval eras are defined so the arc exists and fill
// in as their constructs are added.

export const ERAS = [
    { key: 'stone',     label: 'Stone Age' },
    { key: 'bronze',    label: 'Bronze Age' },
    { key: 'classical', label: 'Classical Age' },
    { key: 'medieval',  label: 'Medieval Age' },
];
export const eraIndex = (key) => Math.max(0, ERAS.findIndex(e => e.key === key));

// Each tech: { id, label, era, icon, cost (Lore), prereqs:[techId], unlocks:[constructType], desc }
export const TECHS = {
    smelting: {
        id: 'smelting', label: 'Smelting', era: 'bronze', icon: '🔥', cost: 24,
        prereqs: [], unlocks: ['forge'],
        desc: 'Smelt copper ore into ingots at a forge.',
    },
    bronzeworking: {
        id: 'bronzeworking', label: 'Bronzeworking', era: 'bronze', icon: '🛠', cost: 32,
        prereqs: ['smelting'], unlocks: ['anvil'],
        desc: 'Work bronze at an anvil for tools and arms.',
    },
    horsemanship: {
        id: 'horsemanship', label: 'Horsemanship', era: 'bronze', icon: '🐎', cost: 30,
        prereqs: ['bronzeworking'], unlocks: ['mounted_grounds'],
        desc: 'Train mounted warriors at a paddock.',
    },
    philosophy: {
        id: 'philosophy', label: 'Philosophy', era: 'classical', icon: '📜', cost: 48,
        prereqs: ['bronzeworking'], unlocks: ['temple', 'oracle'],
        desc: 'Temples and oracles — civic and spiritual life.',
    },
};

// constructType → tech id that unlocks it (types absent here are always buildable / stone-age).
export const TECH_FOR_CONSTRUCT = (() => {
    const m = {};
    for (const t of Object.values(TECHS))
        for (const u of (t.unlocks ?? [])) m[u] = t.id;
    return m;
})();
