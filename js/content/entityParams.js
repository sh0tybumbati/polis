/**
 * entityParams.js — schema for the entity editor's parameter inspector.
 *
 * Describes the tunable scalar fields on an entity def (animal or unit). The editor renders one
 * control per applicable field; values are read from / written to the def + a localStorage override
 * (see entityOverrides.js). Fields flagged `wired: false` are editable & persisted now but not yet
 * consumed by the sim — that's the deliberate "behaviour next" pass.
 *
 *   kind:  'num' | 'int' | 'bool' | 'enum' | 'key'
 *   applies: 'animal' | 'unit' | 'both'
 *   options: enum choices (kind === 'enum')
 *   keyset:  which item-key list to cycle (kind === 'key')
 *   def:     fallback when the def doesn't define the field yet
 */

export const ENTITY_PARAM_SCHEMA = [
    // ── Combat / core ───────────────────────────────────────────────────────────
    { key: 'hp',          label: 'HP',            kind: 'num', min: 1,  max: 60,  step: 1,    applies: 'both',   group: 'Core',   wired: true,  def: 3 },
    { key: 'speed',       label: 'Speed',         kind: 'num', min: 0,  max: 200, step: 2,    applies: 'both',   group: 'Core',   wired: true,  def: 50 },
    { key: 'scale',       label: 'Scale',         kind: 'num', min: 0.3, max: 3,  step: 0.05, applies: 'animal', group: 'Core',   wired: true,  def: 1 },
    { key: 'atk',         label: 'Attack',        kind: 'num', min: 0,  max: 30,  step: 1,    applies: 'both',   group: 'Core',   wired: true,  def: 0 },
    { key: 'range',       label: 'Range (px)',    kind: 'num', min: 0,  max: 240, step: 4,    applies: 'unit',   group: 'Core',   wired: true,  def: 24 },

    // ── Population / drops ──────────────────────────────────────────────────────
    { key: 'maxCount',    label: 'Max count',     kind: 'int', min: 0,  max: 40,  step: 1,    applies: 'animal', group: 'Spawn',  wired: true,  def: 8 },
    { key: 'breedRadius', label: 'Breed radius',  kind: 'num', min: 0,  max: 400, step: 16,   applies: 'animal', group: 'Spawn',  wired: true,  def: 128 },
    { key: 'meat',        label: 'Meat drop',     kind: 'int', min: 0,  max: 30,  step: 1,    applies: 'animal', group: 'Drops',  wired: true,  def: 0 },
    { key: 'hide',        label: 'Hide drop',     kind: 'int', min: 0,  max: 12,  step: 1,    applies: 'animal', group: 'Drops',  wired: true,  def: 0 },
    { key: 'meatKey',     label: 'Meat item',     kind: 'key', keyset: 'meat',                applies: 'animal', group: 'Drops',  wired: true,  def: 'Food.Meat.Venison' },
    { key: 'hideKey',     label: 'Hide item',     kind: 'key', keyset: 'hide',                applies: 'animal', group: 'Drops',  wired: true,  def: 'Textile.Hide.Deer' },

    // ── Senses / aggression (existing-wired radii) ──────────────────────────────
    { key: 'fleeRadius',  label: 'Flee radius',   kind: 'num', min: 0,  max: 400, step: 16,   applies: 'animal', group: 'Senses', wired: true,  def: 96 },
    { key: 'aggroRadius', label: 'Aggro radius',  kind: 'num', min: 0,  max: 400, step: 16,   applies: 'animal', group: 'Senses', wired: true,  def: 80 },
    { key: 'huntRadius',  label: 'Hunt radius',   kind: 'num', min: 0,  max: 600, step: 16,   applies: 'animal', group: 'Senses', wired: true,  def: 0 },
    { key: 'atkRange',    label: 'Attack range',  kind: 'num', min: 0,  max: 120, step: 4,    applies: 'animal', group: 'Senses', wired: true,  def: 28 },

    // ── Behaviour (editable now, wired in the next pass) ────────────────────────
    { key: 'diet',           label: 'Diet',            kind: 'enum', options: ['herbivore', 'omnivore', 'carnivore'], applies: 'animal', group: 'Behaviour', wired: false, def: 'herbivore' },
    { key: 'fightOrFlight',  label: 'When attacked',   kind: 'enum', options: ['flee', 'fight'],                       applies: 'animal', group: 'Behaviour', wired: false, def: 'flee' },
    { key: 'aggroChancePct', label: 'Aggro chance %',  kind: 'int',  min: 0, max: 100, step: 5,                        applies: 'animal', group: 'Behaviour', wired: false, def: 0 },
    { key: 'packCohesion',   label: 'Pack cohesion',   kind: 'num',  min: 0, max: 1,   step: 0.05,                     applies: 'animal', group: 'Behaviour', wired: false, def: 0 },
    { key: 'activeCycle',    label: 'Active cycle',    kind: 'enum', options: ['diurnal', 'nocturnal', 'always'],      applies: 'animal', group: 'Behaviour', wired: false, def: 'always' },
    { key: 'territorialRadius', label: 'Territory rad', kind: 'num', min: 0, max: 400, step: 16,                       applies: 'animal', group: 'Behaviour', wired: false, def: 0 },

    // ── Life-cycle (editable now, wired next) ───────────────────────────────────
    { key: 'lifespanDays',        label: 'Lifespan (d)',  kind: 'int', min: 0, max: 200, step: 5, applies: 'animal', group: 'Life', wired: false, def: 0 },
    { key: 'litterSize',          label: 'Litter size',   kind: 'int', min: 1, max: 8,   step: 1, applies: 'animal', group: 'Life', wired: false, def: 1 },
    { key: 'timeToAdulthoodDays', label: 'Adult age (d)', kind: 'int', min: 0, max: 60,  step: 1, applies: 'animal', group: 'Life', wired: false, def: 0 },

    // ── Domestication ───────────────────────────────────────────────────────────
    { key: 'tameable',  label: 'Tameable',  kind: 'bool',                                  applies: 'animal', group: 'Tame', wired: false, def: false },
    { key: 'tameCost',  label: 'Tame cost', kind: 'int', min: 0, max: 20, step: 1,         applies: 'animal', group: 'Tame', wired: false, def: 1 },
];

// Item-key choices the 'key' fields cycle through (extend as new SKUs are added).
export const KEY_CHOICES = {
    meat: ['Food.Meat.Venison', 'Food.Meat.Pork', 'Food.Meat.Beef', 'Food.Meat.Wolf'],
    hide: ['Textile.Hide.Deer', 'Textile.Hide.Boar', 'Textile.Hide.Aurochs', 'Textile.Hide.Wolf'],
};

// The full set of scalar param keys (used to snapshot a def's editable values).
export const PARAM_KEYS = ENTITY_PARAM_SCHEMA.map(f => f.key);

/** Pull the editable scalar params off a def, falling back to schema defaults. */
export function paramsFromDef(def, kind /* 'animal' | 'unit' */) {
    const out = {};
    for (const f of ENTITY_PARAM_SCHEMA) {
        if (f.applies !== 'both' && f.applies !== kind) continue;
        out[f.key] = def?.[f.key] ?? f.def;
    }
    return out;
}
