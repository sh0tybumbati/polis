import { CONSTRUCT_VOLUME } from '../../config/gameConstants.js';
import { CONSTRUCTS } from '../../content/constructs/index.js';
import { ITEMS } from '../../content/items/index.js';
import { floatText, THEME } from '../../ui/UIKit.js';

export default {
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

        const def = CONSTRUCTS[b.type];
        const titleTxt = this._ui(this.scene.add.text(mx + mw / 2, my + 15,
            `📦 ${def?.label ?? b.type}`, {
                fontSize: '16px', color: '#ffdd88', fontFamily: THEME.fontMono,
            }).setOrigin(0.5, 0).setDepth(43));
        objs.push(titleTxt);

        const closeAll = () => { objs.forEach(o => o.destroy()); this._invModal = null; };
        const closeBtn = this._ui(this.scene.add.text(mx + mw - 14, my + 15, '✕', {
            fontSize: '20px', color: '#ffdd88', fontFamily: THEME.fontMono,
        }).setOrigin(0.5).setDepth(43).setInteractive({ cursor: 'pointer' }));
        closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
        closeBtn.on('pointerout',  () => closeBtn.setColor('#ffdd88'));
        closeBtn.on('pointerdown', closeAll);
        bg.on('pointerdown', closeAll);
        objs.push(closeBtn);

        // Volume bar
        const maxVol = CONSTRUCT_VOLUME[b.type] ?? 0;
        let contentY = my + 42;
        if (maxVol > 0) {
            const curVol = this.scene.economyManager.getConstructCurrentVolume(b);
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
                    fontSize: '11px', color: '#7a9090', fontFamily: THEME.fontMono,
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
                fontSize: '11px', color: '#c8a030', fontFamily: THEME.fontMono,
            }).setDepth(43));
            objs.push(catTxt);
            contentY += 18;

            for (const { key, qty } of items) {
                const label = ITEMS[key]?.label ?? key.split('.').pop();
                const itemTxt = this._ui(this.scene.add.text(colLabel + 10, contentY, label, {
                    fontSize: '13px', color: '#d4c8a8', fontFamily: THEME.fontMono,
                }).setDepth(43));
                const qtyTxt = this._ui(this.scene.add.text(colQty, contentY + 2, `×${qty}`, {
                    fontSize: '14px', color: '#ffdd88', fontFamily: THEME.fontMono,
                }).setOrigin(1, 0).setDepth(43));
                objs.push(itemTxt, qtyTxt);
                contentY += lineH;
                if (contentY > my + mh - 70) { objs.push(
                    this._ui(this.scene.add.text(colLabel, contentY, '…more', {
                        fontSize: '11px', color: '#776655', fontFamily: THEME.fontMono,
                    }).setDepth(43))); break; }
            }
            contentY += 6;
        }

        if (!hasAny) {
            objs.push(this._ui(this.scene.add.text(mx + mw / 2, contentY + 10, 'empty', {
                fontSize: '14px', color: '#4a4030', fontFamily: THEME.fontMono,
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
                fontSize: '11px', color: '#887755', fontFamily: THEME.fontMono,
            }).setDepth(43)));
            contentY += 18;
            for (const [key, qty] of inboxEntries) {
                const label = ITEMS[key]?.label ?? key.split('.').pop();
                objs.push(this._ui(this.scene.add.text(colLabel + 10, contentY,
                    `${label}   ×${qty}`, { fontSize: '12px', color: '#aa9966', fontFamily: THEME.fontMono }).setDepth(43)));
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
                    fontSize: '11px', color: '#aac870', fontFamily: THEME.fontMono,
                }).setDepth(43)));
        }

        this._invModal = objs;
    },

    showAgoraPanel(b) {
        if (this._agoraModal) { this._agoraModal.forEach(o => o.destroy()); this._agoraModal = null; }
        const W = this.scene.SW, H = this.scene.SH;
        const mw = Math.min(W * 0.94, 480), mh = Math.min(H * 0.88, 600);
        const mx = (W - mw) / 2, my = (H - mh) / 2;
        const objs = [];

        const bg = this._ui(this.scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.6).setDepth(40).setInteractive());
        const panel = this._ui(this.scene.add.rectangle(mx + mw/2, my + mh/2, mw, mh, 0x14100a, 1).setDepth(41).setInteractive());
        const border = this._ui(this.scene.add.graphics().setDepth(42));
        border.lineStyle(2, 0xc8a030, 0.8).strokeRect(mx, my, mw, mh);
        objs.push(bg, panel, border);

        objs.push(this._ui(this.scene.add.text(mx + mw/2, my + 14, '🏪 Agora — Trade Orders',
            { fontSize: '15px', color: '#ffdd88', fontFamily: THEME.fontMono }).setOrigin(0.5, 0).setDepth(43)));

        const closeAll = () => { objs.forEach(o => o.destroy()); this._agoraModal = null; };
        const closeBtn = this._ui(this.scene.add.text(mx + mw - 14, my + 14, '✕',
            { fontSize: '20px', color: '#ffdd88', fontFamily: THEME.fontMono }).setOrigin(0.5).setDepth(43).setInteractive({ cursor: 'pointer' }));
        closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
        closeBtn.on('pointerout',  () => closeBtn.setColor('#ffdd88'));
        closeBtn.on('pointerdown', closeAll);
        objs.push(closeBtn);

        const TRADEABLE = Object.values(ITEMS ?? {})
            .filter(it => it.basePrice && it.supertype !== 'Equipment')
            .sort((a, x) => a.supertype.localeCompare(x.supertype) || a.basePrice - x.basePrice);

        b.tradeOrders = b.tradeOrders ?? [];
        b.tradeLog    = b.tradeLog    ?? [];

        const rebuild = () => {
            // Clear existing content (keep first 4 static objects: bg, panel, border, title, close)
            objs.slice(5).forEach(o => o.destroy());
            objs.length = 5;

            let cy = my + 40;

            // ── Standing Orders ────────────────────────────────────────────
            objs.push(this._ui(this.scene.add.text(mx + 14, cy, 'STANDING ORDERS', {
                fontSize: '11px', color: '#c8a030', fontFamily: THEME.fontMono,
            }).setDepth(43)));
            cy += 16;

            if (b.tradeOrders.length === 0) {
                objs.push(this._ui(this.scene.add.text(mx + 14, cy, '(none — add one below)',
                    { fontSize: '11px', color: '#6a5840', fontFamily: THEME.fontMono }).setDepth(43)));
                cy += 16;
            } else {
                for (let i = 0; i < b.tradeOrders.length; i++) {
                    const order = b.tradeOrders[i];
                    objs.push(this._ui(this.scene.add.text(mx + 14, cy,
                        `${order.qty}× ${order.giveLabel} → ${order.receiveQty}× ${order.wantLabel}`,
                        { fontSize: '12px', color: '#d4c8a8', fontFamily: THEME.fontMono }).setDepth(43)));
                    const delBtn = this._ui(this.scene.add.text(mx + mw - 16, cy, '✕',
                        { fontSize: '13px', color: '#cc4444', fontFamily: THEME.fontMono }).setOrigin(1, 0).setDepth(43).setInteractive({ cursor: 'pointer' }));
                    delBtn.on('pointerover', () => delBtn.setColor('#ff6666'));
                    delBtn.on('pointerout',  () => delBtn.setColor('#cc4444'));
                    delBtn.on('pointerdown', () => {
                        b.tradeOrders.splice(i, 1);
                        rebuild();
                    });
                    objs.push(delBtn);
                    cy += 18;
                }
            }

            // ── Add New Order ──────────────────────────────────────────────
            cy += 6;
            const sepG = this._ui(this.scene.add.graphics().setDepth(42));
            sepG.lineStyle(1, 0x4a3810, 0.6).lineBetween(mx + 10, cy, mx + mw - 10, cy);
            objs.push(sepG);
            cy += 8;
            objs.push(this._ui(this.scene.add.text(mx + 14, cy, 'ADD ORDER  (give → want)',
                { fontSize: '11px', color: '#c8a030', fontFamily: THEME.fontMono }).setDepth(43)));
            cy += 16;

            // Item picker state
            if (!this._agoraPick) this._agoraPick = { giveIdx: 0, wantIdx: 1, qty: 5 };
            const pick = this._agoraPick;

            const em = this.scene.economyManager;
            const makeArrow = (x, y, dir, cb) => {
                const btn = this._ui(this.scene.add.text(x, y, dir, { fontSize: '16px', color: '#c8a030', fontFamily: THEME.fontMono }).setOrigin(0.5).setDepth(43).setInteractive({ cursor: 'pointer' }));
                btn.on('pointerover', () => btn.setColor('#ffdd66'));
                btn.on('pointerout',  () => btn.setColor('#c8a030'));
                btn.on('pointerdown', cb);
                objs.push(btn);
            };

            // Give item picker
            const giveItem = TRADEABLE[pick.giveIdx % TRADEABLE.length];
            const giveVal  = em.getItemValue(giveItem.key);
            makeArrow(mx + 16, cy + 8, '◀', () => { pick.giveIdx = (pick.giveIdx - 1 + TRADEABLE.length) % TRADEABLE.length; rebuild(); });
            objs.push(this._ui(this.scene.add.text(mx + 30, cy, `GIVE: ${giveItem.label}`, { fontSize: '12px', color: '#ffdd88', fontFamily: THEME.fontMono }).setDepth(43)));
            objs.push(this._ui(this.scene.add.text(mx + 30, cy + 13, `${this.scene.resources[giveItem.key] ?? 0} in commons  (${giveVal.toFixed(1)} ob)`, { fontSize: '10px', color: '#7a9070', fontFamily: THEME.fontMono }).setDepth(43)));
            makeArrow(mx + mw/2 - 14, cy + 8, '▶', () => { pick.giveIdx = (pick.giveIdx + 1) % TRADEABLE.length; rebuild(); });
            cy += 30;

            // Qty picker
            makeArrow(mx + 16, cy + 6, '◀', () => { pick.qty = Math.max(1, pick.qty - 1); rebuild(); });
            objs.push(this._ui(this.scene.add.text(mx + 30, cy, `QTY: ${pick.qty}`, { fontSize: '12px', color: '#d4c8a8', fontFamily: THEME.fontMono }).setDepth(43)));
            makeArrow(mx + mw/2 - 14, cy + 6, '▶', () => { pick.qty = Math.min(50, pick.qty + 1); rebuild(); });
            cy += 22;

            // Want item picker
            const wantItem = TRADEABLE[pick.wantIdx % TRADEABLE.length];
            const wantVal  = em.getItemValue(wantItem.key);
            const receiveQty = Math.max(1, Math.round((pick.qty * giveVal * 0.80) / wantVal));
            makeArrow(mx + 16, cy + 8, '◀', () => { pick.wantIdx = (pick.wantIdx - 1 + TRADEABLE.length) % TRADEABLE.length; rebuild(); });
            objs.push(this._ui(this.scene.add.text(mx + 30, cy, `WANT: ${wantItem.label}`, { fontSize: '12px', color: '#aaddff', fontFamily: THEME.fontMono }).setDepth(43)));
            objs.push(this._ui(this.scene.add.text(mx + 30, cy + 13, `expect ~${receiveQty}×  (${wantVal.toFixed(1)} ob ea)`, { fontSize: '10px', color: '#7090aa', fontFamily: THEME.fontMono }).setDepth(43)));
            makeArrow(mx + mw/2 - 14, cy + 8, '▶', () => { pick.wantIdx = (pick.wantIdx + 1) % TRADEABLE.length; rebuild(); });
            cy += 32;

            const canAdd = giveItem.key !== wantItem.key;
            const addBtnCol = canAdd ? 0x1a4020 : 0x2a1a10;
            const addBtn = this._ui(this.scene.add.rectangle(mx + mw/2 - 40, cy + 14, mw/2 - 20, 28, addBtnCol, 0.9).setDepth(43));
            const addTxt = this._ui(this.scene.add.text(mx + mw/2 - 40, cy + 14,
                canAdd ? '+ Add Order' : '(same item!)',
                { fontSize: '13px', color: canAdd ? '#88ffaa' : '#665544', fontFamily: THEME.fontMono }).setOrigin(0.5).setDepth(44));
            objs.push(addBtn, addTxt);
            if (canAdd) {
                addBtn.setInteractive({ cursor: 'pointer' });
                addBtn.on('pointerover', () => addBtn.setFillStyle(0x2a6030));
                addBtn.on('pointerout',  () => addBtn.setFillStyle(addBtnCol));
                addBtn.on('pointerdown', () => {
                    b.tradeOrders.push({
                        give: giveItem.key, giveLabel: giveItem.label,
                        want: wantItem.key, wantLabel: wantItem.label,
                        qty: pick.qty, receiveQty,
                    });
                    rebuild();
                });
            }
            cy += 36;

            // ── Trade Log ─────────────────────────────────────────────────
            if (b.tradeLog.length > 0) {
                cy += 6;
                const sepG2 = this._ui(this.scene.add.graphics().setDepth(42));
                sepG2.lineStyle(1, 0x4a3810, 0.5).lineBetween(mx + 10, cy, mx + mw - 10, cy);
                objs.push(sepG2);
                cy += 8;
                objs.push(this._ui(this.scene.add.text(mx + 14, cy, 'RECENT TRADES',
                    { fontSize: '11px', color: '#887755', fontFamily: THEME.fontMono }).setDepth(43)));
                cy += 15;
                for (const t of b.tradeLog.slice(0, 4)) {
                    objs.push(this._ui(this.scene.add.text(mx + 14, cy,
                        `Day ${t.day}: ${t.gave.qty}× ${ITEMS[t.gave.key]?.label ?? t.gave.key} → ${t.got.qty}× ${ITEMS[t.got.key]?.label ?? t.got.key}`,
                        { fontSize: '11px', color: '#7a9060', fontFamily: THEME.fontMono }).setDepth(43)));
                    cy += 14;
                }
            }
        };

        rebuild();
        this._agoraModal = objs;
    },

    showCaravanOffer({ offers = [], autoExecuted = [], agoraExists = false } = {}) {
        if (this._caravanModal) return;
        const { W, H } = this.L;
        const rowH = 52;
        const headerH = agoraExists && autoExecuted.length ? 70 : 44;
        const mh = Math.min(H * 0.85, headerH + offers.length * rowH + 56);
        const mw = Math.min(W * 0.92, 440);
        const mx = (W - mw) / 2, my = (H - mh) / 2;
        const objs = [];

        const bg = this._ui(this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.5).setDepth(38).setInteractive());
        const panel = this._ui(this.scene.add.rectangle(mx + mw/2, my + mh/2, mw, mh, 0x1a1408, 0.97).setDepth(39).setInteractive());
        const border = this._ui(this.scene.add.graphics().setDepth(39));
        border.lineStyle(2, 0xddaa44, 0.9).strokeRect(mx, my, mw, mh);
        objs.push(bg, panel, border);

        const timerRef = { tick: null };
        const closeAll = () => {
            if (timerRef.tick) { timerRef.tick.remove(); timerRef.tick = null; }
            objs.forEach(o => o.destroy());
            this._caravanModal = null;
        };

        objs.push(this._ui(this.scene.add.text(mx + mw/2, my + 12,
            agoraExists ? '🛒 Merchants at the Agora!' : '🛒 Merchants arrive!',
            { fontSize: '15px', color: '#ffdd88', fontFamily: THEME.fontMono }).setOrigin(0.5, 0).setDepth(40)));

        const closeBtn = this._ui(this.scene.add.text(mx + mw - 12, my + 14, '✕',
            { fontSize: '18px', color: '#ffdd88', fontFamily: THEME.fontMono }).setOrigin(0.5).setDepth(40).setInteractive({ cursor: 'pointer' }));
        closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
        closeBtn.on('pointerout',  () => closeBtn.setColor('#ffdd88'));
        closeBtn.on('pointerdown', closeAll);
        objs.push(closeBtn);

        let contentY = my + 34;

        // Auto-executed standing orders
        if (autoExecuted.length) {
            objs.push(this._ui(this.scene.add.text(mx + 12, contentY,
                `✅ Standing orders filled: ${autoExecuted.join('; ')}`,
                { fontSize: '10px', color: '#88ee88', fontFamily: THEME.fontMono, wordWrap: { width: mw - 24 } }
            ).setDepth(40)));
            contentY += 26;
            const sep = this._ui(this.scene.add.graphics().setDepth(39));
            sep.lineStyle(1, 0x5a4810, 0.6).lineBetween(mx + 10, contentY, mx + mw - 10, contentY);
            objs.push(sep);
            contentY += 8;
        }

        if (offers.length === 0) {
            objs.push(this._ui(this.scene.add.text(mx + mw/2, contentY + 10,
                'No trades available right now.',
                { fontSize: '12px', color: '#887755', fontFamily: THEME.fontMono }).setOrigin(0.5, 0).setDepth(40)));
            contentY += 40;
        }

        // Each offer as a row with Accept button
        for (const offer of offers) {
            const canAfford = Object.entries(offer.give).every(([r, n]) => (this.scene.resources[r] ?? 0) >= n);
            const rowBg = this._ui(this.scene.add.rectangle(mx + mw/2, contentY + rowH/2, mw - 8, rowH - 4, canAfford ? 0x1a2010 : 0x1a1208, 0.8).setDepth(39));
            objs.push(rowBg);

            objs.push(this._ui(this.scene.add.text(mx + 14, contentY + 6, offer.label,
                { fontSize: '13px', color: canAfford ? '#e0d088' : '#887755', fontFamily: THEME.fontMono }
            ).setDepth(40)));

            if (offer.valueGiven > 0) {
                const fairness = offer.valueReceived / offer.valueGiven;
                const fairCol = fairness >= 0.85 ? '#88cc88' : fairness >= 0.65 ? '#cccc66' : '#cc8866';
                objs.push(this._ui(this.scene.add.text(mx + 14, contentY + 22,
                    `value: ${offer.valueGiven} → ${offer.valueReceived} obols (${Math.round(fairness * 100)}%)`,
                    { fontSize: '10px', color: fairCol, fontFamily: THEME.fontMono }
                ).setDepth(40)));
            }

            const btnCol = canAfford ? 0x336622 : 0x2a1c10;
            const btnBg = this._ui(this.scene.add.rectangle(mx + mw - 52, contentY + rowH/2, 76, 28, btnCol, 1).setDepth(40));
            const btnTxt = this._ui(this.scene.add.text(mx + mw - 52, contentY + rowH/2, canAfford ? 'Accept' : "Can't",
                { fontSize: '12px', color: canAfford ? '#aaffaa' : '#665544', fontFamily: THEME.fontMono }).setOrigin(0.5).setDepth(41));
            objs.push(btnBg, btnTxt);

            if (canAfford) {
                btnBg.setInteractive({ cursor: 'pointer' });
                btnBg.on('pointerover', () => btnBg.setFillStyle(0x4a9030));
                btnBg.on('pointerout',  () => btnBg.setFillStyle(btnCol));
                btnBg.on('pointerup', () => {
                    this.scene.economyManager.spend(offer.give);
                    for (const [r, n] of Object.entries(offer.receive)) this.scene.economyManager.addResource(r, n);
                    this.scene.updateUI();
                    this.showPhaseMessage('Trade accepted!', 0x88ee88);
                    closeAll();
                });
            }

            const lineSep = this._ui(this.scene.add.graphics().setDepth(39));
            lineSep.lineStyle(1, 0x3a2808, 0.5).lineBetween(mx + 8, contentY + rowH - 2, mx + mw - 8, contentY + rowH - 2);
            objs.push(lineSep);
            contentY += rowH;
        }

        // Dismiss button
        const dismissBg = this._ui(this.scene.add.rectangle(mx + mw/2, contentY + 14, 120, 26, 0x332211, 1).setDepth(40).setInteractive({ cursor: 'pointer' }));
        const dismissTxt = this._ui(this.scene.add.text(mx + mw/2, contentY + 14, 'Send Away',
            { fontSize: '12px', color: '#aa8866', fontFamily: THEME.fontMono }).setOrigin(0.5).setDepth(41));
        objs.push(dismissBg, dismissTxt);
        dismissBg.on('pointerover', () => { dismissBg.setFillStyle(0x554433); dismissTxt.setColor('#ccaa88'); });
        dismissBg.on('pointerout',  () => { dismissBg.setFillStyle(0x332211); dismissTxt.setColor('#aa8866'); });
        dismissBg.on('pointerup', closeAll);

        let secsLeft = 20;
        const countTxt = this._ui(this.scene.add.text(mx + mw / 2, contentY + 36,
            'merchants leave in 20s',
            { fontSize: '9px', color: '#4a3820', fontFamily: THEME.fontMono }).setOrigin(0.5, 0).setDepth(41));
        objs.push(countTxt);

        timerRef.tick = this.scene.time.addEvent({
            delay: 1000, loop: true,
            callback: () => {
                secsLeft--;
                if (countTxt.active) countTxt.setText(`merchants leave in ${secsLeft}s`);
            },
        });
        this.scene.time.delayedCall(20000, () => { if (this._caravanModal) closeAll(); });
        this._caravanModal = objs;
    },

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

        const closeBtn = this._ui(this.scene.add.text(mx + mw - 15, my + 15, '✕', { fontSize: '18px', color: '#ffdd88', fontFamily: THEME.fontMono }).setOrigin(0.5).setDepth(43).setInteractive({ cursor: 'pointer' }));
        closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
        closeBtn.on('pointerout',  () => closeBtn.setColor('#ffdd88'));
        closeBtn.on('pointerdown', closeAll);
        this._censusObjs.push(closeBtn);

        this._censusObjs.push(this._ui(this.scene.add.text(mx + mw / 2, my + 34, '⏸ paused — close to resume',
            { fontSize: '9px', color: '#6a5020', fontFamily: THEME.fontMono }).setOrigin(0.5, 0).setDepth(43)));

        const workers = this.scene.units.filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker').sort((a, b) => b.age - a.age || a.name.localeCompare(b.name));
        const perPage = 10;
        const totalPages = Math.ceil(workers.length / perPage);
        const paged = workers.slice(page * perPage, (page + 1) * perPage);

        // Header — columns as fractions of mw so they scale on any screen width
        const hty = my + 50;
        const colX = [0.05, 0.30, 0.40, 0.50, 0.65].map(p => mx + Math.round(p * mw));
        const hpBarW = Math.round(mw * 0.28);
        const headers = ['Name', 'Age', 'Gen', 'Role', 'Health'];
        headers.forEach((h, i) => {
            this._censusObjs.push(this._ui(this.scene.add.text(colX[i], hty, h, { fontSize: '11px', color: '#887755', fontStyle: 'bold' }).setDepth(43)));
        });

        paged.forEach((u, i) => {
            const ry = hty + 28 + i * 32;
            const line = this._ui(this.scene.add.graphics().setDepth(42));
            line.lineStyle(1, 0x333322, 0.5).lineBetween(mx + 15, ry + 24, mx + mw - 15, ry + 24);
            this._censusObjs.push(line);

            const nameTxt = this._ui(this.scene.add.text(colX[0], ry, u.name, { fontSize: '13px', color: '#d4c8a8', fontFamily: THEME.fontMono, fontStyle: 'bold' }).setDepth(43).setInteractive({ cursor: 'pointer' }));
            nameTxt.on('pointerover', () => nameTxt.setColor('#88ccff'));
            nameTxt.on('pointerout',  () => nameTxt.setColor('#d4c8a8'));
            nameTxt.on('pointerdown', () => {
                this.scene.cameras.main.pan(u.x, u.y, 600, 'Power2');
                this.scene.cameras.main.setZoom(1.5);
                closeAll();
                this.scene.selectUnit(u.id, false);
            });
            this._censusObjs.push(nameTxt);

            const ageLabel = `${Math.round(u.ageYears ?? (u.age ?? 0) * 6)}y`;
            this._censusObjs.push(this._ui(this.scene.add.text(colX[1], ry + 2, ageLabel, { fontSize: '11px', color: '#aaaacc' }).setDepth(43)));
            this._censusObjs.push(this._ui(this.scene.add.text(colX[2], ry + 2, u.gender === 'male' ? '♂' : '♀', { fontSize: '11px', color: '#cc99cc' }).setDepth(43)));

            const roleLbl = u.age < 2 ? 'Child' : (u.role ?? 'Idle');
            this._censusObjs.push(this._ui(this.scene.add.text(colX[3], ry + 2, roleLbl, { fontSize: '11px', color: '#ddcc88' }).setDepth(43)));

            // Health bar
            const hpR = u.hp / u.maxHp;
            const hpCol = hpR > 0.6 ? 0x44aa44 : hpR > 0.3 ? 0xccaa33 : 0xcc3311;
            const hpBar = this._ui(this.scene.add.graphics().setDepth(43));
            hpBar.fillStyle(0x222222).fillRect(colX[4], ry + 4, hpBarW, 6);
            hpBar.fillStyle(hpCol).fillRect(colX[4], ry + 4, Math.round(hpBarW * hpR), 6);
            this._censusObjs.push(hpBar);
        });

        // Pagination
        if (totalPages > 1) {
            const py = my + mh - 35;
            const pgTxt = this._ui(this.scene.add.text(mx + mw / 2, py, `Page ${page + 1} / ${totalPages}`, { fontSize: '12px', color: '#887755' }).setOrigin(0.5).setDepth(43));
            this._censusObjs.push(pgTxt);

            if (page > 0) {
                const prev = this._ui(this.scene.add.text(mx + 40, py, '◀ Prev', { fontSize: '12px', color: '#ffdd88', fontFamily: THEME.fontMono }).setOrigin(0, 0.5).setDepth(43).setInteractive({ cursor: 'pointer' }));
                prev.on('pointerover', () => prev.setColor('#ffffff'));
                prev.on('pointerout',  () => prev.setColor('#ffdd88'));
                prev.on('pointerdown', () => this.showCensusPanel(page - 1));
                this._censusObjs.push(prev);
            }
            if (page < totalPages - 1) {
                const next = this._ui(this.scene.add.text(mx + mw - 40, py, 'Next ▶', { fontSize: '12px', color: '#ffdd88', fontFamily: THEME.fontMono }).setOrigin(1, 0.5).setDepth(43).setInteractive({ cursor: 'pointer' }));
                next.on('pointerover', () => next.setColor('#ffffff'));
                next.on('pointerout',  () => next.setColor('#ffdd88'));
                next.on('pointerdown', () => this.showCensusPanel(page + 1));
                this._censusObjs.push(next);
            }
        }
    },

    showFloatText(x, y, text, color) {
        floatText(this.scene, x, y, text, {
            color, register: (o) => this.scene._w(o),
        });
    },

    showPhaseMessage(text, color) {
        this.scene.phaseMsg
            .setText(text)
            .setColor('#' + color.toString(16).padStart(6, '0'))
            .setAlpha(1);
        this.scene.tweens.add({
            targets: this.scene.phaseMsg, alpha: 0, delay: 2800, duration: 600,
        });
    },
};
