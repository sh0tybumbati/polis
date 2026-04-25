import { SCENE_KEYS } from '../config/sceneKeys.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.MENU });
    }

    preload() {
        console.log('MenuScene: Preloading...');
        // Load menu-specific assets if any
    }

    create() {
        const start = () => this.scene.start(SCENE_KEYS.GAME);

        const { width, height } = this.scale;
        this.add.text(width / 2, height / 2 - 30, 'POLIS', {
            fontSize: '48px', color: '#c8a030', fontFamily: 'monospace',
        }).setOrigin(0.5);

        const prompt = this.add.text(width / 2, height / 2 + 30, 'Tap or press Space to begin', {
            fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
        }).setOrigin(0.5);

        this.tweens.add({ targets: prompt, alpha: 0, yoyo: true, repeat: -1, duration: 700 });

        this.input.keyboard?.on('keydown-SPACE', start);
        this.input.on('pointerdown', start);
    }

    update(time, delta) {
        // Menu animations or updates
    }
}
