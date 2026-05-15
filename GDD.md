# Epochs: The Dawn — Game Design Document (V27)

> A dynastic city-builder spanning the ancient world. Build a civilization from mudbrick huts to marble colonnades — as Sumerian lugal or Hellenic archon. Manage living families, forge localized economies, and shape your city through policy rather than direct command.

---

## Vision

**Epochs: The Dawn** is a **freeform dynastic city-builder** where the core unit of gameplay is the **family estate (É / Oikos)**. Players manage dynasties of named individuals who work, breed, inherit property, and die. The economy is built on **localized production chains** — buildings pull from and push to specific stockpile zones, not a global pool. The player governs as a **civic leader** — setting policy and incentives, not issuing individual orders.

The game supports **civilization selection**: players choose between the gritty Bronze Age survival of **Sumeria** or the classical civic management of **Ancient Greece**. Both share the same engine, mechanics, and content-driven entity system — civilization selection swaps the aesthetic layer, starting conditions, and building set, not the simulation underneath.

---

## Civilizations

At new game start, the player selects a civilization. This determines starting conditions, building vocabulary, visual theme, and military units. The core simulation — needs, genealogy, freeform building, barter economy — is identical across both.

### Sumeria (Bronze Age Survival)

| Aspect | Detail |
|---|---|
| **Aesthetic** | Mudbrick, reed, bitumen; ziggurat as civic center |
| **UI** | Clay-tablet tones, cuneiform accent glyphs |
| **Starting** | Lugal (ruler) + household in a reed camp; scarce water and grain |
| **Buildings** | Reed House, Clay Oven, Grain Store, Ziggurat, Irrigation Channel, Brewery |
| **Military** | Spearmen, axemen, chariots (late-game) |
| **Economy** | Barley/emmer grain, dates, bitumen, copper from trade |
| **Pressure** | Flood seasons, soil salinity, rival city-states |

### Ancient Greece (Classical Civic Management)

| Aspect | Detail |
|---|---|
| **Aesthetic** | Marble, terracotta, olive; stoa as civic center |
| **UI** | Greek-key border, `#c8a030` gold accents, serif typography |
| **Starting** | Archon + consort in a stone camp; coastal or inland site |
| **Buildings** | House, Agora, Stoa, Temple, Gymnasium, Olive Press |
| **Military** | Hoplite, Peltast, Toxotes, Cavalry |
| **Economy** | Wheat, olive oil, wine, wool, coinage via mint |
| **Pressure** | Enemy polis raids, migration pressure, civic unrest |

### Shared Engine

Both civilizations run on the same systems: freeform wall/furniture/zone building, needs (food/rest/social/joy), genealogy and inheritance, localized production chains, the Archon/Lugal policy lever model, and the content-driven entity architecture.

---

## Current Game Mode: Survival / Open World

The active game mode is an **open-ended survival city-builder** with no enemy faction. There are no waves, no conquest victory condition. The player builds and expands indefinitely on an infinite procedurally generated map. Combat and enemy AI remain designed (see Combat section) but are disabled in the current build.

---

## The World

### Chunk-Based Infinite Map

The world is unbounded. It generates in **16×16 tile chunks** on demand:

- Only the **3×3 chunks around spawn** generate synchronously at game start.
- All other chunks generate when a unit's vision circle first reaches them — not from camera panning.
- Adjacent chunks **pre-generate data** (for pathfinding lookahead) without rendering.
- Rendered chunks use a **RenderTexture** (baked GPU texture); re-baked only on tile mutation.
- Far chunks unload their RenderTexture to reclaim VRAM.

### Biomes

Chunks are assigned biomes by noise: heartland, scrubland, forest, badlands. Biome determines tile palette, node density, and which resource nodes spawn.

### River

A single river runs roughly east-west near spawn, with organic drift (value-noise per column) and deterministic ford crossing points seeded from world coordinates. Fords are traversable; river tiles are not.

### Fog of War

- `vis = 0`: undiscovered — full black fog.
- `vis = 1`: seen but not currently visible — dim overlay.
- `vis = 2`: currently in a unit's sight radius — terrain fully visible.

Enemy units only appear on tiles the player currently sees (`vis = 2`). Fog redraws every frame using two `Phaser.GameObjects.Blitter` pools (single draw call each).

### Minimap

Live tile-by-tile minimap pans with exploration. Discovered terrain is recorded; undiscovered tiles are black.

---

## The Estate (É / Oikos)

No prefab house or farm objects exist. All structures emerge organically:

1. **Walls** on tile edges define physical enclosure.
2. **Furniture / appliances** on tiles define function and job slots.
3. **Zones** painted on tiles define work type, storage, and ownership.

The **Camp** is the starting construct — a ready-made shelter before walls are built.

### Walls

Each tile has 4 edges (N/S/E/W). Each edge holds a `WallSegment`:

```
{ layers: [{ material, thickness }], hp, hpMax, buildProgress, height }
height: 'full' | 'low' | 'fence'
```

- **Full walls** enclose rooms (flood-fill room detection).
- **Low walls / fences** define pasture boundaries and restrict animal movement but do not enclose rooms.
- **Composite walls** support multiple material layers (e.g. stone foundation + wood frame).
- Walls decay slowly without maintenance; repair costs material + work.

Material properties (wall block in item defs):

| Material | hpMax | Build skill | Decay |
|---|---|---|---|
| Clay Daub | 40 | Building | Fast |
| Clay Brick | 200 | Masonry | Slow |
| Wood Pine | 80 | Carpentry | Medium |
| Stone Limestone | 300 | Masonry | None |

### Furniture & Appliances

Each tile holds one furniture item (`itemId`, `state`). Furniture defines job slots and room classification.

| Appliance | Job slot |
|---|---|
| Loom | Weaving (wool → cloth) |
| Oven | Baking (flour → bread) |
| Tanning Rack | Tanning (hide → leather) |
| Millstone | Milling (wheat → flour) |
| Workbench | Carpentry (logs → planks) |
| Forge / Anvil | Smithing (ore → ingots → kits) |
| Hearth | Rest quality bonus |
| Bed | Sleeping slot (rest need recovery) |

### Doors & Gates

Doors are **furniture placed in a wall gap** (an edge with no WallSegment). Must be crafted at a workshop. Units path through open doors. Gates = large doors for palisade and pen entrances.

### Room Auto-Detection

When walls fully enclose a space, a flood-fill classifies the room by furniture contents:

| Furniture present | Auto-classified as |
|---|---|
| Bed(s) + Hearth | Living |
| Loom(s) | Weaving |
| Forge | Smithing |
| Oven + Millstone | Baking |
| Workbench | Carpentry |
| Ambiguous | Player prompted |

Player can override at any time.

### Zone Layers

Each tile carries 4 independent zone values (layers do not block each other):

| Layer | Values |
|---|---|
| `ownership` | oikosId \| `'civic'` \| null |
| `work` | zoneId \| null |
| `storage` | zoneId (typed: Food/Materials/Goods/Any) \| null |
| `civ` | *(future)* polisId \| null |

Work zones must be fully enclosed (walls complete, `buildProgress ≥ 1`) to activate. Storage zones require no enclosure — outdoor lumber stacks and grain yards are valid.

### Domain Plot

Each Oikos auto-claims tiles where its walls and furniture are placed. Workers prefer jobs in their Oikos tiles but will work public zones when idle. Domain enforcement (preventing other families from building inside a claimed plot) is a future milestone.

### Grow Zones

Fields are painted as Grow Zones (zone layer), not placed as farm buildings. The player clicks a connected zone to assign a crop. Farmers plant and harvest the per-slot crop progression autonomously.

---

## Genealogy & Genetics

Every villager is a persistent named individual.

### Core Attributes (1–10)

| Attribute | Primary effect |
|---|---|
| **Strength** | Carry capacity bonus |
| **Dexterity** | Craft speed, ranged accuracy |
| **Constitution** | Base HP pool |
| **Intelligence** | Skill XP gain rate |
| **Agility** | Movement speed |
| **Willpower** | Morale, routing resistance, passion stamina |

Attributes improve through use; they atrophy during prolonged idleness.

### Skills (1–10)

*Spear, Sword, Bow, Bake, Butcher, Mill, Tan, Smelt, Forge, Animal Trap, Farming, Woodcutting, Mining, Masonry.*

Skill gain is modified by the unit's **Aptitude**:

| Aptitude | XP rate | Other |
|---|---|---|
| No Interest | ×1.0 | — |
| Interested | ×1.5 | Reduced Willpower decay |
| Burning Passion | ×2.5 | Willpower may regenerate while working |

Each unit is born with 1 Burning Passion and 2 Interested skills (random, inheritable tendency).

### Vocation

At adulthood, attributes and passions combine to assign a **Vocation** (a calling or natural role). Vocation provides loyalty and stability bonuses in job scoring — it nudges the AI toward fitting work without forcing it.

### Phenotype Blending

Physical traits inherit via midpoint math with a mutation jitter:

```
child_value = (parent1_value + parent2_value) / 2  ±  mutation
```

Traits: skin tone (hex), eye color, hair color, height scale.

**Rare traits (<1% chance):** Albinism, Gigantism/Dwarfism, Twin birth, Prodigy (+3 to one skill with Burning Passion).

### Succession & Inheritance

On death:
1. Eldest living child inherits the Oikos (home + appliances).
2. If no children: nearest sibling (same `fatherId` or `motherId`).
3. If no kin alive: estate reverts to **Public** (Archon-controlled).

---

## The Archon (Player Role)

The player is the **Archon** — the elected chief magistrate. The Archon:

- Lives in a **normal Oikos** adjacent to the Townhall (not inside it). Has a spouse (Consort) and household workers.
- Is a **named, persistent unit** with `isArchon: true`, drawn with a gold crown.
- Spawns with +2 all attributes and Masonry skill 3.
- **Dies like anyone else** — succession fires automatically.

### Townhall

The Townhall is **purely civic** — no storage, no residents. It is the center for:
- Policy configuration (tithe rate, labor levies)
- Population statistics
- Migration petition review

### Succession

On Archon death:
1. Heir keeps their own home; inherits Archon's house only if they had none.
2. Priority: eldest adult child → housemates → any adult.
3. *(Planned)* Player chooses successor via UI when Archon dies rather than auto-assignment.

### Policy Levers

| Tool | Location | Effect |
|---|---|---|
| **Firstfruits** | Automatic | 1 unit of each resource skimmed to commons on every private deposit |
| **Harvest Tithe** | Townhall panel | 0–40% (step 5%) skimmed from all private inventories at dawn |
| **Hiring** | Building panel | Toggle a building public/private; public buildings pay state wages |
| **Corvée Labor** | *(future)* Townhall | Each adult owes N public workdays per season |
| **Migration Petitions** | Border events | Accept families (City Planner plots housing) or reject (reputation penalty) |

### Limits of Authority

The Archon cannot directly command individual citizens. Workers choose roles via a job-scoring system; families manage their own Oikos. The gap between the Archon's intent and the city's emergent behavior is the central tension of the game.

---

## Needs System

Every adult villager has four needs (0–1 each):

| Need | Decays when | Recovers when |
|---|---|---|
| **Food** | Awake | Eating |
| **Rest** | Awake | Sleeping at home |
| **Social** | Isolated | Near other awake adults |
| **Joy** | Working | Idle / sleeping |

`u.mood` = weighted average: `food×0.35 + rest×0.30 + social×0.20 + joy×0.15`.

### Day Plan Queue

Every 3 seconds, `_rebuildDayPlan(u)` scores 5 intents and sets `u.currentIntent`:

| Intent | Priority | Trigger |
|---|---|---|
| eat | 20–100 | food < 0.7 (beats work when food < 0.875) |
| sleep | 15–90 | rest < 0.6 (beats work when rest < 0.8) |
| work | 30 | always |
| socialize | max 25 | social < 0.7 (never beats work alone) |
| leisure | max 18 | joy < 0.7 (placeholder; joy recovers passively) |

Night/day is a **pressure**, not a rule. Most villagers sleep at night because rest decays while awake and recovers at home — emergent scheduling, not scripted phases.

### Planned Needs Extensions

- **Mood effects**: speed multiplier on work output; mental break at low mood threshold.
- **Buildings for needs**: tavern/agora for joy + social recovery; better beds for faster rest recovery.

---

## Economy: Barter → Coinage

### Relative Utility Barter

Trade value is dynamic:

```
trade_value = base_price × (1 + 1 / current_stock)
```

A family with 0 meat values it far more than one with 50. Natural supply-and-demand without a player-managed price screen.

**Kinship Gifting:** Families with high social affinity may gift surplus goods, creating social debts rather than formal exchange records.

### Commercial Tiers

| Tier | Building | Mechanic |
|---|---|---|
| 1 | Home Stall (1×1 porch) | Neighbourhood bartering; surplus threshold set by owner |
| 2 | Market Square (2×1 slots) | Families rent stalls; Merchant Porter sub-task moves goods home → market |
| 3 | Mint | Indexes barter ratios into fixed **Copper Coinage**; unlocks Bronze Age |

---

## Item Taxonomy

All items use a 4-level key: `Supertype.Type.Subtype.Form`.

- **Supertype** — storage cap bucket: `Food`, `Materials`, `Textile`, `Equipment`
- **Type** — broad category: `Grain`, `Meat`, `Wood`, `Stone`, `Metal`, `Fiber`, `Hide`
- **Subtype** — specific material: `Wheat`, `Venison`, `Mutton`, `Pine`, `Limestone`, `Copper`, `Wool`, `Deer`
- **Form** — processing stage: omitted for raw; `Flour`, `Bread`, `Cuts`, `Sausages`, `Plank`, `Block`, `Ingot`, `Kit`, `Leather`, `LeatherKit`

### Production Chains

| Chain | Steps |
|---|---|
| Grain | Wheat (raw) → Flour → Bread |
| Meat | Venison/Mutton (raw) → Cuts → Sausages |
| Wood | Pine Log (raw) → Plank |
| Stone | Limestone Chunk (raw) → Block |
| Metal | Copper Ore → Ingot → Kit |
| Hide | Deer/Sheep Hide (raw) → Leather → LeatherKit |

Storage caps tracked at Supertype level. UI groups by Supertype, expandable to full breakdown.

---

## Logistics & Production

### Localized Production (Building-to-Building)

Units do **not** pull from a global resource pool:
- Each building has an `inputBasket` and `outputRack`.
- Units query their *assigned workplace's* basket; if empty, query the nearest assigned **Stockpile Zone UID**.
- **Strict Localism**: units sleep only at `home_id` and deliver only to assigned stockpile zones.

### Cellular Production Team

Multi-worker buildings automatically divide roles:

| Role | Behaviour |
|---|---|
| **Procurer** | Fetches raw materials from stockpile zone into the input basket |
| **Processor** | Bench-locked; highest-skill unit; only works the craft |
| **Porter** | Moves finished goods from output rack to assigned stockpile zone |

Solo building: one worker rotates through all three roles (slower output).

### Heavy Logistics

| Tool | Capacity | Constraint |
|---|---|---|
| Leather Backpack | ×2 carry | Requires Leatherworks |
| Wooden Cart | ×8 carry | Full speed on roads; ×0.5 on rough terrain |

---

## Environment & Resource Nodes

### Resource Physicality

Logs, sticks, and stones are **individual map entities**, not abstract counters. Land must be physically cleared before a foundation is laid; cleared material is consumed by the build or moved to a stockpile zone.

### Asymptotic Growth

```
growth_next = current + (rate / current)
```

Growth slows as entities age but never stops. Yield = `floor(growth_variable)`.

### Two-Stage Tree Harvest

1. **Fell** — worker chops tree; logs scatter as floor entities.
2. **Gather** — worker collects logs.
3. **Sapling** — stump grows a sapling; matures over several days.

### Scrub & Bush Regrowth

- Berry bushes enter a **dormant state** when depleted (not removed); regrow after ~2 days; spread to adjacent tiles (capped at 30).
- Scrub spreads to adjacent tiles; grazing depletes it; scarcity soft-caps animal population (capped at 50).

### Resource Node Respawn Timers (days)

| Node | Respawn |
|---|---|
| Berry Bush | 3 |
| Wild Garden | 4 |
| Olive Grove | 5 |
| Small Tree | 6 |
| Ore Vein | 25 |
| Large Tree | Permanent depletion |
| Large Boulder | Permanent depletion |

### Natural Seeding

- Trees: 12% chance per dawn to seed a sapling on an adjacent forest/grass tile (cap 60).
- Berry Bushes: 10% chance per dawn if bush >50% stock (cap 30).

---

## Wildlife

### Deer & Wild Sheep

- Spawn from map edges in small groups every ~90 seconds (not pre-spawned at world start).
- Forage scrub nodes when hungry; two consecutive unfed days causes death.
- Hungry deer render faded brown; hungry sheep render semi-transparent.

### Pasture (Shepherd System)

- Shepherds tame wild animals into **pastures** (defined by fence enclosure + gate furniture).
- Pasture tracks males, females, lambs separately.
- Dawn breeding: ≥1 fed male + ≥1 fed female → 40% chance per female; lambs mature in 2 days.
- Surplus males culled before females to preserve breeding pairs.
- Shepherds balance herd across multiple pastures (transfer one adult from overcrowded to underpopulated).

---

## The City Planner

A builder unit reaching **Masonry or Carpentry skill 8** is promoted to City Planner (unique named unit):

- Autonomously plans roads and building districts within explored territory.
- **Auto-zones**: separates Industrial (Forge, Mine) from Residential (Homes, Bakery).
- Respects each family's Oikos domain buffer.
- **Relocation**: lays new foundation → deconstructs old → hauls materials → builds. Costs ×0.75 work, ~12% material loss.
- Plots housing for accepted migration families.

---

## Migration

Random families appear at map edges every N days. The Archon **Accepts** or **Rejects**:
- **Accept** → City Planner immediately ghosts a new residential plot in available domain space.
- **Reject** → family moves on; rejection builds a mild reputation penalty.

---

## Combat & Defense

*(Designed; currently disabled in Survival mode.)*

Combat is a **consequence of prosperity** — enemies send what they have actually trained and fed. Starvation weakens waves organically.

### Formations

| Formation | Shape | Strength | Weakness |
|---|---|---|---|
| Phalanx | Vertical line | High frontal HP | Weak flanks |
| Wedge | V-shape | Punches through center | Vulnerable if flanked |
| Screen | Wide sparse | Covers flanks, harasses | Low HP |

### Counter Triangle

Cavalry → Archers → Spearmen → Cavalry

### Unit Progression

Levy (Clubman / Slinger) → Mid (Spearman / Archer / Cavalry) → Elite (Hoplite / Toxotes / Peltast)

Upgrades require material chains: LeatherKit → Peltast; Bronze Kit → Hoplite / Toxotes.

### Enemy Polis

The enemy runs a full mirror economy simulation:
- Workers gather stone, wood, and food from shared world nodes.
- Separate resource pool (`enemyRes`) with starvation killing units at dawn.
- Each dawn: evaluates resources and queues building construction (farm → barracks → archery → house priority).
- Military production: barracks and archery ranges train from `enemyRes.food`.
- Soldiers patrol the village by day, march to attack at night, drift back at dawn.

---

## Visual Direction

- **Style**: Top-down, 32×32px tiles. Dual aesthetic driven by active civilization.
- **Sumerian palette**: Raw clay ochre, bitumen black, river-reed green, lapis lazuli accent.
- **Greek palette**: Sandstone yellows, Aegean blues, olive greens; `#c8a030` gold UI accents.
- **UI**: Dark panel, resolution-agnostic anchoring, contextual sidebars. Border style and typography swap per civ (cuneiform glyphs vs Greek-key).
- **Rendering**: Shape-based sprite system (`renderShapes.js`). Declarative `SHAPES` data per entity, LOD tiers 0–3 (minimap square → silhouette → full detail → zoomed flourishes). All unit bodies drawn in one shared `unitsGfx` Graphics batch per frame.
- **In-game sprite editor**: backtick key opens shape editor.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Rendering | Phaser 3.87 (CDN, no build step) |
| Game logic | Vanilla JS ES Modules, Manager pattern |
| State | Scene-owned arrays (`units`, `buildings`, `resNodes`) |
| Save/load | localStorage, v6 (older saves rejected) |
| Multiplayer (future) | Colyseus (Node.js) + @colyseus/schema |

### Architecture Direction: Content-Driven Entity System

Every entity type (building, unit, job, item, animal, node) will live in its own file under `/js/content/`. Engine managers become thin dispatchers. Enables drag-and-drop modding.

Key patterns:
- Each file exports a definition object with `id`, `label`, `draw(gfx, entity, lod)`, and optional `tick`, `actions`, `score`, `seek`, `recipe`.
- `draw()` receives `lod` (0–3); LOD logic lives in the entity file.
- Definition is never serialized; instances store only runtime state + `type` string to re-link.
- `ctx` facade (not raw scene) passed into all definition functions — keeps definitions testable.

Refactor phases (each independently shippable):
1. Buildings → `/js/content/buildings/`
2. Nodes → `/js/content/nodes/`
3. Animals → `/js/content/animals/`
4. Items + resource pool (4-level taxonomy, supertype storage caps)
5. Jobs → `/js/content/jobs/`
6. Units → `/js/content/units/` *(done for rendering; logic still inline)*
