/**
 * Utility functions for mathematical operations.
 */
export const MathUtils = {
    /**
     * Clamps a value between a minimum and maximum number.
     * @param {number} value The value to clamp.
     * @param {number} min The minimum allowed value.
     * @param {number} max The maximum allowed value.
     * @returns {number} The clamped value.
     */
    clamp: (value, min, max) => {
        return Math.max(min, Math.min(value, max));
    },

    /**
     * Converts degrees to radians.
     * @param {number} degrees The angle in degrees.
     * @returns {number} The angle in radians.
     */
    degreesToRadians: (degrees) => {
        return degrees * (Math.PI / 180);
    },

    /**
     * Smooth 2D value noise — deterministic, no dependencies.
     */
    valueNoise: (x, y) => {
      const hash = (ix, iy) => {
        let h = (ix * 1619 + iy * 31337 + 5003) | 0;
        h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b)) | 0;
        h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b)) | 0;
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      };
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const s  = t => t * t * (3 - 2 * t);
      const sx = s(fx), sy = s(fy);
      return hash(ix,iy)*(1-sx)*(1-sy) + hash(ix+1,iy)*sx*(1-sy)
           + hash(ix,iy+1)*(1-sx)*sy   + hash(ix+1,iy+1)*sx*sy;
    },

    /**
     * Damage multiplier based on unit type advantage.
     */
    counterMod: (attackerType, targetType) => {
        if (attackerType === 'cavalry'  && targetType === 'archer')   return 2.0;
        if (attackerType === 'spearman' && targetType === 'cavalry')  return 1.5;
        if (attackerType === 'archer'   && targetType === 'spearman') return 1.5;
        return 1.0;
    },

    /**
     * Damage reduction based on target terrain.
     */
    coverMod: (targetTerrain) => {
        if (targetTerrain === 3) return 0.8; // 3 is T_FOREST
        return 1.0;
    }
};
