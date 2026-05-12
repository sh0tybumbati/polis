export default {
    id: 'Appliance.Oven', placement: 'tile', width: 1, height: 1,
        label: 'Oven', icon: '🍞', color: 0xbb5522, cat: 'Food',
        zoneType: 'Baking', job: 'baker', jobSlots: 1,
        buildWork: 14,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 5 },
        desc: 'Bakes flour → bread.',
};