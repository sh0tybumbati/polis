export default {
    id: 'grainsilo', placement: 'tile', width: 1, height: 1,
        label: 'Grain Silo', icon: '🌾', color: 0x8b6030, cat: 'Storage',
        zoneType: 'Storage',
        buildWork: 20,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 6, 'Materials.Wood.Pine.Plank': 4 },
        desc: 'Stores grain and food. Place in a storage zone.',
};