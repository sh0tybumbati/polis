import { TECHS, TECH_FOR_CONSTRUCT, ERAS, eraIndex } from '../content/techs/index.js';
import { CONSTRUCTS } from '../content/constructs/index.js';

// Owns the colony's research/era progression: which techs are known, accumulating "Lore" (research
// points), and which constructs are therefore buildable. The archon-builds-first layer
// (unlockedConstructs) and crop discovery sit alongside this; together they form the progression.
export default class ProgressionManager {
    constructor(scene) { this.scene = scene; }

    isTechKnown(id)        { return !!this.scene.knownTechs?.has(id); }
    techForConstruct(type) { return TECH_FOR_CONSTRUCT[type] ?? null; }

    // A construct is research-available if it needs no tech, or its tech is known. Gates everyone.
    isConstructResearched(type) {
        const t = this.techForConstruct(type);
        return !t || this.isTechKnown(t);
    }

    // A tech can be researched next when all its prerequisites are known and it isn't already.
    techAvailable(id) {
        const t = TECHS[id];
        if (!t || this.isTechKnown(id)) return false;
        return (t.prereqs ?? []).every(p => this.isTechKnown(p));
    }
    availableTechs() { return Object.keys(TECHS).filter(id => this.techAvailable(id)); }

    currentEraKey() {
        let idx = 0;
        for (const id of this.scene.knownTechs ?? []) idx = Math.max(idx, eraIndex(TECHS[id]?.era ?? 'stone'));
        return ERAS[idx].key;
    }
    currentEraLabel() { return ERAS[eraIndex(this.currentEraKey())].label; }

    // Lore earned per in-game day: a base trickle, boosted by oracles/temples and a learned populace.
    lorePerDay() {
        const s = this.scene;
        const civic = (s.constructManager?.constructs ?? []).filter(b =>
            b.built && !b.faction && (b.type === 'oracle' || b.type === 'temple')).length;
        const adults = (s.units ?? []).filter(u => u.type === 'worker' && !u.isEnemy && u.hp > 0 && u.age >= 2).length;
        return 1 + civic * 2 + Math.floor(adults / 5);
    }

    setResearch(id) { if (TECHS[id] && this.techAvailable(id)) this.scene.researchTarget = id; }

    grantTech(id) {
        const t = TECHS[id];
        if (!t || this.isTechKnown(id)) return;
        const prevEra = this.currentEraKey();
        this.scene.knownTechs.add(id);
        const unlocked = (t.unlocks ?? []).map(u => CONSTRUCTS[u]?.label ?? u).join(', ');
        this.scene.uiManager?.showToast?.(
            `🔬 Researched ${t.label}${unlocked ? ` — can now build ${unlocked}` : ''}`, '#cfe0ff');
        if (this.currentEraKey() !== prevEra)
            this.scene.uiManager?.showToast?.(`🌅 The ${this.currentEraLabel()} dawns`, '#ffd88a');
    }

    // Called once per in-game day (WorldManager.endNight). Accrues Lore and, when enough has been
    // banked, completes the current research target (auto-picking the cheapest available if unset).
    researchTick() {
        const s = this.scene;
        s.lore = (s.lore ?? 0) + this.lorePerDay();
        if (!s.researchTarget || this.isTechKnown(s.researchTarget) || !this.techAvailable(s.researchTarget)) {
            s.researchTarget = this.availableTechs().sort((a, b) => TECHS[a].cost - TECHS[b].cost)[0] ?? null;
        }
        if (s.researchTarget && s.lore >= TECHS[s.researchTarget].cost) {
            s.lore -= TECHS[s.researchTarget].cost;
            this.grantTech(s.researchTarget);
            s.researchTarget = null;
        }
    }
}
