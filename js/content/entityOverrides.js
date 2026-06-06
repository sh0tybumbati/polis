/**
 * entityOverrides.js — runtime override layer for entity visuals (rigs) and scalar params.
 *
 * The entity editor (SpriteEditorScene) saves edits here instead of (or in addition to) exporting
 * source. Overrides live in localStorage and are applied over the static ES-module defs at startup,
 * so edits take effect live without a rebuild:
 *   • rig    → replaces SPRITES[id] (draws read SPRITES[id] each frame, so visuals update live)
 *   • params → Object.assign onto ANIMALS[id] / UNITS[id] (already-consumed scalars take effect
 *              immediately; the "behaviour next" params merge in but stay inert until wired)
 *
 * Store shape:  localStorage['entityOverrides'] = { [id]: { rig?: <rigObject>, params?: {…scalars} } }
 */

const KEY = 'entityOverrides';

export function getOverrides() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (e) { return {}; }
}

function writeOverrides(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* quota */ }
}

/** Merge an override for one entity id. Pass { rig } and/or { params }. */
export function saveOverride(id, { rig, params } = {}) {
    const store = getOverrides();
    const cur = store[id] || {};
    if (rig)    cur.rig = rig;
    if (params) cur.params = { ...(cur.params || {}), ...params };
    store[id] = cur;
    writeOverrides(store);
    return cur;
}

export function clearOverride(id) {
    const store = getOverrides();
    delete store[id];
    writeOverrides(store);
}

/**
 * Apply all saved overrides over the live registries. Call once at startup (after the registries
 * are imported) and again whenever the editor saves so the change shows without a reload.
 * Mutates the registry objects in place.
 */
export function applyEntityOverrides(SPRITES, ANIMALS, UNITS) {
    const store = getOverrides();
    for (const [id, ov] of Object.entries(store)) {
        if (ov.rig && SPRITES) SPRITES[id] = ov.rig;
        if (ov.params) {
            const target = (ANIMALS && ANIMALS[id]) || (UNITS && UNITS[id]);
            if (target) Object.assign(target, ov.params);
        }
    }
}
