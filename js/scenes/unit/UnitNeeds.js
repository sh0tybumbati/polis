import { TILE, MAP_OY } from '../../config/gameConstants.js';
import { JOBS, WORKSHOP_JOBS } from '../../content/jobs/index.js';

// JOB_AFFINITIES and related helpers are defined in UnitManager.js (module scope)
// and don't need to be imported here since assignVocation/pickRole live there.

export default {
    _rebuildDayPlan(u) {
        const n = u.needs ?? {};
        const food = n.food ?? 1, rest = n.rest ?? 1, social = n.social ?? 1, joy = n.joy ?? 1;
        const plan = [];

        // Priority = how urgently this need wants to be met right now.
        // eat/sleep can exceed work(30) to preempt it; social/leisure stay below so work wins.
        if (food < 0.7)   plan.push({ intent: 'eat',       priority: 20 + (1 - food)   * 80 });
        if (rest < 0.6)   plan.push({ intent: 'sleep',     priority: 15 + (1 - rest)   * 75 });
                          plan.push({ intent: 'work',       priority: 30 });
        if (social < 0.7) plan.push({ intent: 'socialize', priority:  5 + (1 - social) * 20 });
        if (joy < 0.7)    plan.push({ intent: 'leisure',   priority:  3 + (1 - joy)    * 15 });

        plan.sort((a, b) => b.priority - a.priority);
        u.dayPlan = plan;
        u.currentIntent = plan[0]?.intent ?? 'work';
    },

    _handleSocializeIntent(u) {
        // Walk toward the nearest awake adult; proximity recovery handled in _tickNeeds
        const target = this.scene.units.reduce((best, w) => {
            if (w === u || w.isEnemy || w.hp <= 0 || w.age < 2 || w.isSleeping) return best;
            const d = Phaser.Math.Distance.Between(u.x, u.y, w.x, w.y);
            return (!best || d < best.d) ? { w, d } : best;
        }, null);

        if (target && target.d > 24) {
            u.moveTo = {
                x: target.w.x + Phaser.Math.Between(-16, 16),
                y: target.w.y + Phaser.Math.Between(-10, 10),
            };
        }
        // If already close enough, just idle (joy/social recover passively via _tickNeeds)
    },

    _tickNeeds(u, dt) {
        if (!u.needs) u.needs = { food: 1.0, rest: 1.0, social: 0.8, joy: 0.8 };
        const n = u.needs;

        // Food decays while awake; restored by eating
        // Rate: empties in ~3 full day/night cycles (9 min real time)
        if (!u.isSleeping) n.food = Math.max(0, n.food - dt * 0.0000019);

        // Rest: decays while awake, recovers while sleeping at home
        // Rate: needs sleep after ~2 day cycles; recovers fully in ~1 night
        if (u.isSleeping) {
            n.rest = Math.min(1.0, n.rest + dt * 0.000011);
            if (n.rest >= 0.95) u.isSleeping = false; // wake up
        } else {
            n.rest = Math.max(0, n.rest - dt * 0.0000028);
        }

        // Social: decays slowly; partially recovered by proximity to other villagers
        const nearby = this.scene.units.filter(w =>
            w !== u && !w.isEnemy && w.hp > 0 &&
            Phaser.Math.Distance.Between(u.x, u.y, w.x, w.y) < 64).length;
        if (nearby > 0) {
            n.social = Math.min(1.0, n.social + dt * 0.000004 * Math.min(nearby, 3));
        } else {
            n.social = Math.max(0, n.social - dt * 0.0000012);
        }

        // Joy: decays while working, recovers slightly when social need is met
        const isWorking = u.taskType && u.taskType !== 'eat' && !u.isSleeping;
        if (isWorking) {
            n.joy = Math.max(0, n.joy - dt * 0.0000015);
        } else {
            n.joy = Math.min(1.0, n.joy + dt * 0.000003);
        }

        // Mood: weighted average of needs
        u.mood = n.food * 0.35 + n.rest * 0.30 + n.social * 0.20 + n.joy * 0.15;
    },

    _collectWage(u) {
        const workplace = u.taskBldgId
            ? this.scene.buildings.find(b => b.id === u.taskBldgId && b.built) : null;
        const isProductionRole = u.role in WORKSHOP_JOBS;
        const isNodeWorker = u.role === 'woodcutter' || u.role === 'miner' || u.role === 'forager';

        if (isProductionRole && workplace?.wagePending?.[u.id]) {
            for (const [res, amt] of Object.entries(workplace.wagePending[u.id])) {
                if (amt > 0) {
                    u.carrying[res] = (u.carrying[res] ?? 0) + amt;
                    this.scene.uiManager.showFloatText(u.x, u.y - 16, `💰 ${amt} ${res}`, '#ffee88');
                }
            }
            workplace.wagePending[u.id] = {};
        } else if (workplace?.isPublic || isNodeWorker) {
            const WAGE_FOOD = ['Food.Grain.Wheat.Bread', 'Food.Meat.Venison.Sausages', 'Food.Grain.Wheat.Flour', 'Food.Produce.Olive', 'Food.Grain.Wheat', 'Food.Meat.Venison'];
            let paid = false;
            for (const food of WAGE_FOOD) {
                if ((this.scene.resources[food] ?? 0) >= 1) {
                    this.scene.economyManager.takeFromCommons(food, 1);
                    u.carrying[food] = (u.carrying[food] ?? 0) + 1;
                    this.scene.uiManager.showFloatText(u.x, u.y - 16, `💰 ${food}`, '#ffee88');
                    paid = true;
                    break;
                }
            }
            if (!paid) {
                u.wageDebt = (u.wageDebt ?? 0) + 1;
                this.scene.uiManager.showFloatText(u.x, u.y - 16, 'debt +1 food', '#ff8888');
            }
            if (u.commission) {
                for (const [res, amt] of Object.entries(u.commission)) {
                    if (amt > 0) {
                        u.carrying[res] = (u.carrying[res] ?? 0) + amt;
                        this.scene.uiManager.showFloatText(u.x, u.y - 24, `+${amt} ${res} comm.`, '#88eeaa');
                    }
                }
                u.commission = {};
            }
        }
    },

    tickChild(u, dt) {
        // Age progression: child(0) → youth(1) after 2 min, youth(1) → adult(2) after 3 min
        u.ageTimer = (u.ageTimer ?? 0) + dt;
        const threshold = u.age === 0 ? 120000 : 180000;
        if (u.ageTimer >= threshold) {
            u.age++;
            u.ageTimer = 0;
            this.redrawUnit(u);
            const stage = u.age === 1 ? 'youth' : 'adult';
            this.scene.uiManager.showFloatText(u.x, u.y - 20, `${u.name} is now a ${stage}`, '#ddcc88');
            if (u.age === 2) this.assignVocation(u);
            return;
        }

        const home = this.scene.buildings.find(b => b.id === u.homeBldgId);
        if (!home) return;
        const hx = (home.tx + home.size / 2) * TILE, hy = MAP_OY + (home.ty + home.size / 2) * TILE;
        const radius = u.age === 0 ? TILE : TILE * 3;
        const dist = Phaser.Math.Distance.Between(u.x, u.y, hx, hy);
        if (dist > radius * 2.5 || Math.random() < 0.004) {
            u.moveTo = { x: hx + Phaser.Math.Between(-radius, radius), y: hy + Phaser.Math.Between(-radius, radius) };
        }
        if (u.moveTo) this.moveToward(u, u.moveTo.x, u.moveTo.y, u.age === 0 ? 3 : 5, dt);
    },

    pickRole(u, time) {
        u.lastSeek = time;
        const workers = this.scene.units.filter(w => w.type==='worker' && !w.isEnemy && w.hp>0);
        const ctx = {
            cnt: r => workers.filter(w => w.role===r).length,
            need: res => {
                const cap = this.scene.storageMax[res] || 0;
                if (cap <= 0) return 0;
                return 1.0 - Math.min(1.0, (this.scene.resources[res] || 0) / cap);
            },
            buildings: this.scene.buildings,
            units: workers,
            resources: this.scene.resources,
            sheep: this.scene.sheep ?? [],
            domains: this.scene.domains ?? [],
            getDomainAt: (tx, ty) => this.scene.buildingManager.getDomainAt(tx, ty),
        };
        const cands = [];
        for (const job of Object.values(JOBS)) {
            if (!job.score) continue;
            let s = job.score(u, ctx);
            if (s <= 0) continue;
            s += this._attrBonus(u, job.id);
            s += this._passionBonus(u, job.skill);
            if (u.vocation) {
                if (job.id === u.vocation) s += 50;
                else if ((this._vocationFallbacks(u.vocation) ?? []).includes(job.id)) s += 25;
            }
            if (u.role === job.id) s += 35; // role stability — reduce thrashing
            cands.push({ role: job.id, score: s });
        }
        cands.sort((a, b) => b.score - a.score);
        if (cands.length > 0) u.role = cands[0].role;
    },

    assignVocation(u) {
        let best = null, bestScore = -Infinity;
        for (const [jobId, job] of Object.entries(JOBS)) {
            const score = this._attrBonus(u, jobId) + this._passionBonus(u, job.skill) * 1.5;
            if (score > bestScore) { bestScore = score; best = jobId; }
        }
        u.vocation = best;
    },
};
