/**
 * Generic shape renderer for declarative sprite definitions.
 *
 * Shape object fields:
 *   type      'circle' | 'triangle' | 'rect' | 'line' | 'polygon' | 'ellipse'
 *   fill      hex color OR '$varName' string resolved from vars
 *   stroke    { color, width, alpha } — all fields accept '$varName'
 *   alpha     0–1, default 1 (applies to fill only; stroke.alpha is separate)
 *   when      (vars) => boolean — if present, shape is skipped when falsy
 *
 * Geometry per type:
 *   circle    x, y, r
 *   triangle  x1,y1, x2,y2, x3,y3
 *   rect      x, y, w, h
 *   line      x1,y1, x2,y2
 *   polygon   points: [{x,y}, …]   (closed; used by the image-trace pipeline)
 *   ellipse   x, y, rx, ry, rot?   (rot in radians — rotated ellipses emit a polygon)
 *
 * '$varName' resolution works on any numeric or color field.
 * Shapes are drawn in array order (painter's algorithm).
 */

export function res(val, vars) {
    return (typeof val === 'string' && val[0] === '$') ? vars[val.slice(1)] : val;
}

/**
 * opts.scale — multiply all position/size coords (default 1). Stroke widths are NOT scaled
 *              so they stay visually thin at high zoom (useful for the sprite editor).
 * opts.alpha — global alpha multiplier (default 1, used to ghost shapes in editor).
 */
export function renderShapes(gfx, shapes, vars, opts = {}) {
    const scale = opts.scale ?? 1;
    const globalAlpha = opts.alpha ?? 1;
    const ox = opts.ox ?? 0;
    const oy = opts.oy ?? 0;

    const sc  = v => res(v, vars) * scale;          // size: no offset
    const scx = v => res(v, vars) * scale + ox;     // x position
    const scy = v => res(v, vars) * scale + oy;     // y position

    for (const s of shapes) {
        if (s.when && !s.when(vars)) continue;

        if (s.stroke) {
            gfx.lineStyle(
                res(s.stroke.width ?? 1, vars),
                res(s.stroke.color,      vars),
                res(s.stroke.alpha ?? 1, vars) * globalAlpha,
            );
        }

        if (s.fill !== undefined) {
            gfx.fillStyle(res(s.fill, vars), res(s.alpha ?? 1, vars) * globalAlpha);
        }

        switch (s.type) {
            case 'circle':
                if (s.fill !== undefined) gfx.fillCircle(scx(s.x), scy(s.y), sc(s.r));
                if (s.stroke)            gfx.strokeCircle(scx(s.x), scy(s.y), sc(s.r));
                break;
            case 'triangle':
                if (s.fill !== undefined) gfx.fillTriangle(
                    scx(s.x1), scy(s.y1), scx(s.x2), scy(s.y2), scx(s.x3), scy(s.y3));
                if (s.stroke) gfx.strokeTriangle(
                    scx(s.x1), scy(s.y1), scx(s.x2), scy(s.y2), scx(s.x3), scy(s.y3));
                break;
            case 'rect':
                if (s.fill !== undefined) gfx.fillRect(scx(s.x), scy(s.y), sc(s.w), sc(s.h));
                break;
            case 'line':
                if (s.stroke) gfx.lineBetween(scx(s.x1), scy(s.y1), scx(s.x2), scy(s.y2));
                break;
            case 'polygon': {
                const pts = (s.points ?? []).map(p => ({ x: scx(p.x), y: scy(p.y) }));
                if (pts.length < 3) break;
                if (s.fill !== undefined) gfx.fillPoints(pts, true);
                if (s.stroke)            gfx.strokePoints(pts, true);
                break;
            }
            case 'ellipse': {
                const cx = scx(s.x), cy = scy(s.y), rx = sc(s.rx), ry = sc(s.ry);
                const rot = res(s.rot ?? 0, vars);
                if (!rot) {
                    if (s.fill !== undefined) gfx.fillEllipse(cx, cy, rx * 2, ry * 2);
                    if (s.stroke)            gfx.strokeEllipse(cx, cy, rx * 2, ry * 2);
                } else {
                    // Phaser has no rotated-ellipse primitive — approximate with a polygon.
                    const N = 24, cos = Math.cos(rot), sin = Math.sin(rot), pts = [];
                    for (let i = 0; i < N; i++) {
                        const a = (i / N) * Math.PI * 2;
                        const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
                        pts.push({ x: cx + ex * cos - ey * sin, y: cy + ex * sin + ey * cos });
                    }
                    if (s.fill !== undefined) gfx.fillPoints(pts, true);
                    if (s.stroke)            gfx.strokePoints(pts, true);
                }
                break;
            }
        }
    }
}

/**
 * Standard LoD tier selection from camera zoom.
 *   0 — minimap      (zoom < 0.20)
 *   1 — silhouette   (zoom < 0.50)
 *   2 — full detail  (zoom < 1.50)
 *   3 — enhanced     (zoom ≥ 1.50)
 */
export function zoomToLod(zoom) {
    if (zoom < 0.20) return 0;
    if (zoom < 0.50) return 1;
    if (zoom < 1.50) return 2;
    return 3;
}
