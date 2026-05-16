import { SCENE_KEYS } from '../config/sceneKeys.js';
import { panel, rule, textButton } from '../ui/UIKit.js';

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
        if (this._stars)   this._stars.angle        -= 1.2 * dt;
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

        // ── 1. Sky — tileSprite scrolls upward ───────────────────────────────
        const skyTex   = this.textures.get('menu_sky').getSourceImage();
        const skyScale = Math.max(W / skyTex.width, H / skyTex.height);
        this._sky = this.add.tileSprite(cx, H / 2, W, H, 'menu_sky')
            .setTileScale(skyScale, skyScale);
        this._sky.tilePositionX = skyTex.width * 0.47 - (W / 2) / skyScale;

        // Compute foreground horizon for element positioning
        const fgTex       = this.textures.get('menu_fg').getSourceImage();
        const fgScale     = W / fgTex.width;
        const fgRenderedH = fgTex.height * fgScale;
        const fgTopY      = H - fgRenderedH;
        const fgHorizonY  = fgTopY + 0.44 * fgRenderedH;
        const sunCy       = (fgHorizonY + H) / 2 - H * 0.03;

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

        // ── 4. Foreground — anchored to bottom ───────────────────────────────
        this.add.image(cx, H, 'menu_fg')
            .setScale(fgScale * 1.12)
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
            { label: 'SETTINGS',   cb: null },
            { label: 'CREDITS',    cb: null },
        ];

        const backPad = gap * 0.55;
        panel(this, cx - 110, topY - backPad, 220, (buttons.length - 1) * gap + backPad * 2, {
            color: 0x000000, alpha: 0.38, radius: 8, borderAlpha: 0,
        });

        buttons.forEach(({ label, cb }, i) => textButton(this, cx, topY + i * gap, label, cb));
    }
}
