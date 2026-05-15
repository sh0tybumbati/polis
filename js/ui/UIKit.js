/**
 * UIKit — shared UI primitives.
 * All functions take a Phaser.Scene as first argument and return the
 * created object(s) so callers can assign depth, ignore cameras, etc.
 */

export const THEME = {
    bg:          0x130e06,
    panel:       0x1a1408,
    border:      0xc8a030,
    borderAlpha: 0.30,
    gold:        '#c8a030',
    text:        '#d4c8a8',
    dim:         '#554433',
    muted:       '#887755',
    hover:       '#ffffff',
    fontMono:    'monospace',
    fontSerif:   'Georgia, "Times New Roman", serif',
};

/**
 * Dark rounded panel background with optional gold border.
 * Returns the Graphics object.
 */
export function panel(scene, x, y, w, h, {
    alpha       = 0.92,
    radius      = 6,
    borderAlpha = THEME.borderAlpha,
    color       = THEME.panel,
} = {}) {
    const g = scene.add.graphics();
    g.fillStyle(color, alpha).fillRoundedRect(x, y, w, h, radius);
    if (borderAlpha > 0)
        g.lineStyle(1, THEME.border, borderAlpha).strokeRoundedRect(x, y, w, h, radius);
    return g;
}

/**
 * Thin horizontal rule with a centre diamond dot.
 * cx/y are the centre point; w is full width.
 * Returns the Graphics object.
 */
export function rule(scene, cx, y, w, {
    color = THEME.border,
    alpha = 0.35,
    depth = 0,
} = {}) {
    const g = scene.add.graphics().setDepth(depth);
    g.lineStyle(1, color, alpha).lineBetween(cx - w / 2, y, cx + w / 2, y);
    g.fillStyle(color, alpha + 0.2).fillCircle(cx, y, 2);
    return g;
}

/**
 * Interactive serif text button with underline on hover.
 * Inactive buttons (cb = null/undefined) are dimmed and non-interactive.
 * Returns { text, zone, underline } — zone/underline may be null for inactive buttons.
 */
export function textButton(scene, x, y, label, cb, {
    fontSize      = '22px',
    color         = '#e8d898',
    hoverColor    = '#ffffff',
    fontFamily    = THEME.fontSerif,
    letterSpacing = 4,
    depth         = 0,
} = {}) {
    const active = !!cb;
    const txt = scene.add.text(x, y, label, {
        fontFamily, fontSize,
        color: active ? color : THEME.dim,
        letterSpacing,
        shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(depth);

    if (!active) return { text: txt, zone: null, underline: null };

    const ug = scene.add.graphics().setAlpha(0).setDepth(depth);
    const underlineY = y + 16;
    const uw = txt.width + 12;
    ug.lineStyle(1, 0xd4aa40, 0.8).lineBetween(x - uw / 2, underlineY, x + uw / 2, underlineY);

    const zone = scene.add.zone(x, y, Math.max(txt.width + 40, 200), 40)
        .setInteractive({ cursor: 'pointer' }).setDepth(depth + 1);
    zone.on('pointerover',  () => { txt.setColor(hoverColor); ug.setAlpha(1); });
    zone.on('pointerout',   () => { txt.setColor(color);      ug.setAlpha(0); });
    zone.on('pointerdown',  cb);

    return { text: txt, zone, underline: ug };
}

/**
 * Compact monospace label + value on one row, left/right anchored.
 * Returns the value Text object so the caller can call .setText() to update it.
 */
export function statRow(scene, lx, rx, y, label, value = '', {
    labelColor = THEME.muted,
    valueColor = THEME.text,
    fontSize   = '10px',
    depth      = 21,
} = {}) {
    const ts = { fontFamily: THEME.fontMono, fontSize, stroke: '#000000', strokeThickness: 2 };
    scene.add.text(lx, y, label, { ...ts, color: labelColor }).setOrigin(0, 0.5).setDepth(depth);
    return scene.add.text(rx, y, value, { ...ts, color: valueColor }).setOrigin(1, 0.5).setDepth(depth);
}

/**
 * Tab button strip. Returns a controller with .setActive(label) and .destroy().
 * onSelect(label) fires when a tab is clicked.
 */
export function tabStrip(scene, x, y, w, h, labels, activeLabel, onSelect, {
    depth      = 22,
    activeBg   = 0x2a1e08,
    inactiveBg = THEME.bg,
} = {}) {
    const tw   = Math.floor(w / labels.length);
    let current = activeLabel;
    const tabs  = [];

    labels.forEach((lbl, i) => {
        const bx  = x + i * tw;
        const bg  = scene.add.graphics().setDepth(depth);
        const txt = scene.add.text(bx + tw / 2, y + h / 2, lbl, {
            fontFamily: THEME.fontMono, fontSize: '10px', color: THEME.muted,
        }).setOrigin(0.5).setDepth(depth + 1);

        const draw = (active) => {
            bg.clear();
            bg.fillStyle(active ? activeBg : inactiveBg, 0.9).fillRect(bx, y, tw, h);
            bg.lineStyle(1, THEME.border, active ? 0.5 : 0.15).strokeRect(bx, y, tw, h);
            txt.setColor(active ? THEME.gold : THEME.muted);
        };
        draw(lbl === current);

        const zone = scene.add.zone(bx + tw / 2, y + h / 2, tw, h)
            .setInteractive({ cursor: 'pointer' }).setDepth(depth + 2);
        zone.on('pointerdown', () => {
            current = lbl;
            tabs.forEach(t => t.draw(t.lbl === current));
            onSelect(lbl);
        });

        tabs.push({ lbl, draw, bg, txt, zone });
    });

    return {
        setActive(lbl) {
            current = lbl;
            tabs.forEach(t => t.draw(t.lbl === current));
        },
        destroy() {
            tabs.forEach(t => { t.bg.destroy(); t.txt.destroy(); t.zone.destroy(); });
        },
    };
}

/**
 * Floating text that rises and fades out over `duration` ms.
 */
export function floatText(scene, x, y, text, {
    color    = '#ffffff',
    fontSize = '13px',
    duration = 1200,
    riseBy   = 28,
    depth    = 50,
} = {}) {
    const txt = scene.add.text(x, y, text, {
        fontFamily: THEME.fontMono, fontSize, color,
        stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(depth);
    scene.tweens.add({
        targets: txt, y: y - riseBy, alpha: 0,
        duration, ease: 'Sine.easeOut',
        onComplete: () => txt.destroy(),
    });
    return txt;
}

/**
 * Clock string from a countdown timer.
 * phaseDuration is the total ms for this phase.
 * dayStart / nightStart are the clock hours (default 6 and 18).
 */
export function clockString(timerMs, phaseDuration, phaseHours = 12, startHour = 6) {
    const elapsed  = Math.max(0, 1.0 - timerMs / phaseDuration);
    const totalMin = Math.round(elapsed * phaseHours * 60);
    const h = (startHour + Math.floor(totalMin / 60)) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
