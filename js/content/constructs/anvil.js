export default {
    id: 'Appliance.Anvil', placement: 'tile', width: 1, height: 1,
        label: 'Anvil', icon: '🔨', color: 0x444455, cat: 'Metal',
        zoneType: 'Smithing', job: 'smith', jobSlots: 1,
        buildWork: 20,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 10 },
        desc: 'Forges ingots → kits. Requires Forge in same room. (Later: granite)',
};