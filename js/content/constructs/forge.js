export default {
    id: 'forge', placement: 'tile', width: 1, height: 1,
        label: 'Forge', icon: '🔥', color: 0xaa3311, cat: 'Metal',
        zoneType: 'Smelting', job: 'smelter', jobSlots: 1,
        buildWork: 20,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 8 },
        desc: 'Smelts ore → ingots. Required for smithing.',
};