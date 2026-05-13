export default {
    id: 'merchant',
    construct: 'agora',
    baseScore: 40,
    maxPerAgora: 2,
    simulateMs: 45.0,       // seconds at counter simulating a buyer
    valueRatio: 0.65,       // local market: 65% fair value (vs caravan's 80%)

    score(u, ctx) {
        const agora = ctx.constructs.find(b => b.type === 'agora' && b.built && !b.faction);
        if (!agora) return -1;
        const staffed = ctx.units.filter(w => w.role === 'merchant' && w.taskConstructId === agora.id).length;
        if (staffed >= this.maxPerAgora) return -1;
        const hasOrder = (agora.tradeOrders ?? []).some(o => (ctx.resources[o.give] ?? 0) >= o.qty);
        return this.baseScore + (hasOrder ? 50 : 0) + (u.skills.trading?.level ?? 1) * 10;
    },
};
