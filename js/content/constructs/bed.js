export default {
    id: 'Furniture.Bed', placement: 'tile', width: 1, height: 1,
        label: 'Bed', icon: '🛏', color: 0x6a4a28, cat: 'Living',
        zoneType: 'Living', provides: { sleepSlots: 1 },
        buildWork: 8,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 3 },
        desc: 'Sleeping spot for one citizen.',
};