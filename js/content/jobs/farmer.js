export default {
    id: 'farmer',
    skill: 'farming',
    depositTypes: ['grainsilo', 'storageshelf', 'townhall'],
    score(u, ctx) {
        const grainNeed  = Math.max(ctx.need('Food.Grain.Wheat'), ctx.need('Food.Grain.Wheat.Flour'), ctx.need('Food.Grain.Wheat.Bread'));
        const growBonus  = (ctx.growZones ?? 0) > 0 ? 40 : 0;
        return (60 + grainNeed * 50 + growBonus + (u.skills[this.skill]?.level ?? 1) * 15) - ctx.cnt(this.id) * 25;
    },
};
