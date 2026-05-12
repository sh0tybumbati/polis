export default {
    id: 'butchersblock', placement: 'tile', width: 1, height: 1,
        label: "Butcher's Block", icon: '🥩', color: 0x993322, cat: 'Food',
        zoneType: 'Butchering', job: 'butcher', jobSlots: 1,
        buildWork: 8,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 4 },
        desc: 'Processes meat & hide.',
};