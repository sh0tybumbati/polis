// Shared score function for all workshop jobs.
// Each construct supports 2 cellular workers: 1 procurer + 1 processor.
export function workshopScore(u, ctx, def) {
    const inKeys = def.inputs ?? [def.input];
    const anyConstruct = ctx.constructs.some(b => b.type === def.construct && !b.faction);

    // No construct exists at all — give a weak score if there's a need, so one worker
    // takes this role and auto-places the workshop ghost for builders to construct.
    if (!anyConstruct) {
        const hasInput = inKeys.some(k => (ctx.resources[k] ?? 0) > 15);
        const hasNeed  = ctx.need(def.needKey) > 0.5;
        if (!hasInput && !hasNeed) return -1;
        // Only allow one worker to hold this role when no construct exists yet
        if (ctx.units.some(w => w.role === def.id)) return -1;
        return Math.floor(def.baseScore * 0.35);
    }

    const hasFreeSlot = ctx.constructs.some(b =>
        b.type === def.construct && b.built && !b.faction && (
            !ctx.units.some(w => w.role === def.id && w.workshopSubrole === 'procure' && w.taskConstructId === b.id) ||
            !ctx.units.some(w => w.role === def.id && w.workshopSubrole === 'process' && w.taskConstructId === b.id)
        ));
    if (!hasFreeSlot) return -1;

    const hasInput = inKeys.some(k => (ctx.resources[k] ?? 0) > 0)
        || ctx.constructs.some(b => b.built && !b.faction
            && def.fetchSources.includes(b.type) && inKeys.some(k => (b.inventory?.[k] ?? 0) > 0));
    const hireBonus = ctx.constructs.some(b =>
        b.type === def.construct && b.built && b.isPublic && b.hiring) ? 100 : 0;
    return def.baseScore + hireBonus + (hasInput ? 30 : 0) + ctx.need(def.needKey) * 80 + (u.skills[def.skill]?.level ?? 1) * 15;
}
