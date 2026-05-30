export default {
    id: 'wall_edge',
    placement: 'edge',
    label: "🧱 Stone Wall",
    color: 0x7a7a8a,
    costs: {
        'Materials.Stone.Limestone.Stones': { 'Materials.Stone.Limestone.Stones': 2 },
        'Materials.Stone.Limestone':        { 'Materials.Stone.Limestone': 1 },
    },
    allowedMaterials: ['Materials.Stone.Limestone.Stones', 'Materials.Stone.Limestone'],
    buildWork: 5,
    height: 'full',
    desc: "A sturdy stone defensive wall."
};
