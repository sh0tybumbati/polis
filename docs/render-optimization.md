# Render Optimization — Research & Plan

_Discussion from 2026-05-15. Covers the "white pixel / LOD culling" technique, feasibility assessment for Polis, and the prioritized implementation plan._

---

## The White Pixel Technique

The core idea: create a single 1×1 white texture at startup, then use scaled+tinted sprites from that texture for all rectangular shapes. Because all sprites share the same texture, the GPU can batch them into a single draw call regardless of count.

```js
// Generate once in BootScene or GameScene.create()
const g = this.make.graphics({ add: false });
g.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
g.generateTexture('px', 1, 1);
g.destroy();

// Use everywhere instead of Graphics.fillRect
const rect = this.add.image(x, y, 'px')
    .setDisplaySize(w, h)
    .setTint(0xff4422);
```

### What it works well for

- Fog tiles (hundreds of `fillRect` calls per frame → 1 draw call via Blitter)
- Progress bars (3 rects per unit)
- Selection indicator background
- Any rectangular UI element

### What it does NOT replace

- Circles and ellipses (shadow, selection oval, unit head)
- Complex compound shapes (unit body with directional detail)
- These still need `Phaser.Graphics` or pre-rendered textures

---

## LOD Layer Toggle

Instead of checking each sprite's `minZoom` every frame, group all "detail" sprites (eyes, tool details, small labels) into a `Phaser.GameObjects.Layer`. Toggle the whole layer with one boolean when zoom crosses a threshold.

```js
this.detailLayer = this.add.layer();    // depth-4 sprites go here
this.cameras.main.on('camerazoom', (cam, progress, zoom) => {
    this.detailLayer.setVisible(zoom >= 1.2);
});
```

This is O(1) regardless of entity count and requires zero per-frame work.

Polis already has `lod` tiers (0–3) computed per frame in `UnitRender.redrawUnit`. The layer approach would replace that with a one-time event callback — better.

---

## Feasibility Assessment for Polis

### What the proposal gets wrong

1. **Separate sprites per component** — the document suggests creating 4–8 individual sprites per entity (body, backpack, eyes, pupils). With 50 units that's 200–400 live GameObjects each needing position updates when the unit moves. This trades one overhead for another.

2. **Wrong bottleneck** — Polis's primary bottleneck is chunk terrain generation and fog redraws, not unit body complexity. The white pixel approach doesn't help either of those directly.

3. **No ellipse support** — unit shadows, selection rings, and head circles can't be represented as scaled white rectangles. A mixed approach (white pixel for bars/fog, Graphics for circles) is needed.

---

## Prioritized Implementation Plan

### Priority 1 — Dirty-flag unit redraw (low effort, immediate fps gain)

**Problem**: `redrawUnit()` runs every frame for every visible unit. Most frames a sleeping or idle unit hasn't changed at all.

**Fix**: Add `u._dirty = true` when state changes (position, hp, role, sleep, task). Only call `redrawUnit(u)` when `u._dirty`. Clear the flag after redraw.

```js
// In UnitWorker, UnitCombat etc, whenever state changes:
u._dirty = true;

// In UnitManager.tick():
for (const u of this.scene.units) {
    if (!this._isUnitCulled(u) && u._dirty) {
        this.redrawUnit(u);
        u._dirty = false;
    }
}
```

Expected gain: near-zero CPU for idle/sleeping units, which can be the majority during peacetime.

### Priority 2 — White pixel fog (medium effort, biggest visual bottleneck)

**Problem**: `drawFog()` runs every 500ms, iterates all viewport tiles (~880 for 1280×720), and issues `fillRect` for every black/dim tile via `Phaser.Graphics`. Each call is a separate GPU command before batching.

**Fix**: Use a `Phaser.GameObjects.Blitter` with the white pixel texture. Blitters are purpose-built for many sprites from one texture — single draw call.

```js
// In MapManager.initFog():
this.scene.fogBlitter = this.scene._w(
    this.scene.add.blitter(0, 0, 'px').setDepth(8)
);

// In drawFog(): clear bobs, add one per black/dim tile with tint
// (Blitter Bobs don't support per-bob tint in all Phaser versions;
//  fallback: two separate Blitters, one for black, one for dim)
```

Note: verify `Blitter` bob tinting is available in Phaser 3.87 before committing.

### Priority 3 — RenderTexture chunk terrain (medium effort, eliminates per-tile CPU work)

**Problem**: `ChunkManager.renderChunk()` calls 256 `fillRect` on a `Phaser.Graphics` every time a chunk is first rendered or a tile changes. On first discovery of many chunks this spikes CPU.

**Fix**: Render into a `RenderTexture` instead. After the initial render, display the chunk as a plain `Image` sprite. Only re-render the texture when a tile is modified (road painted, construction placed).

```js
renderChunk(cx, cy) {
    const chunk = this.chunks.get(this._chunkKey(cx, cy));
    if (!chunk) return;

    const rt = this.scene.add.renderTexture(
        cx * CHUNK_SIZE * TILE,
        MAP_OY + cy * CHUNK_SIZE * TILE,
        CHUNK_SIZE * TILE, CHUNK_SIZE * TILE
    ).setDepth(0);

    // Draw tiles into rt using a temp Graphics
    const g = this.scene.make.graphics({ add: false });
    // ... fillRect loop ...
    rt.draw(g);
    g.destroy();

    // Store rt instead of gfx
    chunk.rt = rt;
}
```

The `RenderTexture` is then a single GPU texture — 1 draw call per chunk regardless of tile count.

**Trade-off**: RenderTextures consume VRAM. With 20 rendered chunks at 16×16×32px = 512×512px each, VRAM usage is acceptable on desktop but monitor on mobile.

---

## What to Skip

- **Full JSON entity component system** — overengineered for Polis's unit count (<200 units in any reasonable game). The existing `UNITS[type].draw()` content-driven approach already separates data from rendering.
- **Per-sprite `minZoom` data tags** — the existing `lod` int (0–3) in `UnitRender` covers this adequately. Replace with layer toggle when the unit count warrants it.

---

## Summary Table

| Technique | Effort | Impact | When |
|---|---|---|---|
| Dirty-flag unit redraw | Low | Medium (idle units near-free) | Next sprint |
| White pixel fog tiles | Medium | High (fog is redrawn every 500ms) | Next sprint |
| LOD layer toggle | Low | Low–Medium (zoom events are rare) | With dirty-flag |
| RenderTexture chunks | Medium | High (eliminates per-tile CPU on discovery) | After fog fix |
| White pixel unit bars | Low | Low (few units) | Opportunistic |
| Full sprite component system | High | Low for current scale | Skip for now |
