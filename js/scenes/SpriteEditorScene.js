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
import { ANIMALS } from '../content/animals/index.js';
import { UNITS } from '../content/units/index.js';
import { ENTITY_PARAM_SCHEMA, KEY_CHOICES, paramsFromDef } from '../content/entityParams.js';
import { saveOverride, applyEntityOverrides } from '../content/entityOverrides.js';

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
        this.RAIL_W = Phaser.Math.Clamp(Math.round(W * 0.07), 44, 72);  // slim icon rail (<1/8)
        this.RAIL_X = W - this.RAIL_W;
        this.CANVAS_W = this.RAIL_X;                      // canvas area = everything left of the rail
        this.CX = Math.floor(this.RAIL_X / 2);
        this.CY = Math.floor(H / 2);
        this.VS = 7;                                      // view scale (px per rig unit)
        this.panX = 0; this.panY = 0;                     // canvas pan offset (screen px)

        // Editor state
        this.tool = 'place';                              // 'place' | 'pan'
        this.openPanel = null;                            // 'load'|'color'|'parts'|'props'|'inspect'|'anim'|'trace'|null
        this.activePart = 0;
        this.selIdx = -1;
        this.view = null;                                 // facing for directional rigs (null = flat parts)
        this.entityId = null;                             // id of the loaded entity (for Save/override)
        this.entityKind = null;                           // 'animal' | 'unit' | null
        this.params = {};                                 // scalar behavioural params (entityParams schema)
        this._selVerts = new Set();                       // multi-selected vertex handle keys (active shape)
        this._inspScroll = 0;
        this.newType = 'circle';
        this.newFill = 0xccccaa;
        this.newAlpha = 1.0;
        this.gridSnap = true;
        this.pv = {};                                     // $var resolution for fills (none yet)
        this.traceSettings = { colorCount: 6, resolution: 4, maxShapes: 80 };  // image-trace knobs

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

        // Persistent hover tooltip (not part of the rebuilt UI objects).
        this._tip = this.add.text(0, 0, '', {
            fontFamily: 'monospace', fontSize: this._fs(10), color: '#e8f0e8',
            backgroundColor: '#1a261a', padding: { x: 6, y: 3 },
        }).setDepth(30).setVisible(false);

        this.input.mouse?.disableContextMenu();           // allow right-drag panning

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

    // Parts for the currently-edited view (directional rig) or the flat parts array.
    _partList() {
        if (this.rig.views) {
            const keys = Object.keys(this.rig.views);
            if (!this.view || !this.rig.views[this.view]) this.view = keys[0] || 'south';
            return this.rig.views[this.view] ?? (this.rig.views[this.view] = []);
        }
        this.view = null;
        return this.rig.parts ?? (this.rig.parts = []);
    }
    _viewKeys() { return this.rig.views ? Object.keys(this.rig.views) : []; }

    activeShapes() { return this._partList()[this.activePart]?.shapes ?? []; }

    _clone(o) { return JSON.parse(JSON.stringify(o)); }

    // ── Entity loading (rig + params from the live registries) ───────────────────
    _entityIds() { return Object.keys(SPRITES); }
    _loadEntity(id) {
        const rig = SPRITES[id];
        if (!rig) return;
        this._pushUndo();
        this.rig = this._clone(rig);
        if (!this.rig.clips) this.rig.clips = {};
        this.entityId = id;
        this.entityKind = ANIMALS[id] ? 'animal' : (UNITS[id] ? 'unit' : null);
        const def = ANIMALS[id] || UNITS[id] || null;
        this.params = this.entityKind ? paramsFromDef(def, this.entityKind) : {};
        this.view = this.rig.views ? (Object.keys(this.rig.views)[0] || 'south') : null;
        this.activePart = 0; this.selIdx = -1; this._selVerts.clear();
        this._fitView(); this._autosave(); this._redraw();
    }

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
        const pl = this._partList();
        if (this.activePart >= pl.length) this.activePart = pl.length - 1;
        if (this.activePart < 0) this.activePart = 0;
        if (this.selIdx >= this.activeShapes().length) this.selIdx = -1;
        this._selVerts.clear();
    }

    // ── Coordinate mapping (rig units ↔ screen) ─────────────────────────────────────

    _sx(x) { return this.CX + this.panX + x * this.VS; }
    _sy(y) { return this.CY + this.panY + y * this.VS; }
    _gx(px) { return (px - this.CX - this.panX) / this.VS; }
    _gy(py) { return (py - this.CY - this.panY) / this.VS; }

    _fitView() {
        const b = this._rigBounds();
        if (!b) { this.VS = 7; this.panX = 0; this.panY = 0; return; }
        const w = Math.max(4, b.maxX - b.minX), h = Math.max(4, b.maxY - b.minY);
        this.VS = Math.max(1, Math.min(40, Math.min(this.CANVAS_W, this.H) * 0.7 / Math.max(w, h)));
        // Centre the content's bbox in the canvas area.
        this.panX = -((b.minX + b.maxX) / 2) * this.VS;
        this.panY = -((b.minY + b.maxY) / 2) * this.VS;
    }
    _rigBounds() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
        for (const part of this._partList()) for (const s of part.shapes) {
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

    // ── Vertex handles (draggable points of a shape) ─────────────────────────────────
    // Returns [{ key, x, y }] in rig coords. `key` identifies the handle for drag/multi-select.
    _shapeHandles(s) {
        const v = this.pv, n = (f) => res(s[f], v);
        switch (s.type) {
            case 'circle':   return [{ key: 'c', x: n('x'), y: n('y') }, { key: 'r', x: n('x') + n('r'), y: n('y') }];
            case 'ellipse':  return [{ key: 'c', x: n('x'), y: n('y') }, { key: 'rx', x: n('x') + n('rx'), y: n('y') }, { key: 'ry', x: n('x'), y: n('y') + n('ry') }];
            case 'rect':     return [{ key: 'tl', x: n('x'), y: n('y') }, { key: 'br', x: n('x') + n('w'), y: n('y') + n('h') }];
            case 'line':     return [{ key: 'p1', x: n('x1'), y: n('y1') }, { key: 'p2', x: n('x2'), y: n('y2') }];
            case 'triangle': return [{ key: 'p1', x: n('x1'), y: n('y1') }, { key: 'p2', x: n('x2'), y: n('y2') }, { key: 'p3', x: n('x3'), y: n('y3') }];
            case 'polygon':  return (s.points ?? []).map((p, i) => ({ key: 'pt' + i, x: p.x, y: p.y }));
        }
        return [];
    }
    // Hit-test handles of the selected shape; returns the handle key within HIT screen-px, or null.
    _hitHandle(s, ptrX, ptrY) {
        const HIT = 8;
        for (const h of this._shapeHandles(s)) {
            const dx = this._sx(h.x) - ptrX, dy = this._sy(h.y) - ptrY;
            if (dx * dx + dy * dy <= HIT * HIT) return h.key;
        }
        return null;
    }
    // Move one handle by a rig-space delta (mutates the right field(s)).
    _moveHandle(s, key, dx, dy) {
        const r1 = (val) => Math.round(val * 10) / 10;
        const add = (f, d) => { s[f] = r1((s[f] ?? 0) + d); };
        switch (s.type) {
            case 'circle':
                if (key === 'c') { add('x', dx); add('y', dy); }
                else if (key === 'r') s.r = Math.max(0.5, r1((s.r ?? 1) + dx));
                break;
            case 'ellipse':
                if (key === 'c') { add('x', dx); add('y', dy); }
                else if (key === 'rx') s.rx = Math.max(0.5, r1((s.rx ?? 1) + dx));
                else if (key === 'ry') s.ry = Math.max(0.5, r1((s.ry ?? 1) + dy));
                break;
            case 'rect':
                if (key === 'tl') { add('x', dx); add('y', dy); s.w = Math.max(1, r1((s.w ?? 1) - dx)); s.h = Math.max(1, r1((s.h ?? 1) - dy)); }
                else if (key === 'br') { s.w = Math.max(1, r1((s.w ?? 1) + dx)); s.h = Math.max(1, r1((s.h ?? 1) + dy)); }
                break;
            case 'line': case 'triangle': {
                const i = key.slice(1);               // 'p1'->'1'
                add('x' + i, dx); add('y' + i, dy);
                break;
            }
            case 'polygon': {
                const p = s.points?.[parseInt(key.slice(2), 10)];
                if (p) { p.x = r1(p.x + dx); p.y = r1(p.y + dy); }
                break;
            }
        }
    }
    // Polygon vertex add/remove (relative to the selected vertex, or appended).
    _addPolyPoint() {
        const s = this.activeShapes()[this.selIdx];
        if (!s || s.type !== 'polygon' || !s.points?.length) return;
        this._pushUndo();
        const i = this._lastVert ?? s.points.length - 1;
        const a = s.points[i], b = s.points[(i + 1) % s.points.length];
        s.points.splice(i + 1, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
        this._autosave(); this._redraw();
    }
    _delPolyPoint() {
        const s = this.activeShapes()[this.selIdx];
        if (!s || s.type !== 'polygon' || (s.points?.length ?? 0) <= 3) return;
        this._pushUndo();
        const i = this._lastVert ?? s.points.length - 1;
        s.points.splice(i, 1);
        this._selVerts.clear(); this._lastVert = null;
        this._autosave(); this._redraw();
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
        const pl = this._partList();
        const n = pl.length + 1;
        pl.push({ name: `part${n}`, pivot: { x: 0, y: 0 }, z: n - 1, shapes: [] });
        this.activePart = pl.length - 1;
        this.selIdx = -1;
    }
    _cyclePartName(dir) {
        const part = this._partList()[this.activePart]; if (!part) return;
        // cycle through standard limb names + the part's own custom name
        const opts = [...STD_PARTS, part.name].filter((v, i, a) => a.indexOf(v) === i);
        const cur = opts.indexOf(part.name);
        this._pushUndo();
        part.name = opts[(cur + dir + opts.length) % opts.length];
        this._redraw();
    }
    _setPivotToSelection() {
        const part = this._partList()[this.activePart]; if (!part) return;
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
                this._lastImage = img;            // kept so Re-trace can re-run with new settings
                this._vectorizeAndLoad(img);
            };
            img.onerror = () => URL.revokeObjectURL(url);
            img.src = url;
        };
        input.click();
    }

    _retrace() {
        if (this._lastImage) this._vectorizeAndLoad(this._lastImage);
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

        const { shapes, groups } = vectorizeImage(imageData, { ...this.traceSettings });
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
        const part = this._partList()[this.activePart]; if (!part) return;
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
        const part = this._partList()[this.activePart]; if (!part) return;
        const clip = this.rig.clips?.[this.activeClip]; if (!clip?.tracks?.[part.name]) return;
        this._pushUndo();
        delete clip.tracks[part.name];
        this._redraw();
    }

    // ── Input ────────────────────────────────────────────────────────────────────────

    _buildInput() {
        const zone = this.add.zone(0, 0, this.CANVAS_W, this.H).setOrigin(0).setInteractive();
        this._zone = zone;
        zone.on('pointerdown', ptr => {
            // Pan: middle/right button, or the hand tool.
            if (ptr.middleButtonDown?.() || ptr.rightButtonDown?.() || this.tool === 'pan') {
                this._pan = { px: ptr.x, py: ptr.y };
                this._drag = null;
                return;
            }
            let gx = this._gx(ptr.x), gy = this._gy(ptr.y);
            if (this.gridSnap) { gx = Math.round(gx); gy = Math.round(gy); }
            const shift = !!ptr.event?.shiftKey;

            // 1) Vertex handles of the already-selected shape take priority.
            const cur = this.activeShapes()[this.selIdx];
            if (cur) {
                const hk = this._hitHandle(cur, ptr.x, ptr.y);
                if (hk) {
                    this._lastVert = hk.startsWith('pt') ? parseInt(hk.slice(2), 10) : this._lastVert;
                    if (shift) {                       // toggle membership, no drag
                        this._selVerts.has(hk) ? this._selVerts.delete(hk) : this._selVerts.add(hk);
                        this._redraw();
                        return;
                    }
                    if (!this._selVerts.has(hk)) { this._selVerts.clear(); this._selVerts.add(hk); }
                    this._drag = { ox: gx, oy: gy, moved: false, verts: [...this._selVerts] };
                    this._redraw();
                    return;
                }
            }

            // 2) Whole-shape select / drag.
            const sh = this.activeShapes();
            for (let i = sh.length - 1; i >= 0; i--) {
                if (this._hitTest(sh[i], gx, gy)) {
                    this.selIdx = i; this._selVerts.clear();
                    this._drag = { ox: gx, oy: gy, moved: false };
                    this._redraw();
                    return;
                }
            }

            // 3) Miss → place a new shape.
            this.selIdx = -1; this._selVerts.clear();
            this._pushUndo();
            this._placeShape(gx, gy);
            this._drag = null;
            this._redraw();
        });
        zone.on('pointermove', ptr => {
            if (this._pan) {
                this.panX += ptr.x - this._pan.px;
                this.panY += ptr.y - this._pan.py;
                this._pan.px = ptr.x; this._pan.py = ptr.y;
                this._drawCanvas();
                return;
            }
            if (!this._drag) return;
            let gx = this._gx(ptr.x), gy = this._gy(ptr.y);
            if (this.gridSnap) { gx = Math.round(gx); gy = Math.round(gy); }
            const dx = gx - this._drag.ox, dy = gy - this._drag.oy;
            if (dx === 0 && dy === 0) return;
            if (!this._drag.moved) { this._pushUndo(); this._drag.moved = true; }
            const s = this.activeShapes()[this.selIdx];
            if (s && this._drag.verts) { for (const k of this._drag.verts) this._moveHandle(s, k, dx, dy); }
            else if (s) this._translateShape(s, dx, dy);
            this._drag.ox = gx; this._drag.oy = gy;
            this._drawShapesOnly();
        });
        zone.on('pointerup', () => {
            if (this._pan) { this._pan = null; return; }
            if (this._drag?.moved) { this._autosave(); this._redraw(); }
            this._drag = null;
        });

        // Scroll to zoom toward the cursor.
        this.input.on('wheel', (ptr, _over, _dx, dy) => {
            // Over an open scrolling popover (inspector), scroll its content instead of zooming.
            if (this.openPanel === 'inspect') {
                const POP_W = Math.min(Math.round(this.W * 0.30), 280);
                const px = this.RAIL_X - POP_W - 2;
                if (ptr.x >= px && ptr.x < this.RAIL_X) {
                    this._inspScroll = Math.max(0, this._inspScroll + (dy > 0 ? 60 : -60));
                    this._redraw();
                    return;
                }
            }
            if (ptr.x >= this.RAIL_X) return;            // ignore over the rail
            const gx = this._gx(ptr.x), gy = this._gy(ptr.y);
            this.VS = Phaser.Math.Clamp(this.VS * (dy < 0 ? 1.1 : 0.9), 0.5, 60);
            this.panX = ptr.x - this.CX - gx * this.VS;  // keep that rig point under the cursor
            this.panY = ptr.y - this.CY - gy * this.VS;
            this._drawCanvas();
        });

        this.input.keyboard?.on('keydown-ESC', () => { if (this.openPanel) { this.openPanel = null; this._redraw(); } else this._close(); });
        this.input.keyboard?.on('keydown-ZERO', () => { this._fitView(); this._redraw(); });
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

    // Canvas-only redraw for smooth pan/zoom (skips the UI rebuild).
    _drawCanvas() {
        this._drawGrid();
        this._drawShapesOnly();
    }

    _drawShapesOnly() {
        this.shpGfx.clear();
        this.selGfx.clear();
        const ox = this.CX + this.panX, oy = this.CY + this.panY;
        if (this.playing || this._scrubbing) {
            renderRig(this.shpGfx, this.rig, {
                scale: this.VS, ox, oy, walkPhase: this._phase, moving: true,
                facing: this.view ?? 'south',
                clip: this.activeClip, clipTime: this.playhead,
            });
        } else {
            // Static authoring view: draw each part of the current view; dim inactive; mark pivots.
            const pl = this._partList();
            const sorted = [...pl].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
            for (const part of sorted) {
                const active = part === pl[this.activePart];
                renderShapes(this.shpGfx, part.shapes, this.pv, { scale: this.VS, ox, oy, alpha: active ? 1 : 0.35 });
            }
            // pivots
            for (const part of pl) {
                const active = part === pl[this.activePart];
                this.selGfx.fillStyle(active ? 0xff8844 : 0x886644, active ? 1 : 0.6)
                    .fillCircle(this._sx(part.pivot.x), this._sy(part.pivot.y), active ? 3 : 2);
            }
            // selection bbox + draggable vertex handles for the selected shape
            const s = this.activeShapes()[this.selIdx];
            if (s) {
                const b = this._shapeBounds(s);
                if (b) this.selGfx.lineStyle(1, 0x88ffaa, 0.5)
                    .strokeRect(this._sx(b.minX) - 2, this._sy(b.minY) - 2, (b.maxX - b.minX) * this.VS + 4, (b.maxY - b.minY) * this.VS + 4);
                for (const h of this._shapeHandles(s)) {
                    const hx = this._sx(h.x), hy = this._sy(h.y), sel = this._selVerts.has(h.key);
                    this.selGfx.fillStyle(sel ? 0xffdd44 : 0x44ddff, 1).fillRect(hx - 3, hy - 3, 6, 6);
                    this.selGfx.lineStyle(1, 0x06140c, 1).strokeRect(hx - 3, hy - 3, 6, 6);
                }
            }
        }
        // origin marker
        this.selGfx.lineStyle(1, 0x44aa44, 0.7)
            .lineBetween(this._sx(this.rig.origin.x) - 4, this._sy(this.rig.origin.y), this._sx(this.rig.origin.x) + 4, this._sy(this.rig.origin.y));
    }

    _drawBackground() {
        this.bgGfx.clear();
        this.bgGfx.fillStyle(0x0d120d).fillRect(0, 0, this.CANVAS_W, this.H);            // canvas area
        this.bgGfx.fillStyle(0x141a14).fillRect(this.RAIL_X, 0, this.RAIL_W, this.H);    // rail strip
        this.bgGfx.lineStyle(1, 0x2a3a2a).lineBetween(this.RAIL_X, 0, this.RAIL_X, this.H);
    }

    _drawGrid() {
        this.gridGfx.clear();
        const gxMin = Math.floor(this._gx(0)), gxMax = Math.ceil(this._gx(this.CANVAS_W));
        const gyMin = Math.floor(this._gy(0)), gyMax = Math.ceil(this._gy(this.H));
        if (gxMax - gxMin <= 240 && gyMax - gyMin <= 240) {     // skip minor grid when very zoomed out
            this.gridGfx.lineStyle(0.5, 0x1a221a, 0.4);
            for (let gx = gxMin; gx <= gxMax; gx++) { const sx = this._sx(gx); if (sx >= 0 && sx <= this.CANVAS_W) this.gridGfx.lineBetween(sx, 0, sx, this.H); }
            for (let gy = gyMin; gy <= gyMax; gy++) { const sy = this._sy(gy); if (sy >= 0 && sy <= this.H) this.gridGfx.lineBetween(0, sy, this.CANVAS_W, sy); }
        }
        const ox = this._sx(0), oy = this._sy(0);               // origin crosshair (rig 0,0)
        this.gridGfx.lineStyle(1, 0x335533, 0.6);
        if (ox >= 0 && ox <= this.CANVAS_W) this.gridGfx.lineBetween(ox, 0, ox, this.H);
        if (oy >= 0 && oy <= this.H) this.gridGfx.lineBetween(0, oy, this.CANVAS_W, oy);
    }

    // ── UI: shared helpers ──────────────────────────────────────────────────────────

    _fs(n) { return `${Math.round(n * Math.min(1.4, Math.max(1, this.W / 420)))}px`; }
    _txt(x, y, str, style) {
        const o = this.add.text(x, y, str, { fontFamily: 'monospace', color: '#aaaaaa', ...style }).setDepth(10);
        this._uiObjs.push(o); return o;
    }
    _btn(x, y, w, h, label, col, cb, active = false, tip = null) {
        const g = this.add.graphics().setDepth(9);
        g.fillStyle(active ? 0x2a4428 : col, 1).fillRect(x, y, w, h);
        g.lineStyle(1, active ? 0x44aa44 : 0x334433).strokeRect(x, y, w, h);
        const t = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: 'monospace', fontSize: this._fs(10), color: active ? '#88ff88' : '#aaccaa' }).setOrigin(0.5).setDepth(10);
        const z = this.add.zone(x, y, w, h).setOrigin(0).setInteractive().setDepth(11);
        z.on('pointerdown', cb);
        if (tip) { z.on('pointerover', () => this._showTip(tip, x, y + h / 2)); z.on('pointerout', () => this._hideTip()); }
        this._uiObjs.push(g); this._uiObjs.push(t); this._uiObjs.push(z);
        return z;
    }
    // Tooltip floats to the LEFT of the anchor (rail sits on the right edge).
    _showTip(text, anchorX, anchorY) {
        this._tip.setText(text);
        const w = this._tip.width, h = this._tip.height;
        const x = Math.max(2, anchorX - 8 - w);
        const y = Phaser.Math.Clamp(anchorY - h / 2, 2, this.H - h - 2);
        this._tip.setPosition(x, y).setVisible(true);
    }
    _hideTip() { this._tip?.setVisible(false); }
    _swatch(x, y, sz, col, selected, cb) {
        this.uiGfx.fillStyle(col).fillRect(x, y, sz, sz);
        if (selected) this.uiGfx.lineStyle(2, 0xffffff).strokeRect(x - 1, y - 1, sz + 2, sz + 2);
        const z = this.add.zone(x, y, sz, sz).setOrigin(0).setInteractive().setDepth(11);
        z.on('pointerdown', cb);
        this._uiObjs.push(z);
    }
    _togglePanel(name) { this.openPanel = this.openPanel === name ? null : name; this._redraw(); }

    _buildUI() {
        for (const o of this._uiObjs) o.destroy();
        this._uiObjs = [];
        this.uiGfx.clear();
        this._hideTip();                      // a hovered button may have just been destroyed
        this._buildRail();
        this._buildPopover();
    }

    // ── Icon rail (always visible, < 1/8 screen) ─────────────────────────────────────

    _buildRail() {
        const RX = this.RAIL_X, RW = this.RAIL_W;
        const SHAPE_TIPS = { circle: 'Circle', triangle: 'Triangle', rect: 'Rectangle', line: 'Line', polygon: 'Polygon', ellipse: 'Ellipse' };
        const items = [];
        const sep = () => items.push({ sep: true });
        items.push({ ic: '✕', col: 0x221111, cb: () => this._close(), tip: 'Close  (Esc)' });
        sep();
        items.push({ ic: '📂', cb: () => this._togglePanel('load'), active: this.openPanel === 'load', tip: 'Load entity' });
        items.push({ ic: '💾', col: 0x112a14, cb: () => this._saveOverride(), tip: this.entityId ? `Save '${this.entityId}' (live)` : 'Load an entity first' });
        sep();
        items.push({ ic: '↶', cb: () => this._undo(), tip: 'Undo  (Ctrl+Z)' });
        items.push({ ic: '↷', cb: () => this._redo(), tip: 'Redo  (Ctrl+Y)' });
        sep();
        for (const [icon, tp] of SHAPE_TYPES)
            items.push({ ic: icon, cb: () => { this.newType = tp; this.tool = 'place'; this._redraw(); }, active: this.tool === 'place' && this.newType === tp, tip: `${SHAPE_TIPS[tp]} tool` });
        items.push({ ic: '✋', cb: () => { this.tool = this.tool === 'pan' ? 'place' : 'pan'; this._redraw(); }, active: this.tool === 'pan', tip: 'Pan  (or middle/right-drag)' });
        sep();
        items.push({ ic: '🎨', cb: () => this._togglePanel('color'), active: this.openPanel === 'color', tip: 'Colour & alpha' });
        items.push({ ic: '🧩', cb: () => this._togglePanel('parts'), active: this.openPanel === 'parts', tip: 'Parts & shapes' });
        items.push({ ic: '⚙', cb: () => this._togglePanel('props'), active: this.openPanel === 'props', tip: 'Shape properties' });
        items.push({ ic: '🧬', cb: () => this._togglePanel('inspect'), active: this.openPanel === 'inspect', tip: 'Entity parameters' });
        items.push({ ic: '🎞', cb: () => this._togglePanel('anim'), active: this.openPanel === 'anim', tip: 'Animation / keyframes' });
        sep();
        items.push({ ic: '🖼', cb: () => this._togglePanel('trace'), active: this.openPanel === 'trace', tip: 'Import image → trace' });
        items.push({ ic: '⊞', cb: () => { this.gridSnap = !this.gridSnap; this._redraw(); }, active: this.gridSnap, tip: 'Grid snap' });
        items.push({ ic: '⤢', cb: () => { this._fitView(); this._redraw(); }, tip: 'Fit view  (0)' });
        items.push({ ic: '📋', cb: () => this._showExport(), tip: 'Export rig .js' });

        const nIc = items.filter(i => !i.sep).length, nSep = items.length - nIc;
        let size = Math.floor((this.H - nSep * 7 - 12) / nIc) - 3;
        size = Phaser.Math.Clamp(size, 18, 34);
        const x = RX + Math.floor((RW - size) / 2);
        let y = 6;
        for (const it of items) {
            if (it.sep) { this.uiGfx.lineStyle(1, 0x2a3a2a, 0.8).lineBetween(RX + 6, y + 2, this.W - 6, y + 2); y += 7; continue; }
            this._btn(x, y, size, size, it.ic, it.col ?? 0x111811, it.cb, it.active, it.tip);
            y += size + 3;
        }
    }

    // ── Popovers (one open at a time, floats over the canvas edge) ────────────────────

    _buildPopover() {
        if (!this.openPanel) return;
        const POP_W = Math.min(Math.round(this.W * 0.30), 280);
        const x = this.RAIL_X - POP_W - 2;
        this.uiGfx.fillStyle(0x0c140c, 0.96).fillRect(x, 0, POP_W + 2, this.H);
        this.uiGfx.lineStyle(1, 0x2a3a2a).strokeRect(x, 0, POP_W, this.H);
        const px = x + 8, pw = POP_W - 16;
        let py = 8;
        const titles = { load: '📂 Load entity', color: '🎨 Colour & alpha', parts: '🧩 Parts & shapes', props: '⚙ Shape', inspect: '🧬 Parameters', anim: '🎞 Animation', trace: '🖼 Import & trace' };
        this._txt(px, py + 2, titles[this.openPanel], { fontSize: this._fs(11), color: '#c8a030' });
        this._btn(x + POP_W - 24, py - 2, 20, 20, '✕', 0x221111, () => this._togglePanel(this.openPanel));
        py += 24;
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(px, py, px + pw, py); py += 6;
        if (this.openPanel === 'load') this._panelLoad(px, py, pw);
        else if (this.openPanel === 'color') this._panelColor(px, py, pw);
        else if (this.openPanel === 'parts') this._panelParts(px, py, pw);
        else if (this.openPanel === 'props') this._panelProps(px, py, pw);
        else if (this.openPanel === 'inspect') this._panelInspect(px, py, pw);
        else if (this.openPanel === 'anim') this._panelAnim(px, py, pw);
        else if (this.openPanel === 'trace') this._panelTrace(px, py, pw);
    }

    _panelTrace(PX, py, PW) {
        const ts = this.traceSettings;
        // label, key, min, max, step, hint
        const rows = [
            ['Colours', 'colorCount', 2, 32, 1, 'more = more parts/detail'],
            ['Coarseness', 'resolution', 2, 20, 1, 'lower = finer detail'],
            ['Max shapes', 'maxShapes', 20, 400, 20, 'cap on traced shapes'],
        ];
        const apply = (k, d, lo, hi) => { ts[k] = Phaser.Math.Clamp(ts[k] + d, lo, hi); this._redraw(); };
        for (const [label, key, lo, hi, step, hint] of rows) {
            this._txt(PX, py + 4, label, { fontSize: this._fs(9), color: '#668866' });
            this._btn(PX + PW - 86, py, 22, 22, '−', 0x111811, () => apply(key, -step, lo, hi));
            this._txt(PX + PW - 56, py + 4, String(ts[key]), { fontSize: this._fs(10), color: '#ddddaa' });
            this._btn(PX + PW - 26, py, 22, 22, '+', 0x111811, () => apply(key, step, lo, hi));
            py += 22;
            this._txt(PX + 6, py, hint, { fontSize: this._fs(7), color: '#557755' });
            py += 16;
        }
        py += 6;
        this._btn(PX, py, PW, 26, '🖼 Choose image…', 0x112011, () => this._importImage());
        py += 30;
        const can = !!this._lastImage;
        this._btn(PX, py, PW, 24, can ? '↻ Re-trace with these settings' : '↻ Re-trace (import first)', can ? 0x112011 : 0x161616, () => this._retrace());
        py += 30;
        this._txt(PX, py, 'Tip: import once, then tweak', { fontSize: this._fs(8), color: '#557755' });
        this._txt(PX, py + 13, 'the knobs and Re-trace.', { fontSize: this._fs(8), color: '#557755' });
    }

    _panelColor(PX, py, PW) {
        this._txt(PX, py, 'Fill colour', { fontSize: this._fs(9), color: '#668866' }); py += 16;
        const cols = 6, SW = Math.floor(PW / cols) - 2;
        PALETTE.forEach((col, i) => {
            const sx = PX + (i % cols) * (SW + 2), sy = py + Math.floor(i / cols) * (SW + 2);
            this._swatch(sx, sy, SW, col, this.newFill === col, () => {
                this.newFill = col;
                if (this.selIdx >= 0) { const s = this.activeShapes()[this.selIdx]; if (s.fill !== undefined) s.fill = col; else if (s.stroke) s.stroke.color = col; }
                this._autosave(); this._redraw();
            });
        });
        py += Math.ceil(PALETTE.length / cols) * (SW + 2) + 8;
        this._txt(PX, py + 4, 'Alpha', { fontSize: this._fs(9), color: '#668866' });
        const av = this.selIdx >= 0 ? (this.activeShapes()[this.selIdx].alpha ?? 1) : this.newAlpha;
        this._btn(PX + 48, py, 22, 22, '−', 0x111811, () => this._setAlpha(-0.1));
        this._txt(PX + 74, py + 4, av.toFixed(1), { fontSize: this._fs(10), color: '#cccccc' });
        this._btn(PX + 96, py, 22, 22, '+', 0x111811, () => this._setAlpha(0.1));
    }
    _setAlpha(d) {
        this.newAlpha = Phaser.Math.Clamp(Math.round((this.newAlpha + d) * 10) / 10, 0, 1);
        if (this.selIdx >= 0) this.activeShapes()[this.selIdx].alpha = this.newAlpha;
        this._autosave(); this._redraw();
    }

    _panelParts(PX, py, PW) {
        const pl = this._partList();
        // View (facing) selector for directional rigs.
        const vks = this._viewKeys();
        if (vks.length) {
            this._txt(PX, py + 4, 'View', { fontSize: this._fs(9), color: '#668866' });
            let vx = PX + 40;
            for (const vk of vks) {
                const w = 38;
                this._btn(vx, py, w, 20, vk.slice(0, 4), 0x111811, () => { this.view = vk; this.activePart = 0; this.selIdx = -1; this._selVerts.clear(); this._redraw(); }, this.view === vk);
                vx += w + 2;
            }
            py += 26;
        }

        const part = pl[this.activePart];
        this._txt(PX, py + 3, `${pl.length} part(s)`, { fontSize: this._fs(9), color: '#668866' });
        this._btn(PX + PW - 44, py, 44, 20, '+ part', 0x112211, () => { this._addPart(); this._redraw(); });
        py += 24;
        // Clickable part list (compact rows).
        for (let i = 0; i < pl.length; i++) {
            const p = pl[i], on = i === this.activePart;
            this._btn(PX, py, PW - 24, 18, `${i}:${p.name}  z${p.z ?? 0}·${p.shapes.length}`, on ? 0x18301a : 0x111811,
                () => { this.activePart = i; this.selIdx = -1; this._selVerts.clear(); this._redraw(); }, on);
            this._btn(PX + PW - 22, py, 22, 18, '🗑', 0x331111, () => {
                if (pl.length > 1) { this._pushUndo(); pl.splice(i, 1); this.activePart = Math.min(this.activePart, pl.length - 1); this.selIdx = -1; this._redraw(); }
            });
            py += 20;
        }
        py += 4;
        this._btn(PX, py, 70, 20, 'name ◀▶', 0x111811, () => this._cyclePartName(1));
        this._btn(PX + 74, py, 56, 20, '⌖ pivot', 0x111811, () => this._setPivotToSelection());
        this._btn(PX + PW - 56, py, 26, 20, 'z−', 0x111811, () => { if (part) { this._pushUndo(); part.z = (part.z ?? 0) - 1; this._redraw(); } });
        this._btn(PX + PW - 28, py, 26, 20, 'z+', 0x111811, () => { if (part) { this._pushUndo(); part.z = (part.z ?? 0) + 1; this._redraw(); } });
        py += 26;

        // ── Shape sub-list for the active part ──
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(PX, py, PX + PW, py); py += 6;
        const sh = this.activeShapes();
        this._txt(PX, py + 3, `${sh.length} shape(s)`, { fontSize: this._fs(9), color: '#668866' });
        py += 20;
        for (let i = 0; i < sh.length; i++) {
            const on = i === this.selIdx;
            this._btn(PX, py, PW - 48, 18, `#${i} ${sh[i].type}`, on ? 0x18301a : 0x111811,
                () => { this.selIdx = i; this._selVerts.clear(); this._redraw(); }, on);
            this._btn(PX + PW - 46, py, 22, 18, '⧉', 0x111811, () => { this._pushUndo(); const c = this._clone(sh[i]); this._translateShape(c, 2, 2); sh.push(c); this.selIdx = sh.length - 1; this._redraw(); });
            this._btn(PX + PW - 22, py, 22, 18, '🗑', 0x331111, () => { this.selIdx = i; this._deleteSelected(); this._redraw(); });
            py += 20;
        }
        py += 4;
        // Add-shape buttons (pick a type → tap canvas, OR add at origin immediately).
        this._txt(PX, py, 'add:', { fontSize: this._fs(8), color: '#668866' }); py += 14;
        let ax = PX;
        for (const [icon, tp] of SHAPE_TYPES) {
            this._btn(ax, py, 30, 22, icon, 0x111811, () => { this.newType = tp; this.tool = 'place'; this._placeShape(0, 0); this._pushUndo(); this._autosave(); this._redraw(); }, this.newType === tp);
            ax += 32; if (ax > PX + PW - 30) { ax = PX; py += 24; }
        }
        py += 26;
        const sel = sh[this.selIdx];
        if (sel?.type === 'polygon') {
            this._txt(PX, py + 3, `polygon · ${sel.points.length} pts`, { fontSize: this._fs(8), color: '#668866' });
            this._btn(PX + PW - 56, py, 26, 20, '+pt', 0x112011, () => this._addPolyPoint());
            this._btn(PX + PW - 28, py, 26, 20, '−pt', 0x331111, () => this._delPolyPoint());
        }
    }

    // ── Load / Save / params inspector ───────────────────────────────────────────────
    _panelLoad(PX, py, PW) {
        this._txt(PX, py, 'Pick a creature to edit:', { fontSize: this._fs(8), color: '#668866' }); py += 16;
        for (const id of this._entityIds()) {
            const on = id === this.entityId;
            const kind = ANIMALS[id] ? '🐾' : (UNITS[id] ? '🧍' : '◇');
            this._btn(PX, py, PW, 20, `${kind} ${id}`, on ? 0x18301a : 0x111811, () => this._loadEntity(id), on);
            py += 22;
        }
        py += 8;
        this._txt(PX, py, this.entityId ? `Loaded: ${this.entityId} · ${this.entityKind ?? 'rig'}` : 'Editing scratch rig.', { fontSize: this._fs(8), color: '#88aa88' });
        py += 14;
        this._txt(PX, py, '💾 saves a live override.', { fontSize: this._fs(7), color: '#557755' });
    }

    _panelInspect(PX, py, PW) {
        if (!this.entityKind) {
            this._txt(PX, py + 3, 'No entity loaded.', { fontSize: this._fs(9), color: '#668866' });
            this._txt(PX, py + 22, 'Use 📂 to load an animal', { fontSize: this._fs(8), color: '#446644' });
            this._txt(PX, py + 36, 'or unit, then tune it here.', { fontSize: this._fs(8), color: '#446644' });
            return;
        }
        const fields = ENTITY_PARAM_SCHEMA.filter(f => f.applies === 'both' || f.applies === this.entityKind);
        const top = py, bottom = this.H - 6;
        let yy = py - this._inspScroll, group = null;
        const draw = (fn, h) => { if (yy >= top && yy <= bottom - h) fn(yy); yy += h; };
        for (const f of fields) {
            if (f.group !== group) { group = f.group; draw(y => this._txt(PX, y + 2, `— ${group}${f.wired === false ? '  (saved, not yet wired)' : ''}`, { fontSize: this._fs(8), color: '#8a7a40' }), 16); }
            draw(y => this._inspectRow(PX, y, PW, f), 20);
        }
        // scrollbar hint
        this._txt(PX, bottom - 12, 'scroll to see more · 💾 save', { fontSize: this._fs(7), color: '#446644' });
    }

    _inspectRow(PX, y, PW, f) {
        const val = this.params[f.key];
        this._txt(PX, y + 4, f.label, { fontSize: this._fs(8), color: f.wired === false ? '#7a8a6a' : '#a8c8a8' });
        const RX = PX + PW - 96;
        const set = (v) => { this.params[f.key] = v; this._autosave(); this._redraw(); };
        if (f.kind === 'num' || f.kind === 'int') {
            const step = f.step ?? 1, lo = f.min ?? -Infinity, hi = f.max ?? Infinity;
            const fmt = (n) => f.kind === 'int' ? String(Math.round(n)) : (Math.round(n * 100) / 100).toString();
            this._btn(RX, y, 20, 18, '−', 0x111811, () => set(Phaser.Math.Clamp(Math.round(((val ?? f.def) - step) * 100) / 100, lo, hi)));
            this._txt(RX + 24, y + 4, fmt(val ?? f.def), { fontSize: this._fs(8), color: '#ddddaa' });
            this._btn(RX + 74, y, 20, 18, '+', 0x111811, () => set(Phaser.Math.Clamp(Math.round(((val ?? f.def) + step) * 100) / 100, lo, hi)));
        } else if (f.kind === 'bool') {
            this._btn(RX + 40, y, 54, 18, (val ? 'ON' : 'off'), 0x111811, () => set(!val), !!val);
        } else if (f.kind === 'enum' || f.kind === 'key') {
            const opts = f.kind === 'key' ? (KEY_CHOICES[f.keyset] ?? []) : f.options;
            const cur = Math.max(0, opts.indexOf(val));
            const cyc = (d) => set(opts[(cur + d + opts.length) % opts.length]);
            this._btn(RX, y, 18, 18, '◀', 0x111811, () => cyc(-1));
            const label = f.kind === 'key' ? String(val ?? '—').split('.').pop() : String(val ?? '—');
            this._txt(RX + 21, y + 4, label.slice(0, 9), { fontSize: this._fs(7), color: '#ddddaa' });
            this._btn(RX + 76, y, 18, 18, '▶', 0x111811, () => cyc(1));
        }
    }

    _saveOverride() {
        if (!this.entityId) { this._toast('Load an entity first (📂)'); return; }
        const rig = this._clone(this.rig);
        const params = this.entityKind ? { ...this.params } : undefined;
        saveOverride(this.entityId, { rig, params });
        applyEntityOverrides(SPRITES, ANIMALS, UNITS);   // live: game shows it without reload
        this._toast(`Saved '${this.entityId}' ✓ (live)`);
    }

    _toast(msg) {
        if (!this._toastTxt) this._toastTxt = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: this._fs(11), color: '#cfeac0', backgroundColor: '#16301a', padding: { x: 8, y: 4 } }).setDepth(40);
        this._toastTxt.setText(msg).setVisible(true);
        this._toastTxt.setPosition(Math.round(this.CANVAS_W / 2 - this._toastTxt.width / 2), this.H - 44);
        this.time.delayedCall(1500, () => this._toastTxt?.setVisible(false));
    }

    _panelProps(PX, py, PW) {
        const s = this.activeShapes()[this.selIdx];
        if (!s) {
            this._txt(PX, py + 3, 'No shape selected.', { fontSize: this._fs(9), color: '#668866' });
            this._txt(PX, py + 22, 'Pick a shape tool and tap', { fontSize: this._fs(8), color: '#446644' });
            this._txt(PX, py + 36, 'the canvas to add one.', { fontSize: this._fs(8), color: '#446644' });
            return;
        }
        this._txt(PX, py, `#${this.selIdx} ${s.type}`, { fontSize: this._fs(10), color: '#c8a030' });
        this._btn(PX + PW - 56, py - 2, 56, 20, '🗑 del', 0x331111, () => { this._deleteSelected(); this._redraw(); });
        py += 20;
        const fields = {
            circle: ['x', 'y', 'r'], ellipse: ['x', 'y', 'rx', 'ry'],
            rect: ['x', 'y', 'w', 'h'], triangle: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3'],
            line: ['x1', 'y1', 'x2', 'y2'], polygon: [],
        }[s.type] ?? [];
        let col = 0;
        for (const f of fields) {
            if (typeof s[f] !== 'number') continue;
            const cx = PX + col * (PW / 2);
            this._txt(cx, py + 3, f, { fontSize: this._fs(8), color: '#668866' });
            this._btn(cx + 24, py, 18, 18, '−', 0x111811, () => this._nudge(f, -1));
            this._txt(cx + 44, py + 3, String(s[f]), { fontSize: this._fs(8), color: '#ddddaa' });
            this._btn(cx + 68, py, 18, 18, '+', 0x111811, () => this._nudge(f, 1));
            col++; if (col === 2) { col = 0; py += 22; }
        }
        if (col !== 0) py += 22;
        const hasSt = !!s.stroke;
        this._btn(PX, py, 72, 22, hasSt ? '⊘ stroke' : '+ stroke', 0x111811, () => {
            this._pushUndo();
            if (hasSt) delete s.stroke; else s.stroke = { color: this.newFill, width: 1, alpha: 1 };
            this._redraw();
        }, hasSt);
        if (hasSt) {
            this._txt(PX + 78, py + 4, 'w', { fontSize: this._fs(8), color: '#668866' });
            this._btn(PX + 94, py, 18, 22, '−', 0x111811, () => { s.stroke.width = Math.max(0.5, Math.round((s.stroke.width - 0.5) * 2) / 2); this._autosave(); this._redraw(); });
            this._txt(PX + 114, py + 4, String(s.stroke.width ?? 1), { fontSize: this._fs(8), color: '#ddddaa' });
            this._btn(PX + 132, py, 18, 22, '+', 0x111811, () => { s.stroke.width = Math.round((s.stroke.width + 0.5) * 2) / 2; this._autosave(); this._redraw(); });
        }
        py += 26;
        if (s.type === 'polygon') this._txt(PX, py, `polygon: ${s.points.length} pts · drag to move`, { fontSize: this._fs(8), color: '#668866' });
    }

    _panelAnim(PX, py, PW) {
        const clip = this.rig.clips?.[this.activeClip];
        this._txt(PX, py + 3, `Clip '${this.activeClip}'`, { fontSize: this._fs(9), color: '#668866' });
        py += 16;
        this._txt(PX, py + 3, `t ${this.playhead.toFixed(2)} / ${(clip?.length ?? 1).toFixed(2)}`, { fontSize: this._fs(8), color: '#88aa88' });
        py += 18;
        this._btn(PX, py, 44, 22, this.playing ? '⏸' : '▶', 0x111811, () => { this.playing = !this.playing; this._scrubbing = false; this._redraw(); }, this.playing);
        this._btn(PX + 48, py, 28, 22, 't−', 0x111811, () => { this.playing = false; this._scrubbing = true; this.playhead = Math.max(0, Math.round((this.playhead - 0.05) * 100) / 100); this._redraw(); });
        this._btn(PX + 78, py, 28, 22, 't+', 0x111811, () => { this.playing = false; this._scrubbing = true; this.playhead = Math.round((this.playhead + 0.05) * 100) / 100; this._redraw(); });
        py += 26;
        this._btn(PX, py, 72, 22, '＋ key', 0x112011, () => this._addKey());
        this._btn(PX + 78, py, 74, 22, 'clr track', 0x331111, () => this._clearTrack());
        py += 28;
        this._txt(PX, py + 3, `pose r${this.pose.rot.toFixed(2)} x${this.pose.x} y${this.pose.y}`, { fontSize: this._fs(8), color: '#668866' });
        py += 16;
        const poseBtn = (x, lbl, fn) => this._btn(x, py, 28, 20, lbl, 0x111811, () => { fn(); this._scrubbing = true; this.playing = false; this._redraw(); });
        poseBtn(PX, 'r−', () => this.pose.rot = Math.round((this.pose.rot - 0.1) * 100) / 100);
        poseBtn(PX + 30, 'r+', () => this.pose.rot = Math.round((this.pose.rot + 0.1) * 100) / 100);
        poseBtn(PX + 62, 'x−', () => this.pose.x -= 1);
        poseBtn(PX + 92, 'x+', () => this.pose.x += 1);
        poseBtn(PX + 122, 'y−', () => this.pose.y -= 1);
        poseBtn(PX + 152, 'y+', () => this.pose.y += 1);
    }

    // ── Export ──────────────────────────────────────────────────────────────────────

    _exportText() {
        // Pretty rig with hex colours, ready to drop into js/content/sprites/<id>.js
        const rig = this._clone(this.rig);
        const json = JSON.stringify(rig, null, 2)
            .replace(/"(fill|color)":\s*(\d+)/g, (_m, k, n) => `"${k}": 0x${Number(n).toString(16).padStart(6, '0')}`);
        let out = `// Generated by the entity editor. Drop into js/content/sprites/ and register in index.js.\nexport default ${json};\n`;
        if (this.entityKind && Object.keys(this.params).length) {
            const p = JSON.stringify(this.params, null, 2);
            out += `\n// ── Params — merge these scalar fields into js/content/${this.entityKind}s/${this.entityId}.js ──\n${p}\n`;
        }
        return out;
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
