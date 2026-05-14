# Freeform Building System

**Status:** Phase 1 (walls + grow zones) implemented. Room detection and worker integration pending.

Buildings in Polis are not prefab objects placed from a menu. Instead they emerge from three independent systems: walls drawn on tile edges, furniture placed on tiles, and zone layers painted on tiles. This replaces the old `BLDG`/`buildings[]` system.

---

## What's Implemented

### Wall System ✅

Walls live on tile *edges*, not on tiles. Each tile has four edges (N/S/E/W). A wall segment is stored on the lower/left tile's edge slot to avoid duplication for shared edges.

**Wall types** (all use `placement: 'edge'` in their construct def):

| Type | Height | Passable | Material | Visual |
|---|---|---|---|---|
| `wall_edge` | full | No | Stone | 2.5D face panel on E-W, thin strip on N-S |
| `low_wall` | low | No | Stone | Shorter face panel / thin strip |
| `fence` | fence | Animals only | Wood | Thin fence |
| `door` | door | Yes | Wood | Wall face with opening cutout |
| `fence_gate` | fence | Yes | Wood | Fence with opening |

**2.5D rendering:** E-W (isH=true) walls render a face panel extending upward from the boundary (~¼ tile height for full walls, ~⅛ for fences), with a lighter top cap and bottom shadow. N-S walls render as a thin vertical strip with a right-side shadow. Passable types (door/gate) show a dark cutout in the center.

**Placement UI:** Select a wall type button in the build menu → drag to draw edges. Toggle to erase existing walls. Right-click to pick material (where multiple materials are allowed).

### Grow Zones ✅

Grow zones are a selectable zone class, not individual crop buttons.

**Flow:**
1. Select "Grow Zone" in the Zones tab
2. Drag to paint tiles (the zone is created unassigned)
3. Zone paint mode exits automatically; the crop picker opens immediately
4. Pick a crop — the entire connected zone gets the crop assigned
5. Farmers plant and harvest the slots; each tile shows per-slot growth dots

Adjacent grow tiles auto-group into one connected zone. Clicking an existing grow zone (while not in any build mode) re-opens the crop picker.

Grow zones are mutually exclusive with work/storage/market zones — painting one removes any conflicting type from those tiles.

### Zone Layers ✅ (partial)

Four independently painted zone types:

| Zone | Color | Purpose |
|---|---|---|
| Work | Blue | Area where workers look for jobs |
| Storage | Orange | Stockpile area for resources |
| Market | Gold | Merchant trade stalls |
| Grow | Green | Farming fields, crop-specific |

Zones are painted with rectangle drag. Erase mode removes all zone types from tiles.

Work, storage, and market zones can coexist on the same tile. Grow zones are exclusive.

### Build Menu Structure ✅

Tabs: **Civil · Industry · Military · Furnish · Zones · Debug**

- **Civil**: camp, townhall, agora, temple, oracle, tavernseat + wall type buttons + Road
- **Industry**: pasture, mine, millstone, oven, forge, anvil, tanningrack, workbench, stonecutter, olivepress + wall type buttons + Road
- **Military**: melee_grounds, archery_grounds, mounted_grounds, watchtower, wall (tile), palisade, gate, fence (tile) + wall type buttons + Road
- **Furnish**: sub-tabs per category; furniture/appliances placed as tile constructs
- **Zones**: Work Zone, Storage Zone, Market Zone, Grow Zone, Erase Zones
- **Debug**: New Game, Sprite Editor

`house`, `farm`, and `garden` are removed from the player build menu. The **Camp** (`isHomeType: true`) is the starting home construct. Walls + zones + furniture replace standalone house/farm constructs.

### Per-Construct Material Selection ✅

Construct defs declare `allowedMaterials: [...]`. If a def has only one entry, no picker is shown. If it has multiple, right-clicking the button temporarily shows a material picker panel. The chosen material persists per construct type (`scene.constructMaterials` map). The material used is shown as a small badge on the button.

---

## What's Not Yet Implemented

### Room Auto-Detection (Phase 2)

When walls fully enclose an area, flood-fill detection should:
- Identify connected enclosed spaces
- Score furniture inside to classify the room (Living, Weaving, Smithing, Baking, Carpentry, etc.)
- Auto-assign a work zone type based on dominant furniture
- Deactivate the zone if a wall is removed (broken enclosure)

### Zone-Based Job Dispatch (Phase 3)

Workers currently find jobs by scanning construct types. The target is:
- Workers scan work zone tiles within their assignment radius
- Zone type + furniture inside determine available jobs
- Replaces all `b.type === 'whatever'` job-matching logic

### Ownership Zones (Phase 4)

- Auto-claim tiles when an oikos builds walls or places furniture in them
- Civic designation for shared community spaces
- Workers prefer their own oikos zones; fall back to public zones when idle
- Oikos AI eventually expands autonomously — adds rooms, claims adjacent tiles

### Composite Walls / Decay (future)

The design allows multi-layer walls (stone foundation + timber frame) and organic material decay. Not yet implemented — single-material walls only.

---

## Data Model Reference

```js
// Edge-based construct (in ConstructManager)
wallEdges[isH][row][col] = {
  type: 'wall_edge' | 'fence' | 'low_wall' | 'door' | 'fence_gate',
  material: string,
  hp: number, hpMax: number,
  buildProgress: 0..1,
}

// Grow zone tile (in ZoneManager.growTiles Map)
growTiles.get(key) = {
  crop: string | null,       // crop key, e.g. 'wheat'
  slots: number[],           // per-slot progress: -1=empty, 0..1=growing, ≥1=ready
}

// Connected zone selection (scene state)
scene.selectedZoneType  = 'grow' | 'work' | 'storage' | 'market' | null
scene.selectedZoneTile  = { tx, ty }   // click origin tile
scene.selectedZoneTiles = [{ tx, ty }, ...]  // BFS-connected tiles
scene.selectedZoneCrop  = string | null
```

---

## Migration from Old System

| Old | New / Current |
|---|---|
| `buildings[]` (house, farm, garden) | Removed from player build menu |
| `BLDG[type]` prefab size | Walls define footprint |
| `b.type === 'house'` checks | `CONSTRUCTS[b.type]?.isHomeType` |
| `grow:wheat` etc. zone modes | Single `'grow'` mode; crop assigned post-paint |
| Global `scene.constructMaterial` | Per-type `scene.constructMaterials[type]` map |
