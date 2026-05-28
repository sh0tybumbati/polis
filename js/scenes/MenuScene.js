import { SCENE_KEYS } from '../config/sceneKeys.js';
import { panel, rule, textButton, THEME } from '../ui/UIKit.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.MENU });
    }

    preload() {
        this.load.image('menu_sky',     'assets/images/menu/sky.png');
        this.load.image('menu_stars',   'assets/images/menu/constellations.png');
        this.load.image('menu_sunrays', 'assets/images/menu/sunrays.png');
        this.load.image('menu_fg',      'assets/images/menu/foreground.png');
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        const hasSave = !!localStorage.getItem('epochs_save');

        this._buildLayers(W, H);
        this._drawTitle(W, H);
        this._drawButtons(W, H, hasSave);

        this.input.keyboard?.on('keydown-N', () => this._startNew());
        this.input.keyboard?.on('keydown-SPACE', () => hasSave ? this._continue() : this._startNew());
        if (hasSave) {
            this.input.keyboard?.on('keydown-C', () => this._continue());
            this.input.keyboard?.on('keydown-ENTER', () => this._continue());
        }
        this.input.keyboard?.on('keydown-ESC', () => { if (this._settingsOpen) this._hideSettings(); });
    }

    update(time, delta) {
        const dt = delta / 1000;
        if (this._sky)     this._sky.tilePositionY += 8 * dt;
        if (this._stars)   this._stars.angle        -= 1.2 * dt;
        if (this._sunrays) this._sunrays.angle       += 3.5 * dt;
    }

    _startNew() {
        localStorage.removeItem('epochs_save');
        this.scene.launch(SCENE_KEYS.CIV_SELECT);
    }

    _continue() {
        this.scene.start(SCENE_KEYS.GAME);
    }

    _buildLayers(W, H) {
        const cx = W / 2;

        // ── 1. Sky — tileSprite scrolls upward ───────────────────────────────
        const skyTex   = this.textures.get('menu_sky').getSourceImage();
        // Scale to width so one tile spans exactly the screen — clean horizontal tile seam
        const skyScale = W / skyTex.width;
        this._sky = this.add.tileSprite(cx, H / 2, W, H, 'menu_sky')
            .setTileScale(skyScale, skyScale);
        this._sky.tilePositionX = 0;

        // Compute foreground metrics — scale exactly to screen width (no over-magnification)
        const fgTex       = this.textures.get('menu_fg').getSourceImage();
        const fgScale     = W / fgTex.width;
        const fgRenderH   = fgTex.height * fgScale;
        // Push fg down so ~32% of its height is off-screen — shows sky, reduces pixelation
        const fgPush      = H * 0.32;
        const fgTopY      = H + fgPush - fgRenderH;
        const fgHorizonY  = fgTopY + 0.44 * fgRenderH;
        // Sun sits just above the horizon line
        const sunCy       = Math.max(H * 0.10, fgHorizonY - H * 0.12);

        // ── 2. Constellations — faint rotating star chart ─────────────────────
        const starDiameter = Math.max(W, H) * 1.618;
        this._stars = this.add.image(cx, sunCy, 'menu_stars')
            .setDisplaySize(starDiameter, starDiameter)
            .setAlpha(0.08)
            .setBlendMode(Phaser.BlendModes.SCREEN);

        // ── 3. Sun rays — spinning with radial alpha fade ─────────────────────
        const raysSize = Math.max(W, H) * 1.47;
        this._sunrays  = this.add.image(cx, sunCy, 'menu_sunrays')
            .setDisplaySize(raysSize, raysSize)
            .setBlendMode(Phaser.BlendModes.SOFT_LIGHT);

        // Radial BitmapMask — opaque centre, transparent edges
        const mRes    = 512;
        const mCanvas = document.createElement('canvas');
        mCanvas.width = mRes; mCanvas.height = mRes;
        const mCtx = mCanvas.getContext('2d');
        const grad  = mCtx.createRadialGradient(mRes/2, mRes/2, 0, mRes/2, mRes/2, mRes/2);
        grad.addColorStop(0,    'rgba(255,255,255,1)');
        grad.addColorStop(0.45, 'rgba(255,255,255,1)');
        grad.addColorStop(1,    'rgba(255,255,255,0)');
        mCtx.fillStyle = grad;
        mCtx.fillRect(0, 0, mRes, mRes);
        this.textures.addCanvas('rays_mask', mCanvas);
        const maskObj = this.make.image({ x: cx, y: sunCy, key: 'rays_mask', add: false });
        maskObj.setDisplaySize(raysSize, raysSize);
        this._sunrays.setMask(new Phaser.Display.Masks.BitmapMask(this, maskObj));

        // ── 4. Foreground — pushed down so only upper portion is visible ─────
        this.add.image(cx, H + fgPush, 'menu_fg')
            .setScale(fgScale)
            .setOrigin(0.5, 1);
    }

    _drawTitle(W, H) {
        const cx       = W / 2;
        const cy       = H * 0.28;
        const fontSize = Math.min(72, Math.floor(W * 0.13));

        const titleStyle = {
            fontFamily:      'Georgia, "Times New Roman", serif',
            fontSize:        fontSize + 'px',
            color:           '#e8d070',
            stroke:          '#1a0c00',
            strokeThickness: 3,
            letterSpacing:   Math.floor(fontSize * 0.08),
            align:           'center',
            shadow: { offsetX: 0, offsetY: 3, color: '#6a3800', blur: 16, fill: true },
        };

        this.add.text(cx, cy - fontSize * 0.32, 'EPOCHS:',  titleStyle).setOrigin(0.5);
        this.add.text(cx, cy + fontSize * 0.42, 'THE DAWN', titleStyle).setOrigin(0.5);

        rule(this, cx, cy + fontSize * 1.05, Math.min(300, W * 0.45), { alpha: 0.4 });
    }

    _drawButtons(W, H, hasSave) {
        const cx   = W / 2;
        const gap  = Math.min(48, H * 0.075);
        const topY = H * 0.63;

        const buttons = [
            ...(hasSave ? [{ label: 'LOAD GAME', cb: () => this._continue() }] : []),
            { label: 'START GAME', cb: () => this._startNew() },
            { label: 'SETTINGS',   cb: () => this._showSettings() },
            { label: 'CREDITS',    cb: null },
        ];

        const backPad = gap * 0.55;
        panel(this, cx - 110, topY - backPad, 220, (buttons.length - 1) * gap + backPad * 2, {
            color: 0x000000, alpha: 0.38, radius: 8, borderAlpha: 0,
        });

        buttons.forEach(({ label, cb }, i) => textButton(this, cx, topY + i * gap, label, cb));
    }

    _loadSettings() {
        try { return JSON.parse(localStorage.getItem('epochs_settings') ?? '{}'); } catch { return {}; }
    }

    _saveSettings(patch) {
        const cur = this._loadSettings();
        localStorage.setItem('epochs_settings', JSON.stringify({ ...cur, ...patch }));
    }

    _showSettings() {
        if (this._settingsOpen) return;
        this._settingsOpen = true;
        const cfg = this._loadSettings();
        const W = this.scale.width, H = this.scale.height;
        const mw = Math.min(310, W * 0.75);
        const mh = 260;
        const mx = (W - mw) / 2, my = (H - mh) / 2;
        const objs = [];

        const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setDepth(10).setInteractive();
        const box = this.add.rectangle(mx + mw / 2, my + mh / 2, mw, mh, 0x120e08, 1).setDepth(11).setInteractive();
        const bord = this.add.graphics().setDepth(12);
        bord.lineStyle(2, 0xc8a030, 0.9).strokeRect(mx, my, mw, mh);
        objs.push(dim, box, bord);

        objs.push(this.add.text(mx + mw / 2, my + 16, '⚙  SETTINGS', {
            fontSize: '16px', color: '#ffdd88', fontFamily: THEME.fontMono,
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(13));

        const sep1 = this.add.graphics().setDepth(12);
        sep1.lineStyle(1, 0x5a4010, 0.7).lineBetween(mx + 16, my + 42, mx + mw - 16, my + 42);
        objs.push(sep1);

        const state = {
            gameSpeed: cfg.gameSpeed ?? 1,
            fogEnabled: cfg.fogEnabled ?? true,
            showNeeds: cfg.showNeeds ?? true,
            autosave: cfg.autosave ?? true,
        };

        const PAD = 16, ROW_H = 30, labelW = 96;
        const rowX = mx + PAD, contentW = mw - PAD * 2;
        let ry = my + 52;

        const addRow = (label, options, getKey, saveKey) => {
            objs.push(this.add.text(rowX, ry + ROW_H / 2, label, {
                fontSize: '12px', color: '#aaa090', fontFamily: THEME.fontMono,
            }).setOrigin(0, 0.5).setDepth(13));

            const btnArea = contentW - labelW;
            const bw = Math.floor(btnArea / options.length) - 3;
            options.forEach((opt, i) => {
                const bx = rowX + labelW + i * (bw + 3);
                const by = ry + 3;
                const bh = ROW_H - 6;
                const active = () => state[getKey] === opt.val;
                const bg2 = this.add.graphics().setDepth(13);
                const lbl2 = this.add.text(bx + bw / 2, by + bh / 2, opt.label, {
                    fontSize: '11px', fontFamily: THEME.fontMono,
                }).setOrigin(0.5).setDepth(14);
                const redraw = () => {
                    bg2.clear();
                    const a = active();
                    bg2.fillStyle(a ? 0x3a2c14 : 0x1e1608, 1).fillRect(bx, by, bw, bh);
                    bg2.lineStyle(1, a ? 0xc8a030 : 0x5a4010, 0.9).strokeRect(bx, by, bw, bh);
                    lbl2.setColor(a ? '#ffffff' : '#ddcc88');
                };
                redraw();
                const zone = this.add.zone(bx + bw / 2, by + bh / 2, bw, bh).setDepth(15).setInteractive({ cursor: 'pointer' });
                zone.on('pointerover', () => { bg2.clear(); bg2.fillStyle(0x3a2c14, 1).fillRect(bx, by, bw, bh); bg2.lineStyle(1, 0xc8a030, 0.8).strokeRect(bx, by, bw, bh); lbl2.setColor('#ffffff'); });
                zone.on('pointerout',  () => redraw());
                zone.on('pointerdown', () => {
                    state[getKey] = opt.val;
                    this._saveSettings({ [saveKey]: opt.val });
                    objs.forEach(o => o.destroy?.());
                    this._settingsOpen = false;
                    this._showSettings();
                });
                objs.push(bg2, lbl2, zone);
            });
            ry += ROW_H + 6;
        };

        addRow('Game Speed',  [1,2,3,4,5].map(n => ({ label: `${n}×`, val: n })), 'gameSpeed',  'gameSpeed');
        addRow('Fog of War',  [{ label: 'ON', val: true }, { label: 'OFF', val: false }], 'fogEnabled', 'fogEnabled');
        addRow('Need Icons',  [{ label: 'ON', val: true }, { label: 'OFF', val: false }], 'showNeeds',  'showNeeds');
        addRow('Autosave',    [{ label: 'ON', val: true }, { label: 'OFF', val: false }], 'autosave',   'autosave');

        const sep2 = this.add.graphics().setDepth(12);
        sep2.lineStyle(1, 0x5a4010, 0.7).lineBetween(mx + 16, ry + 2, mx + mw - 16, ry + 2);
        objs.push(sep2);

        const BBW = 90, BBH = 26, BBX = mx + mw / 2 - BBW / 2, BBY = ry + 10;
        const bbg = this.add.graphics().setDepth(13);
        bbg.fillStyle(0x1e1608, 1).fillRect(BBX, BBY, BBW, BBH);
        bbg.lineStyle(1, 0x5a4010, 0.8).strokeRect(BBX, BBY, BBW, BBH);
        const bbt = this.add.text(BBX + BBW / 2, BBY + BBH / 2, '← Back', {
            fontSize: '12px', color: '#ddcc88', fontFamily: THEME.fontMono,
        }).setOrigin(0.5).setDepth(14);
        const bbz = this.add.zone(BBX + BBW / 2, BBY + BBH / 2, BBW, BBH).setDepth(15).setInteractive({ cursor: 'pointer' });
        bbz.on('pointerover', () => { bbg.clear(); bbg.fillStyle(0x3a2c14, 1).fillRect(BBX, BBY, BBW, BBH); bbg.lineStyle(1, 0xc8a030, 0.8).strokeRect(BBX, BBY, BBW, BBH); bbt.setColor('#ffffff'); });
        bbz.on('pointerout',  () => { bbg.clear(); bbg.fillStyle(0x1e1608, 1).fillRect(BBX, BBY, BBW, BBH); bbg.lineStyle(1, 0x5a4010, 0.8).strokeRect(BBX, BBY, BBW, BBH); bbt.setColor('#ddcc88'); });
        bbz.on('pointerdown', () => this._hideSettings());
        objs.push(bbg, bbt, bbz);

        this._settingsObjs = objs;
    }

    _hideSettings() {
        this._settingsObjs?.forEach(o => o.destroy?.());
        this._settingsObjs = [];
        this._settingsOpen = false;
    }
}
