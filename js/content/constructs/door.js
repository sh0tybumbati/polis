export default {
    id: 'door',
    placement: 'edge',
    label: "Door",
    color: 0x8a5a28,
    costs: {
        'Materials.Wood.Pine.Sticks': { 'Materials.Wood.Pine.Sticks': 2 },
        'Materials.Wood.Pine':        { 'Materials.Wood.Pine': 1 },
        'Materials.Metal.Iron':       { 'Materials.Metal.Iron': 1 },
    },
    allowedMaterials: ['Materials.Wood.Pine.Sticks', 'Materials.Wood.Pine', 'Materials.Metal.Iron'],
    buildWork: 6,
    height: 'door',
    passable: true,
    desc: "A door. Seals a gap in walls. Iron doors are much sturdier.",
};
