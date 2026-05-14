export default {
    id: 'fence_gate',
    placement: 'edge',
    label: "Fence Gate",
    color: 0x7a5020,
    costs: {
        'Materials.Wood.Pine.Sticks': { 'Materials.Wood.Pine.Sticks': 3 },
        'Materials.Wood.Pine':        { 'Materials.Wood.Pine': 1 },
    },
    allowedMaterials: ['Materials.Wood.Pine.Sticks', 'Materials.Wood.Pine'],
    buildWork: 5,
    height: 'fence',
    passable: true,
    desc: "A gate in a fence or low wall. Open and close to manage livestock.",
};
