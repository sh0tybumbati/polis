/**
 * Sprite-rig registry. Each module under js/content/sprites/ exports a rig object
 * (see js/engine/renderRig.js for the format) authored in the in-game sprite editor
 * (backtick key) or by hand. Units/animals reference a rig by id via SPRITES[id].
 */
import critter from './critter.js';
import deer    from './deer.js';

const defs = [critter, deer];

export const SPRITES = Object.fromEntries(defs.map(d => [d.id, d]));

export default SPRITES;
