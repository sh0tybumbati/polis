# Freeform Building System

**Status:** Design — not yet implemented

Replaces the premade building type system (`BLDG`, `buildings[]`). Buildings now emerge from walls, furniture, and zones rather than being placed as prefab units.

---

## Overview

Three independent systems combine to create buildings:

1. **Walls** — placed on tile edges, define physical enclosure
2. **Furniture / appliances** — placed on tiles, define function and job slots
3. **Zones** — painted on tiles, define work type, storage, and ownership

---

## Wall System

### Data Model

Walls live on tile *edges*, not on tiles themselves. Each tile has four edges (N/S/E/W):

```js
wallEdges[y][x] = {
  N: WallSegment | null,
  S: WallSegment | null,
  E: WallSegment | null,
  W: WallSegment | null,
}

WallSegment {
  layers:        [{ material: string, thickness: number }],
  hp:            number,
  hpMax:         number,
  buildProgress: 0..1,
  height:        'full' | 'low' | 'fence',
}
```

Shared edges between adjacent tiles are stored once (the N edge of tile (y,x) is the same as the S edge of tile (y-1,x)). Canonical storage: always use the **lower/left** tile's edge slot.

### Wall Heights

| Height | Blocks pathing | Encloses rooms | Use |
|--------|---------------|----------------|-----|
| `full` | Yes | Yes | Buildings, fortifications |
| `low` | No | No | Garden borders, decorative |
| `fence` | Animals only | No | Pastures, livestock pens |

### Composite Walls

A wall segment can have multiple material layers (e.g. stone foundation + timber frame). `hpMax` = sum of layer contributions. The outermost layer determines visual style and weather resistance.

### Material Properties

Defined in each material item's `wall` block:

| Material | hpMax | buildWork | skill | decays |
|---|---|---|---|---|
| Clay.Daub | 40 | 10 | Building | Yes (fast) |
| Wood.Pine | 80 | 20 | Carpentry | Yes (slow) |
| Clay.Brick | 200 | 40 | Masonry | Yes (very slow) |
| Stone.Limestone | 300 | 60 | Masonry | No |

Higher skill level = faster build speed multiplier.

### Partial Construction

`buildProgress < 1` = wall under construction. The edge is reserved (blocks further placement) but:
- Does NOT count toward room enclosure
- Units can path through it
- Renders as scaffolding visually

### Decay & Repair

Organic materials lose hp over time at `decayRate` per tick. Repair job = spend material units + work.

### Doors & Gates

Doors/gates are **furniture placed in a wall gap** (an edge with no WallSegment):

```js
doorEdges[y][x] = {
  N/S/E/W: { itemId: 'Furniture.Door.Wood', open: bool, locked: bool } | null
}
```

- Must be crafted at a workshop (Carpentry for wood, Smithing for iron gates)
- `passable: true` — units and animals path through them
- Gates = large doors for fence/palisade openings

---

## Furniture & Appliances

Placed on individual tiles. One item per tile.

```js
furniture[y][x] = {
  itemId: string,   // e.g. 'Furniture.Hearth', 'Furniture.Loom', 'Furniture.Bed'
  state:  {},       // durability, fuel level, etc.
}
```

Furniture items are crafted at workshops and placed in the world. They:
- Define what jobs are available (a Loom provides a Weaving job slot)
- Are required by some zone types to function (Smithing zone needs a Forge)
- Belong to whoever placed them (oikos ownership)

---

## Zone Layers

Four independent layers, each a tile-keyed map. They can overlap freely.

```
ownership[y][x]  →  oikosId | 'civic' | null
work[y][x]       →  zoneId | null
storage[y][x]    →  zoneId | null
(future) civ[y][x] → polisId | null
```

### Work Zones

```js
WorkZone {
  id, type, tiles: Set,
  furnitureReqs: string[],   // furniture itemIds required to activate
  assignedWorkers: [],
  enclosed: bool,            // computed — must be true to activate
}
```

**Enclosure requirement:** work and living zones only activate when all boundary edges are complete walls (`buildProgress >= 1`). Breaking a wall deactivates the zone until repaired.

**Worker assignment:** auto-fills from idle workers; manual assignment also available.

**Zone types and required furniture:**

| Zone type | Required furniture | Optional (boosts output) |
|---|---|---|
| Living | Bed | Hearth, storage chest |
| Weaving | — | Loom (each adds job slot) |
| Smithing | Forge | Anvil, workbench |
| Baking | Oven | Millstone |
| Carpentry | Workbench | — |
| Farming | — (outdoor zone) | — |

### Room Auto-Detection

When a room becomes enclosed, it scores its furniture and auto-classifies:

| Dominant furniture | Classified as |
|---|---|
| Beds + Hearth | Living |
| Loom(s) | Weaving |
| Forge | Smithing |
| Oven | Baking |
| Workbench (no forge) | Carpentry |
| Ambiguous | Unclassified — prompts player |

Player can override or pre-select zone type before enclosure.

### Storage Zones

- No enclosure requirement — can be outdoors
- Overlap with work zones on a different layer
- Typed accepts: `Food` | `Materials` | `Goods` | `Any`
- Workers deliver resources to the nearest accepted storage zone tile
- Replaces the old `b.inbox` per-building buffer system

### Ownership Zones

| Owner | How claimed |
|---|---|
| Oikos | Auto-claimed when oikos builds walls or places furniture |
| Civic | Manually designated; shared community use |
| Public | Inside civ border, no private claim |
| Wilderness | Outside civ border |

Workers prefer jobs within their oikos's tiles. Will seek public zone work when idle. Oikos AI autonomously expands — builds rooms, claims adjacent tiles over time.

---

## Migration from Old System

| Old | New |
|---|---|
| `buildings[]` array | Rooms (computed) + furniture tiles |
| `BLDG[type]` config | `FURNITURE[itemId]` defs + zone type rules |
| `b.built` / `b.buildWork` | `wallSegment.buildProgress` per edge |
| `b.inbox` storage dict | Storage zone tiles |
| Worker assigned to building | Worker assigned to work zone |
| `faction` flag on building | `ownership[y][x]` layer |
| Building size (2×2 etc.) | Walls define the footprint |

---

## Implementation Phases

### Phase 1 — Wall System
- Edge grid data structure (`wallEdges`)
- Render walls on tile borders (use tile edge coordinates)
- Flood-fill room detection on wall change
- Wall placement UI (tool mode: select material, click/drag edges)
- Partial construction rendering (scaffolding)

### Phase 2 — Furniture Placement
- `furniture[y][x]` map
- Place/remove UI (select item from inventory, click tile)
- Room auto-classifies work zone from furniture scan
- Furniture items in content system

### Phase 3 — Zone Layers
- Paint storage zones (tool: drag tiles, pick type)
- Work zone inherits from room or manual override
- Ownership auto-assigns when oikos builds
- Zone rendering (color overlay per layer, toggleable)

### Phase 4 — Worker Integration
- Workers find jobs by scanning work zones (not buildings)
- Resource delivery targets storage zone tiles
- Oikos AI plans and builds their own spaces

### Phase 5 — Civ Borders & Territory
- Civ border layer, territory claims
- Public vs. private land logic
- Conflict / trespass mechanics
