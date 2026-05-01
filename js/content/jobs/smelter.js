export default {
    id: 'smelter',
    building: 'smelter',
    input: 'Materials.Metal.Copper.Ore',
    output: 'Materials.Metal.Copper.Ingot',
    carryQty: 6,
    skill: 'smelt',
    needKey: 'Materials.Metal.Copper.Ingot',
    baseScore: 35,
    fetchSources: ['mine', 'smelter', 'warehouse'],
    selfSupply: { nodes: ['ore_vein'], depositTypes: ['smelter', 'warehouse'] },
    depositTypes: ['smelter', 'warehouse'],
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
