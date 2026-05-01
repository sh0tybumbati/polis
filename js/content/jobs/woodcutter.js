export default {
    id: 'woodcutter',
    minAge: 2,
    skill: 'woodcutting',
    needKey: 'Materials.Wood.Pine',
    nodeTypes: ['small_tree', 'large_tree'],
    depositTypes: ['woodshed', 'warehouse', 'townhall'],
    score(u, ctx) {
        if (u.age < this.minAge) return -1;
        const hireBonus = ctx.buildings.some(b => b.type === 'woodshed' && b.built && b.isPublic && b.hiring) ? 100 : 0;
        return (30 + hireBonus + ctx.need(this.needKey) * 60 + (u.skills[this.skill]?.level ?? 1) * 15) - ctx.cnt(this.id) * 22;
    },
};
