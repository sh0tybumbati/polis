export default {
    id: 'shepherd',
    minAge: 2,
    skill: 'animalTrap',
    depositTypes: [],
    private: true,
    score(u, ctx) {
        if (u.age < this.minAge) return -1;
        const hasPasture = ctx.constructs.some(b => b.type === 'pasture' && b.built && !b.faction);
        if (!hasPasture) return -1;
        const wildSheep = ctx.sheep.filter(s => !s.isTamed && !s.isDead).length;
        if (wildSheep === 0) return -1;
        return (20 + wildSheep * 8 + ctx.need('Textile.Fiber.Wool') * 40 + (u.skills[this.skill]?.level ?? 1) * 10) - ctx.cnt(this.id) * 18;
    },
};
