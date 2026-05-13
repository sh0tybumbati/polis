import { VET_LEVELS, CONSTRUCT_VOLUME, UNIT_NAMES } from '../../config/gameConstants.js';
import { ITEMS } from '../../content/items/index.js';
import { WORKSHOP_JOBS } from '../../content/jobs/index.js';
import { CONSTRUCTS, computeBuildCost } from '../../content/constructs/index.js';

export default {
    _renderInfoPane() {
        this._clearInfo();
        const { INFO_W, PANEL_H, KEY_H, panelY } = this.L;
        const W = INFO_W - 2, H = PANEL_H - KEY_H;
        const ox = 0, oy = panelY + KEY_H;
        const pad = 8;
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy);

        if (this.scene.selectedConstruct) {
            this._renderConstructInfo(ox, oy, W, H, pad);
        } else if (sel.length > 0) {
            this._renderUnitInfo(sel, ox, oy, W, H, pad);
        } else if (this.scene.selectedNode) {
            this._renderNodeInfo(ox, oy, W, H, pad);
        } else if (this.scene.selectedZoneTile) {
            this._renderZoneInfo(ox, oy, W, H, pad);
        } else {
            this._renderIdleInfo(ox, oy, W, H, pad);
        }
    },

    _renderConstructInfo(ox, oy, W, H, pad) {
        const b   = this.scene.selectedConstruct;
        const def = CONSTRUCTS[b.type];

        if ((b.type === 'house' || b.type === 'townhall') && b.built) {
            this._renderOikosInfo(b, ox, oy, W, H, pad);
            return;
        }

        // Non-house constructs within an oikos domain → show family panel
        if (b.built && b.domainId) {
            const dom   = this.scene.domains.find(d => d.id === b.domainId);
            const house = dom ? this.scene.constructs.find(h => h.id === dom.houseConstructId && h.built) : null;
            if (house) { this._renderOikosInfo(house, ox, oy, W, H, pad); return; }
        }

        const TH   = 22;
        const tabs = b.built ? ['Info', 'Workers', 'Inv'] : ['Info'];
        if (!tabs.includes(this._constructTab)) this._constructTab = 'Info';
        this._infTabBar(ox, oy, W, tabs, this._constructTab,
            t => { this._constructTab = t; this.updateUI(); });

        const cy = oy + TH;
        const ch = H - TH;
        this._infCard(ox + 2, cy, W - 4, ch - 2);

        // Sticky header
        this._infTxt(ox + pad, cy + 4, def.label, { fontSize: this._fs(12), color: '#c8a030' });

        if (!b.built) {
            const barW = W - pad * 2 - 4;
            const remaining = Object.values(b.resNeeded ?? {}).reduce((s, v) => s + v, 0);
            let ratio, barCol, phaseLabel;
            if (remaining > 0) {
                const totalCost = Object.values(computeBuildCost(b.type)).reduce((s, v) => s + v, 0);
                ratio = totalCost > 0 ? Math.max(0, 1 - remaining / totalCost) : 0;
                barCol = 0xff8833;
                const needsStr = Object.entries(b.resNeeded ?? {}).filter(([, n]) => n > 0)
                    .map(([r, n]) => `${n} ${r.split('.').pop().slice(0, 4)}`).join('  ');
                phaseLabel = `📦 ${needsStr}`;
            } else {
                ratio = b.maxBuildWork > 0 ? Math.max(0, 1 - b.buildWork / b.maxBuildWork) : 0;
                barCol = 0xffdd44;
                phaseLabel = '⚒ construct…';
            }
            this._infBar(ox + pad, cy + 18, barW, 8, ratio, barCol);
            this._infTxt(ox + pad + barW - 2, cy + 17, `${Math.round(ratio * 100)}%`,
                { fontSize: this._fs(8), color: '#9a9077' }).setOrigin(1, 0);
            this._infTxt(ox + pad, cy + 29, phaseLabel,
                { fontSize: this._fs(9), color: '#9a9077', wordWrap: { width: barW } });
            this._infBtn(ox + pad, cy + ch - 32, W - pad * 2 - 4, 28, 'Cancel Build', 0x443322, () => {
                this.scene.demolishConstruct(b);
            });
            return;
        }

        if (this._constructTab === 'Info')    this._renderConstructDetailInfo(b, def, ox, cy + 18, W, ch - 18, pad);
        else if (this._constructTab === 'Workers') this._renderConstructWorkers(b, def, ox, cy + 18, W, ch - 18, pad);
        else                                 this._renderConstructInventory(b, ox, cy + 18, W, ch - 18, pad);
    },

    _renderConstructDetailInfo(b, def, ox, oy, W, H, pad) {
        let ry = oy;

        if (b.type !== 'house' && b.type !== 'townhall') {
            const label = b.isPublic ? '[STATE]' : '[PRIVATE]';
            const col   = b.isPublic ? '#c8a030' : '#6a5840';
            this._infTxt(ox + W - pad, ry, label, { fontSize: this._fs(9), color: col }).setOrigin(1, 0);
        }

        let status = '';
        if (def.capacity) {
            const pop = this.scene.units.filter(u => u.homeConstructId === b.id && !u.isEnemy && u.hp > 0).length;
            status = `👥 ${pop}/${def.capacity}`;
        }
        const maxVol = CONSTRUCT_VOLUME[b.type];
        if (maxVol) {
            const curVol = this.scene.economyManager.getConstructCurrentVolume(b);
            const volStr = `📦 ${curVol.toFixed(0)}/${maxVol}`;
            status = status ? `${status}  ${volStr}` : volStr;
        } else if (def.stores) {
            const p = Object.entries(def.stores)
                .map(([r, cap]) => `${r.slice(0, 3)}:${this.scene.resources[r] ?? 0}/${cap}`)
                .join(' ');
            status = status ? `${status}  ${p}` : p;
        }
        if (status) { this._infTxt(ox + pad, ry, status, { fontSize: this._fs(9), color: '#9a9077' }); ry += 13; }

        if (Object.values(b.tithePending ?? {}).some(v => v > 0)) {
            const titheStr = Object.entries(b.tithePending).filter(([, v]) => v > 0)
                .map(([r, v]) => `${v} ${r.split('.').pop()}`).join(', ');
            this._infTxt(ox + pad, ry, `🌾 tithe: ${titheStr}`, { fontSize: this._fs(9), color: '#c8a030' });
            ry += 13;
        }
        const totalWages = Object.values(b.wagePending ?? {}).reduce((s, resMap) =>
            s + Object.values(resMap).reduce((a, v) => a + v, 0), 0);
        if (totalWages > 0) {
            const wageStr = Object.values(b.wagePending).reduce((acc, resMap) => {
                for (const [r, v] of Object.entries(resMap)) acc[r] = (acc[r] ?? 0) + v;
                return acc;
            }, {});
            const wageDesc = Object.entries(wageStr).filter(([, v]) => v > 0)
                .map(([r, v]) => `${v} ${r.split('.').pop()}`).join(', ');
            this._infTxt(ox + pad, ry, `💰 wages: ${wageDesc}`, { fontSize: this._fs(9), color: '#aac870' });
            ry += 13;
        }

        if (b.type === 'townhall') {
            const archon = this.scene.units.find(u => u.isArchon && u.hp > 0);
            if (archon) {
                this._infTxt(ox + pad, ry, `Archon: ${archon.name}`, { fontSize: this._fs(10), color: '#ffdd88' });
                ry += 13;
                this._infPhenotype(ox + pad, ry, archon.phenotype);
                this._infTxt(ox + pad + 32, ry, this._attrLine(archon.attributes), { fontSize: this._fs(9), color: '#9a8860' });
                ry += 13;
            }
            const rate = this.scene.titheRate ?? 10;
            this._infTxt(ox + pad, ry, `Tithe: ${rate}%`, { fontSize: this._fs(9), color: '#7a6030' });
            ry += 13;
        }

        if (def.desc) {
            this._infTxt(ox + pad, ry, def.desc,
                { fontSize: this._fs(9), color: '#6a6050', wordWrap: { width: W - pad * 2 } });
        }

        if (b.type !== 'house' && b.type !== 'townhall' && !b.faction) {
            const isPublicStorage = b.type === 'storageshelf' || b.type === 'grainsilo'
                || Object.values(WORKSHOP_JOBS).some(j => j.construct === b.type);
            const BTN_H = 26;
            const by    = oy + H - BTN_H - 4;
            const bw    = isPublicStorage ? (W - pad * 2 - 8) / 2 : (W - pad * 2 - 4);

            this._infBtn(ox + pad, by, bw, BTN_H,
                b.isPublic ? '🏛 State' : '🏠 Private',
                b.isPublic ? 0x1a3040 : 0x2a2018,
                () => { b.isPublic = !b.isPublic; this.updateUI(); });

            if (isPublicStorage && b.isPublic) {
                this._infBtn(ox + pad + bw + 4, by, bw, BTN_H,
                    b.hiring ? '👤 Hiring' : '👥 Hire?',
                    b.hiring ? 0x1a4030 : 0x2a2818,
                    () => { b.hiring = !b.hiring; this.updateUI(); });
            }
        }
    },

    _renderConstructWorkers(b, def, ox, oy, W, H, pad) {
        let wy = oy;
        const workshopDef = Object.values(WORKSHOP_JOBS).find(j => j.construct === b.type);
        if (workshopDef) {
            this._infTxt(ox + pad, wy, '👷 slots:', { fontSize: this._fs(10), color: '#c8a030' });
            wy += 14;
            const labels = { procure: 'Procurer', process: 'Processor' };
            for (const slot of ['procure', 'process']) {
                const w = this.scene.units.find(u =>
                    !u.isEnemy && u.hp > 0 && u.taskConstructId === b.id && u.workshopSubrole === slot);
                this._infTxt(ox + pad + 4, wy, `[${labels[slot]}] ${w ? w.name : '— empty —'}`,
                    { fontSize: this._fs(9), color: w ? '#a09070' : '#554433' });
                wy += 13;
            }
        } else {
            const assigned = this.scene.units.filter(u =>
                !u.isEnemy && u.hp > 0 && u.taskConstructId === b.id && u.role);
            if (assigned.length) {
                this._infTxt(ox + pad, wy, '👷 workers:', { fontSize: this._fs(10), color: '#c8a030' });
                wy += 14;
                for (const w of assigned) {
                    const sub = w.workshopPhase ? ` (${w.workshopPhase})` : '';
                    this._infTxt(ox + pad + 4, wy, `${w.name} — ${w.role}${sub}`,
                        { fontSize: this._fs(9), color: '#a09070' });
                    wy += 12;
                    if (wy > oy + H - 20) break;
                }
            } else {
                this._infTxt(ox + pad, wy, '👷 no workers assigned', { fontSize: this._fs(9), color: '#886644' });
            }
        }
    },

    _renderConstructInventory(b, ox, oy, W, H, pad) {
        let ry = oy;
        const entries = Object.entries(b.inventory ?? {}).filter(([, v]) => v > 0);
        if (entries.length) {
            for (const [k, v] of entries) {
                const lbl = ITEMS[k]?.label ?? k.split('.').pop().slice(0, 12);
                this._infTxt(ox + pad, ry, `${v}× ${lbl}`, { fontSize: this._fs(9), color: '#aac890' });
                ry += 12;
                if (ry > oy + H - 40) break;
            }
        } else {
            this._infTxt(ox + pad, ry, '(empty)', { fontSize: this._fs(9), color: '#4a4030' });
            ry += 12;
        }
        if (b.rooms) {
            ry += 4;
            const roomStr = b.rooms.length
                ? b.rooms.map(r => ({ bedroom: '🛏', kitchen: '🔥', workshop: '🔨', storeroom: '📦' }[r] ?? r).slice(0, 2)).join(' ')
                : '—';
            this._infTxt(ox + pad, ry, `Rooms: ${roomStr}  (${6 - b.rooms.length} free)`,
                { fontSize: this._fs(9), color: '#8a7860' });
            ry += 12;
        }
        const slotLine = (b.applianceItems ?? []).length
            ? b.applianceItems.map(a => a.label ?? a).join(', ')
            : 'no appliances';
        this._infTxt(ox + pad, ry, `[${slotLine}]`, { fontSize: this._fs(9), color: '#5a6840' });
    },

    // Draw 3 tiny phenotype swatches (skin / hair / eye) at (x, y)
    _infPhenotype(x, y, p) {
        if (!p) return;
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        const colors = [p.skinHex, p.hairHex, p.eyeHex];
        colors.forEach((c, i) => {
            g.fillStyle(c, 1).fillCircle(x + i * 9, y + 4, 3.5);
            g.lineStyle(0.5, 0x000000, 0.3).strokeCircle(x + i * 9, y + 4, 3.5);
        });
    },

    // Compact attribute string: two highest attrs highlighted
    _attrLine(a) {
        if (!a) return '';
        const entries = [['STR',a.str],['DEX',a.dex],['CON',a.con],['INT',a.int],['AGI',a.agi],['WIL',a.wil]];
        entries.sort((x,y) => y[1]-x[1]);
        return entries.slice(0,2).map(([k,v]) => `${k}${v}`).join(' ');
    },

    _renderOikosInfo(b, ox, oy, W, H, pad) {
        const TH = 22;
        if (!['Family', 'House'].includes(this._oikosTab)) this._oikosTab = 'Family';
        this._infTabBar(ox, oy, W, ['Family', 'House'], this._oikosTab,
            t => { this._oikosTab = t; this.updateUI(); });

        const cy = oy + TH;
        const ch = H - TH;
        this._infCard(ox + 2, cy, W - 4, ch - 2);

        const allRes   = this.scene.units.filter(u => u.homeConstructId === b.id && !u.isEnemy && u.hp > 0);
        const adults   = allRes.filter(u => u.age >= 2);
        const patriarch = adults.find(u => u.isArchon) ?? adults.find(u => u.gender === 'male') ?? adults[0];
        const familyName = b.type === 'townhall'
            ? (patriarch ? `Archon: ${patriarch.name}` : 'Town Hall')
            : (patriarch ? `${patriarch.name}'s Estate` : `House #${b.id}`);
        const cap = b.type === 'house'
            ? this.scene.constructManager.getHouseCapacity(b)
            : (CONSTRUCTS[b.type]?.capacity ?? '?');

        this._infTxt(ox + pad, cy + 4, familyName, { fontSize: this._fs(11), color: '#c8a030' });
        this._infTxt(ox + W - pad, cy + 4, `${allRes.length}/${cap}`,
            { fontSize: this._fs(10), color: '#6a5c40' }).setOrigin(1, 0);

        if (this._oikosTab === 'Family') {
            this._renderOikosFamily(b, allRes, adults, ox, cy + 18, W, ch - 18, pad);
        } else {
            this._renderOikosHouse(b, ox, cy + 18, W, ch - 18, pad);
        }
    },

    _renderOikosFamily(b, allRes, adults, ox, oy, W, H, pad) {
        const youth    = allRes.filter(u => u.age === 1);
        const children = allRes.filter(u => u.age === 0);

        const resIds = new Set(allRes.map(u => u.id));
        const heirCandidates = allRes.filter(u =>
            (u.fatherId && resIds.has(u.fatherId)) || (u.motherId && resIds.has(u.motherId)));
        const heir = heirCandidates.length
            ? heirCandidates.reduce((a, c) => c.age > a.age ? c : a) : null;

        const seen = new Set();
        const coupleRows = [];
        for (const u of adults) {
            if (seen.has(u.id)) continue;
            seen.add(u.id);
            const spouse = u.spouseId ? adults.find(s => s.id === u.spouseId && !seen.has(s.id)) : null;
            if (spouse) seen.add(spouse.id);
            coupleRows.push(spouse ? [u, spouse] : [u]);
        }

        let ry = oy;
        const drawMember = (u, indent) => {
            if (ry > oy + H - 20) return;
            const gIcon = u.gender === 'female' ? '♀' : '♂';
            const gCol  = u.gender === 'female' ? '#cc88aa' : '#88aacc';
            const isHeir = u === heir;
            const nameStr = (u.name ?? '?').slice(0, 8) + (isHeir ? '★' : '');
            this._infTxt(ox + pad + indent, ry, gIcon, { fontSize: this._fs(9), color: gCol });
            this._infTxt(ox + pad + indent + 9, ry, nameStr,
                { fontSize: this._fs(9), color: isHeir ? '#ffdd88' : '#c4b88a' });
            this._infPhenotype(ox + W - pad - 30, ry, u.phenotype);
            this._infTxt(ox + pad + indent + 9, ry + 9, this._attrLine(u.attributes),
                { fontSize: this._fs(9), color: '#7a6850' });
            ry += 20;
        };

        for (const pair of coupleRows) {
            drawMember(pair[0], 0);
            if (pair[1]) drawMember(pair[1], 4);
        }

        const minors = [...youth, ...children];
        if (minors.length && ry < oy + H - 16) {
            const childDiv = this._inf(this.scene.add.graphics().setDepth(22));
            childDiv.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
            ry += 4;
            for (const u of minors) {
                if (ry > oy + H - 12) break;
                const tag = u.age === 0 ? 'child' : 'youth';
                const fa = this.scene.units.find(p => p.id === u.fatherId);
                const mo = this.scene.units.find(p => p.id === u.motherId);
                const lin = fa || mo
                    ? ` (${[fa?.name?.slice(0, 5), mo?.name?.slice(0, 4)].filter(Boolean).join('·')})` : '';
                this._infTxt(ox + pad + 6, ry, `↳ ${u.name?.slice(0, 8) ?? '?'} ${tag}${lin}`,
                    { fontSize: this._fs(9), color: '#9a8060' });
                ry += 12;
            }
        }

        if (b.type === 'townhall' && ry < oy + H - 24) {
            const r = this.scene.resources ?? {};
            const commons = Object.entries(r).filter(([, v]) => v > 0).sort((a, c) => c[1] - a[1]).slice(0, 4);
            const commonsStr = commons.length
                ? commons.map(([k, v]) => `${v} ${k.split('.').pop().slice(0, 5)}`).join('  ')
                : 'empty';
            ry += 4;
            this._infTxt(ox + pad, ry, `⚖ ${commonsStr}`, { fontSize: this._fs(9), color: '#aac890' });
        }
    },

    _renderOikosHouse(b, ox, oy, W, H, pad) {
        let ry = oy;

        if (b.type === 'townhall') {
            const archon = this.scene.units.find(u => u.isArchon && u.hp > 0);
            const archonHome = archon?.homeConstructId
                ? this.scene.constructs.find(construct => construct.id === archon.homeConstructId && construct.id !== b.id)
                : null;
            if (archonHome) {
                const hInv = Object.entries(archonHome.inventory ?? {}).filter(([, v]) => v > 0);
                const hStr = hInv.length
                    ? hInv.map(([k, v]) => `${v} ${k.split('.').pop().slice(0, 5)}`).join('  ')
                    : 'empty';
                this._infTxt(ox + pad, ry, '🏠 Archon Home', { fontSize: this._fs(9), color: '#c8a070' });
                ry += 12;
                this._infTxt(ox + pad + 4, ry, hStr, { fontSize: this._fs(9), color: '#aa9060' });
                ry += 14;
            }
        } else {
            const inv = b.inventory ?? {};
            const entries = Object.entries(inv).filter(([, v]) => v > 0);
            const invStr = entries.length
                ? entries.map(([r, v]) => `${v} ${r.split('.').pop().slice(0, 5)}`).join('  ')
                : 'empty';
            this._infTxt(ox + pad, ry, `📦 ${invStr}`,
                { fontSize: this._fs(9), color: entries.length ? '#aac890' : '#4a4030' });
            ry += 14;
        }

        if (b.type === 'house') {
            const rooms = b.rooms;
            if (rooms) {
                const roomStr = rooms.length
                    ? rooms.map(r => ({ bedroom: '🛏', kitchen: '🔥', workshop: '🔨', storeroom: '📦' }[r] ?? r).slice(0, 2)).join(' ')
                    : '—';
                this._infTxt(ox + pad, ry, `Rooms: ${roomStr}  (${6 - rooms.length} free)`,
                    { fontSize: this._fs(9), color: '#8a7860' });
                ry += 13;
            } else {
                this._infTxt(ox + pad, ry, 'Rooms: legacy layout', { fontSize: this._fs(9), color: '#6a5840' });
                ry += 13;
            }
        }

        const slotLine = (b.applianceItems ?? []).length
            ? b.applianceItems.map(a => a.label ?? a).join(', ')
            : 'no appliances';
        this._infTxt(ox + pad, ry, `[${slotLine}]`, { fontSize: this._fs(9), color: '#5a6840' });
    },

    _renderUnitInfo(sel, ox, oy, W, H, pad) {
        if (sel.length > 1) {
            this._infCard(ox + 2, oy + 2, W - 4, H - 4);
            this._infTxt(ox + pad, oy + pad + 2, `${sel.length} units selected`,
                { fontSize: this._fs(11), color: '#c8a030' });
            const tally = {};
            sel.forEach(u => {
                const lbl = u.type === 'worker' && u.role ? u.role : (UNIT_NAMES[u.type] ?? u.type);
                tally[lbl] = (tally[lbl] ?? 0) + 1;
            });
            let ty = oy + pad + 18;
            Object.entries(tally).forEach(([t, c]) => {
                this._infTxt(ox + pad, ty, `${c}×  ${t}`, { fontSize: this._fs(10), color: '#9a9077' });
                ty += 14;
            });
            return;
        }

        const u   = sel[0];
        const nm  = UNIT_NAMES[u.type] ?? u.type;
        const vet = u.vetLevel >= 1 ? VET_LEVELS[u.vetLevel - 1].label + ' ' : '';
        const tabs = u.type === 'worker' ? ['Stats', 'Needs', 'Inv'] : ['Stats'];
        if (!tabs.includes(this._unitTab)) this._unitTab = 'Stats';
        this._infTabBar(ox, oy, W, tabs, this._unitTab, t => { this._unitTab = t; this.updateUI(); });

        const cy = oy + 22, ch = H - 22;
        this._infCard(ox + 2, cy, W - 4, ch - 2);
        this._infTxt(ox + pad, cy + 4, `${vet}${nm}`, { fontSize: this._fs(12), color: '#c8a030' });
        this._infTxt(ox + pad, cy + 17, u.name ?? '', { fontSize: this._fs(10), color: '#7a7060' });

        const contentY = cy + 30;
        if (this._unitTab === 'Stats')     this._renderUnitStats(u, ox, contentY, W, ch - 32, pad);
        else if (this._unitTab === 'Needs') this._renderUnitNeeds(u, ox, contentY, W, ch - 32, pad);
        else                               this._renderUnitInventory(u, ox, contentY, W, ch - 32, pad);
    },

    _renderUnitStats(u, ox, oy, W, H, pad) {
        let ry = oy;
        const bw = W - pad * 2 - 4;
        this._infBar(ox + pad, ry, bw, 5,
            u.hp / u.maxHp,
            u.hp / u.maxHp > 0.5 ? 0x44cc44 : u.hp / u.maxHp > 0.25 ? 0xddaa22 : 0xcc3311);
        ry += 7;
        this._infTxt(ox + pad, ry, `HP ${u.hp}/${u.maxHp}`, { fontSize: this._fs(9), color: '#666655' });
        ry += 13;

        if (u.type === 'worker') {
            const role = u.age < 2 ? 'Child' : u.role ? u.role[0].toUpperCase() + u.role.slice(1) : 'Idle';
            const intentLabel = { eat: '🍱 eating', sleep: '💤 resting', socialize: '💬 social', leisure: '☀ leisure' };
            const intentStr = intentLabel[u.currentIntent] ?? '';
            this._infTxt(ox + pad, ry, `${role}  ${intentStr}`, { fontSize: this._fs(9), color: '#aaaacc' });
            ry += 12;
            this._infTxt(ox + pad, ry, `Calling: ${u.vocation ?? '—'}`, { fontSize: this._fs(9), color: '#7a7060' });
            ry += 13;

            this._infPhenotype(ox + pad, ry, u.phenotype);
            const htPct = u.phenotype ? Math.round((u.phenotype.heightScale - 0.6) / 0.8 * 100) : 50;
            this._infTxt(ox + pad + 32, ry, `ht ${htPct}%`, { fontSize: this._fs(9), color: '#6a5840' });
            ry += 13;

            const a = u.attributes;
            if (a) {
                this._infTxt(ox + pad, ry, `STR${a.str} DEX${a.dex} CON${a.con}`, { fontSize: this._fs(9), color: '#9a8860' });
                ry += 12;
                this._infTxt(ox + pad, ry, `INT${a.int} AGI${a.agi} WIL${a.wil}`, { fontSize: this._fs(9), color: '#9a8860' });
                ry += 13;
            }

            const burning    = Object.entries(u.passions ?? {}).find(([, v]) => v === 'burning');
            const interested = Object.entries(u.passions ?? {}).filter(([, v]) => v === 'interested').map(([k]) => k);
            if (burning)          { this._infTxt(ox + pad, ry, `♥ ${burning[0]}`, { fontSize: this._fs(9), color: '#c8603a' }); ry += 12; }
            if (interested.length){ this._infTxt(ox + pad, ry, `~ ${interested.map(s => s.slice(0, 5)).join(', ')}`, { fontSize: this._fs(9), color: '#7a7060' }); ry += 12; }

            const trained = Object.entries(u.skills ?? {}).filter(([, v]) => v.level > 1);
            if (trained.length) {
                const div = this._inf(this.scene.add.graphics().setDepth(22));
                div.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
                ry += 5;
                trained.sort((a, b) => b[1].level - a[1].level).slice(0, 5).forEach(([k, v]) => {
                    this._infTxt(ox + pad, ry, `${k.slice(0, 10)} ${'★'.repeat(Math.min(v.level - 1, 4))}`,
                        { fontSize: this._fs(9), color: '#7a9060' });
                    ry += 12;
                });
            }
        } else {
            this._infTxt(ox + pad, ry, `Atk:${u.atk}  Spd:${u.speed}`, { fontSize: this._fs(10), color: '#aaaacc' });
        }
    },

    _renderUnitNeeds(u, ox, oy, W, H, pad) {
        const needs = u.needs ?? { food: 1, rest: 1, social: 1, joy: 1 };
        const mood  = u.mood  ?? 1;
        const bw    = W - pad * 2 - 36;
        const rows  = [
            { label: 'Food',   val: needs.food,   hi: 0x66bb44, lo: 0xcc3311 },
            { label: 'Rest',   val: needs.rest,   hi: 0x4488cc, lo: 0xcc6622 },
            { label: 'Social', val: needs.social, hi: 0xaa66cc, lo: 0x664488 },
            { label: 'Joy',    val: needs.joy,    hi: 0xddaa22, lo: 0x886611 },
        ];
        let ry = oy;
        for (const r of rows) {
            const col = r.val > 0.5 ? r.hi : r.val > 0.25 ? 0xddaa22 : r.lo;
            this._infTxt(ox + pad, ry + 1, r.label, { fontSize: this._fs(9), color: '#7a7060' });
            this._infBar(ox + pad + 36, ry, bw, 6, r.val, col);
            ry += 13;
        }
        const moodCol = mood > 0.7 ? 0x88ddaa : mood > 0.4 ? 0xddcc44 : 0xcc4433;
        this._infTxt(ox + pad, ry + 1, 'Mood', { fontSize: this._fs(9), color: '#9a8860' });
        this._infBar(ox + pad + 36, ry, bw, 6, mood, moodCol);
        if (u.isSleeping) this._infTxt(ox + W - pad - 4, ry + 1, '💤',
            { fontSize: this._fs(9), color: '#88aacc' }).setOrigin(1, 0);
        ry += 16;

        const curW = this.scene.unitManager.getUnitCarryWeight(u);
        const maxW = this.scene.unitManager.getUnitMaxWeight(u);
        const curV = this.scene.unitManager.getUnitCarryVolume(u);
        const maxV = this.scene.unitManager.getUnitMaxVolume(u);
        this._infTxt(ox + pad, ry, `⚖ ${curW.toFixed(1)}/${maxW} lbs`, { fontSize: this._fs(9), color: '#8899aa' });
        ry += 12;
        this._infTxt(ox + pad, ry, `📦 ${curV.toFixed(1)}/${maxV} cu`, { fontSize: this._fs(9), color: '#aa9988' });
    },

    _renderUnitInventory(u, ox, oy, W, H, pad) {
        let ry = oy;
        if (u.equipment) {
            this._infTxt(ox + pad, ry, `⚔ ${u.equipment}`, { fontSize: this._fs(10), color: '#aabbcc' });
            ry += 14;
        }
        const inv   = u.inv ?? u.carrying ?? {};
        const items = Object.entries(inv).filter(([, v]) => v > 0);
        if (items.length) {
            for (const [k, v] of items) {
                this._infTxt(ox + pad, ry, `${v}× ${ITEMS[k]?.label ?? k.split('.').pop().slice(0, 10)}`,
                    { fontSize: this._fs(9), color: '#aac890' });
                ry += 12;
            }
        } else {
            this._infTxt(ox + pad, ry, '(nothing carried)', { fontSize: this._fs(9), color: '#4a4030' });
            ry += 12;
        }

        ry += 4;
        const div = this._inf(this.scene.add.graphics().setDepth(22));
        div.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
        ry += 6;

        const fa         = u.fatherId ? this.scene.units.find(p => p.id === u.fatherId) : null;
        const mo         = u.motherId ? this.scene.units.find(p => p.id === u.motherId) : null;
        const spouse     = u.spouseId ? this.scene.units.find(p => p.id === u.spouseId) : null;
        const myChildren = this.scene.units.filter(c => c.fatherId === u.id || c.motherId === u.id);

        if (spouse) {
            const sIcon = spouse.gender === 'female' ? '♀' : '♂';
            this._infTxt(ox + pad, ry, `${sIcon} ${spouse.name?.slice(0, 12) ?? '?'}`,
                { fontSize: this._fs(9), color: '#c8a870' });
            ry += 12;
        }
        if (fa || mo) {
            this._infTxt(ox + pad, ry,
                `↑ ${[fa?.name?.slice(0, 7), mo?.name?.slice(0, 7)].filter(Boolean).join(' & ')}`,
                { fontSize: this._fs(9), color: '#6a5840' });
            ry += 12;
        }
        if (myChildren.length) {
            this._infTxt(ox + pad, ry,
                `↓ ${myChildren.map(c => c.name?.slice(0, 5) ?? '?').slice(0, 3).join(', ')}`,
                { fontSize: this._fs(9), color: '#6a7850' });
        }
    },

    _renderNodeInfo(ox, oy, W, H, pad) {
        this._infCard(ox + 2, oy + 2, W - 4, H - 4);
        const n     = this.scene.selectedNode;
        const label = n.type.replace(/_/g, ' ');
        this._infTxt(ox + pad, oy + pad, label, { fontSize: this._fs(12), color: '#c8a030' });
        this._infTxt(ox + pad, oy + pad + 18, `Stock: ${n.stock}`, { fontSize: this._fs(11), color: '#9a9077' });
        const res = n.resource ?? n.type;
        this._infTxt(ox + pad, oy + pad + 32, `Yields: ${res.split('.').pop()}`, { fontSize: this._fs(10), color: '#7a9060' });
        this._infBtn(ox + pad, oy + pad + 50, W - pad * 2 - 4, 30, 'Send workers', 0x2a4022, () => {
            if (this.scene.selIds.size > 0) this.scene.orderWorkersToNode(n);
        });
        this._infBtn(ox + pad, oy + pad + 86, W - pad * 2 - 4, 26, 'Close  ✕', 0x221a10, () => {
            this.scene.selectedNode = null; this.updateUI();
        });
    },

    _renderIdleInfo(ox, oy, W, H, pad) {
        this._infCard(ox + 2, oy + 2, W - 4, H - 4);
        const workers = this.scene.units.filter(u => !u.isEnemy && u.type === 'worker' && u.hp > 0);
        this._infTxt(ox + pad, oy + pad, '👥 Citizens', { fontSize: this._fs(12), color: '#887755' });
        this._infTxt(ox + W - pad, oy + pad, `${workers.length}`,
            { fontSize: this._fs(12), color: '#887755' }).setOrigin(1, 0);

        const census = {};
        for (const u of workers) census[u.age < 2 ? 'Child' : (u.role ?? 'Idle')] =
            (census[u.age < 2 ? 'Child' : (u.role ?? 'Idle')] ?? 0) + 1;

        let ry = oy + pad + 16;
        for (const [role, count] of Object.entries(census).sort((a, b) => b[1] - a[1]).slice(0, 7)) {
            this._infTxt(ox + pad, ry, `${role}  ×${count}`, { fontSize: this._fs(10), color: '#9a9077' });
            ry += 13;
        }

        const div = this._inf(this.scene.add.graphics().setDepth(22));
        div.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
        ry += 6;

        const sm = this.scene.storageMax ?? {}, r = this.scene.resources ?? {};
        const extras = [
            { k: 'Materials.Wood.Pine.Plank',        icon: '🪵→' },
            { k: 'Materials.Stone.Limestone.Block',  icon: '🧱→' },
            { k: 'Materials.Wood.Pine.Sticks',       icon: '🪃' },
            { k: 'Materials.Stone.Limestone.Stones', icon: '🪨' },
            { k: 'Textile.Fiber.Wool',               icon: '🧶' },
            { k: 'Food.Meat.Venison',                icon: '🥩' },
            { k: 'Food.Meat.Venison.Sausages',       icon: '🌭' },
            { k: 'Food.Grain.Wheat',                 icon: '🌿' },
            { k: 'Food.Grain.Wheat.Flour',           icon: '⚙→' },
            { k: 'Food.Produce.Olive',               icon: '🫒' },
            { k: 'seeds',                            icon: '🌱' },
            { k: 'Textile.Hide.Deer',                icon: '🐾' },
            { k: 'Materials.Metal.Copper.Ore',       icon: '🔩' },
        ];
        for (const { k, icon } of extras) {
            if ((sm[k] ?? 0) > 0 && ry < oy + H - 14) {
                this._infTxt(ox + pad, ry, `${icon} ${r[k] ?? 0}/${sm[k]}`, { fontSize: this._fs(10), color: '#7a7060' });
                ry += 13;
            }
        }
    },

    _renderZoneInfo(ox, oy, W, H, pad) {
        const s  = this.scene;
        const { tx, ty } = s.selectedZoneTile;
        const zm = s.zoneManager;
        const fm = s.constructManager;
        const wm = s.constructManager;
        if (!zm) return;

        const zoneType  = s.selectedZoneType;
        const zoneTiles = s.selectedZoneTiles ?? [];
        const cropKey   = s.selectedZoneCrop;

        const isWork    = zoneType === 'work';
        const isStorage = zoneType === 'storage';
        const isGrow    = zoneType === 'grow';
        const isMarket  = zoneType === 'market';

        // Try wall-enclosed room detection for work zones
        const room          = isWork ? (wm?.getRoomAt(tx, ty) ?? null) : null;
        const analysisTiles = room ?? zoneTiles;

        const rawType  = isWork && fm ? fm.classifyRoom(analysisTiles) : null;
        const typeLabel = isGrow ? `Grow: ${cropKey ?? ''}` :
            isStorage ? 'Storage Zone' : isMarket ? 'Market Zone' :
            rawType ? rawType[0].toUpperCase() + rawType.slice(1) : 'Work Zone';
        const headerCol = isWork ? '#5599ff' : isStorage ? '#ffaa33' : isGrow ? '#88ee55' : '#ffdd66';

        this._infCard(ox, oy, W, H);
        this._infTxt(ox + pad, oy + pad,      typeLabel, { fontSize: this._fs(13), color: headerCol });
        this._infTxt(ox + pad, oy + pad + 18,
            room ? `Enclosed room · ${room.length} tiles` : `Zone · ${zoneTiles.length} tiles`,
            { fontSize: this._fs(9), color: room ? '#8888aa' : '#6a5830' });

        let ry = oy + pad + 36;

        if (isWork && fm) {
            const appList = analysisTiles
                .map(t => { const it = fm.getAt(t.tx, t.ty); return it?.built ? CONSTRUCTS[it.type] : null; })
                .filter(Boolean);
            if (appList.length) {
                this._infTxt(ox + pad, ry, 'Appliances:', { fontSize: this._fs(9), color: '#7a7060' });
                ry += 12;
                const grouped = {};
                appList.forEach(d => grouped[d.label] = (grouped[d.label] ?? 0) + 1);
                for (const [lbl, cnt] of Object.entries(grouped)) {
                    this._infTxt(ox + pad + 6, ry, `${cnt > 1 ? cnt + '× ' : ''}${lbl}`,
                        { fontSize: this._fs(10), color: '#c8c0a0' });
                    ry += 13;
                }
            } else {
                this._infTxt(ox + pad, ry, 'No appliances built', { fontSize: this._fs(9), color: '#5a5040' });
                ry += 13;
            }
            const zoneKeys = new Set(analysisTiles.map(t => zm.tileKey(t.tx, t.ty)));
            const assigned = s.units.filter(u =>
                (u.taskType === 'zone_workshop' || u.taskType === 'build_furniture') &&
                zoneKeys.has(u.taskZoneKey ?? -1)
            ).length;
            ry += 3;
            this._infTxt(ox + pad, ry, `Workers: ${assigned}`, { fontSize: this._fs(10), color: assigned ? '#88cc88' : '#5a5040' });
            ry += 14;
        }

        if (isStorage) {
            const zoneKeys = new Set(zoneTiles.map(t => zm.tileKey(t.tx, t.ty)));
            const depositing = s.units.filter(u =>
                u.taskType === 'deposit_zone' && zoneKeys.has(u.taskZoneKey ?? -1)
            ).length;
            this._infTxt(ox + pad, ry, `Depositing: ${depositing}`, { fontSize: this._fs(10), color: depositing ? '#ffcc66' : '#5a5040' });
            ry += 14;
        }

        if (isGrow) {
            const zoneKeys = new Set(zoneTiles.map(t => zm.tileKey(t.tx, t.ty)));
            const farming = s.units.filter(u =>
                (u.taskType === 'harvest_grow' || u.taskType === 'plant_grow') &&
                zoneKeys.has(u.taskZoneKey ?? -1)
            ).length;
            const readyCount = zoneTiles.filter(t => zm.growTiles.get(zm.tileKey(t.tx, t.ty))?.slots.some(v => v >= 1)).length;
            this._infTxt(ox + pad, ry, `Farmers: ${farming}`, { fontSize: this._fs(10), color: farming ? '#88cc88' : '#5a5040' });
            ry += 13;
            if (readyCount > 0)
                this._infTxt(ox + pad, ry, `Ready to harvest: ${readyCount} tiles`, { fontSize: this._fs(9), color: '#ffdd44' });
            ry += 13;
        }

        if (isMarket) {
            const merchants = s.units.filter(u => u.taskType === 'merchant' &&
                zoneTiles.some(t => zm.tileKey(t.tx, t.ty) === u.taskZoneKey)
            ).length;
            this._infTxt(ox + pad, ry, `Merchants: ${merchants}`, { fontSize: this._fs(10), color: merchants ? '#ffcc66' : '#5a5040' });
            ry += 14;
        }

        // Determine expand mode string
        const expandMode = isGrow ? `grow:${cropKey}` : zoneType;

        // Buttons
        const btnY = oy + H - 84;
        this._infBtn(ox + pad, btnY, W - pad * 2, 22, '+ Expand Zone', 0x224433, () => {
            s.zoneMode      = expandMode;
            s.constructType      = null; s.roadMode  = false;
            s.wallMode      = false; s.constructMode = false;
            s.zoneManager?.clearSelection();
            s.selectedZoneTile  = null; s.selectedZoneTiles = null;
            s.selectedZoneType  = null; s.selectedZoneCrop  = null;
            s.hoverGfx?.clear();
            this.updateUI();
        });
        this._infBtn(ox + pad, btnY + 28, W - pad * 2, 22, 'Erase This Zone', 0x442222, () => {
            for (const { tx: etx, ty: ety } of zoneTiles) zm.erase(etx, ety);
            s.zoneManager?.clearSelection();
            s.selectedZoneTile = null; s.selectedZoneTiles = null;
            s.selectedZoneType = null; s.selectedZoneCrop  = null;
            this.updateUI();
        });
        this._infBtn(ox + pad, btnY + 56, W - pad * 2, 22, '✕ Close', 0x1a1408, () => {
            s.zoneManager?.clearSelection();
            s.selectedZoneTile = null; s.selectedZoneTiles = null;
            s.selectedZoneType = null; s.selectedZoneCrop  = null;
            this.updateUI();
        });
    },
};
