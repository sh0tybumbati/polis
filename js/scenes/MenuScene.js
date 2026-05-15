import { SCENE_KEYS } from '../config/sceneKeys.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.MENU });
    }

    preload() {
        this.load.image('menu_sky',     'assets/images/menu/sky.png');
        this.load.image('menu_stars',   'assets/images/menu/constellations.png');
        this.load.image('menu_sunrays', 'assets/images/menu/sunrays.png');
        this.load.image('menu_sun',     'assets/images/menu/sun.png');
        this.load.image('menu_fg',      'assets/images/menu/foreground.png');
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        const hasSave = !!localStorage.getItem('epochs_save');

        this._buildLayers(W, H);
        this._drawTitle(W, H);
        this._drawButtons(W, H, hasSave);
        this._drawFooter(W, H);

        this.input.keyboard?.on('keydown-N', () => this._startNew());
        this.input.keyboard?.on('keydown-SPACE', () => hasSave ? this._continue() : this._startNew());
        if (hasSave) {
            this.input.keyboard?.on('keydown-C', () => this._continue());
            this.input.keyboard?.on('keydown-ENTER', () => this._continue());
        }
    }

    update(time, delta) {
        const dt = delta / 1000;
        if (this._sky)     this._sky.tilePositionY += 18 * dt;
        if (this._stars)   this._stars.angle   += 1.2 * dt;
        if (this._sunrays) this._sunrays.angle  += 3.5 * dt;
        // sun disc is stationary — no update needed
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

        // ── 1. Sky — tileSprite loops seamlessly as it scrolls upward ──────────
        const skyTex = this.textures.get('menu_sky').getSourceImage();
        const skyScale = Math.max(W / skyTex.width, H / skyTex.height);
        this._sky = this.add.tileSprite(cx, H / 2, W, H, 'menu_sky')
            .setTileScale(skyScale, skyScale);
        // Centre the red/blue split (~47% from left in texture) at screen centre
        this._sky.tilePositionX = skyTex.width * 0.47 - (W / 2) / skyScale;

        // Compute foreground horizon Y on screen so sun/stars track it
        const fgTex = this.textures.get('menu_fg').getSourceImage();
        const fgScale = W / fgTex.width;
        const fgRenderedH = fgTex.height * fgScale;
        const fgTopY = H - fgRenderedH;
        // Horizon sits at ~44% from top of the fg image (where sky meets terrain)
        const fgHorizonY = fgTopY + 0.44 * fgRenderedH;
        // Target: halfway between the horizon and the bottom, shifted up a bit
        const belowHorizonCy = (fgHorizonY + H) / 2 - H * 0.07;

        // ── 2. Constellations — very faint, slowly rotating star chart ─────────
        const starDiameter = Math.max(W, H) * 1.15;
        this._stars = this.add.image(cx, belowHorizonCy, 'menu_stars')
            .setDisplaySize(starDiameter, starDiameter)
            .setAlpha(0.055)
            .setBlendMode(Phaser.BlendModes.MULTIPLY);

        // ── 3. Sun rays — behind disc, spinning; MULTIPLY so white bg vanishes ─
        const raysSize = Math.min(W, H) * 0.68;
        this._sunrays = this.add.image(cx, belowHorizonCy, 'menu_sunrays')
            .setDisplaySize(raysSize, raysSize)
            .setBlendMode(Phaser.BlendModes.MULTIPLY);

        // ── 4. Sun disc — stationary, centred on same point ────────────────────
        const sunSize = Math.min(W, H) * 0.28;
        this._sun = this.add.image(cx, belowHorizonCy, 'menu_sun')
            .setDisplaySize(sunSize, sunSize)
            .setBlendMode(Phaser.BlendModes.MULTIPLY);

        // ── 5. Foreground — zoom in slightly (×1.12) then anchor to bottom ─────
        this.add.image(cx, H, 'menu_fg')
            .setScale(fgScale * 1.12)
            .setOrigin(0.5, 1);
    }

    _drawTitle(W, H) {
        const cx = W / 2;
        // Title sits in the open sky zone, above the buildings
        const cy = H * 0.28;
        const fontSize = Math.min(72, Math.floor(W * 0.13));

        this.add.text(cx, cy - fontSize * 0.32, 'EPOCHS:', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: fontSize + 'px',
            color: '#e8d070',
            stroke: '#1a0c00',
            strokeThickness: 3,
            shadow: { offsetX: 0, offsetY: 3, color: '#6a3800', blur: 16, fill: true },
        }).setOrigin(0.5);

        this.add.text(cx, cy + fontSize * 0.42, 'THE DAWN', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: fontSize + 'px',
            color: '#e8d070',
            stroke: '#1a0c00',
            strokeThickness: 3,
            shadow: { offsetX: 0, offsetY: 3, color: '#6a3800', blur: 16, fill: true },
        }).setOrigin(0.5);

        // Thin rule between title and buttons
        const g = this.add.graphics();
        const ry = cy + fontSize * 1.05;
        const rw = Math.min(300, W * 0.45);
        g.lineStyle(1, 0xc8a030, 0.4).lineBetween(cx - rw / 2, ry, cx + rw / 2, ry);
        g.fillStyle(0xd4aa40, 0.55).fillCircle(cx, ry, 2);
    }

    _drawButtons(W, H, hasSave) {
        const cx  = W / 2;
        const gap = Math.min(48, H * 0.075);
        const topY = H * 0.63;

        const buttons = [
            hasSave
                ? { label: 'LOAD GAME', cb: () => this._continue(), active: true  }
                : { label: 'LOAD GAME', cb: null,                    active: false },
            { label: 'START GAME',      cb: () => this._startNew(),  active: true  },
            { label: 'SETTINGS',        cb: null,                    active: false },
            { label: 'CREDITS',         cb: null,                    active: false },
        ];

        buttons.forEach((btn, i) => this._makeTextButton(cx, topY + i * gap, btn));
    }

    _makeTextButton(cx, cy, { label, cb, active }) {
        const color   = active ? '#e8d898' : '#5a4a30';
        const hovered = '#ffffff';

        const txt = this.add.text(cx, cy, label, {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize:   '22px',
            color,
            letterSpacing: 4,
        }).setOrigin(0.5);

        if (!active || !cb) return;

        const ug = this.add.graphics().setAlpha(0);
        const uw = txt.width + 12;
        ug.lineStyle(1, 0xd4aa40, 0.8).lineBetween(cx - uw / 2, cy + 16, cx + uw / 2, cy + 16);

        const zone = this.add.zone(cx, cy, Math.max(txt.width + 40, 200), 40).setInteractive({ cursor: 'pointer' });
        zone.on('pointerover',  () => { txt.setColor(hovered); ug.setAlpha(1); });
        zone.on('pointerout',   () => { txt.setColor(color);   ug.setAlpha(0); });
        zone.on('pointerdown',  cb);
    }

    _drawFooter(W, H) {
        this.add.text(W / 2, H - 20, 'PRESS ANY BUTTON TO CONTINUE', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize:   '11px',
            color:      '#8a7050',
            letterSpacing: 3,
        }).setOrigin(0.5);
    }
}
