export default class AssetManager {
    constructor(scene) {
        this.scene = scene;
    }

    loadImage(key, path) {
        console.log(`AssetManager: Loading image ${key} from ${path}`);
        this.scene.load.image(key, path);
    }

    loadAudio(key, path) {
        console.log(`AssetManager: Loading audio ${key} from ${path}`);
        this.scene.load.audio(key, path);
    }

    // Add more loading methods as needed (e.g., for spritesheets, tilemaps, etc.)
}
