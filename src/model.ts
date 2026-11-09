// darktable's contrast & texture (src/iop/contrastntexture.c, master
// 7d7dac363d, © 2026 darktable developers, GPL-3.0-or-later), the parts the
// CPU needs: the edit's defaults and ranges, commit_params() and
// modify_roi_in(), and the GPU schedule. glsl.ts does the same arithmetic per
// draw, so the two must agree; the tests pin both against values the C gives.
//
// The cascade: luminance, then for each level from the finest to the
// coarsest an exposure-independent guided filter (eigf.h) whose Gaussian
// statistics darktable takes on a grid downscaled by up to 4
// (fast_eigf_surface_blur) with its Deriche blur (gaussian.c). On the GPU each
// level is a downsample draw, the blur and a blend draw. A blur whose sigma on
// that grid is 1 is a 21-tap filter per axis; a wider one is darktable's
// recursive filter itself. Each of its halves is a double pole, 1 / (1 − r z)²,
// the square of the product of (1 + r^d z^d) over d = 1, 2, 4, …; a draw takes
// three of those factors at once, squared, so it reaches eight times further
// in 15 taps, and the first draw also takes the half's own first two taps.

export interface Params {
  /** Local contrast gains, −1 to 5 (0 leaves the band alone). */
  coarse: number;
  medium: number;
  fine: number;
  /** The base detail level: the coarsest level's radius is 2^−level of the
   *  long edge. 1 to 15. */
  detailLevel: number;
  /** −10 to 10; higher suppresses halos (feathering 0.2 × 2^−halo). */
  haloControl: number;
  /** 0 to 1, added to the luminance against shadow noise. */
  noiseBias: number;
  /** EV slopes for the darkest and brightest parts of the base level, −5 to 5. */
  shadows: number;
  highlights: number;
}

export const DEFAULT_PARAMS: Readonly<Params> = {
  coarse: 0,
  medium: 0,
  fine: 0,
  detailLevel: 5,
  haloControl: 0,
  noiseBias: 0.001,
  shadows: 0,
  highlights: 0,
};

export interface Range {
  min: number;
  max: number;
}

/** The C struct's hard limits. */
export const RANGES: Readonly<Record<keyof Params, Range>> = {
  coarse: { min: -1, max: 5 },
  medium: { min: -1, max: 5 },
  fine: { min: -1, max: 5 },
  detailLevel: { min: 1, max: 15 },
  haloControl: { min: -10, max: 10 },
  noiseBias: { min: 0, max: 1 },
  shadows: { min: -5, max: 5 },
  highlights: { min: -5, max: 5 },
};

/** The sliders' ranges (gui_init's soft ranges). */
export const SOFT_RANGES: Readonly<Record<keyof Params, Range>> = {
  coarse: { min: -1, max: 1.5 },
  medium: { min: -1, max: 1.5 },
  fine: { min: -1, max: 1.5 },
  detailLevel: { min: 1, max: 10 },
  haloControl: { min: -5, max: 5 },
  noiseBias: { min: 0, max: 0.2 },
  shadows: { min: -2, max: 2 },
  highlights: { min: -2, max: 2 },
};

export const MAX_ITERATIONS = 20;
export const DEFAULT_FEATHERING = 0.2;
export const MIDTONES_WIDTH = 0.3;
/** The pivot of the shadows and highlights curve, 0.1845 plus the base noise bias. */
export const PIVOT = 0.1845;
/** The finest level is the first whose radius is below this many pixels. */
export const MIN_RADIUS = 2;
/** Taps each side of the blur where its sigma on the grid is 1: the first
 *  dropped tap, n = 11, weighs (1 + 1.695 n) e^(−1.695 n) ≈ 1.6·10⁻⁷ of the centre. */
export const FIR_RADIUS = 10;
/** A recursion's doublings stop once (1 + α n) r^n, the tail it drops, is below this. */
export const SCAN_TAIL = 2 ** -20;
export const MAX_SCAN_STEPS = 16;
/** The long edge the draw count is sized for. A larger render drops its finest levels. */
export const REFERENCE_EDGE = 16384;
/** The host's per-pass draw cap. */
export const MAX_DRAWS = 1024;

/** darktable's max_detail_level: log2 of the full image's long edge, less the level and 1. */
export function maxDetailLevel(sourceLongEdge: number, detailLevel: number): number {
  return Math.log2(sourceLongEdge) - detailLevel - 1;
}

/** The radius of a level, in pixels of the image the cascade runs at. */
export function levelRadius(longEdge: number, detailLevel: number, level: number): number {
  return 0.5 * Math.min(2 ** (-detailLevel - level), 0.5) * longEdge;
}

/** modify_roi_in()'s max_used_level: the first level whose radius is below 2 pixels. */
export function maxUsedLevel(longEdge: number, detailLevel: number): number {
  for (let level = 0; level < MAX_ITERATIONS; level++) {
    if (levelRadius(longEdge, detailLevel, level) < MIN_RADIUS) return level;
  }
  return MAX_ITERATIONS - 1;
}

export function noiseBiasAt(noiseBias: number, level: number, maxLevel: number): number {
  return noiseBias * 2 ** Math.min(level - maxLevel, 0);
}

export type Band = 0 | 1 | 2;

/** band_weight(): the squared sine/cosine crossfade of the coarse (0), medium
 *  (1) and fine (2) gains across the levels. darktable divides by
 *  max_detail_level as C floats do: 0/0 is NaN, which fminf drops, so t is 0.5. */
export function bandWeight(band: Band, level: number, maxLevel: number): number {
  const q = level / maxLevel;
  let t = Number.isNaN(q) ? 0.5 : q - 0.5;
  t = Math.max(Math.min(t, 0.5), -0.5);
  let w = 0;
  if (band === 0) w = t < 0 ? Math.sin(Math.PI * t) : 0;
  else if (band === 1) w = Math.cos(Math.PI * t);
  else w = t >= 0 ? Math.sin(Math.PI * t) : 0;
  return w * w;
}

export function levelGain(p: Pick<Params, "coarse" | "medium" | "fine">, level: number, maxLevel: number): number {
  return (
    p.coarse * bandWeight(0, level, maxLevel) +
    p.medium * bandWeight(1, level, maxLevel) +
    p.fine * bandWeight(2, level, maxLevel)
  );
}

/** The x where (1 + x) e^(−x) falls to SCAN_TAIL: a recursion at α = 1.695 / σ
 *  is done once it reaches n = SCAN_REACH / α taps. */
export const SCAN_REACH: number = (() => {
  const target = -Math.log(SCAN_TAIL);
  let x = target;
  for (let i = 0; i < 50; i++) x -= (x - Math.log1p(x) - target) / (x / (1 + x));
  return x;
})();

/** The doublings a one-pole recursion of the Deriche blur at `dsSigma` takes:
 *  the first power of two past SCAN_REACH / α taps. */
export function scanSteps(dsSigma: number): number {
  const reach = (SCAN_REACH * dsSigma) / 1.695;
  return Math.min(Math.max(1, Math.ceil(Math.log2(reach))), MAX_SCAN_STEPS);
}

/** Draws a recursion takes: one per eightfold reach, three doublings each. */
export function scanDraws(steps: number): number {
  return Math.ceil(steps / 3);
}

export interface LevelPlan {
  level: number;
  sigma: number;
  /** fast_eigf_surface_blur's downscale: sigma clamped to [1, 4]. */
  scaling: number;
  dsSigma: number;
  /** Doublings per recursion; 0 for the 21-tap blur. */
  steps: number;
  /** Downsample, blur and blend. */
  draws: number;
}

export function blurDraws(steps: number): number {
  // Each axis: the 21-tap blur, or both halves' recursions, side by side, and
  // their sum.
  return steps === 0 ? 2 : 2 * (1 + scanDraws(steps));
}

export function planLevel(longEdge: number, detailLevel: number, level: number): LevelPlan {
  const sigma = levelRadius(longEdge, detailLevel, level);
  const scaling = Math.max(Math.min(sigma, 4), 1);
  const dsSigma = Math.max(sigma / scaling, 1);
  const steps = dsSigma > 1 ? scanSteps(dsSigma) : 0;
  return { level, sigma, scaling, dsSigma, steps, draws: 2 + blurDraws(steps) };
}

/** The cascade at a long edge, finest level first, as the GPU runs it. */
export function plan(longEdge: number, detailLevel: number): LevelPlan[] {
  const levels: LevelPlan[] = [];
  for (let level = maxUsedLevel(longEdge, detailLevel); level >= 0; level--) {
    levels.push(planLevel(longEdge, detailLevel, level));
  }
  return levels;
}

/** Draws the cascade takes at a long edge: the luminance draw and every level's. */
export function cascadeDraws(longEdge: number, detailLevel: number): number {
  return plan(longEdge, detailLevel).reduce((sum, l) => sum + l.draws, 1);
}

/** Whether the edit changes the image: a gain or a shadows/highlights slope away from 0. */
export function isActive(p: Params): boolean {
  return p.coarse !== 0 || p.medium !== 0 || p.fine !== 0 || p.shadows !== 0 || p.highlights !== 0;
}

/** The pass's draw count: enough for a render as large as REFERENCE_EDGE, 0
 *  while idle. Draws past the cascade copy its result through. Where float32
 *  rounding gives the GPU a doubling more than this double-precision count,
 *  which can only matter at REFERENCE_EDGE itself, the GPU drops the finest
 *  level instead of running short. */
export function drawCount(p: Params): number {
  return isActive(p) ? Math.min(cascadeDraws(REFERENCE_EDGE, p.detailLevel), MAX_DRAWS) : 0;
}
