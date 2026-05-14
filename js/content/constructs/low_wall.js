export default {
    id: 'low_wall',
    placement: 'edge',
    label: "Low Wall",
    color: 0x8a8a9a,
    costs: {
        'Materials.Stone.Limestone.Stones': { 'Materials.Stone.Limestone.Stones': 1 },
        'Materials.Stone.Limestone':        { 'Materials.Stone.Limestone': 1 },
    },
    allowedMaterials: ['Materials.Stone.Limestone.Stones', 'Materials.Stone.Limestone'],
    buildWork: 8,
    height: 'low',
    desc: "A low stone parapet. Slows enemies but does not block pathing.",
};
