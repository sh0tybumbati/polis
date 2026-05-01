import {
    MAP_W, MAP_H, TILE, MAP_OY,
    BLDG, BLDG_CATS, FM_TYPES, FM_LABELS, UNIT_NAMES, VET_LEVELS, computeBuildCost, SEASONS, SEASON_DAYS,
    BLDG_VOLUME,
} from '../config/gameConstants.js';
import UIPanel from './UIPanel.js';
import { ITEMS } from '../content/items/index.js';

export default class UIManager {
    constructor(scene) {
        this.scene = scene;
        this._infoObjs   = [];
        this._tabObjs    = [];
        this._actionPanel = null;
        this._caravanModal = null;
    }

    _ui(obj) { this.scene.cameras.main.ignore(obj); return obj; }

    rebuildUI() { this.scene.scene.restart(); }

    // ─── Layout ───────────────────────────────────────────────────────────────

    _computeLayout() {
        const W = this.scene.SW, H = this.scene.SH;
        const PANEL_H = Math.min(340, Math.max(240, Math.floor(H * 0.30)));
        const TOP_H   = MAP_OY;   // must match MAP_OY so camera bounds align
        const KEY_H   = 10;   // decorative border strip
        const TAB_H   = 26;   // category tab row inside actions zone
        const panelY  = H - PANEL_H;
        const INFO_W  = Math.floor(W * 0.30);
        const MM_W    = Math.floor(W * 0.28);
        const ACT_W   = W - INFO_W - MM_W;
        return { W, H, PANEL_H, TOP_H, KEY_H, TAB_H, panelY, INFO_W, MM_W, ACT_W };
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    createUI() {
        this.L = this._computeLayout();
        const { W, H } = this.L;

        this._buildTopBar();
        this._buildBottomPanel();
        this._buildMinimapZone();

        // Persistent containers for dynamically rebuilt zones
        this._infoRoot  = this._ui(this.scene.add.container(0, 0).setDepth(21));
        this._tabRoot   = this._ui(this.scene.add.container(0, 0).setDepth(22));

        // Phase message overlay
        this.scene.phaseMsg = this._ui(this.scene.add.text(W / 2, H / 2 - 40, '', {
            fontSize: '22px', color: '#ffffff', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(100).setAlpha(0));

        this.scene.buildCat = this.scene.buildCat ?? 'Economy';
        this.updateUI();
    }

    // ─── Top bar ─────────────────────────────────────────────────────────────

    _buildTopBar() {
        const { W, TOP_H } = this.L;
        this._ui(this.scene.add.rectangle(W / 2, TOP_H / 2, W, TOP_H, 0x130e06, 0.97).setDepth(20));

        // Double-line bottom border
        const g = this._ui(this.scene.add.graphics().setDepth(20));
        g.lineStyle(2, 0xc8a030, 0.85).lineBetween(0, TOP_H - 1, W, TOP_H - 1);
        g.lineStyle(1, 0x7a5010, 0.5).lineBetween(0, TOP_H - 4, W, TOP_H - 4);

        this.scene.timerBarGfx = this._ui(this.scene.add.graphics().setDepth(21));

        const ts = { fontFamily: 'monospace', stroke: '#000000', strokeThickness: 2, align: 'center' };
        const cy = TOP_H / 2 - 2;
        const tbFs = this._fs(12);

        // Controls cluster width: enemyCount(~60) + gap + pause(28) + speed(28) + margins ≈ 150px
        const CTRL_W = 150;
        // 4 resource columns in the left (W - CTRL_W) region, day info in the gap
        const resW = W - CTRL_W;
        const cols = 4, colW = resW / cols;
        const mk = (i, color, fz = tbFs) =>
            this._ui(this.scene.add.text(colW * i + colW / 2, cy, '',
                { ...ts, fontSize: fz, color }).setOrigin(0.5, 0.5).setDepth(21));

        this.scene.foodText   = mk(0, '#7add77');
        this.scene.woodText   = mk(1, '#cc9944');
        this.scene.stoneText  = mk(2, '#aaaacc');
        this.scene.workerInfo = mk(3, '#ddcc88').setInteractive();
        this.scene.workerInfo.on('pointerdown', () => this.showCensusPanel());

        // Day + timer sits between resource cols and controls, centred in gap
        this.scene.dayInfo = this._ui(this.scene.add.text(resW + 8, cy, '', {
            ...ts, fontSize: this._fs(11), color: '#c8a030',
        }).setOrigin(0, 0.5).setDepth(21));

        // Enemy count + pause + speed — top-right cluster
        this.scene.enemyCount = this._ui(this.scene.add.text(W - 110, cy, '', {
            fontFamily: 'monospace', fontSize: this._fs(12), color: '#ee6655',
            stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5).setDepth(21));

        const pBtn = this._ui(this.scene.add.text(W - 68, cy, '⏸', {
            fontFamily: 'monospace', fontSize: this._fs(18), color: '#cccccc',
        }).setOrigin(0.5, 0.5).setDepth(21).setInteractive());
        pBtn.on('pointerdown', () => {
            this.scene.isPaused = !this.scene.isPaused;
            pBtn.setText(this.scene.isPaused ? '▶' : '⏸');
        });

        const sBtn = this._ui(this.scene.add.text(W - 36, cy, '1×', {
            fontFamily: 'monospace', fontSize: this._fs(14), color: '#ffdd44',
        }).setOrigin(0.5, 0.5).setDepth(21).setInteractive());
        sBtn.on('pointerdown', () => {
            this.scene.tickSpeed = (this.scene.tickSpeed % 5) + 1;
            sBtn.setText(`${this.scene.tickSpeed}×`);
        });

        // Retired refs kept as null so old callers don't crash
        this.scene.woolText = null;
        this.scene.phaseTag = null;
        this.scene.selInfo  = null;
        this.scene.timerText = null;
    }

    // ─── Bottom panel chrome ─────────────────────────────────────────────────

    _buildBottomPanel() {
        const { W, H, PANEL_H, panelY, KEY_H, INFO_W, MM_W } = this.L;

        // Background
        this._ui(this.scene.add.rectangle(W / 2, panelY + PANEL_H / 2, W, PANEL_H, 0x130e06, 0.97).setDepth(20));

        const g = this._ui(this.scene.add.graphics().setDepth(20));

        // Greek-key-inspired top border
        this._drawKeyBorder(g, 0, panelY, W, KEY_H);

        // Zone dividers
        g.lineStyle(1, 0x5a3f0e, 0.7)
            .lineBetween(INFO_W,          panelY + KEY_H + 2, INFO_W,          H - 2)
            .lineBetween(INFO_W + MM_W,   panelY + KEY_H + 2, INFO_W + MM_W,   H - 2);
    }

    _drawKeyBorder(g, x, y, w, h) {
        // Solid gold band
        g.fillStyle(0xc8a030, 0.9).fillRect(x, y, w, h);
        // Dark meander cutouts — simplified step pattern
        g.fillStyle(0x130e06, 0.88);
        const u = h;   // step unit = strip height
        for (let i = 0; i * u * 4 < w; i++) {
            const ox = x + i * u * 4;
            // Upper-right notch
            g.fillRect(ox + u,     y,         u, Math.ceil(h * 0.55));
            // Lower-left notch (next half-beat)
            g.fillRect(ox + u * 2, y + Math.floor(h * 0.45), u, Math.ceil(h * 0.55));
        }
        // Bright top edge line
        g.fillStyle(0xf0cc60, 0.6).fillRect(x, y, w, 1);
    }

    // ─── Minimap zone ────────────────────────────────────────────────────────

    _buildMinimapZone() {
        const { H, PANEL_H, panelY, KEY_H, INFO_W, MM_W } = this.L;
        const pad  = 6;
        const mmX  = INFO_W + pad;
        const mmY  = panelY + KEY_H + pad;
        const mmW  = MM_W - pad * 2;
        const mmH  = PANEL_H - KEY_H - pad * 2;

        this.scene._mmX = mmX; this.scene._mmY = mmY;
        this.scene._mmW = mmW; this.scene._mmH = mmH;

        // Double border (gold outer, dark inner)
        const g = this._ui(this.scene.add.graphics().setDepth(21));
        g.lineStyle(2, 0xc8a030, 0.7).strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
        g.lineStyle(1, 0x6a4a08, 0.5).strokeRect(mmX - 4, mmY - 4, mmW + 8, mmH + 8);

        this.scene.minimapGfx = this._ui(this.scene.add.graphics().setDepth(22));

        const mmZone = this._ui(this.scene.add.zone(mmX + mmW / 2, mmY + mmH / 2, mmW, mmH)
            .setInteractive().setDepth(23));
        mmZone.on('pointerdown', ptr => {
            const fx = (ptr.x - this.scene._mmX) / this.scene._mmW;
            const fy = (ptr.y - this.scene._mmY) / this.scene._mmH;
            this.scene.cameras.main.pan(fx * MAP_W * TILE, MAP_OY + fy * MAP_H * TILE, 300, 'Sine.easeOut');
        });
    }

    // ─── Update ──────────────────────────────────────────────────────────────

    updateUI() {
        this._updateResources();
        this._renderInfoPane();
        this._renderActionsZone();
    }

    updateEnemyCount() {
        const n = this.scene.units.filter(u => u.isEnemy && u.hp > 0).length;
        this.scene.enemyCount?.setText(n > 0 ? `⚔ ${n}` : '');
    }

    _updateResources() {
        const sm = this.scene.storageMax ?? {};
        const r  = this.scene.resources  ?? {};
        const units = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);
        // Food column: show wheat/flour/bread as a chain
        const avgNut = units.length > 0
            ? units.reduce((s, u) => s + (u.dailyNutrition ?? 0), 0) / units.length : 1;
        const foodWarn = units.length > 0 && avgNut < 0.3 && this.scene.mealsDone > 0;
        const w = r['Food.Grain.Wheat'] ?? 0, fl = r['Food.Grain.Wheat.Flour'] ?? 0, br = r['Food.Grain.Wheat.Bread'] ?? 0;
        const mt = r['Food.Meat.Venison'] ?? 0, sa = r['Food.Meat.Venison.Sausages'] ?? 0;
        const ct = this.scene.buildings.reduce((s, b) => s + (b.inbox?.['Food.Meat.Venison.Cuts'] ?? 0), 0);
        const meatStr = (mt || ct || sa) ? `  🥩${mt} 🔪${ct} 🌭${sa}` : '';
        this.scene.foodText?.setText(`🌾${w} 🍚${fl} 🍞${br}${meatStr}`)
            .setColor(foodWarn ? '#ff6655' : '#7add77');
        this.scene.woodText?.setText(`🪵 ${r['Materials.Wood.Pine'] ?? 0}/${sm['Materials.Wood.Pine'] ?? 0}`);
        this.scene.stoneText?.setText(`⛏ ${r['Materials.Stone.Limestone'] ?? 0}/${sm['Materials.Stone.Limestone'] ?? 0}`);

        const adults = units.filter(u => u.type === 'worker' && u.age >= 2).length;
        const popCap = this.scene.buildings
            .filter(b => !b.faction && b.built && BLDG[b.type]?.capacity)
            .reduce((s, b) => s + BLDG[b.type].capacity, 0);
        this.scene.workerInfo?.setText(`👥 ${adults}/${popCap}`);

        const phase = this.scene.phase;
        const seasonIdx = Math.floor((this.scene.day - 1) / SEASON_DAYS) % 4;
        const seasonName = SEASONS[seasonIdx];
        this.scene.dayInfo?.setText(phase === 'NIGHT'
            ? `🌙 N${this.scene.day}  ${seasonName}` : `☀ D${this.scene.day}  ${seasonName}`);

        this.updateEnemyCount();
    }

    showSaveFlash() {
        const txt = this.scene.add.text(this.scene.SW - 45, 10, '💾 saved', {
            fontSize: '9px', color: '#88cc88', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 1,
        }).setDepth(25).setOrigin(1, 0);
        this.scene.tweens.add({ targets: txt, alpha: 0, duration: 1500, onComplete: () => txt.destroy() });
    }

    // ─── Info Pane ───────────────────────────────────────────────────────────

    _clearInfo() {
        this._infoObjs.forEach(o => o.destroy());
        this._infoObjs = [];
    }

    _inf(obj) {
        this.scene.cameras.main.ignore(obj);
        this._infoObjs.push(obj);
        this._infoRoot.add(obj);
        return obj;
    }

    _infTxt(x, y, str, style) {
        return this._inf(this.scene.add.text(x, y, str,
            { fontFamily: 'monospace', ...style }).setDepth(22));
    }

    _infBar(x, y, w, h, ratio, col) {
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        g.fillStyle(0x221100, 0.8).fillRect(x, y, w, h);
        g.fillStyle(col).fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), h);
        return g;
    }

    _infBtn(x, y, w, h, label, color, cb) {
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        g.fillStyle(color, 0.88).fillRect(x, y, w, h);
        g.lineStyle(1, 0xc8a030, 0.35).strokeRect(x, y, w, h);

        const t = this._infTxt(x + w / 2, y + h / 2, label,
            { fontSize: this._fs(11), color: '#d4c8a8', align: 'center',
              wordWrap: { width: w - 4 } }).setOrigin(0.5);

        const z = this._inf(this.scene.add.zone(x + w / 2, y + h / 2, w, h)
            .setInteractive().setDepth(23));
        z.on('pointerdown', cb);
        return z;
    }

    // Font scale based on screen width — keeps text readable on small mobile screens
    _fontScale() { return Math.min(1.5, Math.max(1.0, this.L.W / 420)); }
    _fs(n)       { return `${Math.round(n * this._fontScale())}px`; }

    _renderInfoPane() {
        this._clearInfo();
        const { INFO_W, PANEL_H, KEY_H, panelY } = this.L;
        const W = INFO_W - 2, H = PANEL_H - KEY_H;
        const ox = 0, oy = panelY + KEY_H;
        const pad = 8;
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy);

        if (this.scene.selectedBuilding) {
            this._renderBuildingInfo(ox, oy, W, H, pad);
        } else if (sel.length > 0) {
            this._renderUnitInfo(sel, ox, oy, W, H, pad);
        } else if (this.scene.selectedNode) {
            this._renderNodeInfo(ox, oy, W, H, pad);
        } else {
            this._renderIdleInfo(ox, oy, W, H, pad);
        }
    }

    _renderBuildingInfo(ox, oy, W, H, pad) {
        const b   = this.scene.selectedBuilding;
        const def = BLDG[b.type];

        if ((b.type === 'house' || b.type === 'townhall') && b.built) {
            this._renderOikosInfo(b, ox, oy, W, H, pad);
            return;
        }

        this._infTxt(ox + pad, oy + 6, def.label,
            { fontSize: this._fs(13), color: '#c8a030' });
        if (def.desc) {
            this._infTxt(ox + pad, oy + 20, def.desc,
                { fontSize: this._fs(9), color: '#aaaaaa' });
        }

        // Status line
        let status = '';
        if (!b.built) {
            const needs = Object.entries(b.resNeeded ?? {}).filter(([,n]) => n > 0)
                .map(([r, n]) => `${n} ${r.slice(0,3)}`).join(' ');
            status = needs ? `needs: ${needs}` : '⚒ building…';
        } else {
            // State/Private Badge
            if (b.type !== 'house' && b.type !== 'townhall') {
                const label = b.isPublic ? '[STATE]' : '[PRIVATE]';
                const col   = b.isPublic ? '#c8a030' : '#6a5840';
                this._infTxt(ox + W - pad, oy + 6, label, { fontSize: this._fs(9), color: col }).setOrigin(1, 0);
            }
            
            if (def.capacity) {
                const pop = this.scene.units.filter(u => u.homeBldgId === b.id && !u.isEnemy && u.hp > 0).length;
                status = `👥 ${pop}/${def.capacity}`;
            }
            
            const maxVol = BLDG_VOLUME[b.type];
            if (maxVol) {
                const curVol = this.scene.economyManager.getBuildingCurrentVolume(b);
                const volStr = `📦 ${curVol.toFixed(0)}/${maxVol} cubits`;
                status = status ? `${status}  ${volStr}` : volStr;
            } else if (def.stores) {
                const p = Object.entries(def.stores)
                    .map(([r, cap]) => `${r.slice(0,3)}:${this.scene.resources[r] ?? 0}/${cap}`)
                    .join(' ');
                status = status ? `${status}  ${p}` : p;
            }
        }
        if (status) this._infTxt(ox + pad, oy + 31, status,
            { fontSize: this._fs(10), color: '#9a9077' });

        // Show pending tithes and wages
        let pendingY = oy + 44;
        if (Object.values(b.tithePending ?? {}).some(v => v > 0)) {
            const titheStr = Object.entries(b.tithePending).filter(([,v]) => v > 0)
                .map(([r, v]) => `${v} ${r.split('.').pop()}`).join(', ');
            this._infTxt(ox + pad, pendingY, `🌾 tithe: ${titheStr}`, { fontSize: this._fs(10), color: '#c8a030' });
            pendingY += 13;
        }
        const totalWages = Object.values(b.wagePending ?? {}).reduce((s, resMap) =>
            s + Object.values(resMap).reduce((a, b) => a + b, 0), 0);
        if (totalWages > 0) {
            const wageStr = Object.values(b.wagePending).reduce((acc, resMap) => {
                for (const [r, v] of Object.entries(resMap)) acc[r] = (acc[r] ?? 0) + v;
                return acc;
            }, {});
            const wageDesc = Object.entries(wageStr).filter(([, v]) => v > 0)
                .map(([r, v]) => `${v} ${r.split('.').pop()}`).join(', ');
            this._infTxt(ox + pad, pendingY, `💰 wages: ${wageDesc}`, { fontSize: this._fs(10), color: '#aac870' });
            pendingY += 13;
        }

        // HP bar for enemy buildings
        if (b.faction === 'enemy' && b.hp !== undefined) {
            this._infBar(ox + pad, oy + 30, W - pad * 2, 5, b.hp / b.maxHp, 0xcc3322);
        }

        // Worker list for built workshops/production buildings
        if (b.built && !b.faction) {
            const assigned = this.scene.units.filter(u =>
                !u.isEnemy && u.hp > 0 && u.taskBldgId === b.id && u.role);
            if (assigned.length > 0) {
                let wy = pendingY + 2;
                this._infTxt(ox + pad, wy, '👷 workers:', { fontSize: this._fs(10), color: '#c8a030' });
                wy += 13;
                for (const w of assigned) {
                    const sub = w.workshopSubrole ? ` [${w.workshopSubrole}]` : w.workshopPhase ? ` (${w.workshopPhase})` : '';
                    this._infTxt(ox + pad + 4, wy, `${w.name} — ${w.role}${sub}`,
                        { fontSize: this._fs(9), color: '#a09070' });
                    wy += 12;
                    if (wy > oy + H - 52) break;
                }
            } else if (b.built && !b.faction) {
                const wy = pendingY + 2;
                this._infTxt(ox + pad, wy, '👷 no workers assigned', { fontSize: this._fs(10), color: '#886644' });
            }
        }

        // State ownership toggle (built non-house buildings)
        if (b.built && b.type !== 'house' && b.type !== 'townhall' && !b.faction) {
            const isPublicStorage = b.type === 'woodshed' || b.type === 'stonepile';
            const BTN_H = 28;
            const ty = oy + H - BTN_H - 4;
            const bw = isPublicStorage ? (W - pad * 2 - 8) / 2 : (W - pad * 2 - 4);

            const label = b.isPublic ? '🏛 State  (toggle)' : '🏠 Private  (toggle)';
            const col   = b.isPublic ? 0x1a3040 : 0x2a2018;
            this._infBtn(ox + pad, ty, bw, BTN_H, label, col, () => {
                b.isPublic = !b.isPublic;
                this.updateUI();
            });

            if (isPublicStorage && b.isPublic) {
                const hLabel = b.hiring ? '👤 Hired (toggle)' : '👥 Hire? (toggle)';
                const hCol   = b.hiring ? 0x1a4030 : 0x2a2818;
                this._infBtn(ox + pad + bw + 4, ty, bw, BTN_H, hLabel, hCol, () => {
                    b.hiring = !b.hiring;
                    this.updateUI();
                });
            }
        }

        // Townhall: show archon + tithe
        if (b.type === 'townhall' && b.built) {
            const archon = this.scene.units.find(u => u.isArchon && u.hp > 0);
            if (archon) {
                this._infTxt(ox + pad, oy + 34,
                    `Archon: ${archon.name}`, { fontSize: '10px', color: '#ffdd88' });
                this._infPhenotype(ox + pad, oy + 46, archon.phenotype);
                this._infTxt(ox + pad + 32, oy + 47,
                    this._attrLine(archon.attributes), { fontSize: '8px', color: '#9a8860' });
            } else {
                this._infTxt(ox + pad, oy + 34, 'No Archon', { fontSize: '10px', color: '#884422' });
            }
            const rate = this.scene.titheRate ?? 10;
            this._infTxt(ox + pad, oy + 60, `Tithe: ${rate}%  (firstfruits auto)`,
                { fontSize: '9px', color: '#7a6030' });
        }
    }

    // Draw 3 tiny phenotype swatches (skin / hair / eye) at (x, y)
    _infPhenotype(x, y, p) {
        if (!p) return;
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        const colors = [p.skinHex, p.hairHex, p.eyeHex];
        colors.forEach((c, i) => {
            g.fillStyle(c, 1).fillCircle(x + i * 9, y + 4, 3.5);
            g.lineStyle(0.5, 0x000000, 0.3).strokeCircle(x + i * 9, y + 4, 3.5);
        });
    }

    // Compact attribute string: two highest attrs highlighted
    _attrLine(a) {
        if (!a) return '';
        const entries = [['STR',a.str],['DEX',a.dex],['CON',a.con],['INT',a.int],['AGI',a.agi],['WIL',a.wil]];
        entries.sort((x,y) => y[1]-x[1]);
        return entries.slice(0,2).map(([k,v]) => `${k}${v}`).join(' ');
    }

    _renderOikosInfo(b, ox, oy, W, H, pad) {
        const allRes = this.scene.units.filter(u => u.homeBldgId === b.id && !u.isEnemy && u.hp > 0);
        const adults   = allRes.filter(u => u.age >= 2);
        const youth    = allRes.filter(u => u.age === 1);
        const children = allRes.filter(u => u.age === 0);

        const patriarch = adults.find(u => u.isArchon) ?? adults.find(u => u.gender === 'male') ?? adults[0];
        const familyName = b.type === 'townhall'
            ? (patriarch ? `Archon: ${patriarch.name}` : 'Town Hall')
            : (patriarch ? `Oikos of ${patriarch.name}` : `House #${b.id}`);

        this._infTxt(ox + pad, oy + 4, familyName, { fontSize: this._fs(13), color: '#c8a030' });
        if (BLDG[b.type]?.desc) {
            this._infTxt(ox + pad, oy + 18, BLDG[b.type].desc, { fontSize: this._fs(9), color: '#aaaaaa' });
        }
        this._infTxt(ox + W - pad - 22, oy + 6, `${allRes.length}/${BLDG[b.type]?.capacity ?? '?'}`,
            { fontSize: this._fs(11), color: '#6a5c40' });

        const div = this._inf(this.scene.add.graphics().setDepth(22));
        div.lineStyle(1, 0x5a4820, 0.5).lineBetween(ox + pad, oy + 24, ox + W - pad, oy + 24);

        // Pair couples
        let ry = oy + 27;
        const seen = new Set();
        const coupleRows = [];
        for (const u of adults) {
            if (seen.has(u.id)) continue;
            seen.add(u.id);
            const spouse = u.spouseId ? adults.find(s => s.id === u.spouseId && !seen.has(s.id)) : null;
            if (spouse) seen.add(spouse.id);
            coupleRows.push(spouse ? [u, spouse] : [u]);
        }

        const resIds = new Set(allRes.map(u => u.id));
        const heirCandidates = allRes.filter(u =>
            (u.fatherId && resIds.has(u.fatherId)) || (u.motherId && resIds.has(u.motherId)));
        const heir = heirCandidates.length
            ? heirCandidates.reduce((a, c) => c.age > a.age ? c : a) : null;

        const rowH = 20;
        const drawMember = (u, indent) => {
            const gIcon = u.gender === 'female' ? '♀' : '♂';
            const gCol  = u.gender === 'female' ? '#cc88aa' : '#88aacc';
            const isHeir = u === heir;
            const nameStr = (u.name ?? '?').slice(0, 8) + (isHeir ? '★' : '');
            const nameCol = isHeir ? '#ffdd88' : '#c4b88a';

            this._infTxt(ox + pad + indent, ry, gIcon, { fontSize: '10px', color: gCol });
            this._infTxt(ox + pad + indent + 9, ry, nameStr, { fontSize: '10px', color: nameCol });
            this._infPhenotype(ox + W - pad - 30, ry, u.phenotype);

            // Attributes on second micro-line
            const attrStr = this._attrLine(u.attributes);
            const burning = Object.entries(u.passions ?? {}).find(([,v]) => v === 'burning');
            const passStr = burning ? `♥${burning[0].slice(0,5)}` : '';
            this._infTxt(ox + pad + indent + 9, ry + 9,
                `${attrStr}  ${passStr}`,
                { fontSize: '8px', color: '#7a6850' });

            ry += rowH;
        };

        for (const pair of coupleRows) {
            drawMember(pair[0], 0);
            if (pair[1]) drawMember(pair[1], 4); // slight indent for spouse
        }

        // Youth & children
        const minors = [...youth, ...children];
        if (minors.length) {
            const childDiv = this._inf(this.scene.add.graphics().setDepth(22));
            childDiv.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
            ry += 3;
            for (const u of minors) {
                const tag = u.age === 0 ? 'child' : 'youth';
                const fa = this.scene.units.find(p => p.id === u.fatherId);
                const mo = this.scene.units.find(p => p.id === u.motherId);
                const lin = fa || mo ? ` (${[fa?.name?.slice(0,5), mo?.name?.slice(0,4)].filter(Boolean).join('·')})` : '';
                this._infTxt(ox + pad + 6, ry, `↳ ${u.name?.slice(0,8) ?? '?'} ${tag}${lin}`,
                    { fontSize: '9px', color: '#9a8060' });
                this._infPhenotype(ox + W - pad - 30, ry, u.phenotype);
                ry += 12;
            }
        }

        // Inventory + appliances
        ry += 4;
        const div2 = this._inf(this.scene.add.graphics().setDepth(22));
        div2.lineStyle(1, 0x5a4820, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
        ry += 5;

        if (b.type === 'townhall') {
            // Commons: top public resources
            const r = this.scene.resources ?? {};
            const commons = Object.entries(r).filter(([, v]) => v > 0)
                .sort((a, c) => c[1] - a[1]).slice(0, 5);
            const commonsStr = commons.length
                ? commons.map(([k, v]) => `${v} ${k.split('.').pop().slice(0, 5)}`).join('  ')
                : 'empty';
            this._infTxt(ox + pad, ry, '⚖ Commons', { fontSize: this._fs(9), color: '#c8a030' });
            ry += 12;
            this._infTxt(ox + pad + 4, ry, commonsStr, { fontSize: this._fs(9), color: '#aac890' });
            ry += 13;

            // Archon's household inventory (their home building, if different from townhall)
            const archon = this.scene.units.find(u => u.isArchon && u.hp > 0);
            const archonHome = archon?.homeBldgId
                ? this.scene.buildings.find(bldg => bldg.id === archon.homeBldgId && bldg.id !== b.id)
                : null;
            if (archonHome) {
                const hInv = Object.entries(archonHome.inventory ?? {}).filter(([, v]) => v > 0);
                const hStr = hInv.length
                    ? hInv.map(([k, v]) => `${v} ${k.split('.').pop().slice(0, 5)}`).join('  ')
                    : 'empty';
                this._infTxt(ox + pad, ry, '🏠 Archon House', { fontSize: this._fs(9), color: '#c8a070' });
                ry += 12;
                this._infTxt(ox + pad + 4, ry, hStr, { fontSize: this._fs(9), color: '#aa9060' });
                ry += 13;
            }
        } else {
            const inv = b.inventory ?? {};
            const invEntries = Object.entries(inv).filter(([, v]) => v > 0);
            const invStr = invEntries.length
                ? invEntries.map(([r, v]) => `${v} ${r.split('.').pop().slice(0, 5)}`).join('  ')
                : 'empty';
            this._infTxt(ox + pad, ry, `📦 ${invStr}`, { fontSize: this._fs(10), color: invEntries.length ? '#aac890' : '#4a4030' });
            ry += 13;
        }

        const slotLine = (b.applianceItems ?? []).length
            ? b.applianceItems.map(a => a.label ?? a).join(', ')
            : 'no appliances';
        this._infTxt(ox + pad, ry, `[${slotLine}]`, { fontSize: this._fs(9), color: '#5a6840' });
    }

    _renderUnitInfo(sel, ox, oy, W, H, pad) {
        if (sel.length === 1) {
            const u   = sel[0];
            const nm  = UNIT_NAMES[u.type] ?? u.type;
            const vet = u.vetLevel >= 1 ? VET_LEVELS[u.vetLevel - 1].label + ' ' : '';
            this._infTxt(ox + pad, oy + 5, `${vet}${nm}`,
                { fontSize: '12px', color: '#c8a030' });
            this._infTxt(ox + pad, oy + 18, u.name ?? '',
                { fontSize: '10px', color: '#7a7060' });
            this._infBar(ox + pad, oy + 31, W - pad * 2 - 4, 5,
                u.hp / u.maxHp,
                u.hp / u.maxHp > 0.5 ? 0x44cc44 : u.hp / u.maxHp > 0.25 ? 0xddaa22 : 0xcc3311);
            this._infTxt(ox + pad, oy + 38, `HP ${u.hp}/${u.maxHp}`,
                { fontSize: '9px', color: '#666655' });

            // Nutrition Bar
            const nut = Math.min(1, u.dailyNutrition ?? 0);
            const nutCol = nut > 0.7 ? 0x44aa44 : nut > 0.3 ? 0xddaa22 : 0xcc3311;
            this._infBar(ox + pad, oy + 48, W - pad * 2 - 4, 5, nut, nutCol);
            this._infTxt(ox + pad, oy + 55, `FED ${Math.round(nut * 100)}%`,
                { fontSize: '9px', color: '#666655' });

            // Physical Stats (Encumbrance/Volume)
            const curW = this.scene.unitManager.getUnitCarryWeight(u);
            const maxW = this.scene.unitManager.getUnitMaxWeight(u);
            const curV = this.scene.unitManager.getUnitCarryVolume(u);
            const maxV = this.scene.unitManager.getUnitMaxVolume(u);
            const eq   = u.equipment ? ` [${u.equipment}]` : '';

            this._infTxt(ox + pad, oy + 65, `⚖ ${curW.toFixed(1)}/${maxW} lbs${eq}`,
                { fontSize: '9px', color: '#8899aa' });
            this._infTxt(ox + pad, oy + 76, `📦 ${curV.toFixed(1)}/${maxV} cubits`,
                { fontSize: '9px', color: '#aa9988' });

            if (u.type === 'worker') {
                const role = u.role ? u.role[0].toUpperCase() + u.role.slice(1) : 'Idle';
                this._infTxt(ox + pad, oy + 88, `Role: ${role}`,
                    { fontSize: '10px', color: '#aaaacc' });

                // Phenotype swatches + height
                this._infPhenotype(ox + pad, oy + 80, u.phenotype);
                const htPct = u.phenotype ? Math.round((u.phenotype.heightScale - 0.6) / 0.8 * 100) : 50;
                this._infTxt(ox + pad + 32, oy + 80, `ht ${htPct}%`,
                    { fontSize: '8px', color: '#6a5840' });

                // All 6 attributes
                const a = u.attributes;
                if (a) {
                    this._infTxt(ox + pad, oy + 93,
                        `STR${a.str} DEX${a.dex} CON${a.con}`,
                        { fontSize: '9px', color: '#9a8860' });
                    this._infTxt(ox + pad, oy + 103,
                        `INT${a.int} AGI${a.agi} WIL${a.wil}`,
                        { fontSize: '9px', color: '#9a8860' });
                }

                // Passions
                const burning = Object.entries(u.passions ?? {}).find(([,v]) => v === 'burning');
                const interested = Object.entries(u.passions ?? {}).filter(([,v]) => v === 'interested').map(([k]) => k);
                if (burning) this._infTxt(ox + pad, oy + 97, `♥ ${burning[0]}`, { fontSize: '9px', color: '#c8603a' });
                if (interested.length) this._infTxt(ox + pad, oy + 107,
                    `~ ${interested.map(s=>s.slice(0,5)).join(', ')}`, { fontSize: '8px', color: '#7a7060' });

                // Skills with level > 1
                const trainedSkills = Object.entries(u.skills ?? {}).filter(([,v]) => v.level > 1);
                if (trainedSkills.length) {
                    let sy = oy + 118;
                    const div = this._inf(this.scene.add.graphics().setDepth(22));
                    div.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, sy - 1, ox + W - pad, sy - 1);
                    trainedSkills.sort((a,b) => b[1].level - a[1].level).slice(0, 4).forEach(([k, v]) => {
                        const stars = '★'.repeat(Math.min(v.level - 1, 4));
                        this._infTxt(ox + pad, sy, `${k.slice(0,8)} ${stars}`,
                            { fontSize: '8px', color: '#7a9060' });
                        sy += 10;
                    });
                }

                // Lineage
                const fa = u.fatherId ? this.scene.units.find(p => p.id === u.fatherId) : null;
                const mo = u.motherId ? this.scene.units.find(p => p.id === u.motherId) : null;
                const spouse = u.spouseId ? this.scene.units.find(p => p.id === u.spouseId) : null;
                const myChildren = this.scene.units.filter(c => c.fatherId === u.id || c.motherId === u.id);

                let ly = oy + 160;
                if (spouse) {
                    const sIcon = spouse.gender === 'female' ? '♀' : '♂';
                    this._infTxt(ox + pad, ly, `${sIcon} ${spouse.name?.slice(0,10) ?? '?'}`,
                        { fontSize: '9px', color: '#c8a870' });
                    ly += 11;
                }
                if (fa || mo) {
                    const lin = [fa?.name?.slice(0,7), mo?.name?.slice(0,7)].filter(Boolean).join(' & ');
                    this._infTxt(ox + pad, ly, `↑ ${lin}`, { fontSize: '8px', color: '#6a5840' });
                    ly += 10;
                }
                if (myChildren.length) {
                    this._infTxt(ox + pad, ly,
                        `↓ ${myChildren.map(c => c.name?.slice(0,5) ?? '?').slice(0,3).join(', ')}`,
                        { fontSize: '8px', color: '#6a7850' });
                }
            } else {
                this._infTxt(ox + pad, oy + 50, `Atk:${u.atk}  Spd:${u.speed}`,
                    { fontSize: '10px', color: '#aaaacc' });
            }
        } else {
            this._infTxt(ox + pad, oy + 5, `${sel.length} units selected`,
                { fontSize: '10px', color: '#c8a030' });
            const tally = {};
            sel.forEach(u => {
                const lbl = u.type === 'worker' && u.role ? u.role : (UNIT_NAMES[u.type] ?? u.type);
                tally[lbl] = (tally[lbl] ?? 0) + 1;
            });
            let ty = oy + 20;
            Object.entries(tally).forEach(([t, c]) => {
                this._infTxt(ox + pad, ty, `${c}×  ${t}`,
                    { fontSize: '10px', color: '#9a9077' });
                ty += 13;
            });
        }
    }

    _renderNodeInfo(ox, oy, W, H, pad) {
        const n = this.scene.selectedNode;
        const label = n.type.replace(/_/g, ' ');
        this._infTxt(ox + pad, oy + 6, label, { fontSize: this._fs(13), color: '#c8a030' });
        this._infTxt(ox + pad, oy + 22, `Stock: ${n.stock}`, { fontSize: this._fs(11), color: '#9a9077' });
        const res = n.resource ?? n.type;
        this._infTxt(ox + pad, oy + 36, `Yields: ${res.split('.').pop()}`, { fontSize: this._fs(10), color: '#7a9060' });
        this._infBtn(ox + pad, oy + 52, W - pad * 2 - 4, 32, 'Send workers', 0x2a4022, () => {
            if (this.scene.selIds.size > 0) this.scene.orderWorkersToNode(n);
        });
        this._infBtn(ox + pad, oy + 90, W - pad * 2 - 4, 28, 'Close  ✕', 0x221a10, () => {
            this.scene.selectedNode = null; this.updateUI();
        });
    }

    _renderIdleInfo(ox, oy, W, H, pad) {
        this._infTxt(ox + pad, oy + 6, 'No selection',
            { fontSize: this._fs(11), color: '#4a4030' });

        const workers = this.scene.units.filter(u => !u.isEnemy && u.type === 'worker' && u.hp > 0);
        this._infTxt(ox + pad, oy + 22, `👥 ${workers.length} citizens`, { fontSize: this._fs(12), color: '#887755' });

        const census = {};
        for (const u of workers) {
            const role = u.role ?? 'Idle';
            census[role] = (census[role] ?? 0) + 1;
        }

        const sorted = Object.entries(census).sort((a, b) => b[1] - a[1]).slice(0, 8);
        let ry = oy + 38;
        for (const [role, count] of sorted) {
            this._infTxt(ox + pad, ry, `${role}  ×${count}`, { fontSize: this._fs(10), color: '#9a9077' });
            ry += 13;
        }

        // Show expanded resources
        let ty = ry + 6;
        const sm = this.scene.storageMax ?? {};
        const r  = this.scene.resources  ?? {};
        const extras = [
            { k: 'Materials.Wood.Pine.Plank',         icon: '🪵→' },
            { k: 'Materials.Stone.Limestone.Block',   icon: '🧱→' },
            { k: 'Materials.Wood.Pine.Sticks',        icon: '🪃' },
            { k: 'Materials.Stone.Limestone.Stones',  icon: '🪨' },
            { k: 'Textile.Fiber.Wool',                icon: '🧶' },
            { k: 'Food.Meat.Venison',                 icon: '🥩' },
            { k: 'Food.Meat.Venison.Sausages',        icon: '🌭' },
            { k: 'Food.Grain.Wheat',                  icon: '🌿' },
            { k: 'Food.Grain.Wheat.Flour',            icon: '⚙→' },
            { k: 'Food.Produce.Olive',                icon: '🫒' },
            { k: 'seeds',                             icon: '🌱' },
            { k: 'Textile.Hide.Deer',                 icon: '🐾' },
            { k: 'Materials.Metal.Copper.Ore',        icon: '🔩' },
        ];
        extras.forEach(({ k, icon }) => {
            if ((sm[k] ?? 0) > 0) {
                this._infTxt(ox + pad, ty, `${icon} ${r[k] ?? 0}/${sm[k]}`,
                    { fontSize: '10px', color: '#7a7060' });
                ty += 13;
            }
        });
    }

    // ─── Actions Zone ────────────────────────────────────────────────────────

    _clearTabs() {
        this._tabObjs.forEach(o => o.destroy());
        this._tabObjs = [];
    }

    _tab(obj) {
        this.scene.cameras.main.ignore(obj);
        this._tabObjs.push(obj);
        this._tabRoot.add(obj);
        return obj;
    }

    _renderActionsZone() {
        this._clearTabs();
        if (this._actionPanel) { this._actionPanel.destroy(); this._actionPanel = null; }

        const { PANEL_H, KEY_H, TAB_H, panelY, INFO_W, MM_W, ACT_W } = this.L;
        const zx = INFO_W + MM_W;
        const zy = panelY + KEY_H;

        const sel  = this.scene.units.filter(u => u.selected && !u.isEnemy);
        const bldg = this.scene.selectedBuilding;

        let items = [];
        let showTabs = false;

        if (bldg) {
            items = this._buildingActionItems(bldg);
        } else if (sel.length > 0) {
            items = this._unitActionItems(sel);
        } else {
            // Nothing selected — show build menu
            showTabs = true;
            items = this._buildMenuItems();
            items.push({ label: 'All', color: 0x223318, callback: () => {
                this.scene.units.filter(u => !u.isEnemy).forEach(u => this.scene.selectUnit(u.id, true));
            }});
        }

        const MAT_H   = showTabs ? 18 : 0;
        const tabsY   = zy + MAT_H;
        const panelY2 = showTabs ? zy + MAT_H + TAB_H : zy;
        const panelH  = PANEL_H - KEY_H - (showTabs ? MAT_H + TAB_H : 0);

        if (showTabs) {
            this._renderMaterialToggle(zx, zy, ACT_W, MAT_H);
            this._renderCategoryTabs(zx, tabsY, ACT_W, TAB_H);
        }

        this._actionPanel = new UIPanel(this.scene, zx, panelY2, ACT_W, panelH);
        this._actionPanel.setItems(items);
    }

    _buildingActionItems(b) {
        const items = [];
        const def = BLDG[b.type];
        const s = this.scene;
        const afford = (cost) => s.economyManager.afford(cost);

        const close = () => { s.selectedBuilding = null; this.updateUI(); };

        if (!b.built) {
            items.push({ label: 'Cancel Build', color: 0x443322, callback: () => { s.demolishBuilding(b); } });
            items.push({ label: '✕ Close', color: 0x2a1c10, callback: close });
            return items;
        }

        // Type-specific actions
        if (b.type === 'gate') {
            items.push({ label: b.isOpen ? 'Close Gate' : 'Open Gate', color: 0x442200, callback: () => {
                b.isOpen = !b.isOpen; s.redrawBuilding(b); this.updateUI();
            }});
        }

        if (b.type === 'barracks') {
            const train = (type, cost, label) => {
                const can = afford(cost);
                items.push({ label, sublabel: Object.entries(cost).map(([r,n])=>`${n}${r[0]}`).join(' '),
                    color: can ? 0x4a3820 : 0x2a1c10, dimmed: !can, callback: () => {
                        if (!can) return;
                        s.economyManager.spend(cost);
                        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                        s.spawnUnit(type, cx+Phaser.Math.Between(-16,16), cy+Phaser.Math.Between(-8,8), false);
                        this.updateUI();
                    }});
            };
            train('clubman',  { 'Food.Grain.Wheat': 3 },                                    'Clubman');
            train('spearman', { 'Food.Grain.Wheat': 5, 'Materials.Stone.Limestone': 1 },  'Spearman');
        }

        if (b.type === 'archery') {
            const train = (type, cost, label) => {
                const can = afford(cost);
                items.push({ label, sublabel: Object.entries(cost).map(([r,n])=>`${n}${r[0]}`).join(' '),
                    color: can ? 0x2a4030 : 0x2a1c10, dimmed: !can, callback: () => {
                        if (!can) return;
                        s.economyManager.spend(cost);
                        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                        s.spawnUnit(type, cx+Phaser.Math.Between(-16,16), cy+Phaser.Math.Between(-8,8), false);
                        this.updateUI();
                    }});
            };
            train('slinger', { 'Food.Grain.Wheat': 3 },                             'Slinger');
            train('archer',  { 'Food.Grain.Wheat': 5, 'Materials.Wood.Pine': 1 }, 'Archer');
        }

        if (b.type === 'stable') {
            const can = afford({ 'Food.Grain.Wheat': 8, 'Materials.Wood.Pine': 2 });
            items.push({ label: 'Cavalry', sublabel: '8f 2w', color: can ? 0x4a3010 : 0x2a1c10, dimmed: !can, callback: () => {
                if (!can) return;
                s.economyManager.spend({ 'Food.Grain.Wheat': 8, 'Materials.Wood.Pine': 2 });
                const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                s.spawnUnit('cavalry', cx, cy, false);
                this.updateUI();
            }});
        }

        if (b.type === 'townhall') {
            const can = afford({ 'Food.Grain.Wheat': 5 });
            items.push({ label: 'Train Scout', sublabel: '5w', color: can ? 0x334455 : 0x2a1c10, dimmed: !can, callback: () => {
                if (!can) { this.showPhaseMessage('Not enough wheat!', 0xff4444); return; }
                s.economyManager.takeFromCommons('Food.Grain.Wheat', 5);
                const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                s.spawnUnit('scout', cx, cy, false);
                this.updateUI();
            }});
            const rate = s.titheRate ?? 10;
            items.push({ label: `Tithe –  ${rate}%`, color: 0x332211, callback: () => {
                s.titheRate = Math.max(0, (s.titheRate ?? 10) - 5); this.updateUI();
            }});
            items.push({ label: `Tithe +  ${rate}%`, color: 0x223311, callback: () => {
                s.titheRate = Math.min(40, (s.titheRate ?? 10) + 5); this.updateUI();
            }});
            items.push({ label: 'New Game', color: 0x3a1111, callback: () => {
                s.clearSave();
                s.scene.restart();
            }});
        }

        if (b.type === 'pasture' && ((b.males ?? 0) + (b.females ?? 0)) >= 1) {
            items.push({ label: 'Slaughter Sheep', color: 0x661111, callback: () => {
                s._slaughterSheep(b); this.updateUI();
            }});
        }

        if (b.type === 'temple') {
            const c = { ares: 'athena', athena: 'apollo', apollo: 'ares' };
            items.push({ label: `Deity: ${(b.deity ?? 'ares').toUpperCase()}`, color: 0x442266, callback: () => {
                b.deity = c[b.deity ?? 'ares']; this.updateUI();
            }});
        }

        if (b.type === 'garden') {
            const crops = { lentils: 'Lentils', garlic: 'Garlic', onions: 'Onions' };
            const c = { lentils: 'garlic', garlic: 'onions', onions: 'lentils' };
            items.push({ label: `Crop: ${crops[b.cropType ?? 'lentils']}`, color: 0x336633, callback: () => {
                b.cropType = c[b.cropType ?? 'lentils']; this.updateUI();
            }});
        }

        // Assign workers button for production buildings
        if (b.type !== 'house' && b.type !== 'wall' && b.type !== 'palisade') {
            items.push({ label: 'Assign Workers', color: 0x334422, callback: () => {
                s.orderWorkersToBuilding(b); this.updateUI();
            }});
        }

        if (b.built && !b.faction && Object.values(b.inventory ?? {}).some(v => v > 0)) {
            items.push({ label: '📦 Inventory', color: 0x1a2030, callback: () => {
                this.showInventoryModal(b);
            }});
        }

        items.push({ label: 'Demolish', color: 0x551111, callback: () => { s.demolishBuilding(b); } });
        items.push({ label: '✕ Close',  color: 0x2a1c10, callback: close });
        return items;
    }

    _unitActionItems(sel) {
        const items = [];
        const s = this.scene;
        const workers  = sel.filter(u => u.type === 'worker' && u.age >= 2);
        const military = sel.filter(u => u.type !== 'worker');
        const scouts   = sel.filter(u => u.type === 'scout');

        if (workers.length > 0 && military.length === 0) {
            // Pure worker selection — role assignment
            const ROLES = [
                { role: 'farmer',     label: 'Farm',    color: 0x336622 },
                { role: 'forager',    label: 'Forage',  color: 0x2a4a22 },
                { role: 'woodcutter', label: 'Lumber',  color: 0x5a3a18 },
                { role: 'miner',      label: 'Mine',    color: 0x444444 },
                { role: 'builder',    label: 'Build',   color: 0x554422 },
                { role: 'shepherd',   label: 'Herd',    color: 0x445533 },
                { role: 'hunter',     label: 'Hunt',    color: 0x553322 },
            ];
            for (const { role, label, color } of ROLES) {
                const active = workers.every(u => u.role === role);
                items.push({ label, color: active ? color + 0x222222 : color, active, callback: () => {
                    workers.forEach(u => { u.role = role; u.taskType = null; u.targetNode = null; u.moveTo = null; });
                    s.deselect(); this.updateUI();
                }});
            }
            if (workers.some(u => u.role)) {
                items.push({ label: 'Clear Role', color: 0x3a2a1a, callback: () => {
                    workers.forEach(u => { u.role = null; u.taskType = null; });
                    this.updateUI();
                }});
            }
            items.push({ label: 'Recall Home', color: 0x223344, callback: () => {
                workers.forEach(u => {
                    const home = s.buildings.find(b => b.id === u.homeBldgId);
                    if (home) u.moveTo = { x: (home.tx+home.size/2)*TILE, y: MAP_OY+(home.ty+home.size/2)*TILE };
                    u.taskType = null; u.targetNode = null;
                });
                s.deselect(); this.updateUI();
            }});
        } else if (military.length > 0 || scouts.length > 0) {
            // Military / scout selection — formation + combat commands
            const fmItems = FM_TYPES.map((type, i) => ({
                label: FM_LABELS[i],
                color: s.fmType === type ? 0x336688 : 0x1e2c3a,
                active: s.fmType === type,
                callback: () => {
                    s.fmType = type;
                    const ax = sel.reduce((acc, u) => acc + u.x, 0) / sel.length;
                    const ay = sel.reduce((acc, u) => acc + u.y, 0) / sel.length;
                    s.moveSelectedTo(ax, ay);
                    this.updateUI();
                },
            }));
            items.push(...fmItems);

            if (scouts.length > 0) {
                items.push({ label: 'Explore', color: 0x3a2a50, callback: () => {
                    scouts.forEach(u => { u.role = 'scouting'; });
                    s.deselect(); this.updateUI();
                }});
            }

            // Garrison nearest watchtower
            const towers = s.buildings.filter(b => b.built && !b.faction && b.type === 'watchtower');
            if (towers.length > 0) {
                items.push({ label: 'Garrison Tower', color: 0x334455, callback: () => {
                    const cx = sel.reduce((a, u) => a + u.x, 0) / sel.length;
                    const cy = sel.reduce((a, u) => a + u.y, 0) / sel.length;
                    const tower = towers.reduce((best, b) => {
                        const d = Phaser.Math.Distance.Between(cx, cy, (b.tx+1)*TILE, MAP_OY+(b.ty+1)*TILE);
                        return (!best || d < best.d) ? { b, d } : best;
                    }, null)?.b;
                    if (tower) s.orderWorkersToBuilding(tower);
                    s.deselect(); this.updateUI();
                }});
            }

            if (military.some(u => (u.vetLevel ?? 0) === 0)) {
                items.push({ label: 'Dismiss', color: 0x663322, callback: () => {
                    military.forEach(u => { if ((u.vetLevel ?? 0) === 0) u.role = 'demobilizing'; });
                    s.deselect(); this.updateUI();
                }});
            }
        } else {
            // Mixed or children — just move commands
            const fmItems = FM_TYPES.map((type, i) => ({
                label: FM_LABELS[i], color: s.fmType === type ? 0x336688 : 0x1e2c3a, active: s.fmType === type,
                callback: () => { s.fmType = type; this.updateUI(); },
            }));
            items.push(...fmItems);
        }

        items.push({ label: 'Select All', color: 0x223318, callback: () => {
            s.units.filter(u => !u.isEnemy).forEach(u => s.selectUnit(u.id, true));
            this.updateUI();
        }});
        items.push({ label: '✕ Clear', color: 0x2a1c10, callback: () => {
            s.bldgType = null; s.roadMode = false;
            s.deselect(); s.hoverGfx?.clear(); this.updateUI();
        }});
        return items;
    }

    _renderMaterialToggle(x, y, w, h) {
        const mat  = this.scene.bldgMaterial ?? 'Materials.Wood.Pine';
        const half = Math.floor(w / 2);
        [['Materials.Wood.Pine', '🪵 Wood', x], ['Materials.Stone.Limestone', '🧱 Stone', x + half]].forEach(([m, label, bx]) => {
            const active = mat === m;
            const bg = this._tab(this.scene.add.graphics().setDepth(22));
            bg.fillStyle(active ? 0x4a3018 : 0x1a1208, active ? 0.95 : 0.7)
              .fillRect(bx, y, half - 1, h - 1);
            if (active) bg.lineStyle(1, 0xc8a030, 0.7).strokeRect(bx, y, half - 1, h - 1);
            this._tab(this.scene.add.text(bx + half / 2, y + h / 2, label, {
                fontFamily: 'monospace', fontSize: '9px',
                color: active ? '#e8d090' : '#5a4a28',
            }).setOrigin(0.5).setDepth(22));
            this._tab(this.scene.add.zone(bx + half / 2, y + h / 2, half - 1, h - 1)
                .setInteractive().setDepth(23))
                .on('pointerdown', () => { this.scene.bldgMaterial = m; this.updateUI(); });
        });
    }

    _renderCategoryTabs(x, y, w, h) {
        const cats  = Object.keys(BLDG_CATS);
        const tabW  = Math.floor((w - 2) / cats.length);

        cats.forEach((cat, i) => {
            const active = this.scene.buildCat === cat;
            const tx = x + 1 + i * tabW;
            const bg = this._tab(this.scene.add.graphics().setDepth(22));
            bg.fillStyle(active ? 0x4a6070 : 0x221a0e, active ? 0.95 : 0.8)
              .fillRect(tx, y, tabW - 1, h - 1);
            if (active) bg.lineStyle(1, 0xc8a030, 0.8).strokeRect(tx, y, tabW - 1, h - 1);

            const label = cat.length > 5 ? cat.slice(0, 4) : cat;
            const txt = this._tab(this.scene.add.text(tx + tabW / 2, y + h / 2, label, {
                fontFamily: 'monospace', fontSize: '11px',
                color: active ? '#e8d8a0' : '#6a5a3a',
            }).setOrigin(0.5).setDepth(22));

            const z = this._tab(this.scene.add.zone(tx + tabW / 2, y + h / 2, tabW - 1, h - 1)
                .setInteractive().setDepth(23));
            z.on('pointerdown', () => {
                this.scene.buildCat = cat; this.updateUI();
            });
        });
    }

    _buildMenuItems() {
        const mat  = this.scene.bldgMaterial ?? 'Materials.Wood.Pine';
        const bldgs = BLDG_CATS[this.scene.buildCat] ?? [];
        const items = bldgs.map(type => {
            const def      = BLDG[type];
            const cost     = computeBuildCost(type, mat);
            const canBuy   = !Object.keys(cost).length || this.scene.economyManager.afford(cost);
            const isActive = this.scene.bldgType === type;
            const costStr  = Object.keys(cost).length
                ? Object.entries(cost).map(([r, n]) => `${n}${r[0]}`).join(' ')
                : null;
            return {
                label: def.label,
                sublabel: costStr,
                desc: def.desc,
                color: isActive ? 0x4a6070 : (def.color > 0 ? Math.max(0, (def.color & 0xfefefe) >> 1) : 0x2a1e0e),
                dimmed: !canBuy,
                active: isActive,
                callback: () => {
                    this.scene.bldgType = isActive ? null : type;
                    this.scene.roadMode = false;
                    this.scene.hoverGfx?.clear();
                    this.updateUI();
                },
            };
        });

        items.push({
            label: 'Road',
            sublabel: '1s',
            color: this.scene.roadMode ? 0x4a5a28 : 0x2a2010,
            active: this.scene.roadMode,
            callback: () => {
                this.scene.roadMode = !this.scene.roadMode;
                this.scene.bldgType = null;
                this.scene.hoverGfx?.clear();
                this.updateUI();
            },
        });

        return items;
    }

    // ─── Inventory modal ─────────────────────────────────────────────────────

    showInventoryModal(b) {
        if (this._invModal) { this._invModal.forEach(o => o.destroy()); this._invModal = null; }
        const W = this.scene.SW, H = this.scene.SH;
        const mw = Math.min(W * 0.94, 500), mh = Math.min(H * 0.84, 580);
        const mx = (W - mw) / 2, my = (H - mh) / 2;
        const objs = [];

        const bg = this._ui(this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setDepth(40).setInteractive());
        const panel = this._ui(this.scene.add.rectangle(W / 2, H / 2, mw, mh, 0x16120a, 1).setDepth(41).setInteractive());
        const border = this._ui(this.scene.add.graphics().setDepth(42));
        border.lineStyle(2, 0xc8a030, 0.8).strokeRect(mx, my, mw, mh);
        objs.push(bg, panel, border);

        const def = BLDG[b.type];
        const titleTxt = this._ui(this.scene.add.text(mx + mw / 2, my + 15,
            `📦 ${def?.label ?? b.type}`, {
                fontSize: '16px', color: '#ffdd88', fontFamily: 'monospace',
            }).setOrigin(0.5, 0).setDepth(43));
        objs.push(titleTxt);

        const closeAll = () => { objs.forEach(o => o.destroy()); this._invModal = null; };
        const closeBtn = this._ui(this.scene.add.text(mx + mw - 14, my + 15, '✕', {
            fontSize: '20px', color: '#ffdd88', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(43).setInteractive());
        closeBtn.on('pointerdown', closeAll);
        bg.on('pointerdown', closeAll);
        objs.push(closeBtn);

        // Volume bar
        const maxVol = BLDG_VOLUME[b.type] ?? 0;
        let contentY = my + 42;
        if (maxVol > 0) {
            const curVol = this.scene.economyManager.getBuildingCurrentVolume(b);
            const ratio = Math.min(1, curVol / maxVol);
            const barX = mx + 12, barW = mw - 24, barH = 10;
            const vg = this._ui(this.scene.add.graphics().setDepth(43));
            vg.fillStyle(0x221100, 0.8).fillRect(barX, contentY, barW, barH);
            vg.fillStyle(ratio > 0.85 ? 0xcc4422 : 0x3a7a6a).fillRect(barX, contentY, Math.round(barW * ratio), barH);
            vg.lineStyle(1, 0xc8a030, 0.3).strokeRect(barX, contentY, barW, barH);
            objs.push(vg);
            contentY += barH + 4;
            const volTxt = this._ui(this.scene.add.text(mx + mw / 2, contentY,
                `${curVol.toFixed(0)} / ${maxVol} cubits`, {
                    fontSize: '11px', color: '#7a9090', fontFamily: 'monospace',
                }).setOrigin(0.5, 0).setDepth(43));
            objs.push(volTxt);
            contentY += 16;
        }

        const sep1 = this._ui(this.scene.add.graphics().setDepth(42));
        sep1.lineStyle(1, 0x4a3810, 0.5).lineBetween(mx + 12, contentY, mx + mw - 12, contentY);
        objs.push(sep1);
        contentY += 8;

        // Inventory items grouped by taxonomy category
        const inv = b.inventory ?? {};
        const CATS = { Food: [], Materials: [], Textile: [], Equipment: [] };
        const other = [];
        for (const [key, qty] of Object.entries(inv)) {
            if (qty <= 0) continue;
            const cat = key.split('.')[0];
            (CATS[cat] ?? other).push({ key, qty });
        }
        if (other.length) CATS.Other = other;

        const colLabel = mx + 16, colQty = mx + mw - 16;
        const lineH = 26;

        let hasAny = false;
        for (const [cat, items] of Object.entries(CATS)) {
            if (!items.length) continue;
            hasAny = true;
            const catTxt = this._ui(this.scene.add.text(colLabel, contentY, cat.toUpperCase(), {
                fontSize: '11px', color: '#c8a030', fontFamily: 'monospace',
            }).setDepth(43));
            objs.push(catTxt);
            contentY += 18;

            for (const { key, qty } of items) {
                const label = ITEMS[key]?.label ?? key.split('.').pop();
                const itemTxt = this._ui(this.scene.add.text(colLabel + 10, contentY, label, {
                    fontSize: '13px', color: '#d4c8a8', fontFamily: 'monospace',
                }).setDepth(43));
                const qtyTxt = this._ui(this.scene.add.text(colQty, contentY + 2, `×${qty}`, {
                    fontSize: '14px', color: '#ffdd88', fontFamily: 'monospace',
                }).setOrigin(1, 0).setDepth(43));
                objs.push(itemTxt, qtyTxt);
                contentY += lineH;
                if (contentY > my + mh - 70) { objs.push(
                    this._ui(this.scene.add.text(colLabel, contentY, '…more', {
                        fontSize: '11px', color: '#776655', fontFamily: 'monospace',
                    }).setDepth(43))); break; }
            }
            contentY += 6;
        }

        if (!hasAny) {
            objs.push(this._ui(this.scene.add.text(mx + mw / 2, contentY + 10, 'empty', {
                fontSize: '14px', color: '#4a4030', fontFamily: 'monospace',
            }).setOrigin(0.5, 0).setDepth(43)));
            contentY += 30;
        }

        // Inbox section
        const inboxEntries = Object.entries(b.inbox ?? {}).filter(([, v]) => v > 0);
        if (inboxEntries.length) {
            contentY += 4;
            const sep2 = this._ui(this.scene.add.graphics().setDepth(42));
            sep2.lineStyle(1, 0x4a3810, 0.5).lineBetween(mx + 12, contentY, mx + mw - 12, contentY);
            objs.push(sep2);
            contentY += 8;
            objs.push(this._ui(this.scene.add.text(colLabel, contentY, 'INBOX  (awaiting processing)', {
                fontSize: '11px', color: '#887755', fontFamily: 'monospace',
            }).setDepth(43)));
            contentY += 18;
            for (const [key, qty] of inboxEntries) {
                const label = ITEMS[key]?.label ?? key.split('.').pop();
                objs.push(this._ui(this.scene.add.text(colLabel + 10, contentY,
                    `${label}   ×${qty}`, { fontSize: '12px', color: '#aa9966', fontFamily: 'monospace' }).setDepth(43)));
                contentY += lineH;
            }
        }

        // Wage pending summary
        const wageTotal = Object.values(b.wagePending ?? {}).reduce((s, m) =>
            s + Object.values(m).reduce((a, v) => a + v, 0), 0);
        if (wageTotal > 0) {
            contentY += 4;
            objs.push(this._ui(this.scene.add.text(colLabel, contentY,
                `💰 ${wageTotal} units pending wages`, {
                    fontSize: '11px', color: '#aac870', fontFamily: 'monospace',
                }).setDepth(43)));
        }

        this._invModal = objs;
    }

    // ─── Float / Phase messages ──────────────────────────────────────────────

    showFloatText(x, y, text, color) {
        const txt = this.scene._w(this.scene.add.text(x, y, text, {
            fontSize: '11px', color, fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(50));
        this.scene.tweens.add({
            targets: txt, y: y - 24, alpha: 0, duration: 900,
            onComplete: () => txt.destroy(),
        });
    }

    showCaravanOffer(offer) {
        if (this._caravanModal) return; // already showing
        const { W, H } = this.L;
        const mw = Math.min(300, W - 40), mh = 130;
        const mx = (W - mw) / 2, my = (H - mh) / 2 - 30;
        const objs = [];

        const bg = this._ui(this.scene.add.rectangle(mx + mw/2, my + mh/2, mw, mh, 0x1a1408, 0.95).setDepth(20).setStrokeStyle(2, 0xddaa44));
        objs.push(bg);

        const title = this._ui(this.scene.add.text(mx + mw/2, my + 14, '🛒 Merchants arrive!', { fontSize: '13px', color: '#ffdd88', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(20));
        objs.push(title);

        const offerText = this._ui(this.scene.add.text(mx + mw/2, my + 40, offer.label, { fontSize: '13px', color: '#ffffff' }).setOrigin(0.5, 0).setDepth(20));
        objs.push(offerText);

        const closeAll = () => { objs.forEach(o => o.destroy()); this._caravanModal = null; };

        const canAfford = Object.entries(offer.give).every(([r, n]) => (this.scene.resources[r] ?? 0) >= n);
        const acceptCol = canAfford ? 0x336622 : 0x443322;
        const acceptBg = this._ui(this.scene.add.rectangle(mx + mw/2 - 45, my + 88, 80, 28, acceptCol, 1).setDepth(20).setInteractive());
        const acceptTxt = this._ui(this.scene.add.text(mx + mw/2 - 45, my + 88, 'Accept', { fontSize: '12px', color: canAfford ? '#aaffaa' : '#888866' }).setOrigin(0.5).setDepth(21));
        objs.push(acceptBg, acceptTxt);

        acceptBg.on('pointerup', () => {
            if (!canAfford) return;
            this.scene.economyManager.spend(offer.give);
            for (const [r, n] of Object.entries(offer.receive)) this.scene.economyManager.addResource(r, n);
            this.scene.updateUI();
            this.showPhaseMessage('Trade accepted!', 0x88ee88);
            closeAll();
        });

        const declineBg = this._ui(this.scene.add.rectangle(mx + mw/2 + 45, my + 88, 80, 28, 0x442222, 1).setDepth(20).setInteractive());
        const declineTxt = this._ui(this.scene.add.text(mx + mw/2 + 45, my + 88, 'Decline', { fontSize: '12px', color: '#ffaaaa' }).setOrigin(0.5).setDepth(21));
        objs.push(declineBg, declineTxt);
        declineBg.on('pointerup', closeAll);

        // Auto-dismiss after 15s
        this.scene.time.delayedCall(15000, () => { if (this._caravanModal) closeAll(); });
        this._caravanModal = objs;
    }

    showCensusPanel(page = 0) {
        if (this._censusObjs) {
            this._censusObjs.forEach(o => o.destroy());
        }
        this._censusObjs = [];
        this.scene.isPaused = true;

        const W = this.scene.SW, H = this.scene.SH;
        const mw = Math.min(W * 0.9, 450), mh = Math.min(H * 0.85, 550);
        const mx = (W - mw) / 2, my = (H - mh) / 2;

        const bg = this._ui(this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(40).setInteractive());
        const panel = this._ui(this.scene.add.rectangle(W / 2, H / 2, mw, mh, 0x1a1a10, 1).setDepth(41).setInteractive());
        const border = this._ui(this.scene.add.graphics().setDepth(42));
        border.lineStyle(2, 0xc8a030, 0.8).strokeRect(mx, my, mw, mh);
        this._censusObjs.push(bg, panel, border);

        const title = this._ui(this.scene.add.text(mx + mw / 2, my + 15, '🏛 CENSUS ROLLS', { fontSize: '16px', color: '#ffdd88', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(43));
        this._censusObjs.push(title);

        const closeAll = () => {
            this._censusObjs.forEach(o => o.destroy());
            this._censusObjs = null;
            this.scene.isPaused = false;
        };

        const closeBtn = this._ui(this.scene.add.text(mx + mw - 15, my + 15, '✕', { fontSize: '18px', color: '#ffdd88' }).setOrigin(0.5).setDepth(43).setInteractive());
        closeBtn.on('pointerdown', closeAll);
        this._censusObjs.push(closeBtn);

        const workers = this.scene.units.filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker').sort((a, b) => b.age - a.age || a.name.localeCompare(b.name));
        const perPage = 10;
        const totalPages = Math.ceil(workers.length / perPage);
        const paged = workers.slice(page * perPage, (page + 1) * perPage);

        // Header
        const hty = my + 50;
        const colX = [mx + 25, mx + 130, mx + 175, mx + 220, mx + 290, mx + mw - 40];
        const headers = ['Name', 'Age', 'Gen', 'Role', 'Health'];
        headers.forEach((h, i) => {
            this._censusObjs.push(this._ui(this.scene.add.text(colX[i], hty, h, { fontSize: '11px', color: '#887755', fontStyle: 'bold' }).setDepth(43)));
        });

        paged.forEach((u, i) => {
            const ry = hty + 28 + i * 32;
            const line = this._ui(this.scene.add.graphics().setDepth(42));
            line.lineStyle(1, 0x333322, 0.5).lineBetween(mx + 15, ry + 24, mx + mw - 15, ry + 24);
            this._censusObjs.push(line);

            const nameTxt = this._ui(this.scene.add.text(colX[0], ry, u.name, { fontSize: '13px', color: '#ffffff', fontStyle: 'bold' }).setDepth(43).setInteractive());
            nameTxt.on('pointerdown', () => {
                this.scene.cameras.main.pan(u.x, u.y, 600, 'Power2');
                this.scene.cameras.main.setZoom(1.5);
                closeAll();
                this.scene.selectUnit(u.id, false);
            });
            this._censusObjs.push(nameTxt);

            const ageLabel = u.age === 0 ? 'Child' : u.age === 1 ? 'Youth' : 'Adult';
            this._censusObjs.push(this._ui(this.scene.add.text(colX[1], ry + 2, ageLabel, { fontSize: '11px', color: '#aaaacc' }).setDepth(43)));
            this._censusObjs.push(this._ui(this.scene.add.text(colX[2], ry + 2, u.gender === 'male' ? '♂' : '♀', { fontSize: '11px', color: '#cc99cc' }).setDepth(43)));
            
            const roleLbl = u.role ?? 'Idle';
            this._censusObjs.push(this._ui(this.scene.add.text(colX[3], ry + 2, roleLbl, { fontSize: '11px', color: '#ddcc88' }).setDepth(43)));

            // Health bar
            const hpR = u.hp / u.maxHp;
            const hpCol = hpR > 0.6 ? 0x44aa44 : hpR > 0.3 ? 0xccaa33 : 0xcc3311;
            const hpBar = this._ui(this.scene.add.graphics().setDepth(43));
            hpBar.fillStyle(0x222222).fillRect(colX[4], ry + 4, 80, 6);
            hpBar.fillStyle(hpCol).fillRect(colX[4], ry + 4, 80 * hpR, 6);
            this._censusObjs.push(hpBar);
        });

        // Pagination
        if (totalPages > 1) {
            const py = my + mh - 35;
            const pgTxt = this._ui(this.scene.add.text(mx + mw / 2, py, `Page ${page + 1} / ${totalPages}`, { fontSize: '12px', color: '#887755' }).setOrigin(0.5).setDepth(43));
            this._censusObjs.push(pgTxt);

            if (page > 0) {
                const prev = this._ui(this.scene.add.text(mx + 40, py, '◀ Prev', { fontSize: '12px', color: '#ffdd88' }).setOrigin(0, 0.5).setDepth(43).setInteractive());
                prev.on('pointerdown', () => this.showCensusPanel(page - 1));
                this._censusObjs.push(prev);
            }
            if (page < totalPages - 1) {
                const next = this._ui(this.scene.add.text(mx + mw - 40, py, 'Next ▶', { fontSize: '12px', color: '#ffdd88' }).setOrigin(1, 0.5).setDepth(43).setInteractive());
                next.on('pointerdown', () => this.showCensusPanel(page + 1));
                this._censusObjs.push(next);
            }
        }
    }

    showPhaseMessage(text, color) {
        this.scene.phaseMsg
            .setText(text)
            .setColor('#' + color.toString(16).padStart(6, '0'))
            .setAlpha(1);
        this.scene.tweens.add({
            targets: this.scene.phaseMsg, alpha: 0, delay: 2800, duration: 600,
        });
    }
}
