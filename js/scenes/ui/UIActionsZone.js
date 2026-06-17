import { TILE, MAP_OY, FM_TYPES, FM_LABELS, MATERIAL_LABELS, MATERIAL_COLORS, CONSTRUCT_VOLUME } from '../../config/gameConstants.js';
import { CONSTRUCTS, CONSTRUCT_CATS, computeBuildCost } from '../../content/constructs/index.js';
import { ITEMS } from '../../content/items/index.js';
import { CROPS } from '../../content/crops/index.js';
import { TECHS } from '../../content/techs/index.js';
import UIPanel from '../UIPanel.js';
import { tabStrip, THEME } from '../../ui/UIKit.js';

export default {
    _renderActionsZone() {
        this._clearTabs();
        if (this._actionPanel) { this._actionPanel.destroy(); this._actionPanel = null; }

        const { PANEL_H, KEY_H, QB_H, TAB_H, panelY, ACT_W } = this.L;
        const zx = this.L.ACT_X ?? 0;
        let zy = panelY + KEY_H;
        let fullH = PANEL_H - KEY_H - (QB_H ?? 0);

        // Mode indicator — always visible when a mode is active
        const modeH = this._renderModeBar(zx, zy, ACT_W);
        zy += modeH; fullH -= modeH;

        const sel      = this.scene.units.filter(u => u.selected && !u.isEnemy);
        const construct = this.scene.selectedConstruct;
        const workers  = sel.filter(u => u.type === 'worker' && u.age >= 2);
        const military = sel.filter(u => u.type !== 'worker');
        const scouts   = sel.filter(u => u.type === 'scout');

        if (construct) {
            this._renderConstructActions(construct, zx, zy, ACT_W, fullH);
        } else if (workers.length > 0 && military.length === 0) {
            this._renderWorkerActions(sel, workers, zx, zy, ACT_W, fullH);
        } else if (sel.length > 0) {
            this._renderMilActions(sel, military, scouts, zx, zy, ACT_W, fullH);
        } else if (this.scene.selectedZoneType === 'grow' && this.scene.selectedZoneTile) {
            this._renderGrowZonePanel(zx, zy, ACT_W, fullH);
        } else if (this.scene.selectedZoneType && this.scene.selectedZoneTile) {
            this._renderZonePanel(zx, zy, ACT_W, fullH);
        } else if (this.scene.materialPickMode) {
            this._renderMaterialPickPanel(this.scene.materialPickMode, zx, zy, ACT_W, fullH);
        } else {
            this._renderCategoryTabs(zx, zy, ACT_W, TAB_H);
            const panelH = fullH - TAB_H;
            this._actionPanel = new UIPanel(this.scene, zx, zy + TAB_H, ACT_W, panelH);
            this._actionPanel.setItems(this._buildMenuItems());
        }
    },

    _renderModeBar(zx, zy, ACT_W) {
        const label = this._getModeLabel();
        if (!label) return 0;
        const H = 15;
        const { col, bg } = this._modeBarStyle();
        const g = this._tab(this.scene.add.graphics().setDepth(21));
        g.fillStyle(bg, 0.97).fillRect(zx, zy, ACT_W, H);
        g.lineStyle(1, col, 0.5).lineBetween(zx, zy + H - 1, zx + ACT_W, zy + H - 1);
        this._tab(this.scene.add.text(zx + ACT_W / 2, zy + H / 2, label, {
            fontFamily: THEME.fontMono, fontSize: '9px', color: '#c8d4c0',
        }).setOrigin(0.5).setDepth(22));
        return H;
    },

    _getModeLabel() {
        const s = this.scene;
        if (s.wallRectMode) return '⬜ Room · drag corner to corner · ESC to cancel';
        if (s.wallMode) {
            const def = CONSTRUCTS[s.wallType ?? 'wall_edge'];
            return `⚒ ${def?.label ?? 'Wall'} · drag edges · ESC to cancel`;
        }
        if (s.zoneMode === 'grow')    return '🖌 Grow Zone · drag to paint · ESC to cancel';
        if (s.zoneMode === 'work')    return '🖌 Work Zone · drag to paint · ESC to cancel';
        if (s.zoneMode === 'storage') return '🖌 Storage Zone · drag to paint · ESC to cancel';
        if (s.zoneMode === 'market')  return '🖌 Market Zone · drag to paint · ESC to cancel';
        if (s.zoneMode === 'roof')        return '🏠 Roof · drag to plan (green=ok, red=no support) · ESC';
        if (s.zoneMode === 'roof_remove') return '🏚 Remove Roof · drag to tear down · ESC to cancel';
        if (s.zoneMode === 'erase')   return '🧹 Erase · drag to clear zones · ESC to cancel';
        if (s.constructType) {
            const def = CONSTRUCTS[s.constructType];
            return `📍 ${def?.label ?? s.constructType} · click map to place · ESC to cancel`;
        }
        if (s.roadMode) return '🛣 Road · click or drag · ESC to cancel';
        if (s.constructMode) {
            const def = CONSTRUCTS[s.placementType];
            return `🪑 ${def?.label ?? 'Furniture'} · click map to place · ESC to cancel`;
        }
        return null;
    },

    _modeBarStyle() {
        const s = this.scene;
        if (s.wallRectMode)                       return { col: 0x7799bb, bg: 0x121c28 };
        if (s.wallMode)                           return { col: 0x9999cc, bg: 0x1a1a2a };
        if (s.zoneMode === 'grow')                return { col: 0x66aa44, bg: 0x0e1e0e };
        if (s.zoneMode === 'work')                return { col: 0x4488ff, bg: 0x0e1428 };
        if (s.zoneMode === 'storage')             return { col: 0xffaa22, bg: 0x28180a };
        if (s.zoneMode === 'market')              return { col: 0xddaa22, bg: 0x241e06 };
        if (s.zoneMode === 'erase')               return { col: 0xff5555, bg: 0x280e0e };
        if (s.constructType || s.constructMode)   return { col: 0x66aacc, bg: 0x0c1c28 };
        if (s.roadMode)                           return { col: 0xaa8855, bg: 0x1e1608 };
        return { col: 0x555555, bg: 0x141414 };
    },

    _renderZonePanel(zx, zy, ACT_W, fullH) {
        const s   = this.scene;
        const zm  = s.zoneManager;
        const type  = s.selectedZoneType;
        const tile  = s.selectedZoneTile;
        const tiles = s.selectedZoneTiles ?? [];
        const TAB_H = 22, STRIP = 28;

        const ZONE_INFO = {
            work:    { col: 0x4488ff, bg: 0x0e1420, label: 'Work Zone',    hint: 'Workers labor in this area' },
            storage: { col: 0xffaa22, bg: 0x281800, label: 'Storage Zone', hint: 'Resources are stockpiled here' },
            market:  { col: 0xddaa22, bg: 0x242000, label: 'Market Zone',  hint: 'Merchants trade from stalls' },
            pasture: { col: 0x66aa44, bg: 0x0e2010, label: 'Pasture Zone', hint: 'Animals graze here' },
        };
        const info = ZONE_INFO[type] ?? { col: 0xaaaaaa, bg: 0x1a1a1a, label: type, hint: '' };

        // Header bar
        const hdr = this._tab(s.add.graphics().setDepth(21));
        hdr.fillStyle(info.bg, 0.96).fillRect(zx, zy, ACT_W, TAB_H);
        hdr.lineStyle(1, info.col, 0.45).lineBetween(zx, zy + TAB_H, zx + ACT_W, zy + TAB_H);
        this._tab(s.add.text(zx + ACT_W / 2, zy + TAB_H / 2,
            `${info.label} — ${tiles.length} tile${tiles.length !== 1 ? 's' : ''}`, {
                fontFamily: THEME.fontMono, fontSize: '10px', color: '#d4c8a8',
            }).setOrigin(0.5).setDepth(22));

        const bodyY  = zy + TAB_H;

        if (type === 'storage') {
            // Storage: show category filter toggles
            const CATS = [
                { id: 'Food.',              label: 'Food',   color: 0x336622 },
                { id: 'Materials.Wood.',    label: 'Wood',   color: 0x6a3a14 },
                { id: 'Materials.Stone.',   label: 'Stone',  color: 0x445566 },
                { id: 'Materials.Metal.',   label: 'Metal',  color: 0x334466 },
                { id: 'Materials.Textile.', label: 'Cloth',  color: 0x5a3a5a },
                { id: 'Equipment.',         label: 'Equip',  color: 0x4a3a22 },
            ];
            // Read current accepts from the first tile
            const cfg     = tile ? zm.storageTiles.get(zm.tileKey(tile.tx, tile.ty)) : null;
            const accepts = cfg?.accepts ?? [];
            const allOn   = accepts.length === 0;

            const catH   = 22;
            const labelH = 14;
            const bodyH  = fullH - TAB_H - STRIP;
            const bg2 = this._tab(s.add.graphics().setDepth(21));
            bg2.fillStyle(0x100c06, 0.85).fillRect(zx, bodyY, ACT_W, bodyH);

            // "Accept all" hint
            const hintY = bodyY + 6;
            this._tab(s.add.text(zx + 6, hintY, allOn ? 'Accepts: all resources' : 'Accepts only:', {
                fontFamily: THEME.fontMono, fontSize: '8px', color: '#7a6a50',
            }).setDepth(22));

            // Category toggle buttons
            const btnW = Math.floor((ACT_W - 8) / CATS.length);
            const btnY = hintY + labelH + 2;
            CATS.forEach((cat, i) => {
                const on   = allOn || accepts.includes(cat.id);
                const bx   = zx + 4 + i * btnW;
                const bg3  = this._tab(s.add.graphics().setDepth(22));
                bg3.fillStyle(cat.color, on ? 0.88 : 0.25).fillRect(bx, btnY, btnW - 2, catH);
                bg3.lineStyle(1, on ? 0xffaa22 : 0x3a2a10, on ? 0.7 : 0.3).strokeRect(bx, btnY, btnW - 2, catH);
                const hov = this._tab(s.add.graphics().setDepth(23).setAlpha(0));
                hov.fillStyle(0xffffff, 0.12).fillRect(bx, btnY, btnW - 2, catH);
                this._tab(s.add.text(bx + (btnW - 2) / 2, btnY + catH / 2, cat.label, {
                    fontFamily: THEME.fontMono, fontSize: '8px',
                    color: on ? '#e8d8a0' : '#554433', align: 'center',
                }).setOrigin(0.5).setDepth(23));
                const z = this._tab(s.add.zone(bx + (btnW - 2) / 2, btnY + catH / 2, btnW - 2, catH)
                    .setInteractive({ cursor: 'pointer' }).setDepth(24));
                z.on('pointerover', () => hov.setAlpha(1));
                z.on('pointerout',  () => hov.setAlpha(0));
                z.on('pointerdown', () => {
                    // Toggle this category; empty = accept all
                    let next;
                    if (allOn) {
                        // Was all-on: switch to only this one OFF (all others on)
                        next = CATS.map(c => c.id).filter(id => id !== cat.id);
                    } else if (accepts.includes(cat.id)) {
                        next = accepts.filter(id => id !== cat.id);
                    } else {
                        next = [...accepts, cat.id];
                    }
                    // All toggled on = treat as "accept all" (empty)
                    if (next.length === CATS.length) next = [];
                    zm.setStorageAccepts(tile.tx, tile.ty, next);
                    this.updateUI();
                });
            });

            // ── Haul priority + per-tile capacity row ──────────────────────────
            const PRIO_NAMES = ['Low', 'Below', 'Normal', 'High', 'Urgent'];
            const PRIO_COLS  = [0x3a2a14, 0x4a3a1a, 0x2a3a4a, 0x315a36, 0x5a2a2a];
            const curPrio = cfg?.priority ?? 2;
            const curCap  = cfg?.capacity ?? 0;
            const rowY = btnY + catH + 4, rowH = 16;
            const mkCtl = (bx, bw, label, bgCol, cb) => {
                const g = this._tab(s.add.graphics().setDepth(22));
                g.fillStyle(bgCol, 0.85).fillRect(bx, rowY, bw, rowH);
                g.lineStyle(1, 0xffaa22, 0.4).strokeRect(bx, rowY, bw, rowH);
                this._tab(s.add.text(bx + bw / 2, rowY + rowH / 2, label, {
                    fontFamily: THEME.fontMono, fontSize: '8px', color: '#e8d8a0', align: 'center',
                }).setOrigin(0.5).setDepth(23));
                const z = this._tab(s.add.zone(bx + bw / 2, rowY + rowH / 2, bw, rowH)
                    .setInteractive({ cursor: 'pointer' }).setDepth(24));
                z.on('pointerdown', cb);
            };
            const halfW = Math.floor((ACT_W - 8) / 2);
            // Priority cycle (left half)
            mkCtl(zx + 4, halfW - 2, `▲ ${PRIO_NAMES[curPrio]}`, PRIO_COLS[curPrio], () => {
                zm.setStoragePriority(tile.tx, tile.ty, (curPrio + 1) % 5);
                this.updateUI();
            });
            // Capacity stepper (right half): [−] cap [+]
            const capX = zx + 4 + halfW, stepW = 16;
            const capLblW = halfW - 2 - stepW * 2;
            mkCtl(capX, stepW, '−', 0x2a2418, () => {
                zm.setStorageCapacity(tile.tx, tile.ty, Math.max(0, curCap - 10)); this.updateUI();
            });
            this._tab(s.add.text(capX + stepW + capLblW / 2, rowY + rowH / 2,
                curCap ? `cap ${curCap}` : 'cap ∞', {
                    fontFamily: THEME.fontMono, fontSize: '8px', color: '#ddcc88', align: 'center',
                }).setOrigin(0.5).setDepth(23));
            mkCtl(capX + stepW + capLblW, stepW, '＋', 0x2a2418, () => {
                zm.setStorageCapacity(tile.tx, tile.ty, curCap + 10); this.updateUI();
            });

            // Inventory list below toggles
            let invY = rowY + rowH + 4;
            const zoneInv = {};
            for (const t of tiles) {
                const tileCfg = zm.storageTiles.get(zm.tileKey(t.tx, t.ty));
                for (const [res, qty] of Object.entries(tileCfg?.inventory ?? {})) {
                    if (qty > 0) zoneInv[res] = (zoneInv[res] ?? 0) + qty;
                }
            }
            const invEntries = Object.entries(zoneInv).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
            const stripY = bodyY + bodyH;
            if (invEntries.length === 0) {
                this._tab(s.add.text(zx + ACT_W / 2, invY + 4, '(empty)', {
                    fontFamily: THEME.fontMono, fontSize: '8px', color: '#443c2c',
                }).setOrigin(0.5, 0).setDepth(22));
            } else {
                for (const [res, qty] of invEntries) {
                    if (invY >= stripY - 12) break;
                    const lbl = res.split('.').pop().slice(0, 13);
                    this._tab(s.add.text(zx + 6, invY, `${qty}`, {
                        fontFamily: THEME.fontMono, fontSize: '8px', color: '#ddcc88',
                    }).setDepth(22));
                    this._tab(s.add.text(zx + 28, invY, lbl, {
                        fontFamily: THEME.fontMono, fontSize: '8px', color: '#9a8a6a',
                    }).setDepth(22));
                    invY += 12;
                }
            }

            this._actStrip(zx, stripY, ACT_W, STRIP, [
                { label: '＋ Expand', color: 0x0e200e, cb: () => {
                    s.zoneMode = type;
                    s.selectedZoneType = null; s.selectedZoneTile = null; s.selectedZoneTiles = null;
                    zm.clearSelection(); this.updateUI();
                }},
                { label: '🗑 Erase', color: 0x280e0e, cb: () => {
                    tiles.forEach(t => zm.erase(t.tx, t.ty));
                    s.selectedZoneType = null; s.selectedZoneTile = null; s.selectedZoneTiles = null;
                    zm.clearSelection(); this.updateUI();
                }},
                { label: '✕ Close', color: 0x1a1408, cb: () => {
                    s.selectedZoneType = null; s.selectedZoneTile = null; s.selectedZoneTiles = null;
                    zm.clearSelection(); this.updateUI();
                }},
            ]);
            return;
        }

        // Non-storage zones: simple hint body
        const panelH = fullH - TAB_H - STRIP;
        const bg2 = this._tab(s.add.graphics().setDepth(21));
        bg2.fillStyle(0x100c06, 0.85).fillRect(zx, bodyY, ACT_W, panelH);

        this._tab(s.add.text(zx + ACT_W / 2, bodyY + panelH / 2 - 10, info.hint, {
            fontFamily: THEME.fontMono, fontSize: '9px', color: '#7a6a50', align: 'center',
            wordWrap: { width: ACT_W - 12 },
        }).setOrigin(0.5).setDepth(22));
        this._tab(s.add.text(zx + ACT_W / 2, bodyY + panelH / 2 + 8, `Expand to add tiles · Erase to delete`, {
            fontFamily: THEME.fontMono, fontSize: '8px', color: '#554a38', align: 'center',
        }).setOrigin(0.5).setDepth(22));

        // Action strip
        this._actStrip(zx, bodyY + panelH, ACT_W, STRIP, [
            { label: '＋ Expand', color: 0x0e200e, cb: () => {
                s.zoneMode = type;
                s.selectedZoneType = null; s.selectedZoneTile = null; s.selectedZoneTiles = null;
                zm.clearSelection(); this.updateUI();
            }},
            { label: '🗑 Erase', color: 0x280e0e, cb: () => {
                tiles.forEach(t => zm.erase(t.tx, t.ty));
                s.selectedZoneType = null; s.selectedZoneTile = null; s.selectedZoneTiles = null;
                zm.clearSelection(); this.updateUI();
            }},
            { label: '✕ Close', color: 0x1a1408, cb: () => {
                s.selectedZoneType = null; s.selectedZoneTile = null; s.selectedZoneTiles = null;
                zm.clearSelection(); this.updateUI();
            }},
        ]);
    },

    _renderConstructActions(b, zx, zy, ACT_W, fullH) {
        const s     = this.scene;
        const TAB_H = 22;
        const STRIP = 34;
        const close = () => { s.selectedConstruct = null; this.updateUI(); };

        if (b.id !== this._actConstructId) { this._actConstructId = b.id; this._actConstructTab = null; }

        if (!b.built) {
            this._actStrip(zx, zy + fullH - STRIP, ACT_W, STRIP, [
                { label: 'Cancel order', color: 0x443322, cb: () => { s.demolishConstruct(b); } },
                { label: '✕ Close', color: 0x2a1c10, cb: close },
            ]);
            return;
        }

        // Edge constructs (walls/gates/doors/fences) have no inventory/workers/queue — the info
        // pane shows their HP; here just offer deconstruct.
        if (b.placement === 'edge') {
            this._actStrip(zx, zy + fullH - STRIP, ACT_W, STRIP, [
                b.deconstructing
                    ? { label: '✗ Cancel', color: 0x332211, cb: () => { s.constructManager.cancelDeconstruct(b); this.updateUI(); } }
                    : { label: '🔨 Deconstruct', color: 0x441111, cb: () => { s.constructManager.orderDeconstruct(b); this.updateUI(); } },
                { label: '✕ Close', color: 0x2a1c10, cb: close },
            ]);
            return;
        }

        const tabs = this._constructTabs(b);
        if (!this._actConstructTab || !tabs.includes(this._actConstructTab)) this._actConstructTab = tabs[0];
        this._actTabBar(zx, zy, ACT_W, tabs, this._actConstructTab,
            t => { this._actConstructTab = t; this.updateUI(); });

        const panelH = fullH - TAB_H - STRIP;
        if (this._actConstructTab === 'Inv') {
            this._renderConstructInvPanel(b, zx, zy + TAB_H, ACT_W, panelH);
        } else {
            this._actionPanel = new UIPanel(this.scene, zx, zy + TAB_H, ACT_W, panelH);
            this._actionPanel.setItems(this._constructTabItems(b, this._actConstructTab));
        }

        const noAssign = b.type === 'wall' || b.type === 'palisade';
        // A camp is a lightweight tent the player can strike at will — demolish it instantly rather
        // than queuing worker labour (which never completes if the colony is dead/idle, leaving "no
        // way to demolish the camp"). Real buildings still use the worker-driven deconstruct.
        const demoBtn = b.type === 'camp'
            ? { label: '🔨 Strike camp', color: 0x441111, cb: () => { s.demolishConstruct(b); this.updateUI(); } }
            : b.deconstructing
                ? { label: '✗ Cancel', color: 0x332211, cb: () => { s.constructManager.cancelDeconstruct(b); this.updateUI(); } }
                : { label: '🔨 Demo',  color: 0x441111, cb: () => { s.constructManager.orderDeconstruct(b); this.updateUI(); } };
        this._actStrip(zx, zy + TAB_H + panelH, ACT_W, STRIP, [
            { label: '👷 Workers', color: 0x334422, dimmed: noAssign,
              cb: () => { s.orderWorkersToConstruct(b); this.updateUI(); } },
            demoBtn,
            { label: '✕ Close', color: 0x2a1c10, cb: close },
        ]);
    },

    _constructTabs(b) {
        if (b.type === 'barracks' || b.type === 'archery' || b.type === 'stable') return ['Train', 'Inv'];
        if (b.type === 'townhall') return ['Manage', 'Inv'];
        return ['Actions', 'Inv'];
    },

    _renderConstructInvPanel(b, zx, zy, w, h) {
        const s   = this.scene;
        const pad = 6;
        const bg  = this._tab(s.add.graphics().setDepth(21));
        bg.fillStyle(0x0e0c08, 0.9).fillRect(zx, zy, w, h);

        let ry = zy + pad;

        const maxVol = CONSTRUCT_VOLUME[b.type];
        if (maxVol) {
            const curVol = s.economyManager.getConstructCurrentVolume(b);
            const ratio  = Math.min(1, curVol / maxVol);
            const barW   = w - pad * 2;
            const barg   = this._tab(s.add.graphics().setDepth(21.5));
            barg.fillStyle(0x1a1612, 1).fillRect(zx + pad, ry, barW, 6);
            const fillCol = ratio > 0.85 ? 0xcc4422 : ratio > 0.5 ? 0xddaa33 : 0x448844;
            barg.fillStyle(fillCol, 0.85).fillRect(zx + pad, ry, Math.round(barW * ratio), 6);
            this._tab(s.add.text(zx + w / 2, ry - 1, `${curVol.toFixed(0)}/${maxVol} vol`, {
                fontFamily: THEME.fontMono, fontSize: '9px', color: '#6a6050',
            }).setOrigin(0.5, 1).setDepth(22));
            ry += 9;
        }

        const entries = Object.entries(b.inventory ?? {}).filter(([, v]) => v > 0).sort((a, bb) => bb[1] - a[1]);
        if (entries.length === 0) {
            this._tab(s.add.text(zx + w / 2, zy + h / 2, '(empty)', {
                fontFamily: THEME.fontMono, fontSize: '9px', color: '#4a4030',
            }).setOrigin(0.5).setDepth(22));
        } else {
            for (const [k, v] of entries) {
                if (ry > zy + h - 13) break;
                const lbl = ITEMS[k]?.label ?? k.split('.').pop().slice(0, 16);
                this._tab(s.add.text(zx + pad, ry, `${v}`, {
                    fontFamily: THEME.fontMono, fontSize: '9px', color: '#ddcc88',
                }).setDepth(22));
                this._tab(s.add.text(zx + pad + 26, ry, lbl, {
                    fontFamily: THEME.fontMono, fontSize: '9px', color: '#aac890',
                }).setDepth(22));
                ry += 13;
            }
        }
    },

    _constructTabItems(b, tab) {
        const items = [];
        const s = this.scene;
        const afford = cost => s.economyManager.afford(cost);

        if (tab === 'Actions') {
            if (b.type === 'gate') {
                items.push({ label: b.isOpen ? 'Close Gate' : 'Open Gate', color: 0x442200,
                    callback: () => { b.isOpen = !b.isOpen; s.redrawConstruct(b); this.updateUI(); } });
            }
            if (b.type === 'pasture' && ((b.males ?? 0) + (b.females ?? 0)) >= 1) {
                items.push({ label: 'Slaughter Sheep', color: 0x661111,
                    callback: () => { s._slaughterSheep(b); this.updateUI(); } });
            }
            if (b.type === 'temple') {
                const next = { ares: 'athena', athena: 'apollo', apollo: 'ares' };
                items.push({ label: `Deity: ${(b.deity ?? 'ares').toUpperCase()}`, color: 0x442266,
                    callback: () => { b.deity = next[b.deity ?? 'ares']; this.updateUI(); } });
            }
        }

        if (tab === 'Train') {
            const trainUnit = (type, cost, label, col) => {
                const can = afford(cost);
                items.push({ label, sublabel: Object.entries(cost).map(([r,n])=>`${n}${r[0]}`).join(' '),
                    color: can ? col : 0x2a1c10, dimmed: !can, callback: () => {
                        if (!can) return;
                        s.economyManager.spend(cost);
                        const cx = (b.tx+b.width/2)*TILE, cy = MAP_OY+(b.ty+b.width/2)*TILE;
                        s.spawnUnit(type, cx+Phaser.Math.Between(-16,16), cy+Phaser.Math.Between(-8,8), false);
                        this.updateUI();
                    }});
            };
            if (b.type === 'melee_grounds') {
                trainUnit('clubman',  { 'Food.Grain.Wheat': 3 },                                   'Clubman',  0x4a3820);
                trainUnit('spearman', { 'Food.Grain.Wheat': 5, 'Materials.Stone.Limestone': 1 }, 'Spearman', 0x4a3820);
            }
            if (b.type === 'archery_grounds') {
                trainUnit('slinger', { 'Food.Grain.Wheat': 3 },                            'Slinger', 0x2a4030);
                trainUnit('archer',  { 'Food.Grain.Wheat': 5, 'Materials.Wood.Pine': 1 }, 'Archer',  0x2a4030);
            }
            if (b.type === 'mounted_grounds') {
                const cost = { 'Food.Grain.Wheat': 8, 'Materials.Wood.Pine': 2 };
                const can  = afford(cost);
                items.push({ label: 'Cavalry', sublabel: '8f 2w', color: can ? 0x4a3010 : 0x2a1c10, dimmed: !can,
                    callback: () => {
                        if (!can) return;
                        s.economyManager.spend(cost);
                        const cx = (b.tx+b.width/2)*TILE, cy = MAP_OY+(b.ty+b.width/2)*TILE;
                        s.spawnUnit('cavalry', cx, cy, false);
                        this.updateUI();
                    }});
            }
        }

        if (tab === 'Manage') {
            if (b.type === 'townhall') {
                const can = afford({ 'Food.Grain.Wheat': 5 });
                items.push({ label: 'Train Scout', sublabel: '5w', color: can ? 0x334455 : 0x2a1c10, dimmed: !can,
                    callback: () => {
                        if (!can) { this.showPhaseMessage('Not enough wheat!', 0xff4444); return; }
                        s.economyManager.takeFromCommons('Food.Grain.Wheat', 5);
                        const cx = (b.tx+b.width/2)*TILE, cy = MAP_OY+(b.ty+b.width/2)*TILE;
                        s.spawnUnit('scout', cx, cy, false);
                        this.updateUI();
                    }});
                const rate = s.titheRate ?? 10;
                items.push({ label: `Tithe –  ${rate}%`, color: 0x332211,
                    callback: () => { s.titheRate = Math.max(0, (s.titheRate ?? 10) - 5); this.updateUI(); } });
                items.push({ label: `Tithe +  ${rate}%`, color: 0x223311,
                    callback: () => { s.titheRate = Math.min(40, (s.titheRate ?? 10) + 5); this.updateUI(); } });
                items.push({ label: 'New Game', color: 0x3a1111,
                    callback: () => { s.clearSave(); s.scene.restart(); } });
            }
        }

        return items;
    },

    _renderWorkerActions(sel, workers, zx, zy, ACT_W, fullH) {
        const s    = this.scene;
        const STRIP = 28;
        // Jobs and Vocation are now in the inspector Jobs tab.
        // Orders are via the Orders toolbar button.
        // Right panel just provides the deselect strip.
        this._actStrip(zx, zy + fullH - STRIP, ACT_W, STRIP, [
            { label: '✕ Deselect', color: 0x2a1c10, cb: () => {
                s.constructType = null; s.roadMode = false;
                s.deselect(); s.hoverGfx?.clear(); this.updateUI();
            }},
        ]);
    },

    _renderMilActions(sel, military, scouts, zx, zy, ACT_W, fullH) {
        const s     = this.scene;
        const TAB_H = 22;
        const STRIP = 28;
        const hasMil = military.length > 0 || scouts.length > 0;
        const tabs  = hasMil ? ['Move', 'Orders'] : ['Move'];
        if (!tabs.includes(this._actMilTab)) this._actMilTab = 'Move';
        this._actTabBar(zx, zy, ACT_W, tabs, this._actMilTab,
            t => { this._actMilTab = t; this.updateUI(); });

        const panelH = fullH - TAB_H - STRIP;
        const items  = [];

        if (this._actMilTab === 'Move') {
            for (let i = 0; i < FM_TYPES.length; i++) {
                const type  = FM_TYPES[i];
                const label = FM_LABELS[i];
                const active = s.fmType === type;
                items.push({ label, color: active ? 0x336688 : 0x1e2c3a, active, callback: () => {
                    s.fmType = type;
                    const ax = sel.reduce((a, u) => a + u.x, 0) / sel.length;
                    const ay = sel.reduce((a, u) => a + u.y, 0) / sel.length;
                    s.moveSelectedTo(ax, ay);
                    this.updateUI();
                }});
            }
            if (scouts.length > 0) {
                items.push({ label: 'Explore', color: 0x3a2a50, callback: () => {
                    scouts.forEach(u => { u.role = 'scouting'; });
                    s.deselect(); this.updateUI();
                }});
            }
        }

        if (this._actMilTab === 'Orders') {
            const towers = s.constructs.filter(b => b.built && !b.faction && b.type === 'watchtower');
            if (towers.length > 0) {
                items.push({ label: 'Garrison Tower', color: 0x334455, callback: () => {
                    const cx = sel.reduce((a, u) => a + u.x, 0) / sel.length;
                    const cy = sel.reduce((a, u) => a + u.y, 0) / sel.length;
                    const tower = towers.reduce((best, b) => {
                        const d = Phaser.Math.Distance.Between(cx, cy, (b.tx+1)*TILE, MAP_OY+(b.ty+1)*TILE);
                        return (!best || d < best.d) ? { b, d } : best;
                    }, null)?.b;
                    if (tower) s.orderWorkersToConstruct(tower);
                    s.deselect(); this.updateUI();
                }});
            }
            if (military.some(u => (u.vetLevel ?? 0) === 0)) {
                items.push({ label: 'Dismiss', color: 0x663322, callback: () => {
                    military.forEach(u => { if ((u.vetLevel ?? 0) === 0) u.role = 'demobilizing'; });
                    s.deselect(); this.updateUI();
                }});
            }
        }

        this._actionPanel = new UIPanel(this.scene, zx, zy + TAB_H, ACT_W, panelH);
        this._actionPanel.setItems(items);

        this._actStrip(zx, zy + TAB_H + panelH, ACT_W, STRIP, [
            { label: '✕ Clear', color: 0x2a1c10, cb: () => {
                s.constructType = null; s.roadMode = false;
                s.deselect(); s.hoverGfx?.clear(); this.updateUI();
            }},
        ]);
    },

    _renderCategoryTabs(x, y, w, h) {
        const cats = [...Object.keys(CONSTRUCT_CATS), 'Zones', 'Tech', 'Debug'];
        const labels = cats.map(c => c.length > 5 ? c.slice(0, 4) : c);
        tabStrip(this.scene, x + 1, y, w - 2, h - 1, labels, labels[cats.indexOf(this.scene.buildCat)],
            (lbl) => { this.scene.buildCat = cats[labels.indexOf(lbl)]; this.updateUI(); },
            { depth: 22, activeBg: 0x4a6070, inactiveBg: 0x221a0e,
              activeColor: '#e8d8a0', inactiveColor: '#6a5a3a',
              onAdd: (o) => this._tab(o) });
    },

    _buildMenuItems() {
        if (this.scene.buildCat === 'Furniture') {
            const ids  = CONSTRUCT_CATS['Furniture'] ?? [];
            return ids.map(type => {
                const def      = CONSTRUCTS[type];
                const isActive = this.scene.placementType === type && this.scene.constructMode;
                return {
                    label:    def.label,
                    sublabel: def.desc,
                    color:    isActive ? def.color : Math.max(0, (def.color & 0xfefefe) >> 1),
                    active:   isActive,
                    callback: () => {
                        if (isActive) {
                            this.scene.constructMode   = false;
                            this.scene.placementType = null;
                        } else {
                            this.scene.constructMode   = true;
                            this.scene.placementType = type;
                            this.scene.constructType  = null;
                            this.scene.roadMode  = false;
                            this.scene.wallMode  = false;
                        }
                        this.scene.hoverGfx?.clear();
                        this.updateUI();
                    },
                };
            });
        }

        if (this.scene.buildCat === 'Zones') {
            const s = this.scene;
            const mk = (label, sublabel, mode, color) => {
                const active = s.zoneMode === mode;
                return {
                    label, sublabel, active,
                    color: active ? color : Math.max(0, (color & 0xfefefe) >> 1),
                    callback: () => {
                        s.zoneMode      = active ? null : mode;
                        s.constructType      = null; s.roadMode  = false;
                        s.wallMode      = false; s.constructMode = false;
                        s.hoverGfx?.clear();
                        this.updateUI();
                    },
                };
            };
            const items = [
                mk('Work Zone',    'drag to paint areas where workers labor', 'work',    0x224488),
                mk('Storage Zone', 'drag to paint stockpile areas',           'storage', 0x885511),
                mk('Market Zone',  'merchants trade from stalls here',        'market',  0xaa8811),
            ];
            items.push(mk('Grow Zone', 'paint fields · right-click to set crop', 'grow', 0x336622));
            items.push(mk('Roof',        'plan a roof — within 6 tiles of a wall',   'roof',        0x445566));
            items.push(mk('Remove Roof', 'drag to tear roofs down',                  'roof_remove', 0x553344));
            items.push(mk('Erase Zones', 'drag to clear all zone markings', 'erase', 0x552222));
            return items;
        }

        if (this.scene.buildCat === 'Tech') {
            const pr = this.scene.progression;
            const hdr = {
                label: `🔬 ${pr?.currentEraLabel() ?? 'Stone Age'}`,
                sublabel: `Lore ${Math.floor(this.scene.lore ?? 0)}${this.scene.researchTarget ? ` → ${TECHS[this.scene.researchTarget]?.label}` : ''}`,
                color: 0x1a2438, callback: () => {},
            };
            const techItems = Object.values(TECHS).map(t => {
                const known = pr?.isTechKnown(t.id);
                const avail = pr?.techAvailable(t.id);
                const targeted = this.scene.researchTarget === t.id;
                const status = known ? '✓ known' : avail ? (targeted ? '◉ researching' : `${t.cost} Lore`) : '🔒 locked';
                return {
                    label: `${t.icon} ${t.label}`, sublabel: `${t.era} · ${status}`, desc: t.desc,
                    color: known ? 0x21401f : targeted ? 0x2a3a5a : avail ? 0x2a2a18 : 0x1a1410,
                    active: targeted,
                    callback: avail && !known ? () => { pr.setResearch(t.id); this.updateUI(); } : () => {},
                };
            });
            return [hdr, ...techItems];
        }

        if (this.scene.buildCat === 'Debug') {
            return [
                { label: '✏ Sprite Editor', color: 0x101820,
                  callback: () => { this.scene.scene.launch('SpriteEditorScene'); } },
                { label: '🔄 New Game', color: 0x1a0808,
                  callback: () => { this.scene.clearSave(); this.scene.scene.restart(); } },
            ];
        }

        const constructs = CONSTRUCT_CATS[this.scene.buildCat] ?? [];
        const items = constructs.filter(t => CONSTRUCTS[t]).map(type => {
            const def      = CONSTRUCTS[type];
            const mats     = def.allowedMaterials ?? [];
            const mat      = (mats.length > 0)
                ? (this.scene.constructMaterials?.[type] ?? mats[0])
                : null;
            const cost     = computeBuildCost(type, mat);
            const canAfford = !Object.keys(cost).length || this.scene.economyManager.afford(cost);
            const isActive  = this.scene.constructType === type;
            const costStr   = Object.keys(cost).length
                ? Object.entries(cost).map(([r, n]) => `${n} ${MATERIAL_LABELS[r] ?? r.split('.').pop()}`).join(' ')
                : null;
            const hasPicker = mats.length > 1;
            // Tech gate: lock constructs whose tech isn't researched yet.
            const techId  = this.scene.progression?.techForConstruct(type);
            const locked  = techId && !this.scene.progression.isTechKnown(techId);
            if (locked) {
                const tlbl = TECHS[techId]?.label ?? techId;
                return {
                    label: `🔒 ${def.label}`, sublabel: `needs ${tlbl}`, desc: def.desc,
                    color: 0x241c10, dimmed: true, active: false,
                    callback: () => this.scene.uiManager?.showToast?.(`🔒 Research ${tlbl} first`, '#cc9966'),
                };
            }
            return {
                label: def.label, sublabel: costStr, desc: def.desc,
                color: isActive ? 0x4a6070 : canAfford ? (def.color > 0 ? Math.max(0, (def.color & 0xfefefe) >> 1) : 0x2a1e0e) : 0x1a1208,
                dimmed: false, active: isActive,
                matLabel: hasPicker ? (MATERIAL_LABELS[mat] ?? null) : null,
                matColor: hasPicker ? (MATERIAL_COLORS[mat] ?? null) : null,
                callback: () => {
                    this.scene.constructType  = isActive ? null : type;
                    this.scene.roadMode       = false;
                    this.scene.wallMode       = false;
                    this.scene.constructMode  = false;
                    this.scene.hoverGfx?.clear();
                    this.updateUI();
                },
                rightCallback: hasPicker ? () => {
                    this.scene.materialPickMode = type;
                    this.updateUI();
                } : null,
            };
        });

        // Wall-type buttons (Military tab only) — each activates wallMode with its edge type
        if (this.scene.buildCat === 'Military')
        for (const type of ['wall_edge', 'low_wall', 'fence', 'door', 'fence_gate']) {
            const def      = CONSTRUCTS[type];
            if (!def) continue;
            const mats     = def.allowedMaterials ?? [];
            const mat      = mats.length > 0 ? (this.scene.constructMaterials?.[type] ?? mats[0]) : null;
            const cost     = mat && def.costs?.[mat] ? def.costs[mat] : (def.cost ?? {});
            const costStr  = Object.keys(cost).length
                ? Object.entries(cost).map(([r, n]) => `${n} ${MATERIAL_LABELS[r] ?? r.split('.').pop()}`).join(' ')
                : null;
            const hasPicker = mats.length > 1;
            const active    = this.scene.wallMode && this.scene.wallType === type;
            items.push({
                label: def.label, sublabel: costStr, desc: def.desc,
                color: active ? (def.color + 0x222222) : def.color,
                active,
                matLabel: hasPicker ? (MATERIAL_LABELS[mat] ?? null) : null,
                matColor: hasPicker ? (MATERIAL_COLORS[mat] ?? null) : null,
                callback: () => {
                    if (active) { this.scene.wallMode = false; }
                    else {
                        this.scene.wallMode  = true;
                        this.scene.wallType  = type;
                        this.scene.constructType = null;
                        this.scene.roadMode  = false;
                    }
                    this.scene.hoverGfx?.clear();
                    this.updateUI();
                },
                rightCallback: hasPicker ? () => {
                    this.scene.materialPickMode = type;
                    this.updateUI();
                } : null,
            });
        }

        // Rect wall — drag corner-to-corner to outline a room (Military tab only)
        if (this.scene.buildCat === 'Military')
        items.push({
            label: 'Room', sublabel: 'drag rect',
            color: this.scene.wallRectMode ? 0x556688 : 0x223344,
            active: !!this.scene.wallRectMode,
            callback: () => {
                this.scene.wallRectMode = !this.scene.wallRectMode;
                this.scene.wallMode = false;
                this.scene.constructType = null;
                this.scene.roadMode = false;
                this.scene.hoverGfx?.clear();
                this.updateUI();
            },
        });

        // Road — infrastructure, shown under Structures and Military
        if (this.scene.buildCat === 'Structures' || this.scene.buildCat === 'Military')
        items.push({
            label: 'Road', sublabel: '1s',
            color: this.scene.roadMode ? 0x4a5a28 : 0x2a2010,
            active: this.scene.roadMode,
            callback: () => {
                this.scene.roadMode = !this.scene.roadMode;
                this.scene.constructType = null;
                this.scene.wallMode = false;
                this.scene.wallRectMode = false;
                this.scene.hoverGfx?.clear();
                this.updateUI();
            },
        });

        return items;
    },

    _renderGrowZonePanel(zx, zy, ACT_W, fullH) {
        const s       = this.scene;
        const zm      = s.zoneManager;
        const tile    = s.selectedZoneTile;
        const tiles   = s.selectedZoneTiles ?? [];
        const curCrop = s.selectedZoneCrop;
        const TAB_H   = 22;
        const STRIP   = 28;

        // Compute yield estimate from current crop def
        const cropDef     = curCrop ? CROPS[curCrop] : null;
        const totalSlots  = cropDef ? tiles.length * cropDef.density : 0;
        const growSec     = cropDef ? (cropDef.growTime / 1000).toFixed(0) : '—';
        const infoLine    = curCrop
            ? `${tiles.length} tiles · ${totalSlots} ${cropDef.output?.split('.').pop() ?? ''} · ${growSec}s`
            : `${tiles.length} tiles · no crop assigned`;

        // Header
        const hdr = this._tab(s.add.graphics().setDepth(21));
        hdr.fillStyle(0x1a2010, 0.92).fillRect(zx, zy, ACT_W, TAB_H);
        this._tab(s.add.text(zx + ACT_W / 2, zy + TAB_H / 2, `Grow Zone — ${infoLine}`, {
            fontFamily: THEME.fontMono, fontSize: '9px', color: '#a8d880',
        }).setOrigin(0.5).setDepth(22));

        // Crop picker items
        const panelH = fullH - TAB_H - STRIP;
        const items  = Object.entries(CROPS).map(([key, crop]) => {
            const isActive = key === curCrop;
            const locked   = (crop.wild?.length ?? 0) > 0 && !s.discoveredCrops?.has(key);
            const yieldStr = locked
                ? `🔒 find wild ${crop.label.toLowerCase()}`
                : `${tiles.length * crop.density} · ${(crop.growTime / 1000).toFixed(0)}s`;
            return {
                label:    locked ? `🔒 ${crop.label}` : crop.label,
                sublabel: yieldStr,
                color:    locked ? 0x2a2418
                                 : isActive ? crop.zoneColor : Math.max(0, (crop.zoneColor & 0xfefefe) >> 1),
                active:   isActive,
                callback: locked ? () => {
                    s.uiManager?.showToast?.(`🔒 Find wild ${crop.label} before farming it`, '#cc9966');
                } : () => {
                    zm.setGrowZoneCrop(tile.tx, tile.ty, key);
                    s.selectedZoneCrop = key;
                    // Re-select to refresh tile list
                    const { tiles: t2, cropKey: c2 } = zm.getConnectedTiles(tile.tx, tile.ty);
                    const selCol = 0x88ee55;
                    zm.setSelection(t2, selCol);
                    s.selectedZoneTiles = t2;
                    s.selectedZoneCrop  = c2;
                    this.updateUI();
                },
            };
        });

        this._actionPanel = new UIPanel(s, zx, zy + TAB_H, ACT_W, panelH);
        this._actionPanel.setItems(items);

        this._actStrip(zx, zy + TAB_H + panelH, ACT_W, STRIP, [
            { label: '✕ Close', color: 0x2a1c10, cb: () => {
                s.selectedZoneType = null; s.selectedZoneTile = null;
                s.selectedZoneTiles = null; s.selectedZoneCrop = null;
                zm.clearSelection();
                this.updateUI();
            }},
        ]);
    },

    _renderMaterialPickPanel(type, zx, zy, ACT_W, fullH) {
        const def  = CONSTRUCTS[type];
        const mats = def?.allowedMaterials ?? [];
        const cur  = this.scene.constructMaterials?.[type] ?? mats[0];
        const s    = this.scene;
        const TAB_H = 22;
        const STRIP = 28;

        // Header: construct name
        const hdr = this._tab(s.add.graphics().setDepth(21));
        hdr.fillStyle(0x1a1810, 0.92).fillRect(zx, zy, ACT_W, TAB_H);
        this._tab(s.add.text(zx + ACT_W / 2, zy + TAB_H / 2,
            `Material: ${def?.label ?? type}`, {
                fontFamily: THEME.fontMono, fontSize: '11px', color: '#d4c890',
            }).setOrigin(0.5).setDepth(22));

        // Material pick items — use per-material costs map if present, else computeBuildCost
        const panelH = fullH - TAB_H - STRIP;
        const items  = mats.map(mat => {
            const isActive = mat === cur;
            const cost = (def?.costs && def.costs[mat]) ? def.costs[mat] : computeBuildCost(type, mat);
            const costStr = Object.keys(cost).length
                ? Object.entries(cost).map(([r, n]) => `${n} ${MATERIAL_LABELS[r] ?? r.split('.').pop()}`).join(' ')
                : 'free';
            const canAfford = !Object.keys(cost).length || s.economyManager.afford(cost);
            return {
                label: MATERIAL_LABELS[mat] ?? mat.split('.').pop(),
                sublabel: costStr,
                color: isActive ? (MATERIAL_COLORS[mat] ?? 0x334455) : Math.max(0, ((MATERIAL_COLORS[mat] ?? 0x334455) & 0xfefefe) >> 1),
                active: isActive,
                dimmed: !canAfford,
                matColor: MATERIAL_COLORS[mat] ?? null,
                callback: () => {
                    if (!s.constructMaterials) s.constructMaterials = {};
                    s.constructMaterials[type] = mat;
                    s.materialPickMode = null;
                    this.updateUI();
                },
            };
        });

        this._actionPanel = new UIPanel(s, zx, zy + TAB_H, ACT_W, panelH);
        this._actionPanel.setItems(items);

        this._actStrip(zx, zy + TAB_H + panelH, ACT_W, STRIP, [
            { label: '← Back', color: 0x2a1c10, cb: () => { s.materialPickMode = null; this.updateUI(); } },
        ]);
    },
};
