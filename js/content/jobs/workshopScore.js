// Shared score function for all workshop jobs.
// Each building supports 2 cellular workers: 1 procurer + 1 processor.
export function workshopScore(u, ctx, def) {
    const hasFreeSlot = ctx.buildings.some(b =>
        b.type === def.building && b.built && !b.faction && (
            !ctx.units.some(w => w.role === def.id && w.workshopSubrole === 'procure' && w.taskBldgId === b.id) ||
            !ctx.units.some(w => w.role === def.id && w.workshopSubrole === 'process' && w.taskBldgId === b.id)
        ));
    if (!hasFreeSlot) return -1;
    const hasInput = (ctx.resources[def.input] ?? 0) > 0
        || ctx.buildings.some(b => b.built && !b.faction
            && def.fetchSources.includes(b.type) && (b.inventory?.[def.input] ?? 0) > 0);
    const hireBonus = ctx.buildings.some(b =>
        b.type === def.building && b.built && b.isPublic && b.hiring) ? 100 : 0;
    return def.baseScore + hireBonus + (hasInput ? 30 : 0) + ctx.need(def.needKey) * 80 + (u.skills[def.skill]?.level ?? 1) * 15;
}
