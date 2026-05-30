import { GAME_CONFIG } from './config/gameConfig.js';
import { SCENE_KEYS } from './config/sceneKeys.js';

// Import scene classes
import BootScene        from './scenes/BootScene.js';
import MenuScene        from './scenes/MenuScene.js';
import CivSelectScene   from './scenes/CivSelectScene.js';
import GameScene        from './scenes/GameScene.js';
import EndScene         from './scenes/EndScene.js';
import SpriteEditorScene from './scenes/SpriteEditorScene.js';

// Suppress browser right-click context menu over the game canvas
document.addEventListener('contextmenu', e => { if (e.target?.tagName === 'CANVAS') e.preventDefault(); });

// Wait for web fonts before creating the game so text objects render with JetBrains Mono from frame 1.
document.fonts.ready.then(() => {
    new Phaser.Game({
        ...GAME_CONFIG,
        scene: [BootScene, MenuScene, CivSelectScene, GameScene, EndScene, SpriteEditorScene],
    });
});
