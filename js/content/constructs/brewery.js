export default {
    id: 'Appliance.Brewery', placement: 'tile', width: 1, height: 1,
        label: 'Brewery Vat', icon: '🍺', color: 0x8b6914, cat: 'Food',
        zoneType: 'Brewing', job: 'brewer', jobSlots: 1,
        buildWork: 16,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 6 },
        desc: 'Ferments grain → beer.',
};