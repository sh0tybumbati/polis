export default {
    id: 'weaver',
    input: 'Textile.Fiber.Wool',
    output: 'Textile.Cloth.Wool',
    carryQty: 4,
    skill: 'weave',
    needKey: 'Textile.Cloth.Wool',
    baseScore: 30,
    fetchSources: ['warehouse', 'granary'],
    depositTypes: ['warehouse'],
    score(u, ctx) {
        const hasInput = (ctx.resources[this.input] ?? 0) > 0;
        return hasInput
            ? this.baseScore + ctx.need(this.needKey) * 80 + (u.skills[this.skill]?.level ?? 1) * 15
            : 0;
    },
};
