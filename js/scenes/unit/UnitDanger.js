/**
 * UnitDanger — colonist response to wild predators / hostile animals.
 *
 * Threats (NatureManager wolves + hostile boar/aurochs) used to just subtract hp while colonists
 * stood still. Now each colonist, when a threat is near, either FIGHTS (armed units, or brave ones by
 * str/con) or FLEES to the nearest shelter (a building a wolf can't enter — NatureManager skips
 * isInside units). Soldiers additionally defend the colony proactively (see UnitManager.tickPlayer).
 *
 * Courage uses the attribute scale where 10 = human average; most colonists are below that, so the
 * timid run while strong/armed ones turn and fight, and anyone cornered makes a last stand.
 */

import { TILE, MAP_OY } from '../../config/gameConstants.js';
import { CONSTRUCTS } from '../../content/constructs/index.js';
import { ANIMALS } from '../../content/animals/index.js';

const DANGER_R = 6.5 * TILE;     // colonist notices a threat within this
const DEFEND_R = 13 * TILE;      // soldier perimeter for proactive defence
const ATK_CD   = 1000;           // ms between a colonist's swings at an animal

export default {
    // True if this unit carries a weapon (soldier loadout) or has real reach/attack.
    _unitArmed(u) {
        const ld = u.loadout ?? {};
        return !!(ld.spear || ld.club || ld.bow || ld.sling || (u.range ?? 0) > 0 || (u.atk ?? 0) > 1);
    },

    // Nearest currently-hostile animal within r. Wolves are always a threat; boar/aurochs only when
    // engaged (aggroTarget) or aggressive/territorial within their own range.
    _nearestThreat(u, r) {
        let best = null, bd = r;
        const test = (a, hostile) => {
            if (!a || a.isDead || (a.hp ?? 1) <= 0 || !hostile) return;
            const d = Phaser.Math.Distance.Between(u.x, u.y, a.x, a.y);
            if (d < bd) { bd = d; best = a; }
        };
        for (const w of (this.scene.wolf ?? [])) test(w, true);
        for (const sp of ['boar', 'aurochs']) {
            const def = ANIMALS[sp];
            for (const a of (this.scene[sp] ?? [])) {
                const d = Phaser.Math.Distance.Between(u.x, u.y, a.x, a.y);
                const hostile = a.aggroTarget != null
                    || (def.aggressive && d <= (def.aggroRadius ?? 2.5 * TILE))
                    || ((def.territorialRadius ?? 0) > 0 && d <= def.territorialRadius);
                test(a, hostile);
            }
        }
        return best ? { animal: best, dist: bd } : null;
    },

    _threatCount(u, r) {
        let n = 0;
        for (const w of (this.scene.wolf ?? [])) if (!w.isDead && Phaser.Math.Distance.Between(u.x, u.y, w.x, w.y) < r) n++;
        return Math.max(1, n);
    },

    // 0..1 nerve. str/con around the 10-average baseline, +armed, −hurt, −outnumbered.
    _unitCourage(u, threatCount) {
        const at = u.attributes;
        const stat = at ? Phaser.Math.Clamp(((at.str ?? 5) + (at.con ?? 5)) / 2 / 10, 0, 1.2) : 1.0;
        const hpFrac = Phaser.Math.Clamp(u.hp / (u.maxHp || u.hp || 1), 0, 1);
        const armed = this._unitArmed(u);
        return stat * 0.6 + (armed ? 0.4 : 0) - 0.3 * (1 - hpFrac) - 0.15 * (threatCount - 1);
    },

    // Charge then bite/strike an animal; kill leaves a carcass.
    _fightThreat(u, a, time, dt) {
        if (!a || a.isDead) return;
        u._panic = false;
        const reach = (u.range ?? 0) > 0 ? u.range : TILE * 0.9;
        const d = Phaser.Math.Distance.Between(u.x, u.y, a.x, a.y);
        if (d <= reach + 4) {
            if (time - (u.lastAtk ?? 0) > ATK_CD) {
                u.lastAtk = time;
                const dmg = Math.max(1, u.atk ?? 1);
                a.hp = (a.hp ?? 1) - dmg;
                this.scene.uiManager?.showFloatText?.(a.x, a.y - 14, `-${dmg}`, '#ffcc44');
                if (a.hp <= 0) {
                    this.scene.natureManager?._killAnimal?.(a);
                    this.scene.uiManager?.showFloatText?.(a.x, a.y - 18, 'slain!', '#ffaa44');
                }
            }
            u.vx = 0; u.vy = 0;
        } else {
            this.moveToward(u, a.x, a.y, reach, dt);
        }
    },

    // Nearest safe building (home/camp/townhall) the unit can shelter in.
    _nearestShelter(u) {
        const cm = this.scene.constructManager;
        if (!cm?.constructs) return null;
        let best = null, bd = Infinity;
        for (const b of cm.constructs) {
            if (!b.built || b.faction) continue;
            if (!(CONSTRUCTS[b.type]?.isHomeType || b.type === 'townhall' || b.type === 'camp')) continue;
            const cx = (b.tx + (b.width ?? 1) / 2) * TILE, cy = MAP_OY + (b.ty + (b.height ?? 1) / 2) * TILE;
            const d = Phaser.Math.Distance.Between(u.x, u.y, cx, cy);
            if (d < bd) { bd = d; best = { b, cx, cy, d }; }
        }
        return best;
    },

    _fleeToSafety(u, threat, time, dt) {
        u._panic = true;
        const sh = this._nearestShelter(u);
        if (sh) {
            if (sh.d <= TILE * 1.5) {                 // reached shelter — safe inside, stop
                u.x = sh.cx; u.y = sh.cy;
                u.isInside = true; u._sheltered = true;
                u.vx = 0; u.vy = 0; u.currentPath = null;
                u.taskType = null; u.targetNode = null;
                return;
            }
            this.moveToward(u, sh.cx, sh.cy, TILE * 0.6, dt);
            return;
        }
        // No shelter: run directly away from the threat (bounds-clamped in moveToward → finite).
        const ang = Math.atan2(u.y - threat.animal.y, u.x - threat.animal.x);
        this.moveToward(u, u.x + Math.cos(ang) * 5 * TILE, u.y + Math.sin(ang) * 5 * TILE, 4, dt);
    },

    // Returns true if danger took over this unit's turn (caller should stop normal behaviour).
    _dangerResponse(u, time, dt) {
        // Already sheltered: stay until the coast is clear, then resume.
        if (u._sheltered) {
            if (this._nearestThreat(u, DANGER_R)) { u.vx = 0; u.vy = 0; return true; }
            u._sheltered = false; u.isInside = false; u._panic = false;
            return false;
        }
        const threat = this._nearestThreat(u, DANGER_R);
        if (!threat) { u._panic = false; return false; }

        const armed = this._unitArmed(u);
        const hpFrac = Phaser.Math.Clamp(u.hp / (u.maxHp || u.hp || 1), 0, 1);
        const courage = this._unitCourage(u, this._threatCount(u, DANGER_R));
        let willFight = armed ? hpFrac > 0.2 : (courage > 0.55 && hpFrac > 0.35);
        // Cornered: caught in melee with no quick escape → last stand.
        if (!willFight && threat.dist <= TILE * 1.1) willFight = true;

        if (willFight) this._fightThreat(u, threat.animal, time, dt);
        else this._fleeToSafety(u, threat, time, dt);
        return true;
    },
};
