export default {
    id: 'farmer',
    skill: 'farming',
    depositTypes: ['granary', 'warehouse', 'townhall'],
    score(u, ctx) {
        const home = u.homeBldgId ? ctx.buildings.find(b => b.id === u.homeBldgId) : null;
        const homeDomain = home?.domainId ? ctx.domains.find(d => d.id === home.domainId) : null;
        const ownFarm = homeDomain ? ctx.buildings.find(b =>
            b.type === 'farm' && b.built && b.stock > 0 &&
            ctx.getDomainAt(b.tx, b.ty)?.id === homeDomain.id) : null;
        const grainNeed = Math.max(ctx.need('Food.Grain.Wheat'), ctx.need('Food.Grain.Wheat.Flour'), ctx.need('Food.Grain.Wheat.Bread'));
        return (60 + (ownFarm ? 30 : 0) + grainNeed * 50 + (u.skills[this.skill]?.level ?? 1) * 15) - ctx.cnt(this.id) * 25;
    },
};
