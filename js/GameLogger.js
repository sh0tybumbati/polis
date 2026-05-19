const FLUSH_MS        = 2000;
const SPIKE_THRESHOLD = 50;   // ms — log frame if total exceeds this
const SYS_THRESHOLD   = 8;    // ms — include system in spike breakdown if exceeds this

class GameLogger {
    constructor() {
        this._buf      = [];
        this._frameDt  = 16;
        this._sys      = {};   // per-frame system times, reset each frame
        setInterval(() => this._flush(), FLUSH_MS);
    }

    // Called by game code to emit an event
    log(type, data = {}) {
        this._buf.push({
            t:  +(performance.now().toFixed(1)),
            dt: Math.round(this._frameDt),
            e:  type,
            ...data,
        });
    }

    // Called by GameScene.update() for each sub-system
    sys(name, ms) {
        this._sys[name] = (this._sys[name] ?? 0) + ms;
    }

    // Called once per frame with raw browser delta and total game-update cost
    frame(rawDelta, totalMs) {
        this._frameDt = rawDelta;
        if (totalMs >= SPIKE_THRESHOLD) {
            const slow = Object.entries(this._sys)
                .filter(([, ms]) => ms >= SYS_THRESHOLD)
                .sort((a, b) => b[1] - a[1])
                .map(([n, ms]) => `${n}:${Math.round(ms)}`);
            this.log('spike', {
                raw:   Math.round(rawDelta),
                total: Math.round(totalMs),
                slow:  slow.join(',') || 'unknown',
            });
        }
        this._sys = {};
    }

    async _flush() {
        if (this._buf.length === 0) return;
        const batch = this._buf.splice(0, this._buf.length);
        try {
            await fetch('/gamelog', {
                method:    'POST',
                headers:   { 'Content-Type': 'application/json' },
                body:      JSON.stringify(batch),
                keepalive: true,
            });
        } catch (_) { /* server may be restarting — drop silently */ }
    }
}

export default new GameLogger();
