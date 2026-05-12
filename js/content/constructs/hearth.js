export default {
    id: 'hearth', placement: 'tile', width: 1, height: 1,
        label: 'Hearth', icon: '🔥', color: 0xbb4422, cat: 'Living',
        zoneType: 'Living', provides: { warmth: 1 },
        buildWork: 10,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 3 },
        desc: 'Provides heat and enables cooking.',
};