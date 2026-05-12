export default {
    id: 'Furniture.Chest', placement: 'tile', width: 1, height: 1,
        label: 'Chest', icon: '📦', color: 0x7a5a38, cat: 'Living',
        provides: { storageVolume: 40 },
        buildWork: 6,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 4 },
        desc: 'Stores up to 40 units of goods.',
};