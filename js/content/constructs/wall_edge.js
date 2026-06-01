export default {
    id: 'wall_edge',
    placement: 'edge',
    label: "🧱 Wall",
    color: 0x7a7a8a,
    // A full-height wall can be raised from whatever the colony has on hand. Costs are per build
    // material; HP scales separately via materialHpMult (sticks 0.7× … cut stone 2.0× … iron 2.5×).
    // Stone stays first so manual placement still defaults to a stone wall; the archon picks a
    // material explicitly by purpose (cheap wood for houses, sturdy stone for defence).
    // Clay brick slots in here once the clay→pottery chain (#28) lands.
    costs: {
        'Materials.Stone.Limestone.Stones': { 'Materials.Stone.Limestone.Stones': 2 },
        'Materials.Stone.Limestone':        { 'Materials.Stone.Limestone': 1 },
        'Materials.Wood.Pine':              { 'Materials.Wood.Pine': 2 },
        'Materials.Wood.Pine.Sticks':       { 'Materials.Wood.Pine.Sticks': 3 },
    },
    allowedMaterials: [
        'Materials.Stone.Limestone.Stones', 'Materials.Stone.Limestone',
        'Materials.Wood.Pine', 'Materials.Wood.Pine.Sticks',
    ],
    buildWork: 5,
    height: 'full',
    desc: "A full-height wall — built from logs, stones, or dressed block, whatever's at hand."
};
