export default {
    id: 'forager',
    skill: 'farming',
    nodeTypes: ['berry_bush', 'wild_garden', 'olive_grove'],
    depositTypes: [],
    private: true,
    score(u, ctx) {
        const foodNeed = Math.max(ctx.need('Food.Grain.Wheat'), ctx.need('Food.Produce.Olive'));
        return (40 + foodNeed * 40 + (u.skills[this.skill]?.level ?? 1) * 15) - ctx.cnt(this.id) * 22;
    },
};
