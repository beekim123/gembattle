export const deepClone = o => structuredClone(o);
export const sum3 = a => a[0] + a[1] + a[2];
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
