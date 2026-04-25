import { SCENE_KEYS } from '../config/sceneKeys.js';
import AssetManager from '../assets/AssetManager.js';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.BOOT });
        this.assetManager = null; // Initialize asset manager property
    }

    preload() {}

    create() {
        this.scene.start(SCENE_KEYS.MENU);
    }
}
