/**
 * genetics.js — colour utilities + animal phenotype generation/inheritance.
 *
 * Humans already have a phenotype system in js/config/gameConstants.js (randomPhenotype /
 * blendPhenotype / inheritHairStyle). This module adds the animal side and small colour helpers
 * shared by the rig draws. An animal phenotype is:
 *   { coat: 0xRRGGBB, sizeGene: ~0.7–1.4, marking: '<one of def.genetics.markings>', morph }
 * morph ∈ 'none' | 'albino' | 'melanistic' | 'giant'.
 *
 * Per-species ranges live on `def.genetics = { coat, coatJitter, sizeVar, markings, morphRate }`.
 */

const clampByte = v => Math.max(0, Math.min(255, Math.round(v)));
const chan = c => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
const rgb = (r, g, b) => (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Darken a colour when the animal is hungry (keeps the old "hungry dims the coat" cue).
export function dim(col, hungry, f = 0.78) {
    if (!hungry) return col;
    const [r, g, b] = chan(col);
    return rgb(r * f, g * f, b * f);
}

// Random per-channel jitter around a base colour.
export function jitterColor(col, amt = 16) {
    const [r, g, b] = chan(col);
    const j = () => Math.floor(Math.random() * (2 * amt + 1)) - amt;
    return rgb(r + j(), g + j(), b + j());
}

// Average two colours with a little jitter (parent → child blend).
export function blendColor(a, b, jt = 8) {
    const [r1, g1, b1] = chan(a), [r2, g2, b2] = chan(b);
    const j = () => Math.floor(Math.random() * (2 * jt + 1)) - jt;
    return rgb((r1 + r2) / 2 + j(), (g1 + g2) / 2 + j(), (b1 + b2) / 2 + j());
}

const clampSize = s => Math.max(0.7, Math.min(1.4, s));

function applyMorph(morph, coat, sizeGene) {
    if (morph === 'albino')     return { coat: 0xe8e0d4, sizeGene };
    if (morph === 'melanistic') { const [r, g, b] = chan(coat); return { coat: rgb(r * 0.32, g * 0.32, b * 0.34), sizeGene }; }
    if (morph === 'giant')      return { coat, sizeGene: clampSize(sizeGene + 0.3) };
    return { coat, sizeGene };
}

function rollMorph(g) {
    return Math.random() < (g.morphRate ?? 0) ? pick(['albino', 'melanistic', 'giant']) : 'none';
}

export function randomAnimalPheno(def) {
    const g = def?.genetics ?? {};
    let coat = jitterColor(g.coat ?? 0x808080, g.coatJitter ?? 16);
    let sizeGene = clampSize(1 + (Math.random() * 2 - 1) * (g.sizeVar ?? 0.12));
    const marking = pick(g.markings ?? ['plain']);
    const morph = rollMorph(g);
    ({ coat, sizeGene } = applyMorph(morph, coat, sizeGene));
    return { coat, sizeGene, marking, morph };
}

export function blendAnimalPheno(def, a, b) {
    if (!a || !b) return randomAnimalPheno(def);
    const g = def?.genetics ?? {};
    let coat = blendColor(a.coat, b.coat);
    let sizeGene = clampSize((a.sizeGene + b.sizeGene) / 2 + (Math.random() * 0.1 - 0.05));
    const marking = Math.random() < 0.85 ? pick([a.marking, b.marking]) : pick(g.markings ?? ['plain']);
    const morph = rollMorph(g);   // rare morphs surface fresh at birth too
    ({ coat, sizeGene } = applyMorph(morph, coat, sizeGene));
    return { coat, sizeGene, marking, morph };
}
