import { SCENE_KEYS } from '../config/sceneKeys.js';

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
    }

    update(time, delta) {
        const dt = delta / 1000;
        if (this._sky)     this._sky.tilePositionY += 8 * dt;
        if (this._stars)   this._stars.angle        += 1.2 * dt;
        if (this._sunrays) this._sunrays.angle       += 3.5 * dt;
    }

    _startNew() {
        localStorage.removeItem('epochs_save');
        this.scene.start(SCENE_KEYS.GAME);
    }

    _continue() {
        this.scene.start(SCENE_KEYS.GAME);
    }

    _buildLayers(W, H) {
        const cx = W / 2;

        // ── 1. Sky — tileSprite drifts sideways ───────────────────────────────
        const skyTex = this.textures.get('menu_sky').getSourceImage();
        const skyScale = Math.max(W / skyTex.width, H / skyTex.height);
        this._sky = this.add.tileSprite(cx, H / 2, W, H, 'menu_sky')
            .setTileScale(skyScale, skyScale);
        // Centre the red/blue split (~47% from left) at screen centre
        this._sky.tilePositionX = skyTex.width * 0.47 - (W / 2) / skyScale;

        // Compute foreground horizon for sun/star positioning
        const fgTex = this.textures.get('menu_fg').getSourceImage();
        const fgScale = W / fgTex.width;
        const fgRenderedH = fgTex.height * fgScale;
        const fgTopY = H - fgRenderedH;
        const fgHorizonY = fgTopY + 0.44 * fgRenderedH;
        const belowHorizonCy = (fgHorizonY + H) / 2 - H * 0.07;

        // ── 2. Constellations — faint rotating star chart ─────────────────────
        const starDiameter = Math.max(W, H) * 1.618;
        this._stars = this.add.image(cx, belowHorizonCy + H * 0.04, 'menu_stars')
            .setDisplaySize(starDiameter, starDiameter)
            .setAlpha(0.08)
            .setBlendMode(Phaser.BlendModes.SCREEN);

        // ── 3. Sun rays — spinning, radial fade at edges ──────────────────────
        const raysCy   = belowHorizonCy + H * 0.04;
        const raysSize = Math.max(W, H) * 1.47;
        this._sunrays  = this.add.image(cx, raysCy, 'menu_sunrays')
            .setDisplaySize(raysSize, raysSize)
            .setBlendMode(Phaser.BlendModes.SOFT_LIGHT);

        // Radial alpha mask — opaque centre, transparent edges
        const mRes = 512;
        const mCanvas = document.createElement('canvas');
        mCanvas.width = mRes; mCanvas.height = mRes;
        const mCtx = mCanvas.getContext('2d');
        const grad = mCtx.createRadialGradient(mRes/2, mRes/2, 0, mRes/2, mRes/2, mRes/2);
        grad.addColorStop(0,    'rgba(255,255,255,1)');
        grad.addColorStop(0.45, 'rgba(255,255,255,1)');
        grad.addColorStop(1,    'rgba(255,255,255,0)');
        mCtx.fillStyle = grad;
        mCtx.fillRect(0, 0, mRes, mRes);
        this.textures.addCanvas('rays_mask', mCanvas);
        const maskObj = this.make.image({ x: cx, y: raysCy, key: 'rays_mask', add: false });
        maskObj.setDisplaySize(raysSize, raysSize);
        this._sunrays.setMask(new Phaser.Display.Masks.BitmapMask(this, maskObj));

        // ── 4. Foreground — anchored to bottom, zoomed in slightly ────────────
        this.add.image(cx, H, 'menu_fg')
            .setScale(fgScale * 1.12)
            .setOrigin(0.5, 1);
    }

    _drawTitle(W, H) {
        const cx = W / 2;
        const cy = H * 0.28;
        const fontSize = Math.min(72, Math.floor(W * 0.13));

        const titleStyle = {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: fontSize + 'px',
            color: '#e8d070',
            stroke: '#1a0c00',
            strokeThickness: 3,
            letterSpacing: Math.floor(fontSize * 0.08),
            align: 'center',
            shadow: { offsetX: 0, offsetY: 3, color: '#6a3800', blur: 16, fill: true },
        };

        this.add.text(cx, cy - fontSize * 0.32, 'EPOCHS:', titleStyle).setOrigin(0.5);
        this.add.text(cx, cy + fontSize * 0.42, 'THE DAWN', titleStyle).setOrigin(0.5);

        // Thin rule
        const g = this.add.graphics();
        const ry = cy + fontSize * 1.05;
        const rw = Math.min(300, W * 0.45);
        g.lineStyle(1, 0xc8a030, 0.4).lineBetween(cx - rw / 2, ry, cx + rw / 2, ry);
        g.fillStyle(0xd4aa40, 0.55).fillCircle(cx, ry, 2);
    }

    _drawButtons(W, H, hasSave) {
        const cx   = W / 2;
        const gap  = Math.min(48, H * 0.075);
        const topY = H * 0.63;

        // Hide LOAD GAME entirely when no save exists
        const buttons = [
            ...(hasSave ? [{ label: 'LOAD GAME', cb: () => this._continue() }] : []),
            { label: 'START GAME', cb: () => this._startNew() },
            { label: 'SETTINGS',   cb: null },
            { label: 'CREDITS',    cb: null },
        ];

        // Dark backing strip — spans from first to last button with equal padding
        const backPad = gap * 0.55;
        const backTop = topY - backPad;
        const backH   = (buttons.length - 1) * gap + backPad * 2;
        const backW   = 220;
        this.add.graphics()
            .fillStyle(0x000000, 0.38)
            .fillRoundedRect(cx - backW / 2, backTop, backW, backH, 8);

        buttons.forEach((btn, i) => this._makeTextButton(cx, topY + i * gap, btn));
    }

    _makeTextButton(cx, cy, { label, cb }) {
        const active  = !!cb;
        const color   = active ? '#e8d898' : '#5a4a30';
        const hovered = '#ffffff';

        const txt = this.add.text(cx, cy, label, {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize:   '22px',
            color,
            letterSpacing: 4,
            shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 6, fill: true },
        }).setOrigin(0.5);

        if (!active) return;

        const ug = this.add.graphics().setAlpha(0);
        const uw = txt.width + 12;
        ug.lineStyle(1, 0xd4aa40, 0.8).lineBetween(cx - uw / 2, cy + 16, cx + uw / 2, cy + 16);

        const zone = this.add.zone(cx, cy, Math.max(txt.width + 40, 200), 40).setInteractive({ cursor: 'pointer' });
        zone.on('pointerover',  () => { txt.setColor(hovered); ug.setAlpha(1); });
        zone.on('pointerout',   () => { txt.setColor(color);   ug.setAlpha(0); });
        zone.on('pointerdown',  cb);
    }
}
