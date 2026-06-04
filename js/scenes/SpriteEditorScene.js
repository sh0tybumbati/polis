/**
 * SpriteEditorScene — a part-rig sprite editor.
 *
 * Draws through Phaser Graphics + the shared renderShapes / renderRig pipeline (the
 * previous "advanced" rewrite grabbed a 2D canvas context on the WebGL canvas and
 * crashed every frame — see git history). Authors a "rig": named body-part groups of
 * shapes, each with a pivot, plus optional keyframe animation clips. Standard part
 * names (legL/legR/armL/armR/head/torso/tail) auto-animate from walkPhase; authored
 * clips override per part.
 *
 * Workflow:
 *   • Import an image → vectorize.js traces it into polygons grouped by colour, one
 *     part per colour group (a starting point for body parts).
 *   • Tap the canvas to add shapes to the active part; drag to move; nudge in the panel.
 *   • Manage parts (add/rename/select/pivot/z) in the Parts panel.
 *   • Author a walk clip: scrub the playhead, set a pose for the active part, Add Key.
 *   • Export a ready-to-drop .js module for js/content/sprites/; WIP autosaves to
 *     localStorage.
 *
 * Launched in-game with the backtick key (InputManager). ESC closes.
 */

import { renderShapes, res } from '../engine/renderShapes.js';
import { renderRig } from '../engine/renderRig.js';
import { vectorizeImage } from '../engine/vectorize.js';
import { SPRITES } from '../content/sprites/index.js';

const PALETTE = [
    0xccccaa, 0xffdd44, 0x66dd44, 0xee4466, 0x9999bb, 0xf0ece0, 0xdd8833, 0xffaa22,
    0x111111, 0x444444, 0x888888, 0xdddddd, 0xaa7733, 0xcc9944, 0xffdd88, 0xffaa44,
    0x88cc44, 0xdd5533, 0xddcc66, 0xaaaadd, 0xeeddcc, 0xcc8855, 0x55aa55, 0xaa8844,
];
const SHAPE_TYPES = [['○', 'circle'], ['△', 'triangle'], ['□', 'rect'], ['—', 'line'], ['⬠', 'polygon'], ['◯', 'ellipse']];
const AUTOSAVE_KEY = 'spriteEditorRig';
const STD_PARTS = ['legL', 'legR', 'armL', 'armR', 'head', 'torso', 'tail'];

export default class SpriteEditorScene extends Phaser.Scene {
    constructor() { super({ key: 'SpriteEditorScene' }); }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this.W = W; this.H = H;
        this.CW = Math.min(Math.floor(W * 0.52), 420);   // canvas column width
        this.PW = W - this.CW - 4;                        // property column width
        this.CX = Math.floor(this.CW / 2);
        this.CY = Math.floor(H / 2);
        this.PX = this.CW + 4;
        this.VS = 7;                                      // view scale (px per rig unit)

        // Editor state
        this.activePart = 0;
        this.selIdx = -1;
        this.newType = 'circle';
        this.newFill = 0xccccaa;
        this.newAlpha = 1.0;
        this.gridSnap = true;
        this.pv = {};                                     // $var resolution for fills (none yet)

        // Animation authoring
        this.activeClip = 'walk';
        this.playhead = 0;
        this.playing = false;
        this._phase = 0;
        this.pose = { rot: 0, x: 0, y: 0 };

        // Undo / redo / clipboard
        this.undoStack = [];
        this.redoStack = [];
        this.clipboard = null;

        this._drag = null;
        this._listScroll = 0;
        this._uiObjs = [];
        this._exportOverlay = null;

        // Graphics layers (depth order: bg < grid < shapes < selection < ui)
        this.bgGfx   = this.add.graphics().setDepth(0);
        this.gridGfx = this.add.graphics().setDepth(1);
        this.shpGfx  = this.add.graphics().setDepth(2);
        this.selGfx  = this.add.graphics().setDepth(3);
        this.uiGfx   = this.add.graphics().setDepth(8);

        this.rig = this._loadAutosave() || this._blankRig();
        this._fitView();
        this._buildInput();
        this._redraw();
    }

    // ── Rig model ────────────────────────────────────────────────────────────────

    _blankRig() {
        return { id: 'sprite', version: 1, origin: { x: 0, y: 0 },
            parts: [{ name: 'part1', pivot: { x: 0, y: 0 }, z: 0, shapes: [] }], clips: {} };
    }

    activeShapes() { return this.rig.parts[this.activePart]?.shapes ?? []; }

    _clone(o) { return JSON.parse(JSON.stringify(o)); }

    // ── Persistence ───────────────────────────────────────────────────────────────

    _autosave() {
        try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.rig)); } catch (e) { /* quota */ }
    }
    _loadAutosave() {
        try {
            const raw = localStorage.getItem(AUTOSAVE_KEY);
            if (!raw) return null;
            const r = JSON.parse(raw);
            if (r && Array.isArray(r.parts) && r.parts.length) return r;
        } catch (e) { /* corrupt */ }
        return null;
    }

    // ── Undo / redo ───────────────────────────────────────────────────────────────

    _pushUndo() {
        this.undoStack.push(JSON.stringify(this.rig));
        if (this.undoStack.length > 64) this.undoStack.shift();
        this.redoStack.length = 0;
        this._autosave();
    }
    _undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(JSON.stringify(this.rig));
        this.rig = JSON.parse(this.undoStack.pop());
        this._clampSelection(); this._autosave(); this._redraw();
    }
    _redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(JSON.stringify(this.rig));
        this.rig = JSON.parse(this.redoStack.pop());
        this._clampSelection(); this._autosave(); this._redraw();
    }
    _clampSelection() {
        if (this.activePart >= this.rig.parts.length) this.activePart = this.rig.parts.length - 1;
        if (this.activePart < 0) this.activePart = 0;
        if (this.selIdx >= this.activeShapes().length) this.selIdx = -1;
    }

    // ── Coordinate mapping (rig units ↔ screen) ─────────────────────────────────────

    _sx(x) { return this.CX + x * this.VS; }
    _sy(y) { return this.CY + y * this.VS; }
    _gx(px) { return (px - this.CX) / this.VS; }
    _gy(py) { return (py - this.CY) / this.VS; }

    _fitView() {
        const b = this._rigBounds();
        if (!b) { this.VS = 7; return; }
        const w = Math.max(4, b.maxX - b.minX), h = Math.max(4, b.maxY - b.minY);
        this.VS = Math.max(1, Math.min(12, Math.floor(Math.min(this.CW, this.H) * 0.7 / Math.max(w, h))));
    }
    _rigBounds() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
        for (const part of this.rig.parts) for (const s of part.shapes) {
            const b = this._shapeBounds(s); if (!b) continue;
            any = true;
            minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
            maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
        }
        return any ? { minX, minY, maxX, maxY } : null;
    }

    // ── Shape geometry helpers ──────────────────────────────────────────────────────

    _shapeBounds(s) {
        const v = this.pv;
        switch (s.type) {
            case 'circle':  { const x = res(s.x,v), y = res(s.y,v), r = res(s.r,v); return { minX:x-r,minY:y-r,maxX:x+r,maxY:y+r }; }
            case 'ellipse': { const x = res(s.x,v), y = res(s.y,v), rx = res(s.rx,v), ry = res(s.ry,v); return { minX:x-rx,minY:y-ry,maxX:x+rx,maxY:y+ry }; }
            case 'rect':    { const x = res(s.x,v), y = res(s.y,v); return { minX:x,minY:y,maxX:x+res(s.w,v),maxY:y+res(s.h,v) }; }
            case 'triangle':{ const xs=[res(s.x1,v),res(s.x2,v),res(s.x3,v)], ys=[res(s.y1,v),res(s.y2,v),res(s.y3,v)]; return { minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys) }; }
            case 'line':    { const xs=[res(s.x1,v),res(s.x2,v)], ys=[res(s.y1,v),res(s.y2,v)]; return { minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys) }; }
            case 'polygon': { if (!s.points?.length) return null; let a={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}; for (const p of s.points){a.minX=Math.min(a.minX,p.x);a.minY=Math.min(a.minY,p.y);a.maxX=Math.max(a.maxX,p.x);a.maxY=Math.max(a.maxY,p.y);} return a; }
        }
        return null;
    }
    _shapeCenter(s) { const b = this._shapeBounds(s); return b ? { x:(b.minX+b.maxX)/2, y:(b.minY+b.maxY)/2 } : { x:0, y:0 }; }

    _translateShape(s, dx, dy) {
        const mv = f => { if (typeof s[f] === 'number') s[f] += dx; };
        const mvY = f => { if (typeof s[f] === 'number') s[f] += dy; };
        switch (s.type) {
            case 'circle': case 'ellipse': case 'rect': mv('x'); mvY('y'); break;
            case 'triangle': mv('x1'); mvY('y1'); mv('x2'); mvY('y2'); mv('x3'); mvY('y3'); break;
            case 'line': mv('x1'); mvY('y1'); mv('x2'); mvY('y2'); break;
            case 'polygon': for (const p of s.points) { p.x += dx; p.y += dy; } break;
        }
    }

    _hitTest(s, gx, gy) {
        const b = this._shapeBounds(s); if (!b) return false;
        const PAD = 3;
        return gx >= b.minX - PAD && gx <= b.maxX + PAD && gy >= b.minY - PAD && gy <= b.maxY + PAD;
    }

    // ── Shape manipulation ──────────────────────────────────────────────────────────

    _placeShape(gx, gy) {
        const s = { type: this.newType, alpha: this.newAlpha };
        if (this.newType !== 'line') s.fill = this.newFill;
        switch (this.newType) {
            case 'circle':   Object.assign(s, { x: gx, y: gy, r: 4 }); break;
            case 'ellipse':  Object.assign(s, { x: gx, y: gy, rx: 5, ry: 3 }); break;
            case 'triangle': Object.assign(s, { x1: gx, y1: gy - 5, x2: gx - 4, y2: gy + 3, x3: gx + 4, y3: gy + 3 }); break;
            case 'rect':     Object.assign(s, { x: gx - 4, y: gy - 3, w: 8, h: 6 }); break;
            case 'line':     Object.assign(s, { x1: gx - 4, y1: gy, x2: gx + 4, y2: gy, stroke: { color: this.newFill, width: 1 } }); break;
            case 'polygon':  Object.assign(s, { points: [{ x: gx, y: gy - 4 }, { x: gx - 4, y: gy + 4 }, { x: gx + 4, y: gy + 4 }] }); break;
        }
        this.activeShapes().push(s);
        this.selIdx = this.activeShapes().length - 1;
    }

    _deleteSelected() {
        const sh = this.activeShapes();
        if (this.selIdx < 0 || this.selIdx >= sh.length) return;
        this._pushUndo();
        sh.splice(this.selIdx, 1);
        this.selIdx = Math.min(this.selIdx, sh.length - 1);
    }

    _nudge(field, delta) {
        if (this.selIdx < 0) return;
        const s = this.activeShapes()[this.selIdx];
        if (typeof s[field] === 'number') s[field] = Math.round((s[field] + delta) * 10) / 10;
        this._autosave(); this._redraw();
    }

    // ── Parts ──────────────────────────────────────────────────────────────────────

    _addPart() {
        this._pushUndo();
        const n = this.rig.parts.length + 1;
        this.rig.parts.push({ name: `part${n}`, pivot: { x: 0, y: 0 }, z: n - 1, shapes: [] });
        this.activePart = this.rig.parts.length - 1;
        this.selIdx = -1;
    }
    _cyclePartName(dir) {
        const part = this.rig.parts[this.activePart]; if (!part) return;
        // cycle through standard limb names + the part's own custom name
        const opts = [...STD_PARTS, part.name].filter((v, i, a) => a.indexOf(v) === i);
        const cur = opts.indexOf(part.name);
        this._pushUndo();
        part.name = opts[(cur + dir + opts.length) % opts.length];
        this._redraw();
    }
    _setPivotToSelection() {
        const part = this.rig.parts[this.activePart]; if (!part) return;
        this._pushUndo();
        if (this.selIdx >= 0) {
            const c = this._shapeCenter(this.activeShapes()[this.selIdx]);
            part.pivot = { x: Math.round(c.x), y: Math.round(c.y) };
        } else {
            const b = this._partBounds(part);
            if (b) part.pivot = { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) };
        }
        this._redraw();
    }
    _partBounds(part) {
        let a = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, any = false;
        for (const s of part.shapes) { const b = this._shapeBounds(s); if (!b) continue; any = true; a.minX=Math.min(a.minX,b.minX);a.minY=Math.min(a.minY,b.minY);a.maxX=Math.max(a.maxX,b.maxX);a.maxY=Math.max(a.maxY,b.maxY); }
        return any ? a : null;
    }

    // ── Image import → vectorize → parts-by-colour ───────────────────────────────────

    _importImage() {
        let input = this._fileInput;
        if (!input) {
            input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.style.display = 'none';
            (document.getElementById('game') || document.body).appendChild(input);
            this._fileInput = input;
        }
        input.value = '';
        input.onchange = () => {
            const file = input.files?.[0]; if (!file) return;
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                this._vectorizeAndLoad(img);
            };
            img.onerror = () => URL.revokeObjectURL(url);
            img.src = url;
        };
        input.click();
    }

    _vectorizeAndLoad(img) {
        // Scale to a sane working size (≤ 120px on the long edge) for fast tracing.
        const maxEdge = 120;
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxEdge) { const k = maxEdge / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
        const cnv = document.createElement('canvas');
        cnv.width = w; cnv.height = h;
        const ctx = cnv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);

        const { shapes, groups } = vectorizeImage(imageData, { colorCount: 6, resolution: 4, maxShapes: 80 });
        if (!shapes.length) return;

        this._pushUndo();
        // One part per colour group → seed body parts.
        const parts = groups.map((g, i) => {
            const partShapes = g.shapeIndices.map(si => shapes[si]).filter(Boolean).map(s => this._clone(s));
            const part = { name: `part${i + 1}`, pivot: { x: 0, y: 0 }, z: i, shapes: partShapes };
            const b = this._partBounds(part);
            if (b) part.pivot = { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) };
            return part;
        }).filter(p => p.shapes.length);

        this.rig = { id: 'traced', version: 1, origin: { x: 0, y: 0 }, parts: parts.length ? parts : this._blankRig().parts, clips: {} };
        this.activePart = 0; this.selIdx = -1;
        this._recenter();
        this._fitView();
        this._autosave();
        this._redraw();
    }

    _recenter() {
        const b = this._rigBounds(); if (!b) return;
        const cx = Math.round((b.minX + b.maxX) / 2), cy = Math.round((b.minY + b.maxY) / 2);
        for (const part of this.rig.parts) {
            for (const s of part.shapes) this._translateShape(s, -cx, -cy);
            part.pivot = { x: part.pivot.x - cx, y: part.pivot.y - cy };
        }
        // Origin at horizontal centre, bottom (feet).
        const nb = this._rigBounds();
        this.rig.origin = { x: 0, y: nb ? Math.round(nb.maxY) : 0 };
    }

    // ── Keyframe authoring ───────────────────────────────────────────────────────────

    _ensureClip() {
        if (!this.rig.clips) this.rig.clips = {};
        if (!this.rig.clips[this.activeClip]) this.rig.clips[this.activeClip] = { fps: 12, loop: true, length: 1.0, tracks: {} };
        return this.rig.clips[this.activeClip];
    }
    _addKey() {
        const part = this.rig.parts[this.activePart]; if (!part) return;
        this._pushUndo();
        const clip = this._ensureClip();
        const track = clip.tracks[part.name] ?? (clip.tracks[part.name] = []);
        const t = Math.round(this.playhead * 100) / 100;
        const key = { t, rot: Math.round(this.pose.rot * 1000) / 1000, x: this.pose.x, y: this.pose.y };
        const i = track.findIndex(k => Math.abs(k.t - t) < 0.001);
        if (i >= 0) track[i] = key; else { track.push(key); track.sort((a, b) => a.t - b.t); }
        clip.length = Math.max(clip.length ?? 1, t || 0.001);
        this._redraw();
    }
    _clearTrack() {
        const part = this.rig.parts[this.activePart]; if (!part) return;
        const clip = this.rig.clips?.[this.activeClip]; if (!clip?.tracks?.[part.name]) return;
        this._pushUndo();
        delete clip.tracks[part.name];
        this._redraw();
    }

    // ── Input ────────────────────────────────────────────────────────────────────────

    _buildInput() {
        const zone = this.add.zone(0, 0, this.CW, this.H).setOrigin(0).setInteractive();
        zone.on('pointerdown', ptr => {
            let gx = this._gx(ptr.x), gy = this._gy(ptr.y);
            if (this.gridSnap) { gx = Math.round(gx); gy = Math.round(gy); }
            const sh = this.activeShapes();
            for (let i = sh.length - 1; i >= 0; i--) {
                if (this._hitTest(sh[i], gx, gy)) {
                    this.selIdx = i;
                    this._drag = { ox: gx, oy: gy, moved: false };
                    this._redraw();
                    return;
                }
            }
            this.selIdx = -1;
            this._pushUndo();
            this._placeShape(gx, gy);
            this._drag = null;
            this._redraw();
        });
        zone.on('pointermove', ptr => {
            if (!this._drag) return;
            let gx = this._gx(ptr.x), gy = this._gy(ptr.y);
            if (this.gridSnap) { gx = Math.round(gx); gy = Math.round(gy); }
            const dx = gx - this._drag.ox, dy = gy - this._drag.oy;
            if (dx === 0 && dy === 0) return;
            if (!this._drag.moved) { this._pushUndo(); this._drag.moved = true; }
            if (this.selIdx >= 0) this._translateShape(this.activeShapes()[this.selIdx], dx, dy);
            this._drag.ox = gx; this._drag.oy = gy;
            this._drawShapesOnly();
        });
        zone.on('pointerup', () => { if (this._drag?.moved) { this._autosave(); this._redraw(); } this._drag = null; });

        this.input.keyboard?.on('keydown-ESC', () => this._close());
        this.input.keyboard?.on('keydown-DELETE', () => this._deleteSelected() ?? this._redraw());
        this.input.keyboard?.on('keydown-BACKSPACE', () => { this._deleteSelected(); this._redraw(); });
        this.input.keyboard?.on('keydown-Z', e => { if (e.ctrlKey || e.metaKey) { e.shiftKey ? this._redo() : this._undo(); } });
        this.input.keyboard?.on('keydown-Y', e => { if (e.ctrlKey || e.metaKey) this._redo(); });
        this.input.keyboard?.on('keydown-C', e => { if ((e.ctrlKey || e.metaKey) && this.selIdx >= 0) this.clipboard = this._clone(this.activeShapes()[this.selIdx]); });
        this.input.keyboard?.on('keydown-V', e => {
            if ((e.ctrlKey || e.metaKey) && this.clipboard) {
                this._pushUndo();
                const c = this._clone(this.clipboard); this._translateShape(c, 2, 2);
                this.activeShapes().push(c); this.selIdx = this.activeShapes().length - 1; this._redraw();
            }
        });
    }

    _close() {
        if (this._exportOverlay) this._closeExport();
        this._fileInput?.remove(); this._fileInput = null;
        this.scene.stop();
    }

    update(_t, dtMs) {
        if (!this.playing) return;
        const dt = (dtMs ?? 16) / 1000;
        this.playhead += dt;
        const clip = this.rig.clips?.[this.activeClip];
        const len = clip?.length ?? 1;
        if (clip?.loop !== false && len > 0 && this.playhead > len) this.playhead %= len;
        this._phase += dt * 6;
        this._drawShapesOnly();
    }

    // ── Rendering ──────────────────────────────────────────────────────────────────

    _redraw() {
        this._drawBackground();
        this._drawGrid();
        this._drawShapesOnly();
        this._buildUI();
    }

    _drawShapesOnly() {
        this.shpGfx.clear();
        this.selGfx.clear();
        const ox = this.CX, oy = this.CY;
        if (this.playing || this._scrubbing) {
            renderRig(this.shpGfx, this.rig, {
                scale: this.VS, ox, oy, walkPhase: this._phase, moving: true,
                clip: this.activeClip, clipTime: this.playhead,
            });
        } else {
            // Static authoring view: draw each part; dim the inactive ones; mark pivots.
            const sorted = [...this.rig.parts].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
            for (const part of sorted) {
                const active = part === this.rig.parts[this.activePart];
                renderShapes(this.shpGfx, part.shapes, this.pv, { scale: this.VS, ox, oy, alpha: active ? 1 : 0.35 });
            }
            // pivots
            for (const part of this.rig.parts) {
                const active = part === this.rig.parts[this.activePart];
                this.selGfx.fillStyle(active ? 0xff8844 : 0x886644, active ? 1 : 0.6)
                    .fillCircle(this._sx(part.pivot.x), this._sy(part.pivot.y), active ? 3 : 2);
            }
            // selection handle
            const s = this.activeShapes()[this.selIdx];
            if (s) {
                const b = this._shapeBounds(s);
                if (b) this.selGfx.lineStyle(1, 0x88ffaa, 0.9)
                    .strokeRect(this._sx(b.minX) - 2, this._sy(b.minY) - 2, (b.maxX - b.minX) * this.VS + 4, (b.maxY - b.minY) * this.VS + 4);
            }
        }
        // origin marker
        this.selGfx.lineStyle(1, 0x44aa44, 0.7)
            .lineBetween(this._sx(this.rig.origin.x) - 4, this._sy(this.rig.origin.y), this._sx(this.rig.origin.x) + 4, this._sy(this.rig.origin.y));
    }

    _drawBackground() {
        this.bgGfx.clear();
        this.bgGfx.fillStyle(0x0a0e0a).fillRect(0, 0, this.W, this.H);
        this.bgGfx.fillStyle(0x101810).fillRect(0, 0, this.CW, this.H);
        this.bgGfx.fillStyle(0x0c100c).fillRect(this.PX, 0, this.PW, this.H);
        this.bgGfx.lineStyle(1, 0x223322).lineBetween(this.CW, 0, this.CW, this.H);
    }

    _drawGrid() {
        this.gridGfx.clear();
        this.gridGfx.lineStyle(0.5, 0x1a221a, 0.4);
        const span = 30;
        for (let gx = -span; gx <= span; gx++) { const sx = this._sx(gx); if (sx >= 0 && sx <= this.CW) this.gridGfx.lineBetween(sx, 0, sx, this.H); }
        for (let gy = -span; gy <= span; gy++) { const sy = this._sy(gy); if (sy >= 0 && sy <= this.H) this.gridGfx.lineBetween(0, sy, this.CW, sy); }
        this.gridGfx.lineStyle(1, 0x335533, 0.6).lineBetween(this.CX, 0, this.CX, this.H).lineBetween(0, this.CY, this.CW, this.CY);
    }

    // ── UI panel ──────────────────────────────────────────────────────────────────

    _buildUI() {
        for (const o of this._uiObjs) o.destroy();
        this._uiObjs = [];
        this.uiGfx.clear();

        const add = o => { this._uiObjs.push(o); return o; };
        const fs = n => `${Math.round(n * Math.min(1.4, Math.max(1, this.W / 420)))}px`;
        const txt = (x, y, str, style) => add(this.add.text(x, y, str, { fontFamily: 'monospace', color: '#aaaaaa', ...style }).setDepth(10));
        const btn = (x, y, w, h, label, col, cb, active = false) => {
            const g = this.add.graphics().setDepth(9);
            g.fillStyle(active ? 0x2a4428 : col, 1).fillRect(x, y, w, h);
            g.lineStyle(1, active ? 0x44aa44 : 0x334433).strokeRect(x, y, w, h);
            const t = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: 'monospace', fontSize: fs(10), color: active ? '#88ff88' : '#aaccaa' }).setOrigin(0.5).setDepth(10);
            const z = this.add.zone(x, y, w, h).setOrigin(0).setInteractive().setDepth(11);
            z.on('pointerdown', cb);
            add(g); add(t); add(z);
            return z;
        };

        const PX = this.PX + 6, PW = this.PW - 10;
        let py = 6;

        // Header
        txt(PX, py + 3, `✏ rig: ${this.rig.id}`, { fontSize: fs(11), color: '#c8a030' });
        btn(PX + PW - 40, py, 40, 22, '✕ back', 0x221111, () => this._close());
        py += 28;

        // Import / new / undo / redo / snap
        btn(PX, py, 70, 22, '🖼 Import', 0x112011, () => this._importImage());
        btn(PX + 74, py, 42, 22, 'New', 0x111811, () => { this._pushUndo(); this.rig = this._blankRig(); this.activePart = 0; this.selIdx = -1; this._fitView(); this._redraw(); });
        btn(PX + 120, py, 26, 22, '↶', 0x111811, () => this._undo());
        btn(PX + 148, py, 26, 22, '↷', 0x111811, () => this._redo());
        btn(PX + 176, py, 56, 22, this.gridSnap ? 'snap:on' : 'snap:off', 0x111811, () => { this.gridSnap = !this.gridSnap; this._redraw(); }, this.gridSnap);
        py += 28;

        // ── Parts ───────────────────────────────────────────────────────────────────
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(PX, py, PX + PW, py); py += 6;
        const part = this.rig.parts[this.activePart];
        txt(PX, py + 3, `Parts (${this.rig.parts.length}):`, { fontSize: fs(9), color: '#668866' });
        btn(PX + PW - 40, py, 40, 20, '+ part', 0x112211, () => { this._addPart(); this._redraw(); });
        py += 24;
        // active part selector
        btn(PX, py, 22, 22, '◀', 0x111811, () => { this.activePart = (this.activePart + this.rig.parts.length - 1) % this.rig.parts.length; this.selIdx = -1; this._redraw(); });
        txt(PX + 28, py + 5, `${this.activePart}: ${part?.name ?? '—'} (z${part?.z ?? 0}, ${part?.shapes.length ?? 0})`, { fontSize: fs(9), color: '#aaddaa' });
        btn(PX + PW - 22, py, 22, 22, '▶', 0x111811, () => { this.activePart = (this.activePart + 1) % this.rig.parts.length; this.selIdx = -1; this._redraw(); });
        py += 26;
        // rename / pivot / z / delete part
        btn(PX, py, 52, 20, 'name◀▶', 0x111811, () => this._cyclePartName(1));
        btn(PX + 56, py, 52, 20, '⌖ pivot', 0x111811, () => this._setPivotToSelection());
        btn(PX + 112, py, 22, 20, 'z−', 0x111811, () => { if (part) { this._pushUndo(); part.z = (part.z ?? 0) - 1; this._redraw(); } });
        btn(PX + 136, py, 22, 20, 'z+', 0x111811, () => { if (part) { this._pushUndo(); part.z = (part.z ?? 0) + 1; this._redraw(); } });
        btn(PX + PW - 24, py, 24, 20, '🗑', 0x331111, () => {
            if (this.rig.parts.length > 1) { this._pushUndo(); this.rig.parts.splice(this.activePart, 1); this.activePart = 0; this.selIdx = -1; this._redraw(); }
        });
        py += 26;

        // ── New shape type + fill ─────────────────────────────────────────────────────
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(PX, py, PX + PW, py); py += 6;
        txt(PX, py + 3, 'Add shape:', { fontSize: fs(9), color: '#668866' });
        py += 16;
        SHAPE_TYPES.forEach(([icon, tp], i) => {
            btn(PX + (i % 6) * 38, py, 34, 24, icon, 0x111811, () => { this.newType = tp; this._redraw(); }, this.newType === tp);
        });
        py += 30;
        // palette swatches
        const SW = Math.floor(PW / 12) - 1;
        PALETTE.forEach((col, i) => {
            const sx = PX + (i % 12) * (SW + 1), sy = py + Math.floor(i / 12) * (SW + 1);
            this.uiGfx.fillStyle(col).fillRect(sx, sy, SW, SW);
            if (this.newFill === col) this.uiGfx.lineStyle(2, 0xffffff).strokeRect(sx - 1, sy - 1, SW + 2, SW + 2);
            const z = this.add.zone(sx, sy, SW, SW).setOrigin(0).setInteractive().setDepth(11);
            z.on('pointerdown', () => { this.newFill = col; if (this.selIdx >= 0) { const s = this.activeShapes()[this.selIdx]; if (s.fill !== undefined) s.fill = col; else if (s.stroke) s.stroke.color = col; } this._autosave(); this._redraw(); });
            add(z);
        });
        py += Math.ceil(PALETTE.length / 12) * (SW + 1) + 6;

        // ── Selected shape props ──────────────────────────────────────────────────────
        const s = this.activeShapes()[this.selIdx];
        if (s) {
            txt(PX, py, `#${this.selIdx} ${s.type}`, { fontSize: fs(9), color: '#c8a030' });
            btn(PX + PW - 60, py - 2, 60, 20, '🗑 del', 0x331111, () => { this._deleteSelected(); this._redraw(); });
            py += 16;
            const fields = {
                circle: ['x', 'y', 'r'], ellipse: ['x', 'y', 'rx', 'ry'],
                rect: ['x', 'y', 'w', 'h'], triangle: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3'],
                line: ['x1', 'y1', 'x2', 'y2'], polygon: [],
            }[s.type] ?? [];
            let col = 0;
            for (const f of fields) {
                if (typeof s[f] !== 'number') continue;
                const cx = PX + col * (PW / 3);
                txt(cx, py + 3, `${f}`, { fontSize: fs(8), color: '#668866' });
                btn(cx + 22, py, 16, 18, '−', 0x111811, () => this._nudge(f, -1));
                txt(cx + 40, py + 3, String(s[f]), { fontSize: fs(8), color: '#ddddaa' });
                btn(cx + 64, py, 16, 18, '+', 0x111811, () => this._nudge(f, 1));
                col++; if (col === 3) { col = 0; py += 22; }
            }
            if (col !== 0) py += 22;
            if (s.type === 'polygon') { txt(PX, py, `polygon: ${s.points.length} pts (drag to move)`, { fontSize: fs(8), color: '#668866' }); py += 18; }
        } else {
            txt(PX, py + 3, 'Tap canvas to add to active part', { fontSize: fs(9), color: '#446644' });
            py += 20;
        }

        // ── Animation / keyframes ──────────────────────────────────────────────────────
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(PX, py, PX + PW, py); py += 6;
        const clip = this.rig.clips?.[this.activeClip];
        txt(PX, py + 3, `Clip '${this.activeClip}'  t=${this.playhead.toFixed(2)}/${(clip?.length ?? 1).toFixed(2)}`, { fontSize: fs(9), color: '#668866' });
        py += 18;
        btn(PX, py, 40, 22, this.playing ? '⏸ stop' : '▶ play', 0x111811, () => { this.playing = !this.playing; this._scrubbing = false; this._redraw(); }, this.playing);
        btn(PX + 44, py, 26, 22, 't−', 0x111811, () => { this.playing = false; this._scrubbing = true; this.playhead = Math.max(0, Math.round((this.playhead - 0.05) * 100) / 100); this._redraw(); });
        btn(PX + 72, py, 26, 22, 't+', 0x111811, () => { this.playing = false; this._scrubbing = true; this.playhead = Math.round((this.playhead + 0.05) * 100) / 100; this._redraw(); });
        btn(PX + 102, py, 60, 22, '＋ key', 0x112011, () => this._addKey());
        btn(PX + 166, py, 66, 22, 'clr track', 0x331111, () => this._clearTrack());
        py += 26;
        // pose editor (for the key you'll add)
        txt(PX, py + 3, `pose rot ${this.pose.rot.toFixed(2)} x${this.pose.x} y${this.pose.y}`, { fontSize: fs(8), color: '#668866' });
        py += 16;
        const poseBtn = (x, lbl, fn) => btn(x, py, 26, 20, lbl, 0x111811, () => { fn(); this._scrubbing = true; this.playing = false; this._redraw(); });
        poseBtn(PX, 'r−', () => this.pose.rot = Math.round((this.pose.rot - 0.1) * 100) / 100);
        poseBtn(PX + 28, 'r+', () => this.pose.rot = Math.round((this.pose.rot + 0.1) * 100) / 100);
        poseBtn(PX + 60, 'x−', () => this.pose.x -= 1);
        poseBtn(PX + 88, 'x+', () => this.pose.x += 1);
        poseBtn(PX + 120, 'y−', () => this.pose.y -= 1);
        poseBtn(PX + 148, 'y+', () => this.pose.y += 1);
        py += 24;

        // ── Export ──────────────────────────────────────────────────────────────────
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(PX, py, PX + PW, py); py += 8;
        btn(PX, py, PW, 26, '📋 Export rig .js', 0x112011, () => this._showExport());
    }

    // ── Export ──────────────────────────────────────────────────────────────────────

    _exportText() {
        // Pretty rig with hex colours, ready to drop into js/content/sprites/<id>.js
        const rig = this._clone(this.rig);
        const json = JSON.stringify(rig, null, 2)
            .replace(/"(fill|color)":\s*(\d+)/g, (_m, k, n) => `"${k}": 0x${Number(n).toString(16).padStart(6, '0')}`);
        return `// Generated by the sprite editor. Drop into js/content/sprites/ and register in index.js.\nexport default ${json};\n`;
    }

    _showExport() {
        if (this._exportOverlay) this._closeExport();
        const W = this.W, H = this.H;
        const bg = this.add.graphics().setDepth(20);
        bg.fillStyle(0x0a120a, 0.96).fillRect(0, 0, W, H);
        const title = this.add.text(W / 2, 12, '📋 rig module — copy into js/content/sprites/', { fontFamily: 'monospace', fontSize: '11px', color: '#88cc88' }).setOrigin(0.5, 0).setDepth(21);
        const ta = document.createElement('textarea');
        ta.value = this._exportText();
        ta.style.cssText = `position:absolute;left:10px;top:34px;width:${W - 20}px;height:${H - 80}px;background:#0c180c;color:#aaddaa;font-family:monospace;font-size:11px;border:1px solid #334433;padding:8px;box-sizing:border-box;resize:none;`;
        (document.getElementById('game') || document.body).appendChild(ta);
        ta.focus(); ta.select();
        const close = this.add.text(W / 2, H - 28, '[ Close ]', { fontFamily: 'monospace', fontSize: '13px', color: '#cc8844', backgroundColor: '#1a1008', padding: { x: 12, y: 6 } }).setOrigin(0.5).setDepth(21).setInteractive();
        close.on('pointerdown', () => this._closeExport());
        this._exportOverlay = [bg, title, close, { destroy: () => ta.remove() }];
    }
    _closeExport() {
        if (!this._exportOverlay) return;
        for (const o of this._exportOverlay) o.destroy?.();
        this._exportOverlay = null;
    }
}
