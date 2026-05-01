export default {
    id: 'baker',
    building: 'bakery',
    input: 'Food.Grain.Wheat.Flour',
    output: 'Food.Grain.Wheat.Bread',
    carryQty: 7,
    skill: 'bake',
    needKey: 'Food.Grain.Wheat.Bread',
    baseScore: 45,
    fetchSources: ['mill', 'granary', 'warehouse'],
    depositTypes: ['bakery', 'granary', 'warehouse'],
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
