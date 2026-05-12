import agora from './agora.js';
import anvil from './anvil.js';
import archery from './archery.js';
import bakery from './bakery.js';
import barracks from './barracks.js';
import bed from './bed.js';
import blacksmith from './blacksmith.js';
import brewery from './brewery.js';
import butcher from './butcher.js';
import butchersblock from './butchersblock.js';
import camp from './camp.js';
import carpenter from './carpenter.js';
import chest from './chest.js';
import farm from './farm.js';
import fence from './fence.js';
import forge from './forge.js';
import garden from './garden.js';
import gate from './gate.js';
import grainsilo from './grainsilo.js';
import granary from './granary.js';
import hearth from './hearth.js';
import house from './house.js';
import loom from './loom.js';
import marketstall from './marketstall.js';
import masons from './masons.js';
import mill from './mill.js';
import millstone from './millstone.js';
import mine from './mine.js';
import olive_press from './olive_press.js';
import olivepress from './olivepress.js';
import oracle from './oracle.js';
import oven from './oven.js';
import palisade from './palisade.js';
import pasture from './pasture.js';
import smelter from './smelter.js';
import stable from './stable.js';
import stonecutter from './stonecutter.js';
import stonepile from './stonepile.js';
import storageshelf from './storageshelf.js';
import tannery from './tannery.js';
import tanningrack from './tanningrack.js';
import tavernseat from './tavernseat.js';
import temple from './temple.js';
import townhall from './townhall.js';
import wall from './wall.js';
import wall_edge from './wall_edge.js';
import warehouse from './warehouse.js';
import watchtower from './watchtower.js';
import woodshed from './woodshed.js';
import workbench from './workbench.js';

const defs = [
    agora, anvil, archery, bakery, barracks, bed, blacksmith, brewery, butcher, butchersblock, camp, carpenter, chest, farm, fence, forge, garden, gate, grainsilo, granary, hearth, house, loom, marketstall, masons, mill, millstone, mine, olive_press, olivepress, oracle, oven, palisade, pasture, smelter, stable, stonecutter, stonepile, storageshelf, tannery, tanningrack, tavernseat, temple, townhall, wall, wall_edge, warehouse, watchtower, woodshed, workbench
];

export const CONSTRUCTS = Object.fromEntries(defs.map(d => [d.id, d]));

export const CONSTRUCT_CATS = {
    Civil:    ['house', 'townhall', 'agora', 'temple', 'oracle', 'tavernseat'],
    Industry: ['farm', 'pasture', 'mine', 'woodshed', 'mill', 'bakery', 'blacksmith', 'smelter', 'tannery', 'carpenter', 'masons', 'stonecutter'],
    Military: ['barracks', 'archery', 'stable', 'watchtower', 'wall', 'palisade', 'gate', 'fence'],
    Furnish:  ['bed', 'chest', 'hearth', 'loom', 'millstone', 'workbench', 'anvil', 'forge', 'oven', 'tanningrack', 'butchersblock', 'storageshelf', 'marketstall', 'camp']
};

export function computeBuildCost(type, material = 'Materials.Wood.Pine') {
    const def = CONSTRUCTS[type];
    if (!def) return {};
    if (!def.materialQty) return def.cost ?? {};
    const base = { ...(def.cost ?? {}) };
    base[material] = (base[material] ?? 0) + def.materialQty;
    return base;
}

