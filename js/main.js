import { GAME_CONFIG } from './config/gameConfig.js';
import { SCENE_KEYS } from './config/sceneKeys.js';

// Import scene classes
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import EndScene  from './scenes/EndScene.js';

// Canvas covers the physical screen; the world (128×80 tiles) is larger — camera scrolls over it.
const game = new Phaser.Game({
  ...GAME_CONFIG, // Spread the core config
  parent: 'game', // Keep parent div specified
  scene: [ // Register scenes using imported classes
    BootScene,
    MenuScene,
    GameScene,
    EndScene,
  ],
});
