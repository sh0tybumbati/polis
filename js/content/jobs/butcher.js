export default {
    id: 'butcher',
    input: 'Food.Meat.Venison',
    // Any raw meat (venison / pork / beef) butchers into the same sausages.
    inputs: ['Food.Meat.Venison', 'Food.Meat.Pork', 'Food.Meat.Beef'],
    output: 'Food.Meat.Venison.Sausages',
    carryQty: 4,
    skill: 'butcher',
    needKey: 'Food.Meat.Venison.Sausages',
    baseScore: 40,
    fetchSources: ['storageshelf', 'townhall'],
    depositTypes: ['storageshelf', 'townhall'],
    score(u, ctx) {
        const hasInput = this.inputs.some(k => (ctx.resources[k] ?? 0) > 0);
        return hasInput
            ? this.baseScore + ctx.need(this.needKey) * 80 + (u.skills[this.skill]?.level ?? 1) * 15
            : 0;
    },
};
