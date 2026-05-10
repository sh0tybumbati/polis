export default {
    id: 'presser',
    input: 'Food.Produce.Olive',
    output: 'Food.Produce.Olive.Oil',
    carryQty: 5,
    skill: 'press',
    needKey: 'Food.Produce.Olive.Oil',
    baseScore: 30,
    fetchSources: ['granary', 'warehouse', 'townhall'],
    depositTypes: ['granary', 'warehouse'],
    score(u, ctx) {
        const hasInput = (ctx.resources[this.input] ?? 0) > 0;
        return hasInput
            ? this.baseScore + ctx.need(this.needKey) * 80 + (u.skills[this.skill]?.level ?? 1) * 15
            : 0;
    },
};
