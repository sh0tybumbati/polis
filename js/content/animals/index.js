import deer  from './deer.js';
import sheep from './sheep.js';

const defs = [deer, sheep];

export const ANIMALS = Object.fromEntries(defs.map(d => [d.id, d]));
