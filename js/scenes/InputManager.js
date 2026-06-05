import {
    TAP_DIST, MAP_OY, TILE
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
            if (s.uiManager?._ctxMenuOpen) return;   // context menu open — its own zones handle input
            if (s._touches.size === 1) {
                s._ptrDownX = ptr.x; s._ptrDownY = ptr.y; s._dragging = false;
                if (s.wallMode) {
                    s._wallDragEdges.clear();
                    const edge = s.constructManager.nearestEdge(ptr.worldX, ptr.worldY);
                    s._wallDragErasing = edge ? !!s.constructManager.getWall(edge.isH, edge.row, edge.col) : false;
                }
                if (s.wallRectMode) {
                    const t = s.tileAt(ptr.worldX, ptr.worldY);
                    s._wallRectStart = t ? { tx: t.tx, ty: t.ty } : null;
                }
                if (s.zoneMode) {
                    s._zoneDragTiles.clear();
                    const _L = s.uiManager?.L;
                    const _uiH = (_L?.INSP_MAX_H ?? 0) + (_L?.TOOLBAR_H ?? 60);
                    const _inUI = ptr.y < MAP_OY || ptr.y > s.SH - _uiH;
                    const t = !_inUI && s.tileAt(ptr.worldX, ptr.worldY);
                    s._zoneDragStart = t ? { tx: t.tx, ty: t.ty } : null;
                }
                if (s.slateModeType) {
                    const n = s.findNodeAt(ptr.worldX, ptr.worldY);
                    s._slateDragErasing = n && s.slateNodeTypes?.includes(n.type) ? n.slated : false;
                    s._slatedThisDrag = new Set();
                    s._slateDragging = false;
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
            const _inMode = !!(s.zoneMode || s.roadMode || s.wallMode || s.wallRectMode || s.constructType || s.slateModeType || s.constructMode);
            const _Lpm = s.uiManager?.L;
            const _hasSel = !!(s.selIds?.size || s.selectedConstruct || s.selectedNode || s.selectedZoneTile || s.uiManager?._activePanel);
            const _blockH = _inMode
                ? (_Lpm?.TOOLBAR_H ?? 60)
                : _hasSel ? (_Lpm?.INSP_MAX_H ?? 190) + (_Lpm?.TOOLBAR_H ?? 60) : (_Lpm?.PANEL_H ?? 190);
            const isUI = ptr.y < MAP_OY || ptr.y > s.SH - _blockH;

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
                            else s.constructManager.placeWall(edge.isH, edge.row, edge.col);
                            s.constructManager.renderWalls();
                        }
                    }
                } else {
                    this._drawWallGhost(ptr);
                }
            } else if (s.wallRectMode && !isUI) {
                const t = s.tileAt(ptr.worldX, ptr.worldY);
                if (ptr.isDown && s._wallRectStart && t) {
                    this._drawWallRectGhost(s._wallRectStart, t);
                } else if (!ptr.isDown && t) {
                    this._drawWallRectGhost({ tx: t.tx, ty: t.ty }, { tx: t.tx, ty: t.ty });
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
            } else if (s.slateModeType && ptr.isDown && !isUI) {
                // Drag a rectangle to designate every matching node inside it (applied on release).
                // Draw an amber marquee so the area of effect is visible.
                s._slateDragging = true;
                const rx = Math.min(ptr.x, s._ptrDownX), ry = Math.min(ptr.y, s._ptrDownY);
                const rw = Math.abs(ptr.x - s._ptrDownX), rh = Math.abs(ptr.y - s._ptrDownY);
                const cl = Math.min(14, rw / 2, rh / 2);
                s.dragGfx.clear()
                    .fillStyle(0xffbb44, 0.16).fillRect(rx, ry, rw, rh)
                    .lineStyle(2, 0xffd277, 0.95).strokeRect(rx, ry, rw, rh);
                s.dragGfx.lineStyle(3, 0xffffff, 0.9);
                [[rx, ry, 1, 1], [rx + rw, ry, -1, 1], [rx, ry + rh, 1, -1], [rx + rw, ry + rh, -1, -1]]
                    .forEach(([px, py, sx2, sy2]) => {
                        s.dragGfx.lineBetween(px, py, px + sx2 * cl, py);
                        s.dragGfx.lineBetween(px, py, px, py + sy2 * cl);
                    });
                s.hoverGfx.clear();
            } else if (!s.constructType && !s.roadMode && !s.wallMode && !s.slateModeType && ptr.isDown && !ptr.middleButtonDown() && !isUI) {
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
                        // Box select — bright marquee so the area of effect is clearly visible
                        s._dragging = true;
                        const rx = Math.min(ptr.x, s._ptrDownX), ry = Math.min(ptr.y, s._ptrDownY);
                        const rw = Math.abs(ptr.x - s._ptrDownX), rh = Math.abs(ptr.y - s._ptrDownY);
                        const cl = Math.min(14, rw / 2, rh / 2);   // corner-bracket length
                        s.dragGfx.clear()
                            .fillStyle(0x66ccff, 0.18).fillRect(rx, ry, rw, rh)
                            .lineStyle(2, 0x99e0ff, 0.95).strokeRect(rx, ry, rw, rh);
                        // accent corner brackets
                        s.dragGfx.lineStyle(3, 0xffffff, 0.9);
                        [[rx, ry, 1, 1], [rx + rw, ry, -1, 1], [rx, ry + rh, 1, -1], [rx + rw, ry + rh, -1, -1]]
                            .forEach(([px, py, sx2, sy2]) => {
                                s.dragGfx.lineBetween(px, py, px + sx2 * cl, py);
                                s.dragGfx.lineBetween(px, py, px, py + sy2 * cl);
                            });
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
            if (s.uiManager?._ctxMenuOpen) return;   // context menu open — let its zones handle the click

            // Designation drag (forage / woodcutting / mining): apply to every matching node inside
            // the dragged rectangle. A plain tap (no drag) falls through to the single-node toggle.
            if (s.slateModeType && s._slateDragging) {
                s._slateDragging = false;
                const moved = Phaser.Math.Distance.Between(ptr.x, ptr.y, s._ptrDownX, s._ptrDownY) >= TAP_DIST;
                if (moved) {
                    const cam = s.cameras.main;
                    const tl = cam.getWorldPoint(Math.min(ptr.x, s._ptrDownX), Math.min(ptr.y, s._ptrDownY));
                    const br = cam.getWorldPoint(Math.max(ptr.x, s._ptrDownX), Math.max(ptr.y, s._ptrDownY));
                    const erasing = s._slateDragErasing;
                    let cnt = 0;
                    for (const n of s.resNodes ?? []) {
                        if (!s.slateNodeTypes?.includes(n.type)) continue;
                        if (n.x < tl.x || n.x > br.x || n.y < tl.y || n.y > br.y) continue;
                        n.slated    = !erasing;
                        n.slateType = n.slated ? s.slateModeType : null;
                        s.mapManager?.redrawNode(n);
                        cnt++;
                    }
                    if (cnt > 0) s.uiManager?.showFloatText?.(ptr.worldX, ptr.worldY - 10,
                        `${erasing ? 'cleared' : 'marked'} ${cnt}`, erasing ? '#cc8866' : '#ffd277');
                    s.updateUI();
                    return;
                }
            }

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

            {
                const L = s.uiManager?.L;
                const hasSel = (s.selIds?.size ?? 0) > 0 || !!s.selectedConstruct || !!s.selectedNode || !!s.selectedZoneTile;
                const inMode = !!(s.zoneMode || s.roadMode || s.wallMode || s.wallRectMode || s.constructType || s.slateModeType || s.constructMode);
                const blockH = L
                    ? (inMode ? L.TOOLBAR_H : (hasSel || s.uiManager?._activePanel) ? L.INSP_MAX_H + L.TOOLBAR_H : L.TOOLBAR_H)
                    : 190;
                if (ptr.y < MAP_OY || ptr.y > s.SH - blockH) return;
            }
            // Zone mode: commit the painted rect regardless of drag distance
            if (s.zoneMode) {
                const wx = ptr.worldX, wy = ptr.worldY;
                const t = s.tileAt(wx, wy);
                const isGrow = s.zoneMode === 'grow';
                const startTile = s._zoneDragStart;
                if (t && startTile) {
                    const x1 = Math.min(startTile.tx, t.tx), x2 = Math.max(startTile.tx, t.tx);
                    const y1 = Math.min(startTile.ty, t.ty), y2 = Math.max(startTile.ty, t.ty);
                    for (let ry = y1; ry <= y2; ry++)
                        for (let rx = x1; rx <= x2; rx++)
                            this._applyZonePaint(rx, ry);
                    if (isGrow) {
                        s.zoneMode = null;
                        const { tiles, zoneType, cropKey } = s.zoneManager.getConnectedTiles(startTile.tx, startTile.ty);
                        if (tiles.length) {
                            s.selectedZoneTile  = { tx: startTile.tx, ty: startTile.ty };
                            s.selectedZoneTiles = tiles;
                            s.selectedZoneType  = zoneType;
                            s.selectedZoneCrop  = cropKey;
                            s.zoneManager.setSelection(tiles, 0x88ee55);
                        }
                    }
                }
                s._zoneDragStart = null;
                s.hoverGfx?.clear();
                s.updateUI();
                return;
            }

            const wasTap = Phaser.Math.Distance.Between(ptr.x, ptr.y, s._ptrDownX, s._ptrDownY) < TAP_DIST;
            if (!wasTap) return;
            const wx = ptr.worldX, wy = ptr.worldY;
            const hit = s.unitAt(wx, wy);
            const construct = s.findConstructAt(wx, wy);
            const node = s.findNodeAt(wx, wy);

            // Slate mode: tap on a node to toggle it (drag-to-slate is handled in pointermove)
            if (s.slateModeType && node && s.slateNodeTypes?.includes(node.type)) {
                node.slated    = !node.slated;
                node.slateType = node.slated ? s.slateModeType : null;
                s.mapManager?.redrawNode(node);
                s.updateUI();
                return;
            }

            const isTouch = s.sys.game.device.input.touch;

            if (s.zoneMode) {
                // (unreachable — handled above, kept as safety fallback)
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
            if (s.wallRectMode) {
                const t = s.tileAt(wx, wy);
                if (t && s._wallRectStart) this._commitWallRect(s._wallRectStart, t);
                s._wallRectStart = null;
                s.hoverGfx?.clear();
                return;
            }
            if (s.wallMode) {
                // Drag already painted; single tap on a fresh edge also paints
                if (s._wallDragEdges.size === 0) {
                    const edge = s.constructManager.nearestEdge(wx, wy);
                    if (edge) {
                        const existing = s.constructManager.getWall(edge.isH, edge.row, edge.col);
                        if (existing) s.constructManager.removeWall(edge.isH, edge.row, edge.col);
                        else s.constructManager.placeWall(edge.isH, edge.row, edge.col);
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
                    // A further right-click while the menu is open just dismisses it.
                    if (s.uiManager?._ctxMenuOpen) { s.uiManager.closeContextMenu(); return; }
                    // Touch: double-tap empty space deselects.
                    if (isTouch) {
                        const now = Date.now();
                        const doubleTap = (now - this._lastTapTime < 350) &&
                            Phaser.Math.Distance.Between(wx, wy, this._lastTapX, this._lastTapY) < 48;
                        this._lastTapTime = now; this._lastTapX = wx; this._lastTapY = wy;
                        if (doubleTap) { s.deselect(); return; }
                    }
                    // Gather every order possible here. 0 task verbs → move; 1 → do it
                    // (blind, with float-text confirmation); 2+ → show the action menu.
                    const acts = s.actionsAt(wx, wy);
                    const tasks = acts.filter(a => a.id !== 'move');
                    if (tasks.length === 0) s.moveSelectedTo(wx, wy);
                    else if (tasks.length === 1) tasks[0].exec();
                    else s.uiManager?.showContextMenu(ptr.x, ptr.y, acts);
                }
                return;
            }

            // Left click: select — capture workers BEFORE deselect clears s.selIds
            const preWorkers = s.selIds?.size > 0
                ? s.units.filter(u => s.selIds.has(u.id) && u.type === 'worker' && u.age >= 2)
                : [];
            s.deselect();
            s.selectedConstruct = null;
            s.selectedNode = null;
            s.selectedGroundTile = null;
            s.zoneManager?.clearSelection();
            s.selectedZoneTile  = null;
            s.selectedZoneTiles = null;
            s.selectedZoneType  = null;
            s.selectedZoneCrop  = null;
            if (hit && !hit.isEnemy) { s.selectUnit(hit.id, ptr.event?.shiftKey ?? false); return; }
            if (construct) { s.selectedConstruct = construct; s.updateUI(); return; }
            // Nodes are not inspected via left-click — no info panel pops open. To put workers on
            // a node, select them and right-click it (orderWorkersToNode).
            if (node) { s.updateUI(); return; }
            const furnHit = s.constructManager?.findConstructAt(wx, wy);
            if (furnHit) { s.selectedConstruct = furnHit; s.updateUI(); return; }

            // Edge constructs (walls / gates / doors / fences) — selectable when the click
            // lands on a tile border (nearestEdge returns null otherwise).
            const edge = s.constructManager?.nearestEdge(wx, wy);
            const edgeC = edge ? s.constructManager.getEdge(edge.isH, edge.row, edge.col) : null;
            if (edgeC) { s.selectedConstruct = edgeC; s.updateUI(); return; }

            // Check for ground item piles near click
            const nearItem = s.groundItems?.find(i => Math.abs(i.x - wx) < 10 && Math.abs(i.y - wy) < 10);
            if (nearItem) {
                const [gtx, gty] = nearItem.subKey.split(',').map(Number);
                s.selectedGroundTile = { tx: gtx, ty: gty };
                s.updateUI(); return;
            }

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
                    // Assign pre-captured workers to this zone
                    if (preWorkers.length > 0) {
                        if (zoneType === 'grow') {
                            preWorkers.forEach(u => {
                                u.vocation = 'farmer'; u.role = 'farmer';
                                u.taskType = null; u.targetNode = null; u.moveTo = null;
                            });
                            s.uiManager?.showFloatText?.(tile.tx * TILE + TILE / 2, MAP_OY + tile.ty * TILE, '→ farm', '#88ee55');
                        } else if (zoneType === 'storage') {
                            // Route workers carrying anything to deposit here immediately
                            const zm = s.zoneManager;
                            preWorkers.forEach(u => {
                                const carrying = Object.values(u.carrying ?? {}).some(v => v > 0);
                                if (carrying) {
                                    u.taskType = 'deposit_zone';
                                    u.taskZoneKey = zm.tileKey(tile.tx, tile.ty);
                                }
                            });
                            s.uiManager?.showFloatText?.(tile.tx * TILE + TILE / 2, MAP_OY + tile.ty * TILE, '→ deposit', '#ffcc44');
                        } else if (zoneType === 'market') {
                            preWorkers.forEach(u => {
                                u.vocation = 'merchant'; u.role = 'merchant';
                                u.taskType = null; u.targetNode = null; u.moveTo = null;
                            });
                            s.uiManager?.showFloatText?.(tile.tx * TILE + TILE / 2, MAP_OY + tile.ty * TILE, '→ market', '#ffdd66');
                        }
                    }
                    s.updateUI(); return;
                }
            }

            s.updateUI();
        });

        s.input.on('wheel', (ptr, _objs, _dx, dy) => {
            const cam = s.cameras.main;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.3, 3));
        });

        s.input.keyboard?.on('keydown-ESC', () => {
            // Close an open right-click action menu first
            if (s.uiManager?._ctxMenuOpen) { s.uiManager.closeContextMenu(); return; }
            // If settings panel is open, close it and return to pause menu
            if (s.uiManager?._settingsMenuOpen) { s.uiManager.hideSettingsPanel(); s.uiManager.showPauseMenu(); return; }
            // If pause menu is open, close it and resume
            if (s.uiManager?._pauseMenuOpen) { s.uiManager.hidePauseMenu(); return; }
            // Check if anything is currently active/selected
            const hasActive = s.constructType || s.roadMode || s.wallMode || s.wallRectMode ||
                s.constructMode || s.placementType || s.relocateMode || s.zoneMode ||
                s.selectedConstruct || s.selectedZoneTile || s.selectedZoneTiles ||
                s.selectedGroundTile || s.units?.some(u => u.selected);
            if (hasActive) {
                s.constructType = null; s.roadMode = false; s.wallMode = false;
                s.wallRectMode = false; s._wallRectStart = null; s.constructMode = false;
                s.placementType = null; s.relocateMode = false; s.relocateSrc = null;
                s.selectedConstruct = null; s.zoneMode = null; s._zoneDragStart = null;
                s.selectedZoneTile = null; s.selectedZoneTiles = null;
                s.selectedZoneType = null; s.selectedZoneCrop = null;
                s.selectedGroundTile = null;
                s.zoneManager?.clearSelection(); s.deselect(); s.selectedConstruct = null;
                s.hoverGfx.clear(); s.updateUI();
            } else {
                // Nothing active — open pause menu
                s.uiManager?.showPauseMenu();
            }
        });
        s.input.keyboard?.on('keydown-A', () => s.units.filter(u => !u.isEnemy).forEach(u => s.selectUnit(u.id, true)));
        s.input.keyboard?.on('keydown-F', () => { const sel = s.units.filter(u => u.selected && !u.isEnemy); if (sel.length) s.moveSelectedTo((s.spawnTx ?? 0) * TILE, MAP_OY + (s.spawnTy ?? 0) * TILE); });
        s.input.keyboard?.on('keydown-BACKTICK', () => s.scene.launch('SpriteEditorScene'));
        // Debug: spawn a rig-animated critter at the camera centre (proves the sprite pipeline).
        s.input.keyboard?.on('keydown-K', () => {
            const cam = s.cameras.main;
            s.natureManager?.spawnCritter(cam.scrollX + cam.width / (2 * cam.zoom),
                                          cam.scrollY + cam.height / (2 * cam.zoom));
        });

        // Arrow key camera pan — held keys give continuous smooth scroll
        const cursors = s.input.keyboard?.createCursorKeys();
        if (cursors) {
            s.events.on('update', () => {
                const cam = s.cameras.main;
                const spd = 10 / cam.zoom;
                if (cursors.left.isDown)  cam.scrollX -= spd;
                if (cursors.right.isDown) cam.scrollX += spd;
                if (cursors.up.isDown)    cam.scrollY -= spd;
                if (cursors.down.isDown)  cam.scrollY += spd;
            });
        }
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
        const wallType = s.wallType ?? 'wall_edge';
        const wallMat  = s.constructMaterials?.[wallType] ?? CONSTRUCTS[wallType]?.allowedMaterials?.[0] ?? 'Materials.Stone.Limestone';
        const col_c = existing ? 0xff4444 : s.constructManager.getMaterialColor(wallMat);
        const alpha = existing ? 0.9 : 0.7;
        s.hoverGfx.clear().fillStyle(col_c, alpha);
        if (isH) s.hoverGfx.fillRect(px, py - W / 2, TILE, W);
        else     s.hoverGfx.fillRect(px - W / 2, py, W, TILE);
    }

    _drawWallRectGhost(start, end) {
        const s = this.scene;
        const x1 = Math.min(start.tx, end.tx), x2 = Math.max(start.tx, end.tx);
        const y1 = Math.min(start.ty, end.ty), y2 = Math.max(start.ty, end.ty);
        const wallType = s.wallType ?? 'wall_edge';
        const wallMat  = s.constructMaterials?.[wallType] ?? CONSTRUCTS[wallType]?.allowedMaterials?.[0] ?? 'Materials.Stone.Limestone';
        const col = s.constructManager.getMaterialColor(wallMat);
        const W = 6;
        s.hoverGfx.clear().fillStyle(col, 0.6);
        // Top & bottom horizontal edges
        for (let tx = x1; tx <= x2; tx++) {
            s.hoverGfx.fillRect(tx * TILE, MAP_OY + y1 * TILE - W / 2, TILE, W);
            s.hoverGfx.fillRect(tx * TILE, MAP_OY + (y2 + 1) * TILE - W / 2, TILE, W);
        }
        // Left & right vertical edges
        for (let ty = y1; ty <= y2; ty++) {
            s.hoverGfx.fillRect(x1 * TILE - W / 2, MAP_OY + ty * TILE, W, TILE);
            s.hoverGfx.fillRect((x2 + 1) * TILE - W / 2, MAP_OY + ty * TILE, W, TILE);
        }
        // Size label
        const w = x2 - x1 + 1, h = y2 - y1 + 1;
        const cx = (x1 + x2 + 1) / 2 * TILE, cy = MAP_OY + (y1 + y2 + 1) / 2 * TILE;
        s.hoverGfx.fillStyle(0x000000, 0.55).fillRect(cx - 20, cy - 8, 40, 16);
        // (text drawn as world text would need separate object — skip for now, size is visible from grid)
    }

    _commitWallRect(start, end) {
        const s = this.scene;
        const cm = s.constructManager;
        const x1 = Math.min(start.tx, end.tx), x2 = Math.max(start.tx, end.tx);
        const y1 = Math.min(start.ty, end.ty), y2 = Math.max(start.ty, end.ty);
        // Top & bottom horizontal walls
        for (let tx = x1; tx <= x2; tx++) {
            cm.placeWall(true, y1, tx);
            cm.placeWall(true, y2 + 1, tx);
        }
        // Left & right vertical walls
        for (let ty = y1; ty <= y2; ty++) {
            cm.placeWall(false, ty, x1);
            cm.placeWall(false, ty, x2 + 1);
        }
        cm.renderWalls();
    }

    _applyZonePaint(tx, ty) {
        const s = this.scene;
        if (!s.zoneManager) return;
        if (s.zoneMode === 'work')             s.zoneManager.paintWork(tx, ty);
        else if (s.zoneMode === 'storage')     s.zoneManager.paintStorage(tx, ty);
        else if (s.zoneMode === 'market')      s.zoneManager.paintMarket(tx, ty);
        else if (s.zoneMode === 'erase')       s.zoneManager.erase(tx, ty);
        else if (s.zoneMode === 'roof')        s.roofManager?.planRoof(tx, ty, { auto: false });
        else if (s.zoneMode === 'roof_remove') s.roofManager?.removeRoof(tx, ty);
        else if (s.zoneMode === 'grow')
            s.zoneManager.paintGrow(tx, ty, null);
        else if (s.zoneMode?.startsWith('grow:'))
            s.zoneManager.paintGrow(tx, ty, s.zoneMode.split(':')[1]);
    }

    _drawZoneRectGhost(start, end) {
        const s = this.scene;
        const x1 = Math.min(start.tx, end.tx), x2 = Math.max(start.tx, end.tx);
        const y1 = Math.min(start.ty, end.ty), y2 = Math.max(start.ty, end.ty);
        // Roof: tint each tile by support — green where a roof can go, red where it's out of range.
        if (s.zoneMode === 'roof') {
            s.hoverGfx.clear();
            for (let ry = y1; ry <= y2; ry++) for (let rx = x1; rx <= x2; rx++) {
                const ok = s.roofManager?.isSupported(rx, ry);
                const c  = ok ? 0x66ccdd : 0xff4444;
                s.hoverGfx.fillStyle(c, ok ? 0.22 : 0.30)
                    .fillRect(rx * TILE, MAP_OY + ry * TILE, TILE, TILE);
            }
            s.hoverGfx.lineStyle(1, 0x66ccdd, 0.6)
                .strokeRect(x1 * TILE, MAP_OY + y1 * TILE, (x2 - x1 + 1) * TILE, (y2 - y1 + 1) * TILE);
            return;
        }
        let col = 0xffffff;
        if (s.zoneMode === 'work')         col = 0x4488ff;
        else if (s.zoneMode === 'storage') col = 0xffaa22;
        else if (s.zoneMode === 'market')  col = 0xddaa22;
        else if (s.zoneMode === 'erase' || s.zoneMode === 'roof_remove') col = 0xff4444;
        else if (s.zoneMode === 'grow')    col = 0x558833;
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
        else if (s.zoneMode === 'grow')    col = 0x558833;
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
