import { TILE, MAP_OY, DAY_DURATION } from '../../config/gameConstants.js';
import { JOBS, WORKSHOP_JOBS } from '../../content/jobs/index.js';
import GameLogger from '../../GameLogger.js';

// JOB_AFFINITIES and related helpers are defined in UnitManager.js (module scope)
// and don't need to be imported here since assignVocation/pickRole live there.

export default {
    _rebuildDayPlan(u) {
        const n = u.needs ?? {};
        const food = n.food ?? 1, rest = n.rest ?? 1, social = n.social ?? 1, joy = n.joy ?? 1;
        const plan = [];

        const elapsed = this.scene.phase === 'DAY' ? (1.0 - (this.scene.timerMs / DAY_DURATION)) : 1.0;
        
        // Base priorities
        let workPri    = 30;
        let eatPri     = food < 0.7 ? (20 + (1 - food) * 80) : 0;
        // Only propose sleep once genuinely tired (rest < 0.45) — never while comfortably rested.
        let sleepPri   = rest < 0.45 ? (15 + (1 - rest) * 75) : 0;
        let socialPri  = social < 0.7 ? (5 + (1 - social) * 20) : 0;
        let leisurePri = joy < 0.7 ? (3 + (1 - joy) * 15) : 0;

        // Proactive recreation: a long uninterrupted work streak earns a break even when
        // joy/social aren't yet critical, so units don't grind until mood collapses. Traits
        // shift how long they'll grind and what relief they prefer.
        const traits = u.traits ?? [];
        const streak = u._workStreak ?? 0;
        const streakCap = traits.includes('industrious') ? 160
                        : traits.includes('melancholic') ? 70 : 110;   // seconds of work (8-min days)
        if (streak > streakCap) {
            const over    = (streak - streakCap) / streakCap;
            const recBump = Math.min(40, 12 + over * 25);
            leisurePri += recBump * (traits.includes('melancholic') ? 1.3 : 1.0);
            socialPri  += recBump * (traits.includes('sociable')   ? 1.4 : 0.7);
        }
        // Low mood (but not yet collapsed) also pulls toward recreation before a mental break.
        if ((u.mood ?? 1) < 0.45) { leisurePri += 15; socialPri += 10; }

        // --- Time of Day Adjustments ---
        if (this.scene.phase === 'DAY') {
            // Meal times
            if ((elapsed >= 0.23 && elapsed <= 0.28) || // Breakfast
                (elapsed >= 0.48 && elapsed <= 0.53) || // Lunch
                (elapsed >= 0.73 && elapsed <= 0.78)) { // Dinner
                eatPri += 35; 
            }

            // Morning lethargy
            if (elapsed < 0.15) {
                workPri -= 15;
                socialPri += 10;
            }

            // Evening leisure
            if (elapsed > 0.80) {
                workPri -= 20;
                leisurePri += 15;
                socialPri += 10;
            }
            
            // Late night fatigue
            if (elapsed > 0.92) {
                sleepPri += 25;
            }
        } else if (this.scene.phase === 'NIGHT') {
            sleepPri += 50;
            workPri  -= 20;
            // Rested workers gather around a lit campfire before sleep
            const hasLitFire = this.scene.constructs.some(b => b.built && b.type === 'campfire' && b.isLit);
            if (hasLitFire && (n.rest ?? 1) > 0.70) {
                sleepPri -= 35;
                leisurePri += 30;
            }
        }

        // Never propose sleep while comfortably rested — even at night. Time-of-day bumps only
        // nudge an already-tired unit toward bed; sleep exists to recover, not as a ritual.
        if (rest >= 0.45) sleepPri = 0;

        if (eatPri > 0)     plan.push({ intent: 'eat',       priority: eatPri });
        if (sleepPri > 0)   plan.push({ intent: 'sleep',     priority: sleepPri });
                            plan.push({ intent: 'work',      priority: workPri });
        if (socialPri > 0)  plan.push({ intent: 'socialize', priority: socialPri });
        if (leisurePri > 0) plan.push({ intent: 'leisure',   priority: leisurePri });

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
        u._needsAcc = (u._needsAcc ?? 0) + dt;
        if (u._needsAcc < 0.25) return;
        dt = u._needsAcc; u._needsAcc = 0;
        if (!u.needs) u.needs = { food: 1.0, rest: 1.0, social: 0.8, joy: 0.8 };
        const n = u.needs;

        // Food decays while awake; restored by eating
        // Rate halved for the 8-min day so a unit still empties in ~2 full day/night cycles.
        // Sumer civ bonus: 20% slower food decay
        const foodDecay = this.scene.civ === 'sumer' ? 0.00076 : 0.00095;
        if (!u.isSleeping) n.food = Math.max(0, n.food - dt * foodDecay);

        // Rest: decays while awake, recovers while sleeping
        // Passed-out sleep recovers at 35% rate and applies a joy penalty on wake
        if (u.isSleeping) {
            const rate = u._passedOut ? 0.002 : 0.0055;
            n.rest = Math.min(1.0, n.rest + dt * rate);
            if (n.rest >= 0.95) {
                u.isSleeping = false;
                // Exit: step just south of the bed/home so the unit walks out visibly.
                const sleepId = u._sleepConstructId ?? (u.isInside ? u.homeConstructId : null);
                const home = sleepId ? this.scene.constructManager?.getById?.(sleepId) : null;
                if (home) {
                    const hw = home.width ?? 1, hh = home.height ?? 1;
                    u.x = (home.tx + hw / 2) * TILE;
                    u.y = MAP_OY + (home.ty + hh) * TILE - 8;
                }
                u.isInside = false;
                u._sleepConstructId = null;
                if (u._passedOut) {
                    u._passedOut = false;
                    n.joy = Math.max(0, n.joy - 0.30); // slept rough penalty
                }
            }
        } else {
            // Tasks cost stamina: working drains rest faster than idling, so a full work day
            // leaves a unit genuinely tired (ready for bed) by the early night.
            const _REST_NONWORK = new Set(['eat', 'rest_break', 'leisure', 'stroll', 'chat', 'mental_break']);
            const working = !!u.targetNode || (u.taskType && !_REST_NONWORK.has(u.taskType));
            n.rest = Math.max(0, n.rest - dt * (working ? 0.00225 : 0.0015));
        }

        // Social: recovery weighted by relationship quality with nearby units
        let _socialRate = 0, _nearCount = 0;
        for (const w of this.scene.units) {
            if (w === u || w.isEnemy || w.hp <= 0) continue;
            if (Phaser.Math.Distance.Between(u.x, u.y, w.x, w.y) < 64) {
                _socialRate += 0.002 + (u.relations?.[w.id] ?? 0) * 0.0015;
                _nearCount++;
            }
        }
        if (_nearCount > 0) {
            n.social = Math.min(1.0, n.social + dt * Math.min(_socialRate, 0.007));
        } else {
            n.social = Math.max(0, n.social - dt * 0.0006);
        }

        // Joy: decays while working (industrious trait slows drain)
        const isWorking = u.taskType && u.taskType !== 'eat' && !u.isSleeping;
        const joyDrain = (u.traits ?? []).includes('industrious') ? 0.000375 : 0.00075;
        if (isWorking) {
            n.joy = Math.max(0, n.joy - dt * joyDrain);
        } else {
            n.joy = Math.min(1.0, n.joy + dt * 0.0015);
        }

        // Mood: weighted needs + relations bonus − grief penalty ± trait modifiers
        const relVals = Object.values(u.relations ?? {});
        const relBonus = relVals.length
            ? relVals.reduce((a, b) => a + b, 0) / relVals.length * 0.05 : 0;
        const griefPenalty = (u._grief ?? 0) * 0.28;
        const traitMoodMod = (u.traits ?? []).includes('melancholic') ? -0.04 : 0;
        u.mood = Math.max(0, Math.min(1,
            n.food * 0.35 + n.rest * 0.28 + n.social * 0.20 + n.joy * 0.12
            + relBonus - griefPenalty + traitMoodMod));

        // Starvation: food=0 drains HP; warn every 8s
        if (n.food <= 0 && !u.isSleeping) {
            u.hp = Math.max(0, u.hp - dt * 0.25);
            u._starvTimer = (u._starvTimer ?? 0) + dt;
            if (u._starvTimer >= 8) {
                u._starvTimer = 0;
                this.scene.uiManager?.showFloatText?.(u.x, u.y - 20, 'starving!', '#ff4444');
                GameLogger.log('starve', { u: u.name, hp: +u.hp.toFixed(1), role: u.role ?? 'none', task: u.taskType ?? 'none' });
            }
        } else {
            u._starvTimer = 0;
        }

        // Mood collapse: thresholds shifted by trait (resilient=harder to collapse, grumpy=easier)
        const traits = u.traits ?? [];
        const collapseAt = traits.includes('resilient') ? 0.18 : traits.includes('grumpy') ? 0.30 : 0.25;
        const recoverAt  = traits.includes('resilient') ? 0.28 : traits.includes('grumpy') ? 0.42 : 0.35;
        const prevCollapsed = u._moodCollapsed;
        if ((u.mood ?? 1) < collapseAt) u._moodCollapsed = true;
        else if ((u.mood ?? 1) > recoverAt) u._moodCollapsed = false;
        if (u._moodCollapsed && !prevCollapsed) {
            this.scene.uiManager?.showFloatText?.(u.x, u.y - 24, `💔 ${u.name} breaks down!`, '#ff6666');
            u._mentalBreakPending = true;
        }
        if (!u._moodCollapsed && prevCollapsed) {
            u._mentalBreakPending = false;
        }
    },

    _collectWage(u) {
        const workplace = u.taskConstructId
            ? this.scene.constructManager?.getById(u.taskConstructId) : null;
        if (workplace && !workplace.built) return;
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
        // Aging is handled centrally in WorldManager.ageUpUnits (ageYears model); children
        // simply wander near home until they mature into the adult life-stage.
        const home = this.scene.constructManager?.getById(u.homeConstructId);
        if (!home) return;
        const hx = (home.tx + (home.width ?? 1) / 2) * TILE, hy = MAP_OY + (home.ty + (home.height ?? 1) / 2) * TILE;
        const radius = u.age === 0 ? TILE : TILE * 3;
        const dist = Phaser.Math.Distance.Between(u.x, u.y, hx, hy);
        if (dist > radius * 2.5 || Math.random() < 0.004) {
            u.moveTo = { x: hx + Phaser.Math.Between(-radius, radius), y: hy + Phaser.Math.Between(-radius, radius) };
        }
        if (u.moveTo) this.moveToward(u, u.moveTo.x, u.moveTo.y, u.age === 0 ? 3 : 5, dt);
    },

    pickRole(u, time) {
        u.lastSeek = time;
        const priors = u.taskPriorities ?? {}; // 0=disabled, 1-4=priority (1=most urgent)
        const workers = this.scene.units.filter(w => w.type==='worker' && !w.isEnemy && w.hp>0);
        const ctx = {
            cnt: r => { let n = 0; for (const w of workers) if (w.role === r) n++; return n; },
            // Resource "need" = the greater of current storage shortfall and forward-provisioning
            // pressure (population + season + dusk scaled). Folding provisioning in here makes
            // every JOBS.score() forward-looking without touching the individual job files.
            need: res => {
                const cap = this.scene.storageMax[res] || 0;
                const storageFrac = cap > 0 ? 1.0 - Math.min(1.0, (this.scene.resources[res] || 0) / cap) : 0;
                const prov = this.scene.economyManager?.provisioningPressure?.(res, workers.length) ?? 0;
                return Math.max(storageFrac, prov);
            },
            provision: res => this.scene.economyManager?.provisioningPressure?.(res, workers.length) ?? 0,
            constructs: this.scene.constructs,
            units: workers,
            resources: this.scene.resources,
            sheep: this.scene.sheep ?? [],
            domains: this.scene.estateBounds ?? [],
            getEstateAt: (tx, ty) => this.scene.constructManager.getEstateAt(tx, ty),
            growZones: this.scene.zoneManager?.growTiles.size ?? 0,
        };
        const cands = [];
        for (const job of Object.values(JOBS)) {
            if (!job.score) continue;
            const tp = priors[job.id] ?? 3; // unset = normal priority
            if (tp === 0) continue;          // player disabled this job
            let s = job.score(u, ctx);
            if (s <= 0) continue;
            s += this._attrBonus(u, job.id);
            s += this._passionBonus(u, job.skill);
            if (u.vocation) {
                if (job.id === u.vocation) s += 50;
                else if ((this._vocationFallbacks(u.vocation) ?? []).includes(job.id)) s += 25;
            }
            if (u.role === job.id) s += 35; // role stability — reduce thrashing
            s += (5 - tp) * 1000; // priority 1 → +4000 … priority 4 → +1000
            cands.push({ role: job.id, score: s });
        }
        cands.sort((a, b) => b.score - a.score);
        if (cands.length > 0) {
            if (u.role !== cands[0].role)
                GameLogger.log('role', { u: u.name, role: cands[0].role, prev: u.role ?? 'none', score: Math.round(cands[0].score) });
            u.role = cands[0].role;
        } else {
            // Fallback: only use if player hasn't disabled these
            const hasUnbuilt = this.scene.constructs.some(b => !b.built && !b.faction);
            const hasNodes   = this.scene.resNodes?.some(n => n.stock > 0);
            if (hasUnbuilt && u.age >= 2 && (priors['builder'] ?? 3) > 0) u.role = 'builder';
            else if (hasNodes && (priors['forager'] ?? 3) > 0) u.role = 'forager';
        }
    },

    assignVocation(u) {
        let best = null, bestScore = -Infinity;
        for (const [jobId, job] of Object.entries(JOBS)) {
            const score = this._attrBonus(u, jobId) + this._passionBonus(u, job.skill) * 1.5;
            if (score > bestScore) { bestScore = score; best = jobId; }
        }
        u.vocation = best;
    },

    _tickRelations(u, dt) {
        if (!u.relations) u.relations = {};
        u._relTimer = (u._relTimer ?? 0) + dt;
        if (u._relTimer < 4.0) return; // update every 4 real seconds
        u._relTimer = 0;

        // All relations drift slowly toward neutral (memory fades without contact)
        for (const id of Object.keys(u.relations)) {
            u.relations[id] *= 0.996;
            if (Math.abs(u.relations[id]) < 0.005) delete u.relations[id];
        }

        const uTraits = u.traits ?? [];
        const relMult  = uTraits.includes('sociable') ? 1.5 : uTraits.includes('grumpy') ? 0.55 : 1.0;
        const warmMult = uTraits.includes('warm') ? 1.6 : 1.0;

        for (const w of this.scene.units) {
            if (w === u || w.isEnemy || w.hp <= 0 || w.type !== 'worker') continue;
            const dist = Phaser.Math.Distance.Between(u.x, u.y, w.x, w.y);
            let nudge = 0;

            if (dist < 80)                                                      nudge += 0.008;
            if (u.homeConstructId && u.homeConstructId === w.homeConstructId)   nudge += 0.005;
            if (u.spouseId === w.id)                            nudge += 0.010 * warmMult; // spouse
            if (u.fatherId === w.id || u.motherId === w.id)     nudge += 0.006 * warmMult; // parent
            if (w.fatherId === u.id || w.motherId === u.id)     nudge += 0.006 * warmMult; // child

            if ((w.mood ?? 1) < 0.25) nudge -= 0.012;

            if (nudge === 0) continue;
            u.relations[w.id] = Math.max(-1, Math.min(1,
                (u.relations[w.id] ?? 0) + nudge * (nudge > 0 ? relMult : 1.0)));
        }
    },
};
