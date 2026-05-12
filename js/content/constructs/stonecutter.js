export default {
    id: 'Appliance.StoneCutter', placement: 'tile', width: 1, height: 1,
        label: 'Stone Cutter', icon: '🪨', color: 0x6a6858, cat: 'Craft',
        zoneType: 'Masonry', job: 'mason', jobSlots: 1,
        buildWork: 12,
        craftedAt: 'Masonry', craftCost: { 'Materials.Stone.Limestone.Block': 4 },
        desc: 'Cuts stone chunks → blocks.',
};