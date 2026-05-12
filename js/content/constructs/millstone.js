export default {
    id: 'Appliance.Millstone', placement: 'tile', width: 1, height: 1,
        label: 'Millstone', icon: '⚙', color: 0x8a8060, cat: 'Food',
        zoneType: 'Milling', job: 'miller', jobSlots: 1,
        buildWork: 16,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 6 },
        desc: 'Grinds wheat → flour.',
};