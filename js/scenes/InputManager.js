import {
    TAP_DIST, MAP_OY, MAP_W, MAP_BOTTOM, TILE
} from '../config/gameConstants.js';
import { CONSTRUCTS } from '../content/constructs/index.js';
import { CROPS } from '../content/crops/index.js';

export default class InputManager {
    constructor(scene) {
        this.scene = scene;
        this.prevX = 0;
        this.prevY = 0;
        this._lastTapTime = 0;
        this._lastTapX = 0;
        this._lastTapY = 0;
    }

    setupInput() {
        const s = this.scene;
        s.input.mouse?.disableContextMenu();
        s.input.addPointer(1);
        
        s.hoverGfx = s._w(s.add.graphics().setDepth(7));
        s.dragGfx  = s.add.graphics().setDepth(8);
        s.cameras.main.ignore(s.dragGfx);

        s._touches = new Map();

        s.input.on('pointerdown', ptr => {
            s._touches.set(ptr.id, { x: ptr.x, y: ptr.y });
            if (s._touches.size === 1) {
                s._ptrDownX = ptr.x; s._ptrDownY = ptr.y; s._dragging = false;
                if (s.wallMode) {
                    s._wallDragEdges.clear();
                    const edge = s.constructManager.nearestEdge(ptr.worldX, ptr.worldY);
                    s._wallDragErasing = edge ? !!s.constructManager.getWall(edge.isH, edge.row, edge.col) : false;
                }
                if (s.zoneMode) {
                    s._zoneDragTiles.clear();
                    const t = s.tileAt(ptr.worldX, ptr.worldY);
                    s._zoneDragStart = t ? { tx: t.tx, ty: t.ty } : null;
                }
            } else {
                s._dragging = false; s._fmDragging = false; s._fmDragStart = null;
                s.dragGfx.clear();
                if (s.fmGfx) { s.fmGfx.destroy(); s.fmGfx = null; }
            }
        });

        s.input.on('pointermove', ptr => {
            s._touches.set(ptr.id, { x: ptr.x, y: ptr.y });
            const isTouch = s.sys.game.device.input.touch;

            if (s._touches.size >= 2) {
                const [a, b] = [...s._touches.values()];
                const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                if (s._pinch.active) {
                    const cam = s.cameras.main;
                    if (s._pinch.dist > 1) {
                        cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dist / s._pinch.dist), 0.3, 3));
                    }
                    cam.scrollX -= (mx - s._pinch.mx) / cam.zoom;
                    cam.scrollY -= (my - s._pinch.my) / cam.zoom;
                }
                s._pinch.active = true;
                s._pinch.dist = dist; s._pinch.mx = mx; s._pinch.my = my;
                return;
            }

            s._pinch.active = false;
            const isUI = ptr.y < MAP_OY || ptr.y > this.scene.SH - (this.scene.uiManager?.L?.PANEL_H ?? 190);

            // Pan: middle-mouse only (desktop); two-finger pan handled in pinch block above
            if (ptr.isDown && ptr.middleButtonDown()) {
                const cam = s.cameras.main;
                cam.scrollX -= (ptr.x - this.prevX) / cam.zoom;
                cam.scrollY -= (ptr.y - this.prevY) / cam.zoom;
            }
            this.prevX = ptr.x;
            this.prevY = ptr.y;

            if (s.relocateMode && !isUI) {
                if (!ptr.isDown) this._drawFurnishGhost(ptr); // reuse ghost
            } else if (s.constructMode && !isUI) {
                if (!ptr.isDown) this._drawFurnishGhost(ptr);
            } else if (s.wallMode && !isUI) {
                if (ptr.isDown) {
                    const edge = s.constructManager.nearestEdge(ptr.worldX, ptr.worldY);
                    if (edge) {
                        const key = `${edge.isH}:${edge.row}:${edge.col}`;
                        if (!s._wallDragEdges.has(key)) {
                            s._wallDragEdges.add(key);
                            if (s._wallDragErasing) s.constructManager.removeWall(edge.isH, edge.row, edge.col);
                            else s.constructManager.placeWall(edge.isH, edge.row, edge.col, s.wallMaterial);
                            s.constructManager.renderWalls();
                        }
                    }
                } else {
                    this._drawWallGhost(ptr);
                }
            } else if (s.zoneMode && !isUI) {
                if (ptr.isDown && s._zoneDragStart) {
                    const t = s.tileAt(ptr.worldX, ptr.worldY);
                    if (t) this._drawZoneRectGhost(s._zoneDragStart, t);
                } else if (!ptr.isDown) {
                    this._drawZoneGhost(ptr);
                }
            } else if (s.roadMode && ptr.isDown && !isUI) {
                const t = s.tileAt(ptr.worldX, ptr.worldY);
                if (t) s._paintRoad(t.tx, t.ty);
            } else if (!s.constructType && !s.roadMode && !s.wallMode && ptr.isDown && !ptr.middleButtonDown() && !isUI) {
                const d = Phaser.Math.Distance.Between(ptr.x, ptr.y, s._ptrDownX, s._ptrDownY);
                if (d > TAP_DIST) {
                    if (s.selIds.size >= 1) {
                        // Formation drag (works for 1+ selected units)
                        if (!s._fmDragStart) {
                            const sp = s.cameras.main.getWorldPoint(s._ptrDownX, s._ptrDownY);
                            s._fmDragStart = { x: sp.x, y: sp.y };
                        }
                        s._fmDragging = true;
                        s.dragGfx.clear();
                        s._drawFmDragPreview(s._fmDragStart.x, s._fmDragStart.y, ptr.worldX, ptr.worldY);
                    } else {
                        // Box select
                        s._dragging = true;
                        const rx = Math.min(ptr.x, s._ptrDownX), ry = Math.min(ptr.y, s._ptrDownY);
                        const rw = Math.abs(ptr.x - s._ptrDownX), rh = Math.abs(ptr.y - s._ptrDownY);
                        s.dragGfx.clear()
                            .fillStyle(0x4a7acc, 0.12).fillRect(rx, ry, rw, rh)
                            .lineStyle(1, 0x4a7acc, 0.75).strokeRect(rx, ry, rw, rh);
                        s.hoverGfx.clear();
                    }
                }
            } else if (s.constructType && !ptr.isDown) {
                this.drawBuildGhost(ptr);
            }

        });

        s.input.on('pointerup', ptr => {
            s._touches.delete(ptr.id);
            s._pinch.active = false;
            s.dragGfx.clear();
            if (s._touches.size >= 1) return;

            if (s._fmDragging) {
                s._fmDragging = false;
                if (s._fmDragStart) {
                    const x1 = s._fmDragStart.x, y1 = s._fmDragStart.y;
                    const x2 = ptr.worldX, y2 = ptr.worldY;
                    const angle = Math.atan2(y2 - y1, x2 - x1);
                    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
                    s._applyFormation(cx, cy, angle);
                    s._fmDragStart = null;
                }
                return;
            }

            if (s._dragging) {
                s._dragging = false;
                const cam = s.cameras.main;
                const tl = cam.getWorldPoint(Math.min(ptr.x, s._ptrDownX), Math.min(ptr.y, s._ptrDownY));
                const br = cam.getWorldPoint(Math.max(ptr.x, s._ptrDownX), Math.max(ptr.y, s._ptrDownY));
                s.boxSelect(tl.x, tl.y, br.x, br.y, ptr.event?.shiftKey ?? false);
                return;
            }

            if (ptr.y < MAP_OY || ptr.y > this.scene.SH - (this.scene.uiManager?.L?.PANEL_H ?? 190)) return;
            const wasTap = Phaser.Math.Distance.Between(ptr.x, ptr.y, s._ptrDownX, s._ptrDownY) < TAP_DIST;
            if (!wasTap) return;
            const wx = ptr.worldX, wy = ptr.worldY;
            const hit = s.unitAt(wx, wy);
            const construct = s.findConstructAt(wx, wy);
            const node = s.findNodeAt(wx, wy);

            const isTouch = s.sys.game.device.input.touch;

            if (s.zoneMode) {
                const t = s.tileAt(wx, wy);
                if (t && s._zoneDragStart) {
                    const x1 = Math.min(s._zoneDragStart.tx, t.tx), x2 = Math.max(s._zoneDragStart.tx, t.tx);
                    const y1 = Math.min(s._zoneDragStart.ty, t.ty), y2 = Math.max(s._zoneDragStart.ty, t.ty);
                    for (let ry = y1; ry <= y2; ry++)
                        for (let rx = x1; rx <= x2; rx++)
                            this._applyZonePaint(rx, ry);
                }
                s._zoneDragStart = null;
                s.hoverGfx?.clear();
                return;
            }
            if (s.roadMode) { const t = s.tileAt(wx, wy); if (t) s._paintRoad(t.tx, t.ty); return; }
            if (s.constructType) { const t = s.tileAt(wx, wy); if (t) s.placeConstruct(t.tx, t.ty); return; }
            if (s.relocateMode) {
                const tile = s.tileAt(wx, wy);
                if (tile && s.relocateSrc) {
                    const { tx: sx, ty: sy } = s.relocateSrc;
                    if (tile.tx !== sx || tile.ty !== sy)
                        s.constructManager.relocate(sx, sy, tile.tx, tile.ty);
                }
                s.relocateMode = false; s.relocateSrc = null;
                s.selectedConstruct = null; s.hoverGfx?.clear(); s.updateUI();
                return;
            }
            if (s.constructMode) {
                const tile = s.tileAt(wx, wy);
                if (tile) {
                    const existing = s.constructManager.getAt(tile.tx, tile.ty);
                    if (existing) {
                        // Click built furniture to inspect; click unbuilt to cancel order
                        if (existing.built) { s.selectedConstruct = { tx: tile.tx, ty: tile.ty, item: existing }; s.constructMode = false; s.placementType = null; s.hoverGfx?.clear(); s.updateUI(); }
                        else s.constructManager.removeConstruct(existing);
                    } else if (s.placementType) {
                        s.constructManager.placeConstruct(s.placementType, tile.tx, tile.ty);
                    }
                }
                return;
            }
            if (s.wallMode) {
                // Drag already painted; single tap on a fresh edge also paints
                if (s._wallDragEdges.size === 0) {
                    const edge = s.constructManager.nearestEdge(wx, wy);
                    if (edge) {
                        const existing = s.constructManager.getWall(edge.isH, edge.row, edge.col);
                        if (existing) s.constructManager.removeWall(edge.isH, edge.row, edge.col);
                        else s.constructManager.placeWall(edge.isH, edge.row, edge.col, s.wallMaterial);
                        s.constructManager.renderWalls();
                    }
                }
                s._wallDragEdges.clear();
                return;
            }

            // Right-click (desktop) or tap with units selected (mobile) → action
            if (ptr.rightButtonReleased() || (isTouch && s.selIds.size > 0)) {
                if (s.selIds.size > 0) {
                    if (hit && !hit.isEnemy) { s.selectUnit(hit.id, true); return; }
                    if (hit && hit.isEnemy) { /* Attack (TBD) */ return; }
                    if (construct && s.orderWorkersToConstruct(construct)) return;
                    if (node && s.orderWorkersToNode(node)) return;
                    const deer = s.findDeerAt(wx, wy);
                    const sheep = s.findSheepAt(wx, wy);
                    if (deer) { s.assignHunters(deer); return; }
                    if (sheep) { s.assignShepherds(sheep); return; }
                    if (isTouch) {
                        const now = Date.now();
                        const doubleTap = (now - this._lastTapTime < 350) &&
                            Phaser.Math.Distance.Between(wx, wy, this._lastTapX, this._lastTapY) < 48;
                        this._lastTapTime = now; this._lastTapX = wx; this._lastTapY = wy;
                        if (doubleTap) { s.deselect(); return; }
                    }
                    s.moveSelectedTo(wx, wy);
                }
                return;
            }

            // Left click: select
            const hadWorkers = s.selIds?.size > 0 &&
                [...s.selIds].some(id => { const u = s.units.find(u => u.id === id); return u?.type === 'worker' && u.age >= 2; });
            s.deselect();
            s.selectedConstruct = null;
            s.selectedNode = null;
            s.selectedConstruct = null;
            s.zoneManager?.clearSelection();
            s.selectedZoneTile  = null;
            s.selectedZoneTiles = null;
            s.selectedZoneType  = null;
            s.selectedZoneCrop  = null;
            if (hit && !hit.isEnemy) { s.selectUnit(hit.id, ptr.event?.shiftKey ?? false); return; }
            if (construct) { s.selectedConstruct = construct; s.updateUI(); return; }
            if (node) { s.selectedNode = node; s.updateUI(); return; }
            const furnHit = s.constructManager?.findConstructAt(wx, wy);
            if (furnHit) { s.selectedConstruct = furnHit; s.updateUI(); return; }

            const tile = s.tileAt(wx, wy);
            if (tile && s.zoneManager) {
                const zAt = s.zoneManager.getAt(tile.tx, tile.ty);
                if (zAt.work || zAt.storage || zAt.grow || zAt.market) {
                    const { tiles, zoneType, cropKey } = s.zoneManager.getConnectedTiles(tile.tx, tile.ty);
                    const selCol = zoneType === 'work' ? 0x66aaff : zoneType === 'storage' ? 0xffcc44
                        : zoneType === 'market' ? 0xffdd66 : 0x88ee55;
                    s.zoneManager.setSelection(tiles, selCol);
                    s.selectedZoneTile  = { tx: tile.tx, ty: tile.ty };
                    s.selectedZoneTiles = tiles;
                    s.selectedZoneType  = zoneType;
                    s.selectedZoneCrop  = cropKey;
                    // If workers were selected, assign them to this zone
                    if (hadWorkers) {
                        const workers = s.units.filter(u => u.selected && u.type === 'worker' && u.age >= 2);
                        const role = zoneType === 'grow' ? 'farmer' : zoneType === 'market' ? 'merchant' : null;
                        workers.forEach(u => {
                            if (role) { u.vocation = role; u.role = role; }
                            u.taskType = null; u.targetNode = null; u.moveTo = null;
                        });
                        if (workers.length) s.uiManager?.showFloatText?.(tile.tx * TILE + TILE / 2, MAP_OY + tile.ty * TILE, `→ ${zoneType}`, '#aaddff');
                    }
                    s.updateUI(); return;
                }
            }

            if (s.selectedConstruct) { s.selectedConstruct = null; s.updateUI(); }
            if (s.selectedNode) { s.selectedNode = null; s.updateUI(); }
        });

        s.input.on('wheel', (ptr, _objs, _dx, dy) => {
            const cam = s.cameras.main;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.3, 3));
        });

        s.input.keyboard?.on('keydown-ESC', () => { s.constructType = null; s.roadMode = false; s.wallMode = false; s.constructMode = false; s.placementType = null; s.relocateMode = false; s.relocateSrc = null; s.selectedConstruct = null; s.zoneMode = null; s._zoneDragStart = null; s.selectedZoneTile = null; s.selectedZoneTiles = null; s.selectedZoneType = null; s.selectedZoneCrop = null; s.zoneManager?.clearSelection(); s.deselect(); s.selectedConstruct = null; s.hoverGfx.clear(); s.updateUI(); });
        s.input.keyboard?.on('keydown-A', () => s.units.filter(u => !u.isEnemy).forEach(u => s.selectUnit(u.id, true)));
        s.input.keyboard?.on('keydown-F', () => { const sel = s.units.filter(u => u.selected && !u.isEnemy); if (sel.length) s.moveSelectedTo((MAP_W / 2) * TILE, MAP_OY + (MAP_H - 10) * TILE); });
        s.input.keyboard?.on('keydown-BACKTICK', () => s.scene.launch('SpriteEditorScene'));
    }

    _drawFurnishGhost(ptr) {
        const s = this.scene;
        if (ptr.y < MAP_OY || ptr.y > s.SH - (s.uiManager?.L?.PANEL_H ?? 190)) { s.hoverGfx?.clear(); return; }
        const tile = s.tileAt(ptr.worldX, ptr.worldY);
        if (!tile) { s.hoverGfx?.clear(); return; }
        const { tx, ty } = tile;
        const pad = 3, sz = TILE - pad * 2;
        const px = tx * TILE + pad, py = MAP_OY + ty * TILE + pad;
        const existing = s.constructManager.getAt(tx, ty);
        const col = existing ? 0xff4444 : 0xffffff;
        s.hoverGfx.clear()
            .fillStyle(col, 0.15).fillRect(px, py, sz, sz)
            .lineStyle(2, col, 0.7).strokeRect(px, py, sz, sz);
    }

    _drawWallGhost(ptr) {
        const s = this.scene;
        if (ptr.y < MAP_OY || ptr.y > s.SH - (s.uiManager?.L?.PANEL_H ?? 190)) { s.hoverGfx?.clear(); return; }
        const edge = s.constructManager.nearestEdge(ptr.worldX, ptr.worldY);
        if (!edge) { s.hoverGfx?.clear(); return; }
        const { isH, row, col } = edge;
        const px = col * TILE, py = MAP_OY + row * TILE;
        const existing = s.constructManager.getWall(isH, row, col);
        const W = 6; // mirror WallManager.W
        const col_c = existing ? 0xff4444 : s.constructManager.getMaterialColor(s.wallMaterial ?? 'Materials.Wood.Pine');
        const alpha = existing ? 0.9 : 0.7;
        s.hoverGfx.clear().fillStyle(col_c, alpha);
        if (isH) s.hoverGfx.fillRect(px, py - W / 2, TILE, W);
        else     s.hoverGfx.fillRect(px - W / 2, py, W, TILE);
    }

    _applyZonePaint(tx, ty) {
        const s = this.scene;
        if (!s.zoneManager) return;
        if (s.zoneMode === 'work')             s.zoneManager.paintWork(tx, ty);
        else if (s.zoneMode === 'storage')     s.zoneManager.paintStorage(tx, ty);
        else if (s.zoneMode === 'market')      s.zoneManager.paintMarket(tx, ty);
        else if (s.zoneMode === 'erase')       s.zoneManager.erase(tx, ty);
        else if (s.zoneMode?.startsWith('grow:'))
            s.zoneManager.paintGrow(tx, ty, s.zoneMode.split(':')[1]);
    }

    _drawZoneRectGhost(start, end) {
        const s = this.scene;
        const x1 = Math.min(start.tx, end.tx), x2 = Math.max(start.tx, end.tx);
        const y1 = Math.min(start.ty, end.ty), y2 = Math.max(start.ty, end.ty);
        let col = 0xffffff;
        if (s.zoneMode === 'work')         col = 0x4488ff;
        else if (s.zoneMode === 'storage') col = 0xffaa22;
        else if (s.zoneMode === 'market')  col = 0xddaa22;
        else if (s.zoneMode === 'erase')   col = 0xff4444;
        else if (s.zoneMode?.startsWith('grow:'))
            col = CROPS[s.zoneMode.split(':')[1]]?.zoneColor ?? 0x558833;
        const px = x1 * TILE, py = MAP_OY + y1 * TILE;
        const pw = (x2 - x1 + 1) * TILE, ph = (y2 - y1 + 1) * TILE;
        s.hoverGfx.clear()
            .fillStyle(col, 0.22).fillRect(px, py, pw, ph)
            .lineStyle(1, col, 0.85).strokeRect(px, py, pw, ph);
    }

    _drawZoneGhost(ptr) {
        const s = this.scene;
        if (ptr.y < MAP_OY || ptr.y > s.SH - (s.uiManager?.L?.PANEL_H ?? 190)) { s.hoverGfx?.clear(); return; }
        const tile = s.tileAt(ptr.worldX, ptr.worldY);
        if (!tile) { s.hoverGfx?.clear(); return; }
        const { tx, ty } = tile;
        const px = tx * TILE, py = MAP_OY + ty * TILE;
        let col;
        if (s.zoneMode === 'work')         col = 0x4488ff;
        else if (s.zoneMode === 'storage') col = 0xffaa22;
        else if (s.zoneMode === 'market')  col = 0xddaa22;
        else if (s.zoneMode === 'erase')   col = 0xff4444;
        else if (s.zoneMode?.startsWith('grow:'))
            col = CROPS[s.zoneMode.split(':')[1]]?.zoneColor ?? 0x558833;
        else col = 0xffffff;
        s.hoverGfx.clear()
            .fillStyle(col, 0.18).fillRect(px, py, TILE, TILE)
            .lineStyle(1, col, 0.7).strokeRect(px, py, TILE, TILE);
    }

    drawBuildGhost(ptr) {
        const s = this.scene;
        if (!s.constructType || ptr.y < MAP_OY || ptr.y > s.SH - (s.uiManager?.L?.PANEL_H ?? 190)) { s.hoverGfx?.clear(); return; }
        const tile = s.tileAt(ptr.worldX, ptr.worldY); if (!tile) { s.hoverGfx?.clear(); return; }
        const def = CONSTRUCTS[s.constructType];
        if (!def) { s.hoverGfx?.clear(); return; }
        const free = s.constructManager.isFree(tile.tx, tile.ty, def.width, def.height, s.constructType);
        const cost = s.economyManager.afford(def.cost ?? {}); // basic afford check
        const col = !free ? 0xff4444 : cost ? 0xffffff : 0xffaa44;
        const w = def.width * TILE, h = def.height * TILE, px = tile.tx * TILE, py = MAP_OY + tile.ty * TILE;
        s.hoverGfx.clear().fillStyle(col, 0.15).fillRect(px+1, py+1, w-2, h-2)
            .lineStyle(2, col, 0.6).strokeRect(px+1, py+1, w-2, h-2);
    }
}
