# Polis — Development Roadmap

## Milestone 0 — Skeleton (DONE)
- [x] Project structure (`index.html`, `js/`, `css/`, `server/`)
- [x] Phaser 3 via CDN, no build step
- [x] BootScene → MenuScene → GameScene flow
- [x] GDD written
- [x] Colyseus server skeleton

---

## Milestone 1 — Playable MVP (DONE)

### Map & World
- [x] Procedural tile map (grass/sand/rock, 25×18)
- [x] Tile hover highlight during building placement (ghost preview)

### Economy & Buildings
- [x] Resources: food, stone, wood
- [x] Farm, Barracks, Wall, Granary, Woodshed, Stone Pile, Archery Range, House
- [x] Building placement with ghost preview + auto-cancel after place
- [x] Cost deduction; resource carry-back system (workers physically haul to storeroom)
- [x] Demolish / cancel construction with resource recoup
- [x] Floor pile system — resources dropped on ground, workers collect later

### Units
- [x] Hoplite, Archer (player); Raider, Berserker, Veteran (enemy)
- [x] Worker with age stages: child (day 1) → youth (day 2) → adult (day 3+)
- [x] Building-specific worker cap; respawn queue per building
- [x] HP bar above unit; death fade-out

### Population & Upkeep
- [x] Houses hold 4, Townhall holds 6
- [x] Spawn requires 2 adults; lonely houses attract surplus adults over time
- [x] Food upkeep: 3 food/unit/day; starvation kills random units

### Combat
- [x] Auto-attack nearest enemy in range; 1s cooldown
- [x] Enemy waves at night (Day 10+); survive WIN_NIGHTS to win
- [x] Wave composition varies per night

### Formation System
- [x] Click/tap select, shift+click multiselect, box drag select
- [x] Formation presets: LINE (phalanx), WEDGE, SCREEN
- [x] A = select all, F = default formation, ESC = cancel/deselect

### UI
- [x] Resource display, day counter, phase pill, timer bar
- [x] Building info panel (tap with no selection): name, status, Cancel/Demolish button
- [x] Pinch-to-zoom, two-finger pan
- [x] 44px touch-friendly buttons

---

## Milestone 2 — World Depth  ← CURRENT

### Map Size
- [x] **Vast world** — fixed portrait world of 80×128 tiles; camera is a window into it, not a frame around it
- [x] Starting viewport shows only the player's heartland at the bottom; the rest must be explored north
- [x] Map scroll bounds enforced; camera clamps to world edges
- [x] Player polis spawns at bottom-centre; enemy polis at top-centre; four biome bands run south-to-north

### Minimap
- [x] Small fixed overlay (bottom-right corner, ~160×90px) showing the full world at a glance
- [x] Renders: terrain color, fog state (dark = unexplored, dim = seen, lit = current-vision), friendly units (blue dots), enemy units (red dots, only within currently-lit tiles), buildings (colored squares)
- [x] Click/tap on minimap pans main camera to that location
- [x] Minimap respects fog — enemy village region is black until a unit physically reaches it

### Terrain & Biomes
- [x] **Biome system** — four organic zones (heartland, scrubland, forest, badlands) with multi-octave noise borders: primary sweep ±13 tiles, peninsula-scale ±7 tiles, fine roughness ±3 tiles; tile types bleed across boundaries ~30% of the time for soft organic edges
- [x] Resource nodes cluster within appropriate biomes
- [x] **Tile movement modifiers** — movement speed multiplied per tile type (grass ×1.0, sand ×0.75, rock ×0.6, forest ×0.65, road ×1.45, desire path ×1.15); applied per-tick in `moveToward()` via `_tileSpd()`
- [x] **River** — one organic river running roughly east-west (horizontal) through mid-map; 3 ford crossing points; creates a natural strategic chokepoint between player and enemy territory

### Roads & Desire Paths
- [x] **`trafficMap[y][x]`** — incremented each time a unit steps on a tile; decays each day
- [x] **Desire paths** emerge automatically: traffic > 120 → worn-path visual + ×1.15 speed; drop back to bare if traffic decays below threshold
- [x] **Buildable paved roads** — costs 1 stone; ×1.45 speed; distinct visual; drag-paintable in road tool mode
- [x] Road tool in build toolbar; works on any non-building, non-water tile

### Fog of War
- [x] **No starting vision** — entire map begins black; player starts blind even in the heartland
- [x] Each unit projects a vision radius updated every tick: workers 3 tiles (dim to 6), soldiers 5 tiles (dim to 10)
- [x] Three vision states per tile:
  - **Black** (never seen) — terrain, units, buildings completely hidden
  - **Dimmed** (seen but not currently lit) — terrain and *player* buildings visible; enemy units/buildings not updated
  - **Lit** (currently in a unit's radius) — everything visible
- [x] `visMap[y][x]` stores state (0/1/2); recomputed each frame from all living friendly units
- [x] Fog rendered as a dark overlay (depth 8) on the world camera; minimap mirrors fog state
- [x] Player buildings grant a large (radius 10) permanent lit circle while built
- [x] Watch Tower (Milestone 3) adds a large static lit radius even with no units nearby

### Enemy Village (Mirror Sim — groundwork only)
- [x] Enemy polis pre-placed in Badlands during world gen (buildings exist, visible once fog cleared)
- [x] Enemy workers active from day 1 with full economy sim (gather resources, eat, respawn)
- [x] Enemy village buildings act as HP pools; destroying them degrades enemy production
- [x] Full mirror economy simulation (pulled forward from MS3)

### Gender System

Gender is a single field (`gender: 'male' | 'female'`) assigned at spawn (50/50 random) that threads through people, soldiers, workers, wild animals, and pastured sheep alike. It affects reproduction and housing logic but never combat stats.

#### People & Workers
- [x] All workers and soldiers get a `gender` field at spawn (50/50 random); starting pair is hardcoded male + female
- [x] **House pairing** — a house can only spawn a new child if at least one adult male and one adult female resident are present; attraction logic only moves the missing gender from surplus buildings
- [x] Gender shown as a tiny dot (blue = male, rose = female) just to the right of the HP bar on all units

#### Pastured Sheep
- [x] Each tamed sheep in a pasture gets a `gender` field (`b.males` / `b.females` counts)
- [x] **Pastures work like houses** — shepherd prefers to tame the missing sex when seeding; tamed adults enter at their wild gender
- [x] **Pasture breeding** — once per day at dawn, each female in a fed pen with ≥1 male has a 40% chance to produce a lamb; lambs mature in 2 days with random gender
- [x] **Shepherd feeds at dawn** — shepherd's first task is to carry food (1 per sheep) to each unfed pasture; pens that weren't fed cannot breed
- [x] Both sexes produce wool and meat
- [x] **Shepherd priority order**: (1) feed pens → (2) transfer from full pen to underpopulated pen → (3) shear wild sheep → (4) tame wild → (5) slaughter surplus
- [x] Shepherd culls extra males first, preserving at least one per pen
- [x] **Hungry-day death** — two consecutive unfed days kills a pasture sheep (grace rule parity with people)

#### Wild Animals
- [x] All wild deer and sheep get a `gender` field at spawn/edge-entry
- [x] Male deer are scale 1.1, have antlers drawn, and flee radius –0.5 tiles vs females; both yield the same meat
- [x] Wild sheep have a subtle gender dot on the head (blue/rose)
- [x] Mating check at dawn: a female within 5 tiles of a male of the same species, both having eaten today → 40% chance of offspring

### Living Ecosystem

#### Scrub Vegetation
- [x] **Scrub nodes** — sparse olive-green shrub clusters in heartland/scrubland; animal-only forage (`resource: null`), 35 placed at world-gen
- [x] **Slow spread** — 15% chance per day to seed adjacent tile; new scrubs start dormant (1 day); capped at 50 nodes
- [x] **Grazing depletes scrub** — animals decrement `stock` on arrival; at 0 the node enters a 3-day dormant (bare dirt) state before regrowing
- [x] Scrubs drawn as small olive-green clusters; depleted scrubs shown as bare dirt patch

#### Berry Bush Spread & Regrowth
- [x] **Berry bushes never disappear** — when stock hits 0 the bush enters a dormant state (bare visual, cannot be harvested); stock replenishes fully after ~2 days, then it can be harvested again
- [x] **Bushes spread** — each day transition, each bush at > 50% stock has a ~10% chance to seed a new bush on a random adjacent grass or scrubland tile (not rock, water, sand, building, or existing node)
- [x] New bush starts dormant (0 stock) and takes ~2 days to reach full stock before it becomes harvestable
- [x] Global cap: ~30 berry bushes on the map at once; spread halts if cap is reached

#### Tree Growth & Saplings
- [x] **Saplings** — when a tree node is fully harvested (stock reaches 0) it is not removed; instead it becomes a sapling with a multi-day regrowth timer (small_tree: 3 days, large_tree: 5 days)
- [x] Sapling is drawn as a tiny green dot; it cannot be harvested; after the timer it restores to full stock and normal appearance
- [x] **Natural seeding** — each day transition, every tree (not sapling) has a ~12% chance to drop a sapling on a random adjacent forest or grass tile (not water, rock, sand, building, or existing node); the sapling matures normally
- [x] Seeding is capped: no more than one new sapling per tree per day; global tree node cap ~60 to prevent runaway forestation

#### Wildlife Foraging
- [x] **Deer and sheep must eat 3 scrub portions per day** — tracked via `ateToday` counter reset at each dawn
- [x] If an animal ends the day having eaten < 3: it becomes **hungry** (faded tint); two consecutive hungry days = death
- [x] Animals actively path toward the nearest scrub node when hungry; scrub is animal-only forage (workers cannot harvest it)
- [x] Scrub scarcity naturally soft-caps animal population — no hard cap needed

#### Wildlife Reproduction & Edge Entry
- [x] **No pre-spawned populations** — animals enter from N/E/W map edges every ~90s (1–2 deer or 1 sheep) while below cap
- [x] Edge entry: spawns at N row 8, or random y on E/W edges in the middle 60% of map height; gender assigned on entry
- [x] **Mating / reproduction** — male+female pair in proximity → offspring after time; not yet implemented
- [x] Population self-regulates through scrub availability; overpopulation collapses when scrubs are stripped
- [x] Tamed pasture sheep use the gender-based pasture breeding + shepherd feeding system above; the old `SHEEP_WOOL_MS` fixed timer is replaced entirely

---

## Milestone 3 — Combat Depth & Living World

### Enemy Village — Full Mirror Simulation
- [x] Enemy polis runs the same economic tick loop as the player: workers gather, population grows, food upkeep applies, buildings are placed by an AI build-order
- [x] **AI build order** — enemy follows a loose priority sequence (farm → barracks → archery → house) based on resource thresholds, same rules as player economy
- [x] Wave composition is no longer scripted — it reflects what the enemy has actually trained; starvation or raiding can weaken or delay waves organically
- [x] Enemy workers and soldiers pathfind and behave using the same unit system; enemy soldiers patrol during day and march south at night
- [x] Enemy village rebuilds destroyed structures using its own workers and resources
- [x] Player can observe enemy activity once fog is cleared in that region
- [x] **Enemy scout** appears ~20s before each night; killing it reveals full wave composition as a UI flash
- [x] **Player scouting** — train fast Kataskopos (scouts) at the Townhall to explore and reveal map
- [x] **Proactive Workers** — idle workers intelligently seek roles based on current resource shortages

### Economy Depth — Food Chains & Daily Life

#### Time of Day & Meals
- [x] **Three meals per day** — `consumeFood()` fires at 25%, 50%, 75% of DAY timer; each meal consumes 1 food per living unit (replaces old single 3× dawn deduction); starvation now deals 1 HP (not instant kill) per missed meal
- [ ] Villager work schedule tied to meal times — MS4+
- [ ] Portable rations for scouts — MS4

#### Food Chain Buildings (first pass — passive auto-processing)
- [x] **Mill** — 2 wheat → 3 flour every 10s (auto); stores wheat (40) + flour (30)
- [x] **Bakery** — 2 flour → 3 food every 12s (auto); shows float "🍞 bread" per batch
- [x] **Butcher** — 1 meat → 3 food every 8s (auto); shows float "🥩 cuts" per batch
- [x] **Wheat from farms** — farms also produce bonus wheat at dawn (~15% of food yield); wheat chains into mill only if mill is built (no storage = silently capped at 0)
- [x] **Hunting → meat chain** — deer carcasses yield `meat` resource; hunters deposit at butcher for 3× food value, or directly as 1:1 food if no butcher exists; sheep slaughter still gives direct food
- [x] **Resources** — `wheat`, `flour`, `meat` added to resource pool, storageMax, carrying, and topbar UI

#### Future Food Chain (MS4+)
- [x] Kepos (garden) — auto-produces food from seeds; seeds harvested from discovered wild gardens
- [x] **Specialized Crop Types** — Kepos plots can cycle between Lentils (food), Garlic (HP regen), and Onions (worker speed)
- [x] Elaiotriveion (olive press) — 2 olives → 3 food; olives harvested from discovered olive groves (mid-map)
- [ ] **Distinct crop types for Kepos** — wild gardens yield specific seeds (lentils, garlic, onions, etc.); each Kepos plot grows one crop type with different bonuses (e.g. lentils = steady food, garlic = soldier HP regen, onions = worker speed)
- [ ] Cookhouse: bread + sausage → portable rations for scouts
- [ ] Tiered food taxonomy with worker-slot shop model (customers visit shops)
- [ ] Foodhaus fallback building with workstation bottleneck
- [ ] Unlock gates per building
- [ ] Enemy AI builds food chain buildings (Mylos, Artopoion, Makellon)

#### Military Production — Unit Tiers & Material Chains

**Unit roster (three tiers):**

| Tier | Unit | Source | Requires |
|---|---|---|---|
| Levy | Clubman | Barracks | nothing |
| Levy | Slinger | Archery | nothing |
| Mid | Spearman | Barracks | food |
| Mid | Archer | Archery | food |
| Mid | Cavalry | Stable | food |
| Mid | Peltast | field upgrade | leather kit |
| Elite | Hoplite | field upgrade | leather + bronze kit |
| Elite | Toxotes | field upgrade | leather + bronze kit |

**Leather chain** (hunt → tan → equip):
- [x] Deer carcasses drop **hide** alongside meat; hunters haul hide to tannery storage
- [x] **Tannery**: 3 hide → 1 leather (8s); 4 leather → 1 leather kit (12s)
- [x] At dawn: Clubmen/Slingers with a kit upgrade to **Peltast**

**Bronze chain** (mine → smelt → forge → equip):
- [x] **Ore veins** in badlands/scrubland at world-gen
- [x] **Mine** building: workers haul ore
- [x] **Smelter**: 2 ore → 1 ingot (10s)
- [x] **Blacksmith**: 1 ingot + 1 leather → 1 bronze kit (15s)
- [x] At dawn: Peltasts/Spearmen/Archers with a bronze kit upgrade to **Hoplite** / **Toxotes**

**Unlock gates:**
| Building | Unlocks after |
|---|---|
| Tannery | 3 hides ever collected |
| Mine | Stone Pile built |
| Smelter | Mine has produced 5 ore |
| Blacksmith | Smelter has produced 3 ingots AND Tannery has produced 5 leather |

#### Material Chains *(future milestones)*
- **Wood**: Logs → Sawmill (1 log → 3 planks) → Carpenter (planks → furniture, tools, components)
- **Stone**: Raw stone → Stonemason (1 stone → 2 blocks) → Builder's Yard (blocks → fortifications, paved areas)

### Counter-Unit Triangle
- [x] **Cavalry** — fast (×1.6 speed), high damage vs archers, weak to spearmen (hoplites get +50% atk vs cavalry)
- [x] **Spearman** (renamed/upgraded Hoplite variant) — bonus vs cavalry, average vs everything else
- [x] Rock-paper-scissors clearly communicated in UI (unit tooltip shows strengths/weaknesses)

### Unit Experience
- [x] Units surviving 2+ nights gain *Veteran* status: +1 HP, +10% speed, gold shield icon
- [x] Veteran units are irreplaceable (no respawn queue when they die); loss feels meaningful
- [x] Optional: named veteran units (procedural Greek names)

### Morale & Routing
- [x] Units below 25% HP attempt to flee toward home building
- [x] Flanked units (enemies attacking from 2+ sides simultaneously) get –20% attack
- [ ] Units near a Hero unit (see below) are immune to routing
- [x] Rout creates a cascade: fleeing units trigger nearby units to check morale

### Defensive Structures
- [x] **Watch Tower** — costs stone+wood; auto-fires arrows at range 5 tiles; reveals fog in radius 6
- [x] **Wall Gate** — placed in a wall segment; manually open/close; seals automatically at nightfall
- [x] **Palisade** (cheap wooden wall) — cheaper than stone wall, burns if fire mechanic added later

### GUI & User Interface
- [x] **Major GUI Rework** — bottom-docked control panel separating game world from UI
- [x] **Centered Minimap** — embedded in the control panel for centralized navigation
- [x] **Context-Aware Sidebars** — dynamically shifting buttons based on selection (Workers vs. Soldiers vs. Buildings)
- [x] **Mobile-Friendly Optimization** — compact tabs and grid-based building menu for small screens
- [x] **Special Actions** — "RECALL" for workers, "DISMISS" for non-veteran soldiers

### Terrain Advantages (combat)
- [x] Forest tiles: archers in forest get cover (–20% incoming ranged damage)
- [x] High-ground tiles: archers gain +8 range when stationary
- [x] River fords: only passable at designated ford tiles; creates natural chokepoints

---

## Milestone 4 — Dynastic Layer (Phase 1: Genealogy Foundation)

Every unit becomes a persistent individual with biological heritage. This is the highest-priority architectural shift toward the Oikos-first vision.

### Unit Struct Additions
- [x] Add `fatherId`, `motherId` (null for founder generation)
- [x] Add `attributes: { str, dex, con, int, agi, wil }` (1–10 each)
- [x] Add `phenotype: { skinHex, hairHex, eyeHex, heightScale }`
- [x] Add `passions: { [skill]: 'none' | 'interested' | 'burning' }`
- [x] Add `skills: { Farming, Woodcutting, Mining, Masonry, Bake, Butcher, Mill, Tan, Smelt, Forge, AnimalTrap, Spear, Sword, Bow }` (0–10)
- [x] Add `spouseId` for pair-bonding

### Birth System
- [x] Children inherit `fatherId` + `motherId` at spawn
- [x] Attributes blended: `child = floor((p1 + p2) / 2) ± mutation (0–1)`, clamped 1–10
- [x] Phenotype blended: midpoint hex values with ±jitter for each channel
- [x] Passions: each child gets 1 Burning Passion + 2 Interested skills; tendencies inherited with random drift
- [x] Rare traits (<1% each): Albinism, Gigantism/Dwarfism, Twin birth, Prodigy (one skill starts +3 with Burning Passion)

### Attribute Effects (Phase 1 pass)
| Attribute | Effect |
|---|---|
| STR | Carry capacity: `base × (0.5 + str × 0.1)` |
| CON | Max HP: `10 + con` |
| AGI | Movement speed multiplier: `1 + (agi - 5) × 0.04` |
| INT | Skill XP rate multiplier: `1 + (int - 5) × 0.1` |
| WIL | Routing threshold: `max(0.05, 0.45 - wil × 0.04)` |
- [x] All attribute effects wired

### Starting Tetrad
- [x] Replace 2-worker start with 4 married couples (8 adults), 4 starter 2×2 homes, 4 attached farms
- [x] Each individual: unique Greek name, randomized attributes (3–7), 1 Burning Passion
- [x] Couples linked via `spouseId`; starting homes assigned one couple each

### Succession on Death
- [x] On unit death: eldest living child inherits `homeBldgId`
- [x] Fallback 1: nearest sibling (same `fatherId` or `motherId`)
- [x] Fallback 2: estate reverts to Public
- [x] Float text notification on succession event

### Skills
- [x] Skill XP accrues on task completion, rate = `baseXP × INT_multiplier × passion_multiplier`
- [x] Passion multipliers: No Interest ×1.0 / Interested ×1.5 / Burning Passion ×2.5
- [x] Skill level = `floor(xp / 10) + 1`, capped at 10
- [x] Skills persist on the individual; carry through life, lost on death unless heir

---

## Milestone 5 — Oikos System (Phase 2: Family Estates)

### New Buildings & Production
- [x] `carpenter` building: wood(3) → planks(2) per 12s; pixel-art render
- [x] `masons` building: stone(3) → stoneBlocks(2) per 14s; pixel-art render
- [x] `blacksmith` added to BLDG_CATS Economy (was already in BLDG/EconomyManager)
- [x] `planks` and `stoneBlocks` resources added to GameScene, BuildingManager, UIManager
- [x] House size 1→2 (2×2 tile), capacity 4→6; Starting Tetrad updated
- [x] `APPLIANCE_DEF` constant: workbench, loom, millstone, hearth, anvil

### Domain Plot
- [x] `scene.domains[]` array; `assignDomain(house)` called on house placement
- [x] Domain = 8×8 grid (3-tile pad around 2×2 house): stored as {x1,y1,x2,y2}
- [x] `getDomainAt(tx,ty)` helper in BuildingManager
- [ ] Enforce in `isFree()` once Oikos family assignment is implemented
- [ ] Clicking any domain structure opens the Family Menu

### Modular Room Expansion
- [ ] 1×2 drag-expansion attached to any domicile wall face
- [ ] Each room: +2 capacity, +1 internal appliance slot
- [ ] Family auto-repairs home when `condition < 80%` using private material stash

### Internal Appliances
- [x] `applianceSlots: 2`, `applianceItems: []` on house bldg objects
- [x] At dawn: `checkApplianceDesires()` — resident skill ≥ 5 triggers desire
- [x] At-home craft: spends `costRaw` (sticks/stones) immediately if affordable
- [x] Workshop order: queues order on carpenter/masons/blacksmith `orderQueue`
- [x] `_processOrders()` in EconomyManager: 25s craft time, spends `costWorkshop`, delivers to house
- [x] Float text on install: 🔨 (self-craft) or 📦 (workshop delivery)

### Family Menu UI
- [x] `_renderOikosInfo`: replaces standard building info for built houses
- [x] Header: "Oikos of [patriarch name]", resident count
- [x] Resident rows: gender icon (♂/♀), name, age bracket, top skill+level, burning passion dot
- [x] Heir highlighted in gold with ★ (eldest child with a parent also in this house)
- [x] Appliance slot summary line
- [x] Buttons: "View Genealogy" (stub), Demolish, Close
- [ ] Genealogy tree: 2-generation ancestor view (deferred)

---

## Milestone 6 — Close the Game Loop

*Goal: make the game a real, winnable/loseable experience before adding more systems.*

### Win / Lose Conditions
- [ ] Player townhall destroyed → LOSE screen
- [ ] Enemy townhall destroyed → WIN screen (or escalate to next enemy village)
- [ ] All player workers dead with no births possible → LOSE

### Building HP
- [ ] All player buildings get HP on placement (scaled by build work)
- [ ] Enemy units in raid mode attack nearest player building when no player units in range
- [ ] Destroyed buildings leave rubble; workers can clear and rebuild
- [ ] Repair task: worker assigned to damaged building restores HP at half build cost

### Enemy Village as Proper Mirror
- [ ] Enemy workers spawned at start with `homeBldgId` pointing to enemy townhall
- [ ] Enemy village runs same birth/meal/age system as player (through WorldManager)
- [ ] Enemy farm gets harvested by enemy workers; enemy meals consume enemy food
- [ ] Enemy rebuilds destroyed buildings using own workers and resources
- [ ] Enemy trains from barracks only when `enemyRes.food` is sufficient (already done)

### Gates & Walls Block Movement
- [ ] Closed gates are impassable to enemy units
- [ ] Walls block pathing; enemies must path around or break through

---

## Milestone 7 — Combat & Defense Depth

*Goal: make raids and defense feel meaningful.*

### Siege
- [ ] Enemy units attack buildings when no player units in range (building HP system from M6)
- [ ] Catapult unit (Siege Workshop): slow, high damage vs buildings, low vs units
- [ ] War Elephant: large, slow, very high HP, damages buildings on contact

### Defensive Structures
- [ ] Watchtower auto-fires arrows (already partially wired — make it actually deal damage)
- [ ] Palisade/wall HP; enemies must spend time breaking through
- [ ] Fire mechanic: flaming arrows can ignite wooden structures; bucket-brigade workers

### Strategic Layer
- [ ] **Idle worker alerts** — pulsing indicator on idle adult workers
- [ ] **Repair** — workers repair damaged buildings at half build cost (dovetails with M6)
- [ ] **Food pressure** — shortage: workers at 70% speed, no training; surplus: +10% speed
- [ ] **Trade caravan** — random event every ~8 days; sell surplus for food

### Hero Unit
- [ ] One named hero per village; levels up each night survived
- [ ] Hero death = morale collapse for nearby units
- [ ] Area morale aura; unique ability at level 3

---

## Milestone 8 — Localized Production  *(V25 Priority 0 — largest architectural change)*

*Must come before barter — barter requires per-family inventories which requires this.*

### Public vs Private Economy
- [x] `scene.resources` = public commons (player-controlled, shown in topbar)
- [x] `house.inventory` = private Oikos stock (shown in household panel)
- [x] Freelance workers (forager/woodcutter/miner/hunter/shepherd) deposit to home Oikos
- [x] Farmers and builders deposit to public pool (public buildings)
- [x] Meals: each house feeds residents from private inventory first; public pool covers remainder
- [x] Townhall: no longer a residence — public workspace only

### Tribute System (pre-coinage)
- [x] **Firstfruits** — 1 unit of each resource skimmed to commons on every private deposit (hardcoded, automatic)
- [x] **Harvest Tithe** — player-set rate (0–40%, step 5%) applied to all private inventories at dawn; controlled via Townhall panel
- [ ] **Corvée Labor** — each adult owes N public workdays per season; on their corvée day they act as public workers *(deferred to Political System milestone)*
- [ ] **Surplus Offering** — households with inventory above a configurable threshold automatically offer excess to commons *(deferred to Barter milestone)*
- [ ] **Tax in Coin** — replace tithe with coin-denominated tax rate once coinage is introduced *(deferred to Coinage milestone)*

### Remove Global Pool (future pass)
- [ ] Replace `scene.resources` with per-building `inputBasket` + `outputRack`
- [ ] Stockpile Yard building: families and workshops query their assigned yard UID
- [ ] Workers sleep only at `home_id`, deliver only to assigned stockpile yards
- [ ] Enemy village uses same system

### Worker Role Trinity
- [ ] **Procurer** — fetches raw materials from nodes to workshop input basket
- [ ] **Processor** — bench-locked at workshop, highest skill, runs the conversion
- [ ] **Porter** — moves finished goods from output rack to stockpile yard
- [ ] Solo building: one worker rotates through all three roles at reduced throughput

### Resource Physicality
- [ ] Generalize floor piles to cover all resource types
- [ ] Land clearing required before any foundation (trees/scrub must be removed)
- [ ] Wooden Cart: ×8 carry capacity, road-only for full speed, ×0.5 on rough terrain

### Asymptotic Node Growth
- [ ] `growth_next = current + (rate / current)` for all node regrowth
- [ ] Large nodes yield more per tick but grow slower

---

## Milestone 9 — Barter Economy  *(depends on M8 per-family inventories)*

### Family Private Inventory
- [ ] Each Oikos has a private `inventory` object separate from the stockpile yard
- [ ] Families consume from private inventory first; buy/trade for shortfalls

### Relative Utility Barter
- [ ] Dynamic trade value: `trade_value = base_price × (1 + 1 / current_stock)`
- [ ] Kinship gifting: families with high social affinity gift surplus; creates social debt record

### Commercial Tiers
- [ ] **Home Stall** (1×1 porch attachment): neighbourhood barter; owner sets surplus threshold
- [ ] **Market Square** (2×1 stall slots): families rent stalls; Merchant Porter moves goods home → market
- [ ] **Mint**: indexes barter ratios into fixed Copper Coinage; unlocks Bronze Age tech tree branch

---

## Milestone 10 — Living World Expansion

### Oikos Completion (deferred from M5)
- [ ] Modular room expansion: 1×2 drag-on attached to any wall face; +2 capacity, +1 appliance slot
- [ ] Domain enforcement in `isFree()` once family assignment is clear
- [ ] Genealogy tree: 2-generation ancestor view in Family Menu

### City Planner AI
- [ ] Builder reaching skill 8 becomes City Planner
- [ ] Autonomously plans roads, building districts within explored territory
- [ ] Auto-zones: separates Industrial from Residential; respects Oikos domains
- [ ] Relocation: lays new foundation → deconstructs old → hauls materials → rebuilds

### Migration Petitions
- [ ] Random families appear at map border every N days
- [ ] Player accepts or rejects; City Planner ghosts a new residential plot on accept
- [ ] Rejection builds mild reputation penalty

---

## Milestone 11 — Procedural World

### Chunk-Based Generation
- [ ] Replace fixed 80×128 map with chunk-based generation; world expands on exploration
- [ ] Biome regions generated per chunk; tile distribution matches current band system
- [ ] Minimap becomes a live region view that pans and scales with exploration

---

## Milestone 12 — Era Progression & Multiplayer

### Era Progression
- [ ] Persian Wars arc: Thermopylae-style last stand scenarios
- [ ] Siege Workshop: catapult targeting buildings
- [ ] Generational carry: one building bonus or veteran unit persists between runs
- [ ] 4-city-state league mode: each player is a different Greek polis with unique unit bonus

### Multiplayer
- [ ] Colyseus server: server-authoritative unit movement + combat
- [ ] Client sends commands (move, build, train), server resolves
- [ ] Room lobby (host creates, others join via code)
- [ ] 2-player co-op: shared map, split flanks
- [ ] Reconnection handling; deploy: GitHub Pages + Render

---

## Stretch / Future

- [ ] Greek pottery visual theme (red-figure aesthetic)
- [ ] Map editor
- [ ] Procedural enemy general with personality (aggressive / flanking / siege)
- [ ] Oracle: reveals next raid composition before timer ends
- [ ] Fire mechanic: flaming arrows, burning buildings, bucket-brigade workers
- [ ] Naval flank: enemy ships land on the south coast (new attack vector)
