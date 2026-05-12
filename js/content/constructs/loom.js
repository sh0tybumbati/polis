export default {
    id: 'Appliance.Loom', placement: 'tile', width: 1, height: 1,
        label: 'Loom', icon: '🧶', color: 0x7755aa, cat: 'Craft',
        zoneType: 'Weaving', job: 'weaver', jobSlots: 1,
        buildWork: 10,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 4 },
        desc: 'Weaves wool → cloth.',
};