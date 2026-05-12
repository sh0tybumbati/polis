export default {
    id: 'miner',
    minAge: 2,
    skill: 'mining',
    needKey: 'Materials.Stone.Limestone',
    nodeTypes: ['small_boulder', 'large_boulder', 'ore_vein', 'mountain'],
    depositTypes: ['stonepile', 'smelter'],
    score(u, ctx) {
        if (u.age < this.minAge) return -1;
        const hireBonus = ctx.constructs.some(b => b.type === 'stonepile' && b.built && b.isPublic && b.hiring) ? 100 : 0;
        return (25 + hireBonus + ctx.need(this.needKey) * 60 + (u.skills[this.skill]?.level ?? 1) * 15) - ctx.cnt(this.id) * 22;
    },
};
