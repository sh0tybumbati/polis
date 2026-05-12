export default {
    id: 'Appliance.TanningRack', placement: 'tile', width: 1, height: 1,
        label: 'Tanning Rack', icon: '👞', color: 0x7a4a28, cat: 'Craft',
        zoneType: 'Tanning', job: 'tanner', jobSlots: 1,
        buildWork: 10,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 5 },
        desc: 'Cures hide → leather.',
};