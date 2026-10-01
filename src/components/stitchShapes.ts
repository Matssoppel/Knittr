import { Stitch } from '../store/usePatternStore';

// Vector paths exported from the "Stitch Cell" component in Figma, drawn on a
// 28×28 box. Each stitch is two legs (a V) plus a bar across the top.
export const STITCH_BOX = 28;

const LEFT_LEG =
  'M0.0960676 3.74712C-0.39206 1.84885 1.04152 0 3.00155 0H7.60635C8.97545 0 10.1709 0.926912 10.5118 2.25288L16.169 24.2529C16.6571 26.1512 15.2235 28 13.2635 28H8.65869C7.28959 28 6.09417 27.0731 5.75321 25.7471L0.0960676 3.74712Z';
const RIGHT_LEG =
  'M28.169 3.74712C28.6571 1.84885 27.2235 0 25.2635 0H20.6587C19.2896 0 18.0942 0.926912 17.7532 2.25288L12.0961 24.2529C11.6079 26.1512 13.0415 28 15.0015 28H19.6064C20.9755 28 22.1709 27.0731 22.5118 25.7471L28.169 3.74712Z';
const BAR =
  'M0.132521 4C0.132521 1.79086 1.92338 0 4.13252 0H24.1325C26.3417 0 28.1325 1.79086 28.1325 4V7C28.1325 9.20914 26.3417 11 24.1325 11H4.13252C1.92338 11 0.132521 9.20914 0.132521 7V4Z';

// Which parts are in shadow (dark) and which face the viewer (light).
// Knit: legs in front of the bar. Purl: the bar bumps out in front of the legs.
export const STITCH_PARTS: Record<Exclude<Stitch, 'empty'>, { dark: string[]; light: string[] }> = {
  knit: { dark: [BAR], light: [LEFT_LEG, RIGHT_LEG] },
  purl: { dark: [LEFT_LEG, RIGHT_LEG], light: [BAR] },
};

// The dark shade is the yarn color with 20% black laid over it, matching the
// Figma design.
export function shade(hex: string, amount = 0.2): string {
  const n = parseInt(hex.slice(1), 16);
  const f = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
