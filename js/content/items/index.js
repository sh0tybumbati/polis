import wheat       from './wheat.js';
import flour       from './flour.js';
import bread       from './bread.js';
import meat        from './meat.js';
import cuts        from './cuts.js';
import sausages    from './sausages.js';
import olives      from './olives.js';
import olive_oil   from './olive_oil.js';
import cloth_wool  from './cloth_wool.js';
import berries     from './berries.js';
import wood        from './wood.js';
import sticks      from './sticks.js';
import planks      from './planks.js';
import stone       from './stone.js';
import stones      from './stones.js';
import stoneBlocks from './stoneBlocks.js';
import ore         from './ore.js';
import ingot       from './ingot.js';
import wool        from './wool.js';
import hide        from './hide.js';
import leather     from './leather.js';
import leatherKit  from './leatherKit.js';
import bronzeKit   from './bronzeKit.js';

const defs = [
    wheat, flour, bread, meat, cuts, sausages, olives, olive_oil, berries,
    wood, sticks, planks, stone, stones, stoneBlocks, ore, ingot,
    wool, cloth_wool, hide, leather, leatherKit, bronzeKit,
];

export const ITEMS = Object.fromEntries(defs.map(d => [d.key, d]));

export const FOOD_KEYS = defs.filter(d => d.supertype === 'Food').map(d => d.key);
