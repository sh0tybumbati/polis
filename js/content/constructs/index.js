import agora from './agora.js';
import anvil from './anvil.js';
import archery_grounds from './archery_grounds.js';
import melee_grounds from './melee_grounds.js';
import bed from './bed.js';
import brewery from './brewery.js';
import butchersblock from './butchersblock.js';
import camp from './camp.js';
import chest from './chest.js';
import farm from './farm.js';
import door from './door.js';
import fence from './fence.js';
import fence_gate from './fence_gate.js';
import forge from './forge.js';
import garden from './garden.js';
import gate from './gate.js';
import grainsilo from './grainsilo.js';
import hearth from './hearth.js';
import house from './house.js';
import loom from './loom.js';
import marketstall from './marketstall.js';
import millstone from './millstone.js';
import mine from './mine.js';
import mounted_grounds from './mounted_grounds.js';
import olivepress from './olivepress.js';
import oracle from './oracle.js';
import oven from './oven.js';
import palisade from './palisade.js';
import pasture from './pasture.js';
import stable from './mounted_grounds.js'; // Alias if needed, but I'll use new name
import stonecutter from './stonecutter.js';
import storageshelf from './storageshelf.js';
import tanningrack from './tanningrack.js';
import tavernseat from './tavernseat.js';
import temple from './temple.js';
import townhall from './townhall.js';
import low_wall from './low_wall.js';
import wall from './wall.js';
import wall_edge from './wall_edge.js';
import watchtower from './watchtower.js';
import workbench from './workbench.js';

const defs = [
    agora, anvil, archery_grounds, melee_grounds, bed, butchersblock, camp, chest, door, farm, fence, fence_gate, forge, garden, gate, grainsilo, hearth, house, low_wall, loom, marketstall, millstone, mine, mounted_grounds, olivepress, oracle, oven, palisade, pasture, stonecutter, storageshelf, tanningrack, tavernseat, temple, townhall, wall, wall_edge, watchtower, workbench
];

export const CONSTRUCTS = Object.fromEntries(defs.map(d => [d.id, d]));

export const CONSTRUCT_CATS = {
    Civil:    ['camp', 'townhall', 'agora', 'temple', 'oracle', 'tavernseat'],
    Industry: ['pasture', 'mine', 'millstone', 'oven', 'forge', 'anvil', 'tanningrack', 'workbench', 'stonecutter', 'olivepress'],
    Military: ['melee_grounds', 'archery_grounds', 'mounted_grounds', 'watchtower', 'wall', 'palisade', 'gate', 'fence'],
    Furnish:  ['bed', 'chest', 'hearth', 'loom', 'millstone', 'workbench', 'anvil', 'forge', 'oven', 'tanningrack', 'butchersblock', 'storageshelf', 'marketstall', 'grainsilo']
};

export function computeBuildCost(type, material = 'Materials.Wood.Pine') {
    const def = CONSTRUCTS[type];
    if (!def) return {};
    if (!def.materialQty) return def.cost ?? {};
    const base = { ...(def.cost ?? {}) };
    base[material] = (base[material] ?? 0) + def.materialQty;
    return base;
}
