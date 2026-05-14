export default {
    id: 'fence',
    placement: 'edge',
    label: "🪵 Fence",
    color: 0x8a6030,
    costs: {
        'Materials.Wood.Pine.Sticks': { 'Materials.Wood.Pine.Sticks': 3 },
        'Materials.Wood.Pine':        { 'Materials.Wood.Pine': 1 },
    },
    allowedMaterials: ['Materials.Wood.Pine.Sticks', 'Materials.Wood.Pine'],
    buildWork: 4,
    height: 'fence',
    desc: "A basic wooden fence. Animals cannot pass through, but provides no defense."
};
