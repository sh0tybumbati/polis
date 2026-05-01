import worker    from './worker.js';
import archer    from './archer.js';
import spearman  from './spearman.js';
import cavalry   from './cavalry.js';
import clubman   from './clubman.js';
import slinger   from './slinger.js';
import peltast   from './peltast.js';
import hoplite   from './hoplite.js';
import toxotes   from './toxotes.js';
import scout     from './scout.js';
import berserker from './berserker.js';

const defs = [worker, archer, spearman, cavalry, clubman, slinger, peltast, hoplite, toxotes, scout, berserker];

export const UNITS = Object.fromEntries(defs.map(d => [d.id, d]));
