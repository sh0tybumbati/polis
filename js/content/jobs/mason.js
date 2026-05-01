export default {
    id: 'mason',
    building: 'masons',
    input: 'Materials.Stone.Limestone',
    output: 'Materials.Stone.Limestone.Block',
    carryQty: 4,
    skill: 'masonry',
    needKey: 'Materials.Stone.Limestone.Block',
    baseScore: 28,
    fetchSources: ['stonepile', 'warehouse', 'townhall'],
    selfSupply: { nodes: ['boulder', 'ore_vein'], depositTypes: ['stonepile', 'warehouse', 'townhall'] },
    depositTypes: ['masons', 'warehouse'],
    score(u, ctx) {
        const hasFreeSlot = ctx.buildings.some(b =>
            b.type === this.building && b.built && !b.faction &&
            !ctx.units.some(w => w.role === this.id && w.taskBldgId === b.id));
        if (!hasFreeSlot) return -1;
        const hasInput = (ctx.resources[this.input] ?? 0) > 0
            || ctx.buildings.some(b => b.built && !b.faction && this.fetchSources.includes(b.type) && (b.inventory?.[this.input] ?? 0) > 0);
        return this.baseScore + (hasInput ? 30 : 0) + ctx.need(this.needKey) * 80 + (u.skills[this.skill]?.level ?? 1) * 15;
    },
};
