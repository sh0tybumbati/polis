# Polis — Game Design Document (V25)

> A modular, dynastic city-builder transitioning to a Sumerian aesthetic. Manage living families, build a lasting civilization through modular constructs, and defend it through the night.

---

## Vision

Polis is a **Modular** city-builder where the core unit of gameplay is the **family estate (É / Oikos)**. Players manage dynasties of named individuals who work, breed, inherit property, and die. The economy is based on **modular constructs**—from grand townhalls to small 1x1 appliances (millstones, hearths) placed within family domains.

The game is currently transitioning from its original Greek theme to a **Sumerian** aesthetic.

---

## The Estate (É / Oikos)

The Estate is a **composite entity**: a living space built by the player from walls, furniture, and zone layers. There are no prefab "house" or "farm" objects to drop on the map — instead:

1. **Walls** on tile edges define physical enclosure (full stone, low stone, wood fence, doors/gates)
2. **Furniture** on tiles defines function and job slots (loom, oven, hearth, bed, etc.)
3. **Zones** painted on tiles define work type, storage, grow fields, and ownership

The **Camp** is the starting construct — a ready-made shelter before walls are built. As the player draws enclosing walls and places furniture, rooms emerge organically and are classified by their contents.

### Domain Plot
- Each family's Oikos auto-claims the tiles where their walls and furniture are placed.
- Domain enforcement (preventing other families from building inside) is a future milestone.
- Clicking any child structure within an estate opens the Family Menu.

### Build Menu Structure

| Tab | Contents |
|---|---|
| Civil | Camp, Townhall, Agora, Temple, Oracle, Tavernseat |
| Industry | Pasture, Mine, and processing constructs (mill, forge, oven, etc.) |
| Military | Training grounds, watchtower, tile-based walls/palisade/gate |
| Furnish | All furniture/appliances placed as 1×1 tile items |
| Zones | Work, Storage, Market, Grow zone painting tools |
| Debug | New Game, Sprite Editor |

Wall-type edge constructs (Wall, Low Wall, Fence, Door, Fence Gate) appear in the Civil/Industry/Military tabs for convenience. Right-click a construct button to pick its build material when multiple are allowed.

### Modular Constructs & Appliances
Each appliance placed inside a room provides a job slot:

| Construct | Effect |
|---|---|
| Loom | Weaving job slot (wool → cloth) |
| Oven | Baking job slot (flour → bread) |
| Tanning Rack | Tanning job slot (hide → leather) |
| Millstone | Milling job slot (wheat → flour) |
| Workbench | Carpentry job slot (logs → planks) |
| Anvil/Forge | Smithing job slot (ore → ingots → kits) |
| Hearth | Rest quality bonus for living rooms |
| Bed | Sleeping slot (rest need recovery) |

### Grow Zones
Fields are painted as Grow Zones (a zone layer), not as prefab farm buildings. After painting, the player clicks the zone to assign a crop. Adjacent tiles auto-group into one connected zone. Farmers plant and harvest the per-slot crop progression autonomously.

Constructs are requested autonomously when a family member has sufficient skill and an empty slot.

---

## Genealogy & Genetics

Every villager is a persistent individual. There are no anonymous workers.

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

Skill gain is modified by the unit's **Aptitude** for that skill:

| Aptitude | XP rate | Other |
|---|---|---|
| No Interest | ×1.0 | — |
| Interested | ×1.5 | Reduced Willpower decay |
| Burning Passion | ×2.5 | Willpower may regenerate *while working* |

Each unit is born with 1 Burning Passion and 2 Interested skills (random, inheritable tendency).

### Phenotype Blending
Physical traits are inherited via midpoint math with a mutation jitter:

```
child_value = (parent1_value + parent2_value) / 2  ±  mutation
```

Traits: skin tone (hex), eye color, hair color, height scale.

**Rare traits (<1% chance):**
- Albinism
- Gigantism / Dwarfism
- Twin birth
- Prodigy: one skill starts at +3 with Burning Passion

### Succession & Inheritance
On death:
1. Eldest living child inherits the Oikos (home + appliances).
2. If no children: nearest sibling (same fatherId or motherId).
3. If no kin alive: estate reverts to **Public** (player-controlled).

---

## Economy: Barter → Coinage

### Relative Utility Barter
Trade value is dynamic, not fixed:

```
trade_value = base_price × (1 + 1 / current_stock)
```

A family with 0 meat values it far more than one with 50. This creates natural supply-and-demand without a player-managed price screen.

**Kinship Gifting:** Families with high social affinity may gift surplus goods, creating social debts rather than formal exchange records.

### Commercial Tiers

| Tier | Building | Mechanic |
|---|---|---|
| 1 | Home Stall (1×1 porch) | Neighbourhood bartering; surplus threshold set by owner |
| 2 | Market Square (2×1 slots) | Families rent stalls; Merchant Porter sub-task moves goods from home to market |
| 3 | Mint | Indexes barter ratios into fixed **Copper Coinage**; unlocks the Bronze Age |

---

## Logistics & Production

### Localized Production (Building-to-Building)
Units do **not** pull from a global resource pool. Instead:
- Each building has an `inputBasket` and an `outputRack`.
- A unit checks its *assigned workplace's* basket; if empty, it queries the nearest assigned **Stockpile Yard UID**.
- The Strict Localism rule: units sleep only at `home_id` and deliver only to assigned stockpile yards.

### Cellular Production Team
Multi-worker buildings automatically divide roles:

| Role | Behaviour |
|---|---|
| **Procurer** | Fetches raw materials from stockpile yard into the input basket |
| **Processor** | Bench-locked; highest-skill unit; only works the craft |
| **Porter** | Moves finished goods from output rack to assigned stockpile yard |

Solo building: one worker rotates through all three roles (slower output).

### Heavy Logistics

| Tool | Capacity | Constraint |
|---|---|---|
| Leather Backpack | ×2 carry | Requires Leatherworks |
| Wooden Cart | ×8 carry | Road-only for full speed; ×0.5 speed on rough terrain |

---

## Environment & World

### Resource Physicality
Logs, sticks, and stones are **individual map entities**, not abstract counters. Land must be physically cleared before a foundation can be laid; cleared material is consumed by the build or moved to a stockpile yard.

### Asymptotic Growth
```
growth_next = current + (rate / current)
```
Growth slows as entities age but never stops. Yield = `floor(growth_variable)`.

### Two-Stage Tree Harvest
1. **Fell** — worker chops tree, leaving a stump; logs scatter as floor entities.
2. **Gather** — worker collects logs from the floor.
3. **Sapling** — stump grows a sapling over several days; matures to full tree.

### Scrub & Bush Regrowth
- Berry bushes enter a **dormant state** when depleted (not removed); regrow after ~2 days.
- Scrub spreads to adjacent tiles; grazing depletes it; scarcity soft-caps animal population.

### Resource Node Respawn
All finite nodes eventually recover. Respawn timers (in days): berry_bush 3, wild_garden 4, olive_grove 5, small_tree 6, ore_vein 25. Large trees and large boulders are **permanent depletions** — they do not respawn, making their location strategically significant.

---

## The City Planner

A builder unit reaching **skill 8** becomes a City Planner (promoted automatically, becomes a unique named unit):
- Autonomously plans roads and building districts within explored territory.
- **Auto-zones**: separates Industrial (Tannery, Smelter, Mine) from Residential (Homes, Bakery, Butcher).
- Respects the 8×8 Oikos buffer for each family.
- **Relocation**: lays new foundation → deconstructs old → hauls materials → builds. Costs ×0.75 work, ~12% material loss.

---

## The Archon (Player Role)

The player acts as the **Archon** — the chief magistrate of the polis. The Archon does not command individual citizens directly; instead they set policy levers that shape how the city self-organises.

### Policy Levers

| Tool | Location | Effect |
|---|---|---|
| **Firstfruits** | Automatic | 1 unit of each resource skimmed to commons on every private deposit |
| **Harvest Tithe** | Townhall panel | 0–40% (step 5%) skimmed from all private inventories at dawn |
| **Hiring** | Building panel | Toggle a building public/private; public buildings pay state wages |
| **Corvée Labor** | *(future)* Townhall | Each adult owes N public workdays per season |
| **Migration Petitions** | Border events | Accept families (City Planner plots housing) or reject (reputation penalty) |

### Limits of Authority

The Archon cannot directly command individual citizens. Workers choose roles via the job-scoring system; families manage their own Oikos. The player's power is indirect — set the incentives, and the city responds.

This gap between the Archon's intent and the city's emergent behaviour is the central tension of the game.

---

## Starting Conditions

### The Camp
The game begins with a single **Camp** construct and 2 adults (Archon and Consort). The Camp acts as the initial home and storage hub until the first permanent housing is established.

### Migration Petitions
Random families appear at the map border every N days. The player **Accepts** or **Rejects**:
- Accept → City Planner immediately ghosts a new residential plot in available domain space.
- Reject → family moves on; rejection builds a mild reputation penalty.

---

## Combat & Defense

Combat remains a consequence of prosperity. The enemy polis runs a full mirror economy simulation — the waves it sends reflect what it has actually trained and fed. Starvation weakens waves organically.

### Formations
| Formation | Shape | Strength | Weakness |
|---|---|---|---|
| Phalanx | Vertical line | High frontal HP | Weak flanks |
| Wedge | V-shape | Punches through center | Vulnerable if flanked |
| Screen | Wide sparse | Covers flanks, harasses | Low HP |

### Counter Triangle
Cavalry → Archers → Spearmen → Cavalry

### Unit Progression
Levy (Clubman/Slinger) → Mid (Spearman/Archer/Cavalry) → Elite (Hoplite/Toxotes/Peltast)

Upgrades require material chains: leather kit → Peltast; bronze kit → Hoplite/Toxotes.

---

## World Generation

### Current (Fixed Map)
80×128 tiles, four biome bands (heartland/scrubland/forest/badlands), one river with three fords, fog of war.

### Target (Chunk-Based Infinite)
- Chunk-based generation in biome regions; world grows as players explore.
- Minimap becomes a live region view; pans with exploration.
- Supports Migration Petitions arriving from off-screen.

---

## Visual Direction

- **Style**: Top-down, 32×32px tiles, earthy Greek palette
- **Colors**: Sandstone yellows, Aegean blues, olive greens; `#c8a030` gold UI accents
- **UI**: Dark panel with Greek-key border, square buttons, resolution-agnostic anchoring
- **LOD**: JS-shape engine — small shape groups cull at far zoom, leaving colored-square stand-ins for performance

---

## Tech Stack

| Layer | Tech |
|---|---|
| Rendering | Phaser 3 (CDN, no build step) |
| Game logic | Vanilla JS ES Modules, Manager pattern |
| State | Scene-owned arrays (`units`, `buildings`, `resNodes`) |
| Multiplayer (future) | Colyseus (Node.js) + @colyseus/schema |
