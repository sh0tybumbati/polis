export default {
    id: 'builder',
    minAge: 2,
    skill: 'masonry',
    depositTypes: [],
    score(u, ctx) {
        if (u.age < this.minAge) return -1;
        const unbuilt = ctx.buildings.filter(b => !b.built && !b.faction);
        if (unbuilt.length === 0) return -1;
        return (65 + unbuilt.length * 15 + (u.skills[this.skill]?.level ?? 1) * 10) - ctx.cnt(this.id) * 20;
    },
};
