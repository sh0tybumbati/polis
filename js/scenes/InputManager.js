import {
    TAP_DIST, MAP_OY, MAP_W, MAP_BOTTOM, TILE, BLDG
} from '../config/gameConstants.js';

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
                    const edge = s.wallManager.nearestEdge(ptr.worldX, ptr.worldY);
                    s._wallDragErasing = edge ? !!s.wallManager.getWall(edge.isH, edge.row, edge.col) : false;
                }
                if (s.zoneMode) s._zoneDragTiles.clear();
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
            } else if (s.furnitureMode && !isUI) {
                if (!ptr.isDown) this._drawFurnishGhost(ptr);
            } else if (s.wallMode && !isUI) {
                if (ptr.isDown) {
                    const edge = s.wallManager.nearestEdge(ptr.worldX, ptr.worldY);
                    if (edge) {
                        const key = `${edge.isH}:${edge.row}:${edge.col}`;
                        if (!s._wallDragEdges.has(key)) {
                            s._wallDragEdges.add(key);
                            if (s._wallDragErasing) s.wallManager.removeWall(edge.isH, edge.row, edge.col);
                            else s.wallManager.placeWall(edge.isH, edge.row, edge.col, s.wallMaterial);
                            s.wallManager.renderWalls();
                        }
                    }
                } else {
                    this._drawWallGhost(ptr);
                }
            } else if (s.zoneMode && !isUI) {
                if (ptr.isDown) {
                    const t = s.tileAt(ptr.worldX, ptr.worldY);
                    if (t) {
                        const key = t.ty * MAP_W + t.tx;
                        if (!s._zoneDragTiles.has(key)) {
                            s._zoneDragTiles.add(key);
                            this._applyZonePaint(t.tx, t.ty);
                        }
                    }
                } else {
                    this._drawZoneGhost(ptr);
                }
            } else if (s.roadMode && ptr.isDown && !isUI) {
                const t = s.tileAt(ptr.worldX, ptr.worldY);
                if (t) s._paintRoad(t.tx, t.ty);
            } else if (!s.bldgType && !s.roadMode && !s.wallMode && ptr.isDown && !ptr.middleButtonDown() && !isUI) {
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
            } else if (s.bldgType && !ptr.isDown) {
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
            const bldg = s.findBuildingAt(wx, wy);
            const node = s.findNodeAt(wx, wy);

            const isTouch = s.sys.game.device.input.touch;

            if (s.zoneMode) { const t = s.tileAt(wx, wy); if (t) this._applyZonePaint(t.tx, t.ty); return; }
            if (s.roadMode) { const t = s.tileAt(wx, wy); if (t) s._paintRoad(t.tx, t.ty); return; }
            if (s.bldgType) { const t = s.tileAt(wx, wy); if (t) s.placeBuilding(t.tx, t.ty); return; }
            if (s.relocateMode) {
                const tile = s.tileAt(wx, wy);
                if (tile && s.relocateSrc) {
                    const { tx: sx, ty: sy } = s.relocateSrc;
                    if (tile.tx !== sx || tile.ty !== sy)
                        s.furnitureManager.relocate(sx, sy, tile.tx, tile.ty);
                }
                s.relocateMode = false; s.relocateSrc = null;
                s.selectedFurniture = null; s.hoverGfx?.clear(); s.updateUI();
                return;
            }
            if (s.furnitureMode) {
                const tile = s.tileAt(wx, wy);
                if (tile) {
                    const existing = s.furnitureManager.getAt(tile.tx, tile.ty);
                    if (existing) {
                        // Click built furniture to inspect; click unbuilt to cancel order
                        if (existing.built) { s.selectedFurniture = { tx: tile.tx, ty: tile.ty, item: existing }; s.furnitureMode = false; s.furnitureItemId = null; s.hoverGfx?.clear(); s.updateUI(); }
                        else s.furnitureManager.remove(tile.tx, tile.ty);
                    } else if (s.furnitureItemId) {
                        s.furnitureManager.placeOrder(tile.tx, tile.ty, s.furnitureItemId);
                    }
                }
                return;
            }
            if (s.wallMode) {
                // Drag already painted; single tap on a fresh edge also paints
                if (s._wallDragEdges.size === 0) {
                    const edge = s.wallManager.nearestEdge(wx, wy);
                    if (edge) {
                        const existing = s.wallManager.getWall(edge.isH, edge.row, edge.col);
                        if (existing) s.wallManager.removeWall(edge.isH, edge.row, edge.col);
                        else s.wallManager.placeWall(edge.isH, edge.row, edge.col, s.wallMaterial);
                        s.wallManager.renderWalls();
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
                    if (bldg && s.orderWorkersToBuilding(bldg)) return;
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
            s.deselect();
            s.selectedBuilding = null;
            s.selectedNode = null;
            s.selectedFurniture = null;
            s.selectedZoneTile = null;
            if (hit && !hit.isEnemy) { s.selectUnit(hit.id, ptr.event?.shiftKey ?? false); return; }
            if (bldg) { s.selectedBuilding = bldg; s.updateUI(); return; }
            if (node) { s.selectedNode = node; s.updateUI(); return; }
            const furnHit = s.furnitureManager?.findAt(wx, wy);
            if (furnHit) { s.selectedFurniture = furnHit; s.updateUI(); return; }

            const tile = s.tileAt(wx, wy);
            if (tile && s.zoneManager) {
                const zAt = s.zoneManager.getAt(tile.tx, tile.ty);
                if (zAt.work || zAt.storage) {
                    s.selectedZoneTile = { tx: tile.tx, ty: tile.ty };
                    s.updateUI(); return;
                }
            }

            if (s.selectedBuilding) { s.selectedBuilding = null; s.updateUI(); }
            if (s.selectedNode) { s.selectedNode = null; s.updateUI(); }
        });

        s.input.on('wheel', (ptr, _objs, _dx, dy) => {
            const cam = s.cameras.main;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.3, 3));
        });

        s.input.keyboard?.on('keydown-ESC', () => { s.bldgType = null; s.roadMode = false; s.wallMode = false; s.furnitureMode = false; s.furnitureItemId = null; s.relocateMode = false; s.relocateSrc = null; s.selectedFurniture = null; s.zoneMode = null; s.selectedZoneTile = null; s.deselect(); s.selectedBuilding = null; s.hoverGfx.clear(); s.updateUI(); });
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
        const existing = s.furnitureManager.getAt(tx, ty);
        const col = existing ? 0xff4444 : 0xffffff;
        s.hoverGfx.clear()
            .fillStyle(col, 0.15).fillRect(px, py, sz, sz)
            .lineStyle(2, col, 0.7).strokeRect(px, py, sz, sz);
    }

    _drawWallGhost(ptr) {
        const s = this.scene;
        if (ptr.y < MAP_OY || ptr.y > s.SH - (s.uiManager?.L?.PANEL_H ?? 190)) { s.hoverGfx?.clear(); return; }
        const edge = s.wallManager.nearestEdge(ptr.worldX, ptr.worldY);
        if (!edge) { s.hoverGfx?.clear(); return; }
        const { isH, row, col } = edge;
        const px = col * TILE, py = MAP_OY + row * TILE;
        const existing = s.wallManager.getWall(isH, row, col);
        const col_c = existing ? 0xff4444 : 0xc8a030;
        s.hoverGfx.clear().fillStyle(col_c, 0.85);
        if (isH) s.hoverGfx.fillRect(px, py - 2, TILE, 4);
        else     s.hoverGfx.fillRect(px - 2, py, 4, TILE);
    }

    _applyZonePaint(tx, ty) {
        const s = this.scene;
        if (!s.zoneManager) return;
        if (s.zoneMode === 'work')    s.zoneManager.paintWork(tx, ty);
        else if (s.zoneMode === 'storage') s.zoneManager.paintStorage(tx, ty);
        else if (s.zoneMode === 'erase')   s.zoneManager.erase(tx, ty);
    }

    _drawZoneGhost(ptr) {
        const s = this.scene;
        if (ptr.y < MAP_OY || ptr.y > s.SH - (s.uiManager?.L?.PANEL_H ?? 190)) { s.hoverGfx?.clear(); return; }
        const tile = s.tileAt(ptr.worldX, ptr.worldY);
        if (!tile) { s.hoverGfx?.clear(); return; }
        const { tx, ty } = tile;
        const px = tx * TILE, py = MAP_OY + ty * TILE;
        const col = s.zoneMode === 'work' ? 0x4488ff : s.zoneMode === 'storage' ? 0xffaa22 : 0xff4444;
        s.hoverGfx.clear()
            .fillStyle(col, 0.18).fillRect(px, py, TILE, TILE)
            .lineStyle(1, col, 0.7).strokeRect(px, py, TILE, TILE);
    }

    drawBuildGhost(ptr) {
        const s = this.scene;
        if (!s.bldgType || ptr.y < MAP_OY || ptr.y > s.SH - (s.uiManager?.L?.PANEL_H ?? 190)) { s.hoverGfx?.clear(); return; }
        const tile = s.tileAt(ptr.worldX, ptr.worldY); if (!tile) { s.hoverGfx?.clear(); return; }
        const def = BLDG[s.bldgType];
        const free = s.buildingManager.isFree(tile.tx, tile.ty, def.size, s.bldgType);
        const canAfford = !def.cost || s.economyManager.afford(def.cost);
        const col = !free ? 0xff4444 : canAfford ? 0xffffff : 0xffaa44;
        const size = def.size * TILE, px = tile.tx * TILE, py = MAP_OY + tile.ty * TILE;
        s.hoverGfx.clear().fillStyle(col, 0.15).fillRect(px+1, py+1, size-2, size-2)
            .lineStyle(2, col, 0.6).strokeRect(px+1, py+1, size-2, size-2);
    }
}
