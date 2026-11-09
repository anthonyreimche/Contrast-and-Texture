// commit_params() and modify_roi_in() against what the C computes (values
// worked out from contrastntexture.c), and the draw schedule's bounds.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  MAX_DRAWS,
  REFERENCE_EDGE,
  SCAN_TAIL,
  bandWeight,
  blurDraws,
  cascadeDraws,
  drawCount,
  isActive,
  levelGain,
  levelRadius,
  maxDetailLevel,
  maxUsedLevel,
  noiseBiasAt,
  plan,
  scanDraws,
  scanSteps,
} from "../src/model";

describe("levels", () => {
  it("halves the radius per level from 2^-level of half the long edge", () => {
    expect([0, 1, 2].map((l) => levelRadius(256, 5, l))).toEqual([4, 2, 1]);
    expect(levelRadius(6000, 5, 0)).toBeCloseTo(93.75, 10);
  });

  it("caps the base scale at a half", () => {
    expect(levelRadius(1000, 0.5, 0)).toBe(250);
  });

  it("ends at the first level under 2 pixels, as modify_roi_in does", () => {
    expect(maxUsedLevel(256, 5)).toBe(2);
    expect(maxUsedLevel(6000, 5)).toBe(6);
    expect(maxUsedLevel(4096, 1)).toBe(10);
  });

  it("downscales like fast_eigf_surface_blur: sigma clamped to [1, 4], at least 1 on the grid", () => {
    const [fine, , coarse] = plan(256, 5);
    expect(fine).toMatchObject({ level: 2, sigma: 1, scaling: 1, dsSigma: 1, steps: 0, draws: 4 });
    expect(coarse).toMatchObject({ level: 0, sigma: 4, scaling: 4, dsSigma: 1, steps: 0 });
    const wide = plan(6000, 5)[6];
    expect(wide).toMatchObject({ level: 0, scaling: 4 });
    expect(wide.dsSigma).toBeCloseTo(93.75 / 4, 10);
    expect(wide.steps).toBeGreaterThan(0);
    expect(wide.draws).toBe(2 + 2 * (1 + scanDraws(wide.steps)));
  });
});

describe("noise bias and band weights", () => {
  it("reads max_detail_level off the full image's long edge", () => {
    expect(maxDetailLevel(256, 5)).toBe(2);
    expect(maxDetailLevel(4096, 3)).toBe(8);
  });

  it("halves the bias per level below max_detail_level", () => {
    expect(noiseBiasAt(0.001, 2, 2)).toBe(0.001);
    expect(noiseBiasAt(0.001, 0, 2)).toBe(0.00025);
    expect(noiseBiasAt(0.001, 5, 2)).toBe(0.001);
  });

  it("fades coarse into medium into fine across the levels", () => {
    expect([0, 1, 2].map((l) => bandWeight(0, l, 2))).toEqual([1, 0, 0]);
    expect(bandWeight(1, 1, 2)).toBe(1);
    expect(bandWeight(2, 2, 2)).toBe(1);
    expect(bandWeight(1, 0, 2)).toBeCloseTo(0, 12);
    for (let l = 0; l <= 6; l++) {
      const sum = bandWeight(0, l, 4.5) + bandWeight(1, l, 4.5) + bandWeight(2, l, 4.5);
      expect(sum).toBeCloseTo(1, 12);
    }
  });

  it("follows C's float division by a max_detail_level of 0 or below", () => {
    // 0/0 is NaN, which fminf drops: t = 0.5, all fine.
    expect([bandWeight(0, 0, 0), bandWeight(1, 0, 0), bandWeight(2, 0, 0)]).toEqual([0, expect.closeTo(0, 12), 1]);
    expect(bandWeight(2, 3, 0)).toBe(1);
    // A negative one clamps t to -0.5: all coarse.
    expect(bandWeight(0, 2, -1.5)).toBe(1);
    expect(bandWeight(0, 0, -1.5)).toBe(1);
  });

  it("sums the three gains by their weights", () => {
    expect(levelGain({ coarse: 1, medium: 2, fine: 3 }, 1, 2)).toBe(2);
    expect(levelGain({ coarse: 1, medium: 2, fine: 3 }, 0, 2)).toBeCloseTo(1, 12);
  });
});

describe("the recursions' length", () => {
  it("doubles until the dropped tail of (1 + a n) r^n is below SCAN_TAIL, and no further", () => {
    for (const s of [1.01, 1.5, 2, 3.7, 16, 23.4, 64, 256, 1024]) {
      const a = 1.695 / s;
      const tail = (n: number) => (1 + a * n) * Math.exp(-a * n);
      const steps = scanSteps(s);
      expect(tail(2 ** steps)).toBeLessThanOrEqual(SCAN_TAIL * 1.0001);
      if (steps > 1) expect(tail(2 ** (steps - 1))).toBeGreaterThan(SCAN_TAIL);
    }
  });

  it("takes a draw per eightfold reach, the first one also taking the half's first taps", () => {
    for (let steps = 1; steps <= 16; steps++) {
      const draws = scanDraws(steps);
      expect(8 ** draws).toBeGreaterThanOrEqual(2 ** steps);
      expect(8 ** (draws - 1)).toBeLessThan(2 ** steps);
    }
    expect(blurDraws(0)).toBe(2);
    expect(blurDraws(8)).toBe(2 * (1 + 3));
  });
});

describe("the draw count", () => {
  it("is 0 while nothing changes the image", () => {
    expect(isActive(DEFAULT_PARAMS)).toBe(false);
    expect(drawCount(DEFAULT_PARAMS)).toBe(0);
    expect(drawCount({ ...DEFAULT_PARAMS, detailLevel: 2, haloControl: 3, noiseBias: 0.1 })).toBe(0);
  });

  it.each(["coarse", "medium", "fine", "shadows", "highlights"] as const)("runs the cascade for %s alone", (key) => {
    expect(drawCount({ ...DEFAULT_PARAMS, [key]: 0.5 })).toBeGreaterThan(0);
  });

  it("covers the cascade at any size up to the reference edge, within the host's cap", () => {
    for (let dl = 1; dl <= 15; dl += 0.5) {
      const draws = drawCount({ ...DEFAULT_PARAMS, medium: 1, detailLevel: dl });
      expect(draws).toBeLessThanOrEqual(MAX_DRAWS);
      for (const edge of [64, 256, 960, 2560, 4096, 6000, 8192, 11648, REFERENCE_EDGE]) {
        expect(cascadeDraws(edge, dl)).toBeLessThanOrEqual(draws);
      }
    }
  });

  // Every draw runs over the whole target, so the count is what a slider costs.
  it("keeps the default detail level's cascade short", () => {
    expect(cascadeDraws(4096, 5)).toBeLessThanOrEqual(50);
    expect(drawCount({ ...DEFAULT_PARAMS, medium: 1 })).toBeLessThanOrEqual(75);
    expect(drawCount({ ...DEFAULT_PARAMS, medium: 1, detailLevel: 1 })).toBeLessThanOrEqual(160);
  });
});
