/**
 * vectorize.js — image → polygon tracer (DOM-free port of VectorParser/app.js).
 *
 * Pipeline: median-cut quantize → 4-connected BFS blob segmentation → small-blob
 * absorption → fit a primitive (polygon / circle / ellipse / line / mix) to each blob
 * → RDP-simplify polygon contours. Each blob becomes ONE shape in renderShapes format
 * (see js/engine/renderShapes.js), so traced sprites render through the same path as
 * hand-authored ones.
 *
 *   vectorizeImage(imageData, settings) → { shapes, groups, palette }
 *     imageData  — an ImageData (or anything with {data, width, height})
 *     settings   — { colorCount=8, resolution=6, maxShapes=120, opacity=1,
 *                    primitiveType='polygon', includeBackground=false }
 *     shapes     — [ renderShapes-format shape, … ]   (sorted big→small)
 *     groups     — [ { name, shapeIndices:[…] }, … ]  (seeded one per palette color)
 *     palette    — [ 0xRRGGBB, … ]
 *
 * No DOM / no UI coupling — safe to run in the Phaser sprite editor or headless.
 */

// ── color utilities ────────────────────────────────────────────────────────
function colorDistance(c1, c2) {
    return (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2; // squared is fine for nearest
}
function rgbToNum(r, g, b) {
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

// ── median-cut quantizer ─────────────────────────────────────────────────────
function medianCut(pixels, numColors) {
    if (pixels.length === 0) return [[128, 128, 128]];
    let buckets = [pixels];
    const maxB = Math.max(numColors, 64);
    while (buckets.length < numColors && buckets.length < maxB) {
        let maxR = 0, maxCh = 0, maxI = -1;
        for (let bi = 0; bi < buckets.length; bi++) {
            const bk = buckets[bi];
            if (bk.length < 2) continue;
            for (let c = 0; c < 3; c++) {
                let mn = 255, mx = 0;
                for (let j = 0; j < bk.length; j++) {
                    if (bk[j][c] < mn) mn = bk[j][c];
                    if (bk[j][c] > mx) mx = bk[j][c];
                }
                const rng = mx - mn;
                if (rng > maxR) { maxR = rng; maxCh = c; maxI = bi; }
            }
        }
        if (maxR === 0 || maxI === -1) break;
        const bk = buckets[maxI];
        bk.sort((a, b) => a[maxCh] - b[maxCh]);
        const mid = Math.floor(bk.length / 2);
        buckets.splice(maxI, 1, bk.slice(0, mid), bk.slice(mid));
    }
    return buckets.map(bk => {
        if (!bk.length) return [128, 128, 128];
        let r = 0, g = 0, b = 0;
        for (const p of bk) { r += p[0]; g += p[1]; b += p[2]; }
        const n = bk.length;
        return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });
}

function nearestColorIdx(target, palette) {
    let minD = Infinity, best = 0;
    for (let i = 0; i < palette.length; i++) {
        const d = colorDistance(target, palette[i]);
        if (d < minD) { minD = d; best = i; }
    }
    return best;
}

function samplePixels(data, w, h) {
    const pixels = [];
    const step = 3;
    for (let py = 0; py < h; py += step) {
        for (let px = 0; px < w; px += step) {
            const idx = (py * w + px) * 4;
            if (data[idx + 3] < 40) continue;
            pixels.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
    }
    return pixels;
}

// ── shape fitting ────────────────────────────────────────────────────────────
function centroidAndMoments(pixels, w) {
    const N = pixels.length;
    let sumX = 0, sumY = 0;
    for (let i = 0; i < N; i++) { sumX += pixels[i] % w; sumY += (pixels[i] / w) | 0; }
    const cx = sumX / N, cy = sumY / N;
    let mu20 = 0, mu02 = 0, mu11 = 0;
    for (let i = 0; i < N; i++) {
        const dx = (pixels[i] % w) - cx, dy = ((pixels[i] / w) | 0) - cy;
        mu20 += dx * dx; mu02 += dy * dy; mu11 += dx * dy;
    }
    mu20 /= N; mu02 /= N; mu11 /= N;
    return { cx, cy, mu20, mu02, mu11 };
}

function fitCircle(pixels, w, fill, alpha) {
    const { cx, cy } = centroidAndMoments(pixels, w);
    const r = Math.max(1, Math.sqrt(pixels.length / Math.PI) + 0.5);
    return { type: 'circle', x: Math.round(cx), y: Math.round(cy), r: Math.round(r), fill, alpha };
}

function fitEllipse(pixels, w, fill, alpha) {
    const { cx, cy, mu20, mu02, mu11 } = centroidAndMoments(pixels, w);
    const common = Math.sqrt((mu20 - mu02) ** 2 + 4 * mu11 * mu11);
    const l1 = (mu20 + mu02 + common) / 2, l2 = (mu20 + mu02 - common) / 2;
    const rx = Math.max(1, 2 * Math.sqrt(Math.max(0.1, l1)) + 0.5);
    const ry = Math.max(1, 2 * Math.sqrt(Math.max(0.1, l2)) + 0.5);
    const rot = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
    return { type: 'ellipse', x: Math.round(cx), y: Math.round(cy), rx: Math.round(rx), ry: Math.round(ry), rot, fill, alpha };
}

function fitLine(pixels, w, fill, alpha) {
    const { cx, cy, mu20, mu02, mu11 } = centroidAndMoments(pixels, w);
    const common = Math.sqrt((mu20 - mu02) ** 2 + 4 * mu11 * mu11);
    const l1 = (mu20 + mu02 + common) / 2, l2 = (mu20 + mu02 - common) / 2;
    const rx = 2 * Math.sqrt(Math.max(0.1, l1)), ry = 2 * Math.sqrt(Math.max(0.1, l2));
    const angle = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
    const dx = rx * Math.cos(angle), dy = rx * Math.sin(angle);
    return {
        type: 'line',
        x1: Math.round(cx - dx), y1: Math.round(cy - dy),
        x2: Math.round(cx + dx), y2: Math.round(cy + dy),
        stroke: { color: fill, width: Math.max(1, Math.round(ry * 2)), alpha },
    };
}

function bboxPolygon(pixels, w, h, fill, alpha) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let i = 0; i < pixels.length; i++) {
        const px = pixels[i] % w, py = (pixels[i] / w) | 0;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    return { type: 'polygon', fill, alpha, points: [
        { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY },
    ] };
}

function fitPolygon(pixels, w, h, epsilon, fill, alpha) {
    let contour = getBlobContour(pixels, w, h);
    if (contour.length > 500) {
        const step = Math.ceil(contour.length / 500);
        const ds = [];
        for (let i = 0; i < contour.length; i += step) ds.push(contour[i]);
        if (contour.length > 1) ds.push(contour[contour.length - 1]);
        contour = ds;
    }
    const simplified = rdp(contour, epsilon);
    const pts = [];
    for (let i = 0; i < simplified.length; i++) {
        const p = simplified[i];
        if (i === 0) { pts.push(p); continue; }
        const prev = pts[pts.length - 1];
        if (prev.x !== p.x || prev.y !== p.y) pts.push(p);
    }
    if (pts.length < 3) return bboxPolygon(pixels, w, h, fill, alpha);
    return { type: 'polygon', fill, alpha, points: pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) };
}

function fitMixed(pixels, w, h, epsilon, fill, alpha) {
    const { mu20, mu02, mu11 } = centroidAndMoments(pixels, w);
    const common = Math.sqrt((mu20 - mu02) ** 2 + 4 * mu11 * mu11);
    const l1 = (mu20 + mu02 + common) / 2, l2 = (mu20 + mu02 - common) / 2;
    const ratio = l1 > 0 ? l2 / l1 : 1.0;
    if (ratio < 0.08) return fitLine(pixels, w, fill, alpha);
    if (ratio > 0.85) return fitCircle(pixels, w, fill, alpha);
    const simplified = rdp(getBlobContour(pixels, w, h), epsilon);
    return simplified.length > 8 ? fitPolygon(pixels, w, h, epsilon, fill, alpha)
                                 : fitEllipse(pixels, w, fill, alpha);
}

// ── Moore-neighbor contour trace ─────────────────────────────────────────────
function getBlobContour(pixels, w, h) {
    const blobSet = new Set(pixels);
    let startX = w, startY = h, startIdx = -1;
    for (let i = 0; i < pixels.length; i++) {
        const px = pixels[i] % w, py = (pixels[i] / w) | 0;
        if (py < startY || (py === startY && px < startX)) { startX = px; startY = py; startIdx = pixels[i]; }
    }
    if (startIdx === -1) return [];
    const points = [];
    let cx = startX, cy = startY;
    const dx = [1, 1, 0, -1, -1, -1, 0, 1];
    const dy = [0, -1, -1, -1, 0, 1, 1, 1];
    let backtrackDir = 4;
    const maxPoints = pixels.length * 2 + 10;
    let iter = 0;
    while (iter < maxPoints) {
        points.push({ x: cx, y: cy });
        let nextX = -1, nextY = -1, found = false, ndir = 0;
        for (let step = 0; step < 8; step++) {
            ndir = (backtrackDir + step) % 8;
            const tx = cx + dx[ndir], ty = cy + dy[ndir];
            if (tx >= 0 && tx < w && ty >= 0 && ty < h && blobSet.has(ty * w + tx)) {
                nextX = tx; nextY = ty; found = true; break;
            }
        }
        if (!found || (nextX === startX && nextY === startY)) break;
        cx = nextX; cy = nextY;
        backtrackDir = (ndir + 6) % 8;
        iter++;
    }
    return points;
}

function rdp(points, epsilon) {
    if (points.length <= 2) return points;
    let maxDist = 0, index = -1;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
        const d = perpDist(points[i], points[0], points[end]);
        if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > epsilon) {
        const r1 = rdp(points.slice(0, index + 1), epsilon);
        const r2 = rdp(points.slice(index), epsilon);
        return r1.slice(0, r1.length - 1).concat(r2);
    }
    return [points[0], points[end]];
}

function perpDist(p, p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / Math.hypot(dx, dy);
}

function shapeArea(s) {
    if (s.type === 'circle')  return Math.PI * s.r * s.r;
    if (s.type === 'ellipse') return Math.PI * s.rx * s.ry;
    if (s.type === 'line')    return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * (s.stroke?.width ?? 1);
    if (s.type === 'polygon') {
        const pts = s.points;
        if (pts.length < 3) return 0;
        let sum = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            sum += a.x * b.y - b.x * a.y;
        }
        return Math.abs(sum) / 2;
    }
    return 0;
}

// ── main entry ───────────────────────────────────────────────────────────────
export function vectorizeImage(imageData, settings = {}) {
    const {
        colorCount = 8,
        resolution = 6,
        maxShapes = 120,
        opacity = 1,
        primitiveType = 'polygon',
        includeBackground = false,
    } = settings;

    const data = imageData.data;
    const w = imageData.width, h = imageData.height;

    // 1) quantize
    const paletteRGB = medianCut(samplePixels(data, w, h), Math.min(colorCount, 64));
    const palette = paletteRGB.map(c => rgbToNum(c[0], c[1], c[2]));

    // 2) quantized color-index grid (255 = transparent)
    const colorGrid = new Uint8Array(w * h);
    const colorCounts = new Uint32Array(256);
    for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        if (data[idx + 3] < 40) { colorGrid[i] = 255; continue; }
        const cIdx = nearestColorIdx([data[idx], data[idx + 1], data[idx + 2]], paletteRGB);
        colorGrid[i] = cIdx;
        colorCounts[cIdx]++;
    }

    // 3) connected-component segmentation (BFS, 4-connected)
    const visited = new Uint8Array(w * h);
    const queue = new Uint32Array(w * h);
    const blobs = [];
    const minArea = Math.max(2, Math.round((resolution ** 2) / 8));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (visited[idx] === 1 || colorGrid[idx] === 255) continue;
            const colorIdx = colorGrid[idx];
            let qHead = 0, qTail = 0;
            queue[qTail++] = idx; visited[idx] = 1;
            while (qHead < qTail) {
                const curr = queue[qHead++];
                const ccx = curr % w, ccy = (curr / w) | 0;
                if (ccx > 0)     { const n = curr - 1; if (!visited[n] && colorGrid[n] === colorIdx) { visited[n] = 1; queue[qTail++] = n; } }
                if (ccx < w - 1) { const n = curr + 1; if (!visited[n] && colorGrid[n] === colorIdx) { visited[n] = 1; queue[qTail++] = n; } }
                if (ccy > 0)     { const n = curr - w; if (!visited[n] && colorGrid[n] === colorIdx) { visited[n] = 1; queue[qTail++] = n; } }
                if (ccy < h - 1) { const n = curr + w; if (!visited[n] && colorGrid[n] === colorIdx) { visited[n] = 1; queue[qTail++] = n; } }
            }
            if (qTail >= minArea) {
                const pixels = new Uint32Array(qTail);
                for (let i = 0; i < qTail; i++) pixels[i] = queue[i];
                blobs.push({ colorIdx, pixels });
            }
        }
    }
    blobs.sort((a, b) => b.pixels.length - a.pixels.length);

    // 4) small-blob absorption (smaller blobs merge into adjacent larger ones)
    const pixelToBlob = new Int32Array(w * h).fill(-1);
    for (let i = 0; i < blobs.length; i++) {
        const px = blobs[i].pixels;
        for (let p = 0; p < px.length; p++) pixelToBlob[px[p]] = i;
    }
    for (let i = blobs.length - 1; i >= 0; i--) {
        const pixels = blobs[i].pixels;
        const adjacent = new Set();
        for (let p = 0; p < pixels.length; p++) {
            const idx = pixels[p], ccx = idx % w, ccy = (idx / w) | 0;
            const nb = [];
            if (ccx > 0) nb.push(idx - 1);
            if (ccx < w - 1) nb.push(idx + 1);
            if (ccy > 0) nb.push(idx - w);
            if (ccy < h - 1) nb.push(idx + w);
            for (const nIdx of nb) {
                const other = pixelToBlob[nIdx];
                if (other !== -1 && other < i) adjacent.add(other);
            }
        }
        for (const largerIdx of adjacent) {
            const lb = blobs[largerIdx];
            const merged = new Uint32Array(lb.pixels.length + pixels.length);
            merged.set(lb.pixels); merged.set(pixels, lb.pixels.length);
            lb.pixels = merged;
        }
    }

    // 5) optional dominant-color background rect
    const shapes = [];
    const shapeColorIdx = [];
    if (includeBackground) {
        let bgDom = 0, maxCount = 0;
        for (let i = 0; i < 256; i++) if (colorCounts[i] > maxCount) { maxCount = colorCounts[i]; bgDom = i; }
        shapes.push({ type: 'polygon', fill: palette[bgDom] ?? 0x808080, alpha: 1,
            points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] });
        shapeColorIdx.push(bgDom);
    }

    // 6) fit a primitive per blob
    const epsilon = Math.max(0.5, resolution / 8);
    const budget = Math.max(1, maxShapes - shapes.length);
    for (const blob of blobs.slice(0, budget)) {
        const uniquePixels = new Uint32Array(new Set(blob.pixels));
        const fill = palette[blob.colorIdx] ?? 0x808080;
        let shape;
        switch (primitiveType) {
            case 'circle':  shape = fitCircle(uniquePixels, w, fill, opacity); break;
            case 'ellipse': shape = fitEllipse(uniquePixels, w, fill, opacity); break;
            case 'line':    shape = fitLine(uniquePixels, w, fill, opacity); break;
            case 'mix':     shape = fitMixed(uniquePixels, w, h, epsilon, fill, opacity); break;
            default:        shape = fitPolygon(uniquePixels, w, h, epsilon, fill, opacity); break;
        }
        if (shape) { shapes.push(shape); shapeColorIdx.push(blob.colorIdx); }
    }

    // 7) sort foreground big→small (keep optional bg at index 0)
    const fgStart = includeBackground ? 1 : 0;
    const order = shapes.map((_, i) => i);
    const fgOrder = order.slice(fgStart).sort((a, b) => shapeArea(shapes[b]) - shapeArea(shapes[a]));
    const finalOrder = order.slice(0, fgStart).concat(fgOrder);
    const sortedShapes = finalOrder.map(i => shapes[i]);
    const sortedColorIdx = finalOrder.map(i => shapeColorIdx[i]);

    // 8) seed one candidate group per palette colour (a sensible body-part starting point)
    const byColor = new Map();
    sortedColorIdx.forEach((ci, si) => {
        if (!byColor.has(ci)) byColor.set(ci, []);
        byColor.get(ci).push(si);
    });
    const groups = [...byColor.entries()].map(([ci, idxs], n) => ({
        name: `part${n + 1}`,
        color: palette[ci] ?? 0x808080,
        shapeIndices: idxs,
    }));

    return { shapes: sortedShapes, groups, palette };
}

export default vectorizeImage;
