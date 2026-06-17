import { VET_LEVELS, CONSTRUCT_VOLUME, UNIT_NAMES, TRAITS, TILE, MAP_OY, V25_SKILLS } from '../../config/gameConstants.js';
import { THEME } from '../../ui/UIKit.js';
import { CROPS } from '../../content/crops/index.js';
import { ITEMS } from '../../content/items/index.js';
import { WORKSHOP_JOBS } from '../../content/jobs/index.js';
import { CONSTRUCTS, computeBuildCost } from '../../content/constructs/index.js';

export default {
    _renderInfoPane() {
        this._clearInfo();
        const { INFO_W, INFO_X, PANEL_H, KEY_H, QB_H, panelY } = this.L;
        const W = INFO_W - 2, H = PANEL_H - KEY_H - (QB_H ?? 0);
        const ox = INFO_X ?? 0, oy = panelY + KEY_H;
        const pad = 8;
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0);

        if (this.scene.selectedConstruct) {
            this._renderConstructInfo(ox, oy, W, H, pad);
        } else if (sel.length > 0) {
            this._renderUnitInfo(sel, ox, oy, W, H, pad);
        } else if (this.scene.selectedNode && this.scene.resNodes?.includes(this.scene.selectedNode)) {
            this._renderNodeInfo(ox, oy, W, H, pad);
        } else if (this.scene.selectedZoneTile) {
            this._renderZoneInfo(ox, oy, W, H, pad);
        } else if (this.scene.selectedGroundTile) {
            this._renderGroundTileInfo(ox, oy, W, H, pad);
        } else {
            this._renderIdleInfo(ox, oy, W, H, pad);
        }
    },

    _renderConstructInfo(ox, oy, W, H, pad) {
        const b   = this.scene.selectedConstruct;
        const def = CONSTRUCTS[b.type];

        if ((CONSTRUCTS[b.type]?.isHomeType || b.type === 'townhall') && b.built) {
            this._renderOikosInfo(b, ox, oy, W, H, pad);
            return;
        }

        // Non-house constructs within an oikos domain → show family panel
        if (b.built && b.domainId) {
            const dom   = this.scene.estateBounds.find(d => d.id === b.domainId);
            const house = dom ? this.scene.constructs.find(h => h.id === dom.houseConstructId && h.built) : null;
            if (house) { this._renderOikosInfo(house, ox, oy, W, H, pad); return; }
        }

        const TH   = this.scene.uiManager?.L?.TAB_H ?? 34;
        const workshopDef = Object.values(WORKSHOP_JOBS).find(j => j.construct === b.type);
        const tabs = b.built
            ? (workshopDef ? ['Info', 'Queue', 'Workers'] : ['Info', 'Workers'])
            : ['Info'];
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
            const inv  = b.inventory ?? {};
            const need = b.resNeeded ?? {};
            const mats = [...new Set([...Object.keys(need), ...Object.keys(inv)])]
                .filter(r => (need[r] ?? 0) + (inv[r] ?? 0) > 0);
            const remaining = Object.values(need).reduce((s, v) => s + v, 0);
            const totalCost = mats.reduce((s, r) => s + (need[r] ?? 0) + (inv[r] ?? 0), 0);
            const delivered = mats.reduce((s, r) => s + (inv[r] ?? 0), 0);

            let ratio, barCol, phaseLabel;
            if (remaining > 0) {
                // Delivery phase: bar = materials delivered / total bill.
                ratio = totalCost > 0 ? delivered / totalCost : 0;
                barCol = 0xff8833;
                const bom = mats.map(r =>
                    `${inv[r] ?? 0}/${(need[r] ?? 0) + (inv[r] ?? 0)} ${r.split('.').pop().slice(0, 5)}`).join('   ');
                phaseLabel = `📦 ${bom}`;
            } else {
                ratio = b.maxBuildWork > 0 ? Math.max(0, 1 - b.buildWork / b.maxBuildWork) : 0;
                barCol = 0xffdd44;
                phaseLabel = '⚒ constructing…';
            }
            this._infBar(ox + pad, cy + 18, barW, 8, ratio, barCol);
            this._infTxt(ox + pad + barW - 2, cy + 17, `${Math.round(ratio * 100)}%`,
                { fontSize: this._fs(8), color: '#9a9077' }).setOrigin(1, 0);
            this._infTxt(ox + pad, cy + 29, phaseLabel,
                { fontSize: this._fs(9), color: '#9a9077', wordWrap: { width: barW } });
            const ghostMat = b.material ? ` (${b.material.split('.').pop()})` : '';
            this._infTxt(ox + pad, cy + 44, `🛡 HP when built: ${b.maxHp ?? (b.maxBuildWork ?? 0) * 3}${ghostMat}`,
                { fontSize: this._fs(9), color: '#8a9aa8' });
            this._infBtn(ox + pad, cy + ch - 32, W - pad * 2 - 4, 28, 'Cancel order', 0x443322, () => {
                this.scene.demolishConstruct(b);
            });
            return;
        }

        if (this._constructTab === 'Info')       this._renderConstructDetailInfo(b, def, ox, cy + 18, W, ch - 18, pad);
        else if (this._constructTab === 'Queue')  this._renderConstructQueue(b, workshopDef, ox, cy + 18, W, ch - 18, pad);
        else if (this._constructTab === 'Workers') this._renderConstructWorkers(b, def, ox, cy + 18, W, ch - 18, pad);
        else                                      this._renderConstructInventory(b, ox, cy + 18, W, ch - 18, pad);
    },

    _renderConstructDetailInfo(b, def, ox, oy, W, H, pad) {
        let ry = oy;

        // Current / max HP (edges show the material that sets their durability)
        const matLabel = (b.placement === 'edge' && b.material) ? ` · ${b.material.split('.').pop()}` : '';
        this._infTxt(ox + pad, ry, `🛡 ${Math.round(b.hp ?? 0)}/${b.maxHp ?? 0} HP${matLabel}`,
            { fontSize: this._fs(9), color: '#8a9aa8' });
        ry += 13;

        if (!CONSTRUCTS[b.type]?.isHomeType && b.type !== 'townhall') {
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

        if (!CONSTRUCTS[b.type]?.isHomeType && b.type !== 'townhall' && !b.faction) {
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

    _renderConstructQueue(b, jDef, ox, oy, W, H, pad) {
        const isQueue = Array.isArray(b.productionQueue);
        let ry = oy;

        // Mode toggle
        const btnW = (W - pad * 2 - 6) / 2;
        this._infBtn(ox + pad, ry, btnW, 22, 'Auto',
            isQueue ? 0x1a1810 : 0x2a4020,
            () => { b.productionQueue = null; this.updateUI(); });
        this._infBtn(ox + pad + btnW + 4, ry, btnW, 22, 'Queue',
            isQueue ? 0x2a4020 : 0x1a1810,
            () => { if (!isQueue) b.productionQueue = []; this.updateUI(); });
        ry += 28;

        const inLabel  = jDef.input.split('.').pop();
        const outLabel = jDef.output.split('.').pop();
        this._infTxt(ox + pad, ry, `${inLabel} → ${outLabel}`, { fontSize: this._fs(9), color: '#776655' });
        ry += 14;

        if (!isQueue) {
            this._infTxt(ox + pad, ry, 'Auto: workers produce continuously', { fontSize: this._fs(8), color: '#554433', wordWrap: { width: W - pad * 2 } });
            return;
        }

        // Bill list — each order: mode glyph (№ count / → until-N / ∞ forever), suspend, remove
        const queue = b.productionQueue;
        const outStock = this.scene.resources?.[jDef.output] ?? 0;
        const orderActive = (o) => {
            if (!o || o.suspended) return false;
            const m = o.mode ?? 'count';
            if (m === 'forever') return true;
            if (m === 'untilN')  return outStock < o.qty;
            return (o.done ?? 0) < o.qty;
        };
        if (queue.length === 0) {
            this._infTxt(ox + pad, ry, '— no bills —', { fontSize: this._fs(9), color: '#443322' });
            ry += 14;
        } else {
            const activeIdx = queue.findIndex(orderActive);
            for (let i = 0; i < queue.length; i++) {
                if (ry > oy + H - 58) break;
                const order = queue[i];
                const mode = order.mode ?? 'count';
                const susp = !!order.suspended;
                const isActive = i === activeIdx;
                const body = mode === 'count'  ? `${order.qty}× (${order.done ?? 0}/${order.qty})`
                           : mode === 'untilN' ? `to ${order.qty} (${outStock})`
                           : `∞`;
                const mark = susp ? '⏸ ' : isActive ? '▶ ' : '  ';
                this._infTxt(ox + pad, ry, `${mark}${body} ${outLabel}`,
                    { fontSize: this._fs(9), color: susp ? '#665544' : isActive ? '#c8a030' : '#9a8a6a' });
                const b3 = ox + W - pad - 16, b2 = b3 - 18, b1 = b2 - 18;
                const glyph = mode === 'count' ? '№' : mode === 'untilN' ? '→' : '∞';
                this._infBtn(b1, ry - 1, 16, 14, glyph, 0x2a2818, () => {
                    order.mode = mode === 'count' ? 'untilN' : mode === 'untilN' ? 'forever' : 'count';
                    order.done = 0;
                    this.updateUI();
                });
                this._infBtn(b2, ry - 1, 16, 14, susp ? '▶' : '⏸', susp ? 0x2a4020 : 0x2a2818, () => {
                    order.suspended = !order.suspended; this.updateUI();
                });
                this._infBtn(b3, ry - 1, 16, 14, '✕', 0x3a1010, () => { queue.splice(i, 1); this.updateUI(); });
                ry += 16;
            }
        }

        // Add-bill controls (qty = count target / until-N target; mode is set per-row after adding)
        if (!b._queueQty) b._queueQty = 5;
        const qw = (W - pad * 2 - 4) / 3;
        this._infBtn(ox + pad,            ry, qw, 22, '−', 0x221810, () => { b._queueQty = Math.max(1, (b._queueQty ?? 5) - 1); this.updateUI(); });
        this._infTxt(ox + pad + qw + 2,   ry + 6, String(b._queueQty ?? 5), { fontSize: this._fs(11), color: '#c8a030' }).setOrigin(0.5, 0);
        this._infBtn(ox + pad + qw * 2 + 4, ry, qw, 22, '+', 0x221810, () => { b._queueQty = Math.min(200, (b._queueQty ?? 5) + 1); this.updateUI(); });
        ry += 26;
        this._infBtn(ox + pad, ry, W - pad * 2 - 4, 22, `+ Add bill (${b._queueQty ?? 5}× ${outLabel})`, 0x1a2a10, () => {
            queue.push({ qty: b._queueQty ?? 5, done: 0, mode: 'count', suspended: false });
            this.updateUI();
        });
        this._infTxt(ox + pad, ry + 24, '№ count · → until-N · ∞ forever · ⏸ pause',
            { fontSize: this._fs(7), color: '#5a5040', wordWrap: { width: W - pad * 2 } });
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
        const TH = this.scene.uiManager?.L?.TAB_H ?? 34;
        if (!['Family', 'House'].includes(this._oikosTab)) this._oikosTab = 'Family';
        this._infTabBar(ox, oy, W, ['Family', 'House'], this._oikosTab,
            t => { this._oikosTab = t; this.updateUI(); });

        const cy = oy + TH;
        const ch = H - TH;
        this._infCard(ox + 2, cy, W - 4, ch - 2);

        const allRes   = this.scene.units.filter(u => u.homeConstructId === b.id && !u.isEnemy && u.hp > 0);
        const adults   = allRes.filter(u => u.age >= 2);
        const patriarch = adults.find(u => u.isArchon) ?? adults.find(u => u.gender === 'male') ?? adults[0];
        const hFamilyName = patriarch?.familyName ? `the ${patriarch.familyName}` : null;
        const familyName = b.type === 'townhall'
            ? (patriarch ? `Archon: ${patriarch.name}` : 'Town Hall')
            : (hFamilyName ? `Oikos ${hFamilyName}` : patriarch ? `${patriarch.name}'s House` : `House #${b.id}`);
        const cap = CONSTRUCTS[b.type]?.isHomeType
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
            if (ry > oy + H - 22) return;
            const gIcon = u.gender === 'female' ? '♀' : '♂';
            const gCol  = u.gender === 'female' ? '#cc88aa' : '#88aacc';
            const isHeir = u === heir;
            const nameStr = (u.name ?? '?').slice(0, 10) + (isHeir ? '★' : '');
            const moodPct = Math.round((u.mood ?? 1) * 100);
            const moodCol = moodPct > 70 ? '#88cc88' : moodPct > 40 ? '#ddcc44' : '#cc5544';
            this._infTxt(ox + pad + indent, ry, gIcon, { fontSize: this._fs(9), color: gCol });
            this._infTxt(ox + pad + indent + 10, ry, nameStr,
                { fontSize: this._fs(10), color: isHeir ? '#ffdd88' : '#d4c89a' });
            this._infTxt(ox + W - pad - 2, ry, `${moodPct}%`,
                { fontSize: this._fs(9), color: moodCol }).setOrigin(1, 0);
            this._infPhenotype(ox + W - pad - 34, ry, u.phenotype);
            ry += 13;
            const roleStr = u.role ? u.role[0].toUpperCase() + u.role.slice(1) : 'Idle';
            const attrStr = this._attrLine(u.attributes);
            this._infTxt(ox + pad + indent + 10, ry, `${roleStr}  ${attrStr}`,
                { fontSize: this._fs(8), color: '#7a6850' });
            if ((u.traits ?? []).length) {
                const traitStr = u.traits.map(t => TRAITS[t]?.label ?? t).slice(0, 2).join(' · ');
                this._infTxt(ox + W - pad - 2, ry, traitStr,
                    { fontSize: this._fs(8), color: '#8878a0' }).setOrigin(1, 0);
            }
            ry += 14;
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

        if (CONSTRUCTS[b.type]?.isHomeType) {
            const rooms = b.rooms;
            if (rooms) {
                const roomStr = rooms.length
                    ? rooms.map(r => ({ bedroom: '🛏', kitchen: '🔥', workshop: '🔨', storeroom: '📦' }[r] ?? r).slice(0, 2)).join(' ')
                    : '—';
                this._infTxt(ox + pad, ry, `Rooms: ${roomStr}  (${6 - rooms.length} free)`,
                    { fontSize: this._fs(9), color: '#8a7860' });
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
        const workers = sel.filter(w => w.type === 'worker' && w.age >= 2);
        const isAdultWorker = u.type === 'worker' && u.age >= 2;
        const tabs = isAdultWorker
            ? ['Stats', 'Skills', 'Needs', 'Inv', 'Jobs']
            : ['Stats'];
        if (!tabs.includes(this._unitTab)) { this._unitTab = 'Stats'; this._skillsScroll = 0; }
        this._infTabBar(ox, oy, W + 2, tabs, this._unitTab, t => { if (t !== 'Skills') this._skillsScroll = 0; this._unitTab = t; this.updateUI(); });

        const TH = this.scene.uiManager?.L?.TAB_H ?? 34;
        const cy = oy + TH, ch = H - TH;
        this._infCard(ox + 2, cy, W - 4, ch - 2);
        const fullName = [u.name, u.familyName].filter(Boolean).join(' ');
        this._infTxt(ox + pad, cy + 5, fullName, { fontSize: this._fs(13), color: '#e8d080' });
        const _yrs = Math.round(u.ageYears ?? (u.age ?? 0) * 6);
        const ageTag = u.age < 2 ? (u.age === 0 ? `Infant ${_yrs}y` : `Youth ${_yrs}y`)
                     : u.age >= 10 ? `${vet}${nm} · Elder ${_yrs}y` : `${vet}${nm} · ${_yrs}y`;
        const roleSecondary = u.type === 'worker' && u.age >= 2
            ? (u.role ? u.role[0].toUpperCase() + u.role.slice(1) : 'Idle') + `  ·  ${ageTag}`
            : ageTag;
        this._infTxt(ox + pad, cy + 20, roleSecondary, { fontSize: this._fs(9), color: '#9a8860' });

        const contentY = cy + 34;
        const contentH = ch - 34;
        if (this._unitTab === 'Stats')       this._renderUnitStats(u, ox, contentY, W, contentH, pad);
        else if (this._unitTab === 'Skills') this._renderUnitSkills(u, ox, contentY, W, contentH, pad);
        else if (this._unitTab === 'Needs')  this._renderUnitNeeds(u, ox, contentY, W, contentH, pad);
        else if (this._unitTab === 'Inv')    this._renderUnitInventory(u, ox, contentY, W, contentH, pad);
        else if (this._unitTab === 'Jobs')   this._renderInlineJobs(workers, ox, contentY, W, contentH, pad);
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
            const ageTag = u.age < 2 ? 'Child' : u.age >= 10 ? '(Elder)' : '';
            const roleStr = u.age < 2 ? '' : u.role ? u.role[0].toUpperCase() + u.role.slice(1) : 'Idle';
            const role = [roleStr, ageTag].filter(Boolean).join(' ');
            const intentLabel = { eat: '🍱 eating', sleep: '💤 resting', socialize: '💬 social', leisure: '☀ leisure' };
            const intentStr = u.taskType === 'mental_break' ? '💔 breaking down' : (intentLabel[u.currentIntent] ?? '');
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
                const halfW = Math.floor((W - pad * 2) / 2);
                const ATTR_PAIRS = [['STR', a.str, 'DEX', a.dex], ['CON', a.con, 'INT', a.int], ['AGI', a.agi, 'WIL', a.wil]];
                for (const [k1, v1, k2, v2] of ATTR_PAIRS) {
                    this._infTxt(ox + pad, ry, k1, { fontSize: this._fs(8), color: '#6a6050' });
                    this._infTxt(ox + pad + halfW - 6, ry, String(v1), { fontSize: this._fs(10), color: '#c8b888' }).setOrigin(1, 0);
                    this._infTxt(ox + pad + halfW, ry, k2, { fontSize: this._fs(8), color: '#6a6050' });
                    this._infTxt(ox + W - pad, ry, String(v2), { fontSize: this._fs(10), color: '#c8b888' }).setOrigin(1, 0);
                    ry += 14;
                }
            }

            if ((u.traits ?? []).length) {
                let tx = ox + pad;
                for (const t of u.traits) {
                    const def = TRAITS[t];
                    if (!def) continue;
                    const txt = this._infTxt(tx, ry, `[${def.label}]`, { fontSize: this._fs(8), color: def.col });
                    txt.setInteractive({ cursor: 'pointer' });
                    const cx = tx + txt.width / 2;
                    txt.on('pointerover', () => this._showTooltip(cx, ry, def.label, def.desc));
                    txt.on('pointerout',  () => this._hideTooltip());
                    tx += def.label.length * 5 + 12;
                }
                ry += 12;
            }
        } else {
            this._infTxt(ox + pad, ry, `Atk:${u.atk}  Spd:${u.speed}`, { fontSize: this._fs(10), color: '#aaaacc' });
        }
    },

    _renderUnitSkills(u, ox, oy, W, H, pad) {
        const SKILL_LABELS = {
            farming: 'Farming', woodcutting: 'Woodcutting', mining: 'Mining',
            masonry: 'Masonry', bake: 'Baking', butcher: 'Butchery',
            mill: 'Milling', tan: 'Tanning', smelt: 'Smelting',
            forge: 'Forging', animalTrap: 'Trapping', spear: 'Spear',
            sword: 'Sword', bow: 'Archery',
        };

        const rows = V25_SKILLS.map(k => ({
            key: k, label: SKILL_LABELS[k] ?? k,
            skill: u.skills?.[k] ?? { level: 1, xp: 0 },
            passion: u.passions?.[k] ?? 'none',
        }));
        const passRank = { burning: 2, interested: 1, none: 0 };
        rows.sort((a, b) => {
            const pd = passRank[b.passion] - passRank[a.passion];
            return pd !== 0 ? pd : b.skill.level - a.skill.level;
        });

        const ROW_H  = 15;
        const needScroll = rows.length * ROW_H > H;
        const btnH   = needScroll ? 14 : 0;
        const listH  = H - btnH * 2;
        const maxRows = Math.floor(listH / ROW_H);
        const maxScroll = Math.max(0, rows.length - maxRows);
        if (this._skillsScroll == null) this._skillsScroll = 0;
        this._skillsScroll = Math.max(0, Math.min(this._skillsScroll, maxScroll));
        const scroll = this._skillsScroll;

        if (needScroll) {
            const upTxt = this._inf(this.scene.add.text(ox + W - pad, oy, '▲', {
                fontFamily: THEME.fontMono, fontSize: this._fs(9),
                color: scroll > 0 ? '#c8a030' : '#3a3020',
            }).setOrigin(1, 0).setDepth(22));
            if (scroll > 0) {
                upTxt.setInteractive({ cursor: 'pointer' });
                upTxt.on('pointerdown', () => { this._skillsScroll = scroll - 1; this.updateUI(); });
            }
            const dnTxt = this._inf(this.scene.add.text(ox + W - pad, oy + H - btnH, '▼', {
                fontFamily: THEME.fontMono, fontSize: this._fs(9),
                color: scroll < maxScroll ? '#c8a030' : '#3a3020',
            }).setOrigin(1, 0).setDepth(22));
            if (scroll < maxScroll) {
                dnTxt.setInteractive({ cursor: 'pointer' });
                dnTxt.on('pointerdown', () => { this._skillsScroll = scroll + 1; this.updateUI(); });
            }
        }

        const visible = rows.slice(scroll, scroll + maxRows);
        let ry = oy + (needScroll ? btnH : 2);
        for (const { label, skill, passion } of visible) {
            const passCol  = passion === 'burning' ? '#cc4422' : '#c8a030';
            const passIcon = passion === 'burning' ? '♥' : passion === 'interested' ? '~' : ' ';
            this._infTxt(ox + pad, ry, passIcon, { fontSize: this._fs(9), color: passCol, fontFamily: THEME.fontMono });

            const lvl = skill.level;
            const nameCol = lvl > 1 ? '#d4c89a' : '#6a5840';
            this._infTxt(ox + pad + 11, ry, label, { fontSize: this._fs(9), color: nameCol });

            const stars = lvl > 1 ? '★'.repeat(Math.min(lvl - 1, 5)) : '—';
            const starCol = lvl > 1 ? '#c8a030' : '#3a3020';
            this._infTxt(ox + W - pad, ry, stars, { fontSize: this._fs(9), color: starCol, fontFamily: THEME.fontMono }).setOrigin(1, 0);

            ry += ROW_H;
        }
    },

    _renderUnitNeeds(u, ox, oy, W, H, pad) {
        const needs = u.needs ?? { food: 1, rest: 1, social: 1, joy: 1 };
        const mood  = u.mood  ?? 1;
        const labelW = 52;
        const bw     = W - pad * 2 - labelW - 4;
        const rows   = [
            { label: 'Food',   val: needs.food,   hi: 0x66bb44, lo: 0xcc3311 },
            { label: 'Rest',   val: needs.rest,   hi: 0x4488cc, lo: 0xcc6622 },
            { label: 'Social', val: needs.social, hi: 0xaa66cc, lo: 0x664488 },
            { label: 'Joy',    val: needs.joy,    hi: 0xddaa22, lo: 0x886611 },
        ];
        let ry = oy + 2;
        for (const r of rows) {
            const col = r.val > 0.5 ? r.hi : r.val > 0.25 ? 0xddaa22 : r.lo;
            this._infTxt(ox + pad, ry + 2, r.label, { fontSize: this._fs(11), color: '#f0e0b0', stroke: '#000000', strokeThickness: 2 });
            this._infBar(ox + pad + labelW, ry + 1, bw, 13, r.val, col);
            ry += 20;
        }
        const moodCol = mood > 0.7 ? 0x88ddaa : mood > 0.4 ? 0xddcc44 : 0xcc4433;
        const comfortIcon = u._warm ? ' 🔥' : u._indoor ? ' 🏠' : '';
        this._infTxt(ox + pad, ry + 2, `Mood${comfortIcon}`, { fontSize: this._fs(11), color: '#f0e0b0', stroke: '#000000', strokeThickness: 2 });
        this._infBar(ox + pad + labelW, ry + 1, bw, 13, mood, moodCol);
        if (u.isSleeping) this._infTxt(ox + W - pad - 4, ry + 1, '💤',
            { fontSize: this._fs(9), color: '#88aacc' }).setOrigin(1, 0);
        if ((u._grief ?? 0) > 0) this._infTxt(ox + W - pad - 4, ry + 1, `🕯 ${Math.round(u._grief * 100)}%`,
            { fontSize: this._fs(9), color: '#9988aa' }).setOrigin(1, 0);
        ry += 16;

        // Mood breakdown — why the colonist feels this way (top contributors by magnitude).
        const factors = (u._moodFactors ?? []).filter(x => Math.abs(x.val) >= 0.005)
            .sort((a, b) => Math.abs(b.val) - Math.abs(a.val)).slice(0, 6);
        for (const ftr of factors) {
            if (ry > oy + H - 28) break;
            const pos = ftr.val >= 0;
            this._infTxt(ox + pad + 2, ry, ftr.label, { fontSize: this._fs(8), color: '#9a8a6a' });
            this._infTxt(ox + W - pad - 2, ry, `${pos ? '+' : ''}${Math.round(ftr.val * 100)}`,
                { fontSize: this._fs(8), color: pos ? '#88cc88' : '#cc6655' }).setOrigin(1, 0);
            ry += 11;
        }
        ry += 4;

        if (u._widowed) {
            this._infTxt(ox + pad, ry, u.gender === 'female' ? '🖤 Widow' : '🖤 Widower',
                { fontSize: this._fs(9), color: '#886699' });
            ry += 12;
        }

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

        // Relations
        const relEntries = Object.entries(u.relations ?? {})
            .map(([id, score]) => ({ u: this.scene.units.find(w => w.id === +id), score }))
            .filter(r => r.u && Math.abs(r.score) > 0.05)
            .sort((a, b) => b.score - a.score);
        if (relEntries.length) {
            const relDiv = this._inf(this.scene.add.graphics().setDepth(22));
            relDiv.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
            ry += 5;
            for (const r of relEntries.slice(0, 4)) {
                const bar = r.score > 0 ? '▌'.repeat(Math.round(r.score * 4)) : '▌'.repeat(Math.round(-r.score * 4));
                const col = r.score > 0.3 ? '#88cc88' : r.score < -0.3 ? '#cc6666' : '#aaa880';
                const rName = [r.u.name, r.u.familyName].filter(Boolean).join(' ').slice(0, 13);
                this._infTxt(ox + pad, ry, `${rName} ${bar}`, { fontSize: this._fs(9), color: col });
                ry += 12;
            }
            ry += 2;
        }

        const fa         = u.fatherId ? this.scene.units.find(p => p.id === u.fatherId) : null;
        const mo         = u.motherId ? this.scene.units.find(p => p.id === u.motherId) : null;
        const spouse     = u.spouseId ? this.scene.units.find(p => p.id === u.spouseId) : null;
        const myChildren = this.scene.units.filter(c => c.fatherId === u.id || c.motherId === u.id);

        if (spouse) {
            const sIcon = spouse.gender === 'female' ? '♀' : '♂';
            const sName = [spouse.name, spouse.familyName].filter(Boolean).join(' ').slice(0, 16);
            this._infTxt(ox + pad, ry, `${sIcon} ${sName}`,
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
        const res = n.resource ?? n.type;
        this._infStatRow(ox + pad, ox + W - pad, oy + pad + 18, 'Stock',  n.stock,               '#9a9077', this._fs(11));
        this._infStatRow(ox + pad, ox + W - pad, oy + pad + 32, 'Yields', res.split('.').pop(),   '#7a9060', this._fs(10));
        this._infBtn(ox + pad, oy + pad + 50, W - pad * 2 - 4, 30, 'Send workers', 0x2a4022, () => {
            if (this.scene.selIds.size > 0) this.scene.orderWorkersToNode(n);
        });
        this._infBtn(ox + pad, oy + pad + 86, W - pad * 2 - 4, 26, 'Close  ✕', 0x221a10, () => {
            this.scene.selectedNode = null; this.updateUI();
        });
    },

    _renderGroundTileInfo(ox, oy, W, H, pad) {
        const s   = this.scene;
        const { tx, ty } = s.selectedGroundTile;
        this._infCard(ox + 2, oy + 2, W - 4, H - 4);

        this._infTxt(ox + pad, oy + pad, 'Ground Items', { fontSize: this._fs(12), color: '#c8a030' });
        this._infTxt(ox + W - pad, oy + pad, `tile ${tx},${ty}`,
            { fontSize: this._fs(8), color: '#5a5040' }).setOrigin(1, 0);

        const tileItems = s.groundItems?.filter(i => {
            const [itx, ity] = i.subKey.split(',').map(Number);
            return itx === tx && ity === ty;
        }) ?? [];

        let ry = oy + pad + 18;
        if (tileItems.length === 0) {
            this._infTxt(ox + pad, ry, '(empty)', { fontSize: this._fs(9), color: '#4a4030' });
        } else {
            // Aggregate by resource
            const totals = {};
            for (const i of tileItems) totals[i.resource] = (totals[i.resource] ?? 0) + i.qty;
            for (const [res, qty] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
                if (ry > oy + H - 30) break;
                const lbl = res.split('.').pop().slice(0, 14);
                this._infTxt(ox + pad, ry, `${qty}×`, { fontSize: this._fs(10), color: '#ddcc88' });
                this._infTxt(ox + pad + 28, ry, lbl, { fontSize: this._fs(10), color: '#aac890' });
                ry += 14;
            }
        }

        this._infBtn(ox + pad, oy + H - 30, W - pad * 2 - 4, 26, '✕ Close', 0x221a10, () => {
            s.selectedGroundTile = null; this.updateUI();
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
            this._infStatRow(ox + pad, ox + W - pad, ry, role, `×${count}`, '#9a9077', this._fs(10));
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

    _renderInlineJobs(workers, ox, oy, W, H, pad) {
        const s = this.scene;
        if (!workers.length) return;
        // Per-job priority for the selected worker(s): Off (0) disables the job, 1–4 bias how
        // urgently the AI picks it (1 = most urgent), '—' = unset/normal. pickRole consumes
        // u.taskPriorities. Tap a cell to cycle  —→1→2→3→4→Off→—.
        const JOB_ROWS = [
            { id: 'farmer',     label: '🌾 Farm'   },
            { id: 'forager',    label: '🍄 Forage' },
            { id: 'woodcutter', label: '🪵 Lumber' },
            { id: 'miner',      label: '⛏ Mine'   },
            { id: 'builder',    label: '🔨 Build'  },
            { id: 'shepherd',   label: '🐑 Herd'   },
            { id: 'hunter',     label: '🏹 Hunt'   },
        ];
        const VOCATIONS = [
            'farmer','hunter','woodcutter','miner','builder','shepherd','forager',
            'carpenter','mason','smith','smelter','miller','baker','butcher',
            'presser','weaver','brewer','tanner','merchant',
        ];

        this._infTxt(ox + pad, oy + 2, 'Job priority — tap to cycle (Off · 1–4)',
            { fontSize: this._fs(8), color: '#7a6a4a' });
        let ry = oy + 14;
        const rowH = 16, cols = 2;
        const cellW = Math.floor((W - pad * 2) / cols);
        const u0 = workers[0];
        const CYCLE = [undefined, 1, 2, 3, 4, 0];
        const stLabel = v => v === 0 ? 'Off' : (v >= 1 && v <= 4) ? `P${v}` : '—';
        const stColor = v => v === 0 ? 0x4a2020 : v === 1 ? 0x3a6a2a : v === 2 ? 0x315a36
                          : v === 3 ? 0x2a3a4a : v === 4 ? 0x3a2a4a : 0x2a2418;

        // 2-column grid so all jobs fit the short info pane. Each cell is one cycling button.
        JOB_ROWS.forEach((job, i) => {
            const col = i % cols, rowi = Math.floor(i / cols);
            const cx = ox + pad + col * cellW;
            const cy = ry + rowi * rowH;
            const cur = u0.taskPriorities?.[job.id];
            this._infBtn(cx, cy, cellW - 4, rowH - 2, `${job.label}  ${stLabel(cur)}`, stColor(cur), () => {
                const next = CYCLE[(CYCLE.findIndex(v => v === cur) + 1) % CYCLE.length];
                workers.forEach(w => {
                    if (!w.taskPriorities) w.taskPriorities = {};
                    if (next === undefined) delete w.taskPriorities[job.id];
                    else w.taskPriorities[job.id] = next;
                });
                this.updateUI();
            });
        });
        ry += Math.ceil(JOB_ROWS.length / cols) * rowH + 6;

        // Calling / Vocation — with ◂ ▸ cycle arrows
        if (ry + 18 < oy + H) {
            const dg = this._inf(s.add.graphics().setDepth(22));
            dg.lineStyle(1, 0x3a2e18, 0.35).lineBetween(ox + pad, ry + 2, ox + W - pad, ry + 2);
            ry += 6;

            const u     = workers[0];
            const voc   = u?.vocation ?? null;
            const vidx  = voc ? VOCATIONS.indexOf(voc) : -1;
            const label = voc ? voc[0].toUpperCase() + voc.slice(1) : '—';

            this._infTxt(ox + pad, ry, 'Calling', { fontSize: this._fs(8), color: '#5a5040' });
            this._infTxt(ox + pad + 46, ry, label, { fontSize: this._fs(9), color: '#c8a840' });

            // ◂ prev
            const prevBtn = this._inf(s.add.text(ox + W - pad - 26, ry - 1, '◂', {
                fontFamily: THEME.fontMono, fontSize: this._fs(10), color: '#807040',
            }).setOrigin(0, 0).setDepth(22).setInteractive({ cursor: 'pointer' }));
            prevBtn.on('pointerdown', () => {
                const ni = vidx <= 0 ? VOCATIONS.length - 1 : vidx - 1;
                workers.forEach(w => { w.vocation = VOCATIONS[ni]; });
                this.updateUI();
            });

            // ▸ next
            const nextBtn = this._inf(s.add.text(ox + W - pad - 10, ry - 1, '▸', {
                fontFamily: THEME.fontMono, fontSize: this._fs(10), color: '#807040',
            }).setOrigin(0, 0).setDepth(22).setInteractive({ cursor: 'pointer' }));
            nextBtn.on('pointerdown', () => {
                const ni = vidx < 0 ? 0 : (vidx + 1) % VOCATIONS.length;
                workers.forEach(w => { w.vocation = VOCATIONS[ni]; });
                this.updateUI();
            });
        }
    },

    _renderInlineOrders(workers, ox, oy, W, H, pad) {
        const s = this.scene;
        let ry = oy + 4;
        const btnH = 30;
        this._infBtn(ox + pad, ry, W - pad * 2 - 4, btnH, '🏠 Recall Home', 0x223344, () => {
            workers.forEach(u => {
                const home = s.constructs.find(b => b.id === u.homeConstructId);
                if (home) u.moveTo = { x: (home.tx + home.width / 2) * TILE, y: MAP_OY + (home.ty + home.height / 2) * TILE };
                u.taskType = null; u.targetNode = null;
            });
            s.deselect?.();
            this.updateUI();
        });
        ry += btnH + 6;
        this._infBtn(ox + pad, ry, W - pad * 2 - 4, btnH, '⚔ Guard Nearest Tower', 0x223a44, () => {
            const towers = s.constructs.filter(b => b.built && !b.faction && b.type === 'watchtower');
            if (towers.length > 0) s.orderWorkersToConstruct(towers[0]);
            s.deselect?.();
            this.updateUI();
        });
    },

    _renderZoneInfo(ox, oy, W, H, pad) {
        const s  = this.scene;
        const { tx, ty } = s.selectedZoneTile;
        const zm = s.zoneManager;
        const fm = s.constructManager;
        if (!zm) return;

        const zoneType  = s.selectedZoneType;
        const zoneTiles = s.selectedZoneTiles ?? [];
        const cropKey   = s.selectedZoneCrop;

        const isWork    = zoneType === 'work';
        const isStorage = zoneType === 'storage';
        const isGrow    = zoneType === 'grow';
        const isMarket  = zoneType === 'market';

        const room          = isWork ? (fm?.getRoomAt(tx, ty) ?? null) : null;
        const analysisTiles = room ?? zoneTiles;
        const rawType       = isWork && fm ? fm.classifyRoom(analysisTiles) : null;
        const typeLabel     = isGrow    ? `Grow: ${cropKey ?? ''}` :
                              isStorage ? 'Storage Zone' :
                              isMarket  ? 'Market Zone' :
                              rawType   ? rawType[0].toUpperCase() + rawType.slice(1) : 'Work Zone';
        const headerCol     = isWork ? '#5599ff' : isStorage ? '#ffaa33' : isGrow ? '#88ee55' : '#ffdd66';
        const expandMode    = isGrow ? `grow:${cropKey}` : zoneType;

        const TH = this.L?.TAB_H ?? 26;

        // Storage zones get Info / Inv tabs
        let cy = oy, ch = H;
        if (isStorage) {
            if (!['Info', 'Inv'].includes(this._zoneTab)) this._zoneTab = 'Info';
            this._infTabBar(ox, oy, W, ['Info', 'Inv'], this._zoneTab,
                t => { this._zoneTab = t; this.updateUI(); });
            cy = oy + TH;
            ch = H - TH;
        }

        this._infCard(ox, cy, W, ch);
        this._infTxt(ox + pad, cy + pad, typeLabel, { fontSize: this._fs(13), color: headerCol });
        this._infTxt(ox + pad, cy + pad + 18,
            room ? `Enclosed room · ${room.length} tiles` : `Zone · ${zoneTiles.length} tiles`,
            { fontSize: this._fs(9), color: room ? '#8888aa' : '#6a5830' });

        // Shared bottom buttons
        const btnY = cy + ch - 56;
        this._infBtn(ox + pad, btnY, W - pad * 2, 22, '+ Expand Zone', 0x224433, () => {
            s.zoneMode = expandMode;
            s.constructType = null; s.roadMode = false;
            s.wallMode = false; s.constructMode = false;
            s.zoneManager?.clearSelection();
            s.selectedZoneTile = null; s.selectedZoneTiles = null;
            s.selectedZoneType = null; s.selectedZoneCrop  = null;
            s.hoverGfx?.clear();
            this.updateUI();
        });
        this._infBtn(ox + pad, btnY + 28, W - pad * 2, 22, 'Erase · ✕ Close', 0x442222, () => {
            for (const { tx: etx, ty: ety } of zoneTiles) zm.erase(etx, ety);
            s.zoneManager?.clearSelection();
            s.selectedZoneTile = null; s.selectedZoneTiles = null;
            s.selectedZoneType = null; s.selectedZoneCrop  = null;
            this.updateUI();
        });

        let ry = cy + pad + 36;

        // Storage: Inv tab — resource list
        if (isStorage && this._zoneTab === 'Inv') {
            const zoneInv = {};
            for (const t of zoneTiles) {
                const cfg = zm.storageTiles?.get(zm.tileKey(t.tx, t.ty));
                for (const [res, qty] of Object.entries(cfg?.inventory ?? {})) {
                    if (qty > 0) zoneInv[res] = (zoneInv[res] ?? 0) + qty;
                }
            }
            const invEntries = Object.entries(zoneInv).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
            if (invEntries.length === 0) {
                this._infTxt(ox + pad, ry + 4, '(empty)', { fontSize: this._fs(9), color: '#554433' });
            } else {
                for (const [res, qty] of invEntries) {
                    if (ry + 14 >= btnY - 2) break;
                    const parts = res.split('.');
                    const lbl = parts.slice(-2).join(' · ');
                    this._infTxt(ox + pad, ry, `${qty}`, { fontSize: this._fs(10), color: '#ddcc88' });
                    this._infTxt(ox + pad + 34, ry, lbl, { fontSize: this._fs(10), color: '#9a8a6a' });
                    ry += 14;
                }
            }
            return;
        }

        // Storage: Info tab — accept filters
        if (isStorage) {
            const zoneKeys = new Set(zoneTiles.map(t => zm.tileKey(t.tx, t.ty)));
            const depositing = s.units.filter(u =>
                u.taskType === 'deposit_zone' && zoneKeys.has(u.taskZoneKey ?? -1)
            ).length;
            this._infTxt(ox + pad, ry, `Depositing: ${depositing}`,
                { fontSize: this._fs(9), color: depositing ? '#ffcc66' : '#5a5040' });
            ry += 14;

            // Haul priority (left) + per-tile capacity stepper (right)
            const cfg0    = zm.storageTiles?.get(zm.tileKey(tx, ty));
            const PRIO    = ['Low', 'Below', 'Normal', 'High', 'Urgent'];
            const PCOL    = [0x3a2a14, 0x4a3a1a, 0x2a3a4a, 0x315a36, 0x5a2a2a];
            const curPrio = cfg0?.priority ?? 2;
            const curCap  = cfg0?.capacity ?? 0;
            const zFill   = zoneTiles.reduce((sum, t) =>
                sum + zm.zoneFill(zm.storageTiles?.get(zm.tileKey(t.tx, t.ty))), 0);
            const halfW   = Math.floor((W - pad * 2 - 4) / 2);
            this._infBtn(ox + pad, ry, halfW, 20, `▲ ${PRIO[curPrio]}`, PCOL[curPrio],
                () => { zm.setStoragePriority?.(tx, ty, (curPrio + 1) % 5); this.updateUI(); });
            const capX = ox + pad + halfW + 4, sW = 20, midW = halfW - sW * 2;
            this._infBtn(capX, ry, sW, 20, '−', 0x2a2418,
                () => { zm.setStorageCapacity?.(tx, ty, Math.max(0, curCap - 10)); this.updateUI(); });
            this._infTxt(capX + sW, ry + 4, curCap ? `${zFill}/${curCap}` : `${zFill}/∞`,
                { fontSize: this._fs(8), color: '#ddcc88', align: 'center', fixedWidth: midW });
            this._infBtn(capX + sW + midW, ry, sW, 20, '＋', 0x2a2418,
                () => { zm.setStorageCapacity?.(tx, ty, curCap + 10); this.updateUI(); });
            ry += 24;

            const CATS = [
                { id: 'Food.',            label: 'Food',  color: 0x336622 },
                { id: 'Materials.Wood.',  label: 'Wood',  color: 0x6a3a14 },
                { id: 'Materials.Stone.', label: 'Stone', color: 0x445566 },
                { id: 'Materials.Metal.', label: 'Metal', color: 0x334466 },
                { id: 'Textile.',         label: 'Cloth', color: 0x5a3a5a },
                { id: 'Equipment.',       label: 'Equip', color: 0x4a3a22 },
            ];
            const cfg     = zm.storageTiles?.get(zm.tileKey(tx, ty));
            const accepts = cfg?.accepts ?? [];
            const allOn   = accepts.length === 0;
            const catBW   = Math.floor((W - pad * 2 - CATS.length + 1) / CATS.length);
            CATS.forEach((cat, i) => {
                const on = allOn || accepts.includes(cat.id);
                this._infBtn(ox + pad + i * (catBW + 1), ry, catBW, 26, cat.label,
                    on ? cat.color : 0x181210,
                    () => {
                        let next;
                        if (allOn) next = CATS.map(c => c.id).filter(id => id !== cat.id);
                        else if (accepts.includes(cat.id)) next = accepts.filter(id => id !== cat.id);
                        else next = [...accepts, cat.id];
                        if (next.length === CATS.length) next = [];
                        zm.setStorageAccepts?.(tx, ty, next);
                        this.updateUI();
                    });
            });
            ry += 30;
            this._infTxt(ox + pad, ry,
                allOn ? 'Accepts: all' : `Accepts: ${accepts.map(a => a.split('.')[1] ?? a).join(', ')}`,
                { fontSize: this._fs(8), color: '#7a6a50' });
        }

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
            this._infTxt(ox + pad, ry, `Workers: ${assigned}`,
                { fontSize: this._fs(10), color: assigned ? '#88cc88' : '#5a5040' });
        }

        if (isGrow) {
            const zoneKeys = new Set(zoneTiles.map(t => zm.tileKey(t.tx, t.ty)));
            const farming = s.units.filter(u =>
                (u.taskType === 'harvest_grow' || u.taskType === 'plant_grow') &&
                zoneKeys.has(u.taskZoneKey ?? -1)
            ).length;
            const readyCount = zoneTiles.filter(t =>
                zm.growTiles.get(zm.tileKey(t.tx, t.ty))?.slots.some(v => v >= 1)
            ).length;
            this._infTxt(ox + pad, ry,
                `Farmers: ${farming}${readyCount > 0 ? `  ·  ${readyCount} ready` : ''}`,
                { fontSize: this._fs(9), color: farming ? '#88cc88' : '#5a5040' });
            ry += 16;

            const cropBW = Math.floor((W - pad * 2 - 8) / 3);
            let ci = 0;
            for (const [key, crop] of Object.entries(CROPS)) {
                const bx = ox + pad + ci * (cropBW + 4);
                const active = key === cropKey;
                this._infBtn(bx, ry, cropBW, 28, crop.label,
                    active ? crop.zoneColor : Math.max(0, (crop.zoneColor & 0xfefefe) >> 1),
                    () => {
                        zm.setGrowZoneCrop?.(tx, ty, key);
                        s.selectedZoneCrop = key;
                        const { tiles: t2, cropKey: c2 } = zm.getConnectedTiles(tx, ty);
                        zm.setSelection?.(t2, 0x88ee55);
                        s.selectedZoneTiles = t2;
                        s.selectedZoneCrop = c2;
                        this.updateUI();
                    });
                ci++;
                if (ci >= 3) { ci = 0; ry += 32; }
            }
        }

        if (isMarket) {
            const merchants = s.units.filter(u => u.taskType === 'merchant' &&
                zoneTiles.some(t => zm.tileKey(t.tx, t.ty) === u.taskZoneKey)
            ).length;
            this._infTxt(ox + pad, ry, `Merchants: ${merchants}`,
                { fontSize: this._fs(10), color: merchants ? '#ffcc66' : '#5a5040' });
        }
    },
};
