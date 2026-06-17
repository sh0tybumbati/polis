/**
 * rigAnim.js — part-transform sources for the rig renderer (js/engine/renderRig.js).
 *
 * Two ways a part group can move:
 *   1. Convention   — parts named with the standard limb slots (legL/legR/armL/armR/
 *                     head/torso/tail) auto-animate from the unit's walkPhase, reusing
 *                     the same swing feel as the hand-coded worker (worker.js limbs).
 *   2. Keyframes    — an authored clip track overrides the convention for that part.
 *
 * A transform is { rot, x, y, sx, sy } applied around the part's pivot.
 */

const REST = { rot: 0, x: 0, y: 0, sx: 1, sy: 1 };

// Which standard slots get convention motion. Unknown names ⇒ static (returns null).
const LIMB_SLOTS = new Set(['legL', 'legR', 'armL', 'armR', 'head', 'torso', 'tail']);

export function isConventionPart(name) {
    return LIMB_SLOTS.has(name);
}

/**
 * Convention transform for a standard limb slot. Returns null for non-standard names
 * (those stay static unless an authored clip drives them).
 */
export function conventionPartTransform(name, { walkPhase = 0, moving = false, working = false, facing = 'south' } = {}) {
    if (!LIMB_SLOTS.has(name)) return null;
    const ph = walkPhase;

    if (working) {
        // Both arms chop; legs plant; subtle torso/head bob.
        const chop = -(0.35 + Math.sin(ph * 1.4) * 0.30);
        switch (name) {
            case 'armL': case 'armR': return { ...REST, rot: chop };
            case 'torso':             return { ...REST, y: Math.sin(ph * 1.4) * 0.4 };
            case 'head':              return { ...REST, rot: Math.sin(ph * 1.4) * 0.05 };
            default:                  return { ...REST };   // legs still
        }
    }

    if (moving) {
        const sw = Math.sin(ph);                 // primary gait phase
        const bob = -Math.abs(Math.sin(ph)) * 0.6;

        // Facing toward/away from the camera (north/south): a left-right swing reads as wrong, so
        // limbs step up-and-down instead — each leg/arm lifts on alternate halves of the gait.
        if (facing === 'north' || facing === 'south') {
            const LEG = 1.8, ARM = 0.9;
            switch (name) {
                case 'legL': return { ...REST, y: -Math.max(0,  sw) * LEG };
                case 'legR': return { ...REST, y: -Math.max(0, -sw) * LEG };
                case 'armL': return { ...REST, y: -Math.max(0, -sw) * ARM };  // arms counter the legs
                case 'armR': return { ...REST, y: -Math.max(0,  sw) * ARM };
                case 'torso': return { ...REST, y: bob };
                case 'head':  return { ...REST, y: bob };
                case 'tail':  return { ...REST, y: -Math.abs(sw) * 1.0 };
                default:      return { ...REST };
            }
        }

        // Side profile (east/west): swing limbs fore-and-aft about the hip/shoulder.
        switch (name) {
            case 'legL': return { ...REST, rot:  sw * 0.55 };
            case 'legR': return { ...REST, rot: -sw * 0.55 };
            case 'armL': return { ...REST, rot: -sw * 0.45 };  // arms counter-swing legs
            case 'armR': return { ...REST, rot:  sw * 0.45 };
            case 'torso': return { ...REST, y: bob };
            case 'head':  return { ...REST, y: bob, rot: sw * 0.04 };
            case 'tail':  return { ...REST, rot: Math.sin(ph * 1.3) * 0.25 };
            default:      return { ...REST };
        }
    }

    // Idle — gentle breathing only.
    const br = Math.sin(ph * 0.5) * 0.03;
    switch (name) {
        case 'torso': return { ...REST, y: br };
        case 'head':  return { ...REST, y: br * 0.5 };
        case 'tail':  return { ...REST, rot: Math.sin(ph * 0.5) * 0.08 };
        default:      return { ...REST };
    }
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Sample an authored clip's track for one part at time tSec.
 *   clip — { fps, loop, length, tracks:{ partName:[ {t,rot,x,y,sx,sy}, … ] } }
 * Returns { rot, x, y, sx, sy } or null if the clip has no track for this part.
 * Keys may omit fields (default to REST values); keys are sorted by `t` (seconds).
 */
export function sampleClip(clip, partName, tSec) {
    if (!clip || !clip.tracks) return null;
    const track = clip.tracks[partName];
    if (!track || track.length === 0) return null;

    const length = clip.length ?? 1;
    let t = tSec;
    if (clip.loop !== false && length > 0) t = ((t % length) + length) % length;
    else t = Math.max(0, Math.min(length, t));

    const keys = track;                            // assumed sorted by .t ascending
    if (t <= keys[0].t) return fill(keys[0]);
    const last = keys[keys.length - 1];
    if (t >= last.t) return fill(last);

    for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i], b = keys[i + 1];
        if (t >= a.t && t <= b.t) {
            const span = b.t - a.t;
            const f = span > 0 ? (t - a.t) / span : 0;
            const A = fill(a), B = fill(b);
            return {
                rot: lerp(A.rot, B.rot, f),
                x:   lerp(A.x,   B.x,   f),
                y:   lerp(A.y,   B.y,   f),
                sx:  lerp(A.sx,  B.sx,  f),
                sy:  lerp(A.sy,  B.sy,  f),
            };
        }
    }
    return fill(last);
}

function fill(k) {
    return {
        rot: k.rot ?? 0, x: k.x ?? 0, y: k.y ?? 0,
        sx: k.sx ?? 1, sy: k.sy ?? 1,
    };
}

/**
 * Resolve the final transform for a part: authored clip wins, else convention, else rest.
 */
export function resolvePartTransform(rig, part, ctx) {
    const clip = ctx.clip && rig.clips ? rig.clips[ctx.clip] : null;
    const sampled = sampleClip(clip, part.name, ctx.clipTime ?? 0);
    if (sampled) return sampled;
    const conv = conventionPartTransform(part.name, ctx);
    return conv ?? { ...REST };
}

export { REST };
