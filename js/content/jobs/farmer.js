export default {
    id: 'farmer',
    skill: 'farming',
    depositTypes: ['grainsilo', 'storageshelf', 'townhall'],
    score(u, ctx) {
        const hasGrowZone = ctx.domains?.length >= 0 && ctx.constructs.some(b => false); // placeholder; grow zones scored via need
        const grainNeed = Math.max(ctx.need('Food.Grain.Wheat'), ctx.need('Food.Grain.Wheat.Flour'), ctx.need('Food.Grain.Wheat.Bread'));
        return (60 + grainNeed * 50 + (u.skills[this.skill]?.level ?? 1) * 15) - ctx.cnt(this.id) * 25;
    },
};
