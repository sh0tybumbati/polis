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
- [ ] **Enemy scout** appears ~20s before each night; killing it reveals full wave composition as a UI flash

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
- [ ] Cookhouse: bread + sausage → portable rations for scouts
- [ ] Tiered food taxonomy with worker-slot shop model (customers visit shops)
- [ ] Foodhaus fallback building with workstation bottleneck
- [ ] Veggie gardens, olive press, olive groves (discovered resources)
- [ ] Unlock gates per building
- [ ] Enemy AI builds food chain buildings

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

### Terrain Advantages (combat)
- [x] Forest tiles: archers in forest get cover (–20% incoming ranged damage)
- [x] High-ground tiles: archers gain +8 range when stationary
- [x] River fords: only passable at designated ford tiles; creates natural chokepoints

---

## Milestone 4 — Strategic Layer

### Day Phase Agency
- [ ] **Scouting** — send a fast unit east before nightfall to reveal the enemy wave composition
- [ ] **Idle worker alerts** — pulsing indicator on idle adult workers; tap to assign
- [ ] **Pre-wave intel flash** — 10s before night, text overlay shows incoming unit types if enemy scout was killed
- [ ] **Repair** — workers can repair damaged (but not destroyed) buildings at half build cost

### Hero Unit
- [ ] One named hero spawns at game start (procedural Greek name, e.g. *Lysander*)
- [ ] Hero levels up each night survived: gains HP, area morale aura, unique ability at level 3
- [ ] Hero death = immediate morale collapse for nearby units; loss condition if no survivors remain
- [ ] Persists between runs (Milestone 4 generational carry)

### Food as Strategic Pressure
- [ ] **Shortage state** — when food < upkeep: workers operate at 70% gather speed, no new training allowed; death only triggers after 2 consecutive days short
- [ ] **Surplus bonus** — food > 2× upkeep: +10% worker speed (well-fed bonus)
- [ ] **Trade caravan** (random event, every ~8 days): merchant passes through; can sell excess stone/wood for food

---

## Milestone 5 — Multiplayer

- [ ] Colyseus server: server-authoritative unit movement + combat
- [ ] Client sends commands (move, build, train), server resolves
- [ ] Room lobby (host creates, others join via code)
- [ ] 2-player co-op: shared map, split flanks
- [ ] Sync: unit HP, positions, phase transitions, enemy village state
- [ ] Reconnection handling
- [ ] Deploy: GitHub Pages + Render

---

## Milestone 6 — Era Progression

- [ ] Persian Wars arc: Thermopylae-style last stand scenarios
- [ ] War Elephant enemy (large, slow, high HP, damages buildings on contact)
- [ ] Siege Workshop: catapult unit that targets buildings
- [ ] Generational carry: one building bonus or veteran unit persists between runs
- [ ] 4-city-state league mode: each player is a different Greek polis with a unique unit bonus

---

## Stretch / Future

- [ ] Greek pottery visual theme (red-figure aesthetic)
- [ ] Map editor
- [ ] Procedural enemy general with personality (aggressive / flanking / siege)
- [ ] Oracle building: reveals next wave composition before timer ends
- [ ] Fire mechanic: flaming arrows, burning buildings, bucket-brigade workers
- [ ] Naval flank: enemy ships land on the south coast (new attack vector)
