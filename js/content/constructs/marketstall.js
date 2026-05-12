export default {
    id: 'Appliance.MarketStall', placement: 'tile', width: 1, height: 1,
        label: 'Market Stall', icon: '🏪', color: 0xbb9922, cat: 'Market',
        zoneType: 'Market', job: 'merchant', jobSlots: 1,
        buildWork: 8,
        craftedAt: 'Carpentry', craftCost: { 'Materials.Wood.Pine.Plank': 4 },
        desc: 'Merchants trade here. Place in a market zone.',
};