import { SCENE_KEYS } from '../config/sceneKeys.js';
import { rule, THEME } from '../ui/UIKit.js';

const CIVS = [
    {
        id: 'greece',
        name: 'HELLAS',
        subtitle: 'The Greek City-States',
        accentColor: 0x6aabdd,
        textColor: '#9ecfff',
        desc: 'Philosophers and traders who cultivated the olive and the agora. Knowledge flows as freely as wine.',
        traits: ['Olive groves yield 40% more', 'Agora restores social needs', 'Leisure grants faster joy'],
        bonus: '+6 olives, +4 berries, agora built at start',
    },
    {
        id: 'sumer',
        name: 'SUMER',
        subtitle: 'The First Cities of Mesopotamia',
        accentColor: 0xdd9a30,
        textColor: '#ffd080',
        desc: 'Tamed rivers and baked clay into civilization. The first to count grain and build temples to the sky.',
        traits: ['Farms yield 25% more grain', 'Workers need 20% less food', 'Grain silo built at start'],
        bonus: '+12 wheat, +8 sticks, grain silo at start',
    },
];

export default class CivSelectScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.CIV_SELECT });
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this._selected = null;
        this._cards = [];

        // Overlay
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.70);

        // Title
        this.add.text(W / 2, H * 0.095, 'CHOOSE YOUR PEOPLE', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '20px', color: '#e8d070',
            stroke: '#000000', strokeThickness: 2,
            letterSpacing: 6,
        }).setOrigin(0.5);

        rule(this, W / 2, H * 0.155, 280, { alpha: 0.35 });

        // Cards
        const cardW  = Math.min(210, W * 0.36);
        const cardH  = H * 0.63;
        const gap    = W * 0.05;
        const totalW = cardW * 2 + gap;
        const leftX  = W / 2 - totalW / 2;
        const cardY  = H * 0.185;

        CIVS.forEach((civ, i) => {
            const cx = leftX + i * (cardW + gap) + cardW / 2;
            this._cards.push(this._makeCard(civ, cx, cardY, cardW, cardH));
        });

        // Begin button
        this._beginBtn = this.add.text(W / 2, H * 0.89, 'BEGIN', {
            fontFamily: 'Georgia, serif', fontSize: '19px',
            color: '#554433', stroke: '#000000', strokeThickness: 2, letterSpacing: 8,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this._beginBtn.on('pointerover', () => {
            if (this._selected) this._beginBtn.setStyle({ color: '#ffee88' });
        });
        this._beginBtn.on('pointerout', () => {
            if (this._selected) this._beginBtn.setStyle({ color: '#e8d070' });
        });
        this._beginBtn.on('pointerdown', () => {
            if (this._selected) this._launch(this._selected);
        });

        // Back
        const back = this.add.text(W * 0.05, H * 0.92, '← BACK', {
            fontFamily: THEME.fontMono, fontSize: '10px', color: '#665544',
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        back.on('pointerover',  () => back.setStyle({ color: '#aaa090' }));
        back.on('pointerout',   () => back.setStyle({ color: '#665544' }));
        back.on('pointerdown',  () => this.scene.stop());
    }

    _makeCard(civ, cx, topY, cardW, cardH) {
        const bg = this.add.rectangle(cx, topY + cardH / 2, cardW, cardH, 0x080808, 0.80)
            .setStrokeStyle(1, 0x332200, 0.7)
            .setInteractive({ useHandCursor: true });

        const emblemY = topY + cardH * 0.14;
        this._drawEmblem(civ, cx, emblemY, cardW * 0.52);

        this.add.text(cx, topY + cardH * 0.31, civ.name, {
            fontFamily: 'Georgia, serif', fontSize: '17px',
            color: civ.textColor, stroke: '#000000', strokeThickness: 2, letterSpacing: 5,
        }).setOrigin(0.5);

        this.add.text(cx, topY + cardH * 0.38, civ.subtitle, {
            fontFamily: THEME.fontMono, fontSize: '8px', color: '#665544',
        }).setOrigin(0.5);

        rule(this, cx, topY + cardH * 0.435, cardW * 0.72, { color: civ.accentColor, alpha: 0.3 });

        this.add.text(cx, topY + cardH * 0.475, civ.desc, {
            fontFamily: 'Georgia, serif', fontSize: '8.5px', color: '#bbaa99',
            wordWrap: { width: cardW - 20 }, align: 'center',
        }).setOrigin(0.5, 0);

        const traitTop = topY + cardH * 0.635;
        civ.traits.forEach((t, i) => {
            this.add.text(cx - cardW / 2 + 12, traitTop + i * 16, `· ${t}`, {
                fontFamily: THEME.fontMono, fontSize: '8px', color: '#998866',
            });
        });

        this.add.text(cx, topY + cardH * 0.895, civ.bonus, {
            fontFamily: THEME.fontMono, fontSize: '7.5px', color: '#554433',
            wordWrap: { width: cardW - 16 }, align: 'center',
        }).setOrigin(0.5);

        bg.on('pointerover', () => {
            if (this._selected?.id !== civ.id) bg.setFillStyle(0x141008, 0.92);
        });
        bg.on('pointerout', () => {
            if (this._selected?.id !== civ.id) bg.setFillStyle(0x080808, 0.80);
        });
        bg.on('pointerdown', () => this._selectCiv(civ, bg));

        return { civ, bg };
    }

    _drawEmblem(civ, cx, cy, size) {
        const g = this.add.graphics();
        if (civ.id === 'greece') {
            // Three columns + pediment
            g.fillStyle(0x9ecfff, 0.65);
            const colW = size * 0.11, colH = size * 0.46, colGap = size * 0.19;
            const n = 3, totalW = n * colW + (n - 1) * colGap;
            const x0 = cx - totalW / 2;
            for (let i = 0; i < n; i++) {
                g.fillRect(x0 + i * (colW + colGap), cy - colH / 2, colW, colH);
            }
            g.fillTriangle(
                cx - totalW * 0.68, cy - colH / 2,
                cx + totalW * 0.68, cy - colH / 2,
                cx, cy - colH / 2 - size * 0.2
            );
            g.fillRect(cx - totalW * 0.72, cy + colH / 2, totalW * 1.44, size * 0.08);
        } else {
            // Ziggurat — 3 stepped tiers
            g.fillStyle(0xffd080, 0.65);
            const steps = 3, baseW = size * 0.88, stepH = size * 0.17;
            const baseY = cy + (steps * stepH) / 2;
            for (let i = 0; i < steps; i++) {
                const w = baseW * (1 - i * 0.24);
                g.fillRect(cx - w / 2, baseY - (i + 1) * stepH, w, stepH - 2);
            }
        }
    }

    _selectCiv(civ, bg) {
        this._cards.forEach(c => c.bg.setFillStyle(0x080808, 0.80).setStrokeStyle(1, 0x332200, 0.7));
        bg.setFillStyle(0x110e04, 0.96).setStrokeStyle(2, civ.accentColor, 0.85);
        this._selected = civ;
        this._beginBtn.setStyle({ color: '#e8d070' });
    }

    _launch(civ) {
        this.scene.stop(SCENE_KEYS.MENU);
        this.scene.start(SCENE_KEYS.GAME, { civ: civ.id });
    }
}
