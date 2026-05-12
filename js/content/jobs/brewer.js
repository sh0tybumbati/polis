export default {
    id: 'brewer',
    label: 'Brewer',
    input: 'Food.Grain.Wheat',
    output: 'Food.Drink.Beer',
    carryQty: 6,
    skill: 'brew',
    score(u, ctx) {
        if ((ctx.resources['Food.Grain.Wheat'] ?? 0) <= 0) return 0;
        return 40 + ctx.need('Food.Drink.Beer') * 80 + (u.skills?.brew?.level ?? 1) * 15;
    },
};
