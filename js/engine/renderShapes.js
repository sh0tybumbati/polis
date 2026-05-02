/**
 * Generic shape renderer for declarative sprite definitions.
 *
 * Shape object fields:
 *   type      'circle' | 'triangle' | 'rect' | 'line'
 *   fill      hex color OR '$varName' string resolved from vars
 *   stroke    { color, width, alpha } — all fields accept '$varName'
 *   alpha     0–1, default 1 (applies to fill only; stroke.alpha is separate)
 *   when      (vars) => boolean — if present, shape is skipped when falsy
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

    const sc = v => res(v, vars) * scale;

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
                if (s.fill !== undefined) gfx.fillCircle(sc(s.x), sc(s.y), sc(s.r));
                if (s.stroke)            gfx.strokeCircle(sc(s.x), sc(s.y), sc(s.r));
                break;
            case 'triangle':
                if (s.fill !== undefined) gfx.fillTriangle(
                    sc(s.x1), sc(s.y1), sc(s.x2), sc(s.y2), sc(s.x3), sc(s.y3));
                if (s.stroke) gfx.strokeTriangle(
                    sc(s.x1), sc(s.y1), sc(s.x2), sc(s.y2), sc(s.x3), sc(s.y3));
                break;
            case 'rect':
                if (s.fill !== undefined) gfx.fillRect(sc(s.x), sc(s.y), sc(s.w), sc(s.h));
                break;
            case 'line':
                if (s.stroke) gfx.lineBetween(sc(s.x1), sc(s.y1), sc(s.x2), sc(s.y2));
                break;
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
