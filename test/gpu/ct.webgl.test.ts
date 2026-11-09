// The stage on the real renderer. Run via `npm run test:gpu` (run.cjs copies
// this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//  • the four-channel pass compiles with the host's namespacing and runs the
//    bag's draw count;
//  • an idle edit leaves the frame exactly as it was;
//  • on half-float targets, the cascade (darktable's downscale grid, its
//    21-tap and recursive blurs, the guided filter's blend) and the inline's
//    shadows and highlights land on darktable's result, here the CPU
//    transcription test/reference/dtref.ts, which dtref.test.ts holds to
//    darktable's own output;
//  • a draw count too small for the render drops the finest levels and
//    still renders.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, cascadeDraws, plan, type Params } from "@ct/model";
import { bagPatch, qualified, resetPatch } from "@ct/params";
import { detailStage } from "@ct/stage";
import { contrastTexture } from "@ct-test/reference/dtref";
import { CURRENT_PROCESS_VERSION } from "@/catalog/process-version";
import type { ProcessingStageContribution } from "@/extensions/types";
import { toStageSpace } from "@/rendering/stage-space";
import { OPEN_PROBE, builtinStages, floatImage, identityParams, withRenderer } from "@/rendering/webgl/webgl.test-support";

const W = 320;
const H = 200;
const AS_DRAWN = { encoding: "perceptual", primaries: "rec709" } as const;
const SPACE = { encoding: "linear", primaries: "rec2020" } as const;

/** A deterministic hash in [0, 1). */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Linear Rec.709: a lit gradient, a dark disc, a bright window with hard
 *  edges, fine texture everywhere and coloured blobs, from 0.002 to 2. */
const SCENE = floatImage(W, H, (x, y) => {
  const u = x / W;
  const v = y / H;
  let base = 0.02 + 0.3 * u * (1 - 0.5 * v);
  if ((x - 80) ** 2 + (y - 120) ** 2 < 45 ** 2) base *= 0.08;
  if (x > 200 && x < 280 && y > 30 && y < 90) base = 1.6;
  const texture = 1 + 0.25 * (hash(x, y) - 0.5) + 0.15 * Math.sin(x * 0.9) * Math.sin(y * 0.7);
  const tint: [number, number, number] =
    (x - 250) ** 2 + (y - 150) ** 2 < 30 ** 2 ? [1.2, 0.7, 0.4] : (x - 150) ** 2 + (y - 40) ** 2 < 25 ** 2 ? [0.5, 0.8, 1.3] : [1, 1, 1];
  return tint.map((t) => Math.max(base * texture * t, 0.002)) as [number, number, number];
});

const CASES: [string, Partial<Params>][] = [
  ["medium +100%", { medium: 1 }],
  ["fine +100%", { fine: 1 }],
  ["coarse +150%, fine -50%", { coarse: 1.5, fine: -0.5 }],
  ["detail 2, all +100%", { detailLevel: 2, coarse: 1, medium: 1, fine: 1 }],
  ["detail 1, medium +80%", { detailLevel: 1, medium: 0.8 }],
  ["shadows +1, highlights -1", { shadows: 1, highlights: -1 }],
  ["halo +2, noise bias 0.02, fine +200%", { haloControl: 2, noiseBias: 0.02, fine: 2 }],
];

type Frames = Record<string, Float32Array>;

function render(bags: Record<string, Record<string, unknown>>, stages: ProcessingStageContribution[] = [detailStage()]): Frames {
  const frames: Frames = {};
  withRenderer({ stages: [...builtinStages(), ...stages], pipeline: OPEN_PROBE }, (renderer) => {
    renderer.setImage(SCENE);
    renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
    for (const [name, bag] of Object.entries(bags)) {
      renderer.setContributedParams(bag);
      const frame = renderer.readFloatFrame("pre-output", Infinity, AS_DRAWN);
      if (!frame) throw new Error(`no frame for ${name}`);
      frames[name] = frame.data;
    }
  });
  return frames;
}

const full = (p: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, ...p });

/** The identity frame in the stage's space, as the cascade reads it. */
function stageInput(identity: Float32Array) {
  const data = new Float32Array(W * H * 3);
  for (let k = 0; k < W * H; k++) {
    const rgb = toStageSpace([identity[4 * k], identity[4 * k + 1], identity[4 * k + 2]], SPACE, "scene");
    data.set(rgb, 3 * k);
  }
  return { width: W, height: H, data };
}

/** |log2| of the GPU's per-pixel multiplier over the reference's, sorted. */
function errors(identity: Float32Array, frame: Float32Array, ref: Float32Array, input: Float32Array): number[] {
  const out: number[] = [];
  for (let k = 0; k < W * H; k++) {
    const i = 1; // green: every pixel of the scene has it
    const gpu = frame[4 * k + i] / identity[4 * k + i];
    const want = ref[3 * k + i] / input[3 * k + i];
    out.push(Math.abs(Math.log2(gpu / want)));
  }
  return out.sort((a, b) => a - b);
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

describe("Contrast & Texture on the GPU", () => {
  const bags: Record<string, Record<string, unknown>> = { identity: resetPatch() };
  for (const [name, p] of CASES) bags[name] = bagPatch(full(p));
  const frames = render(bags);
  const input = stageInput(frames.identity);

  // Outside the live view the stage stays in the program while idle, and its
  // Rec. 2020 round trip rounds in the last bit or so.
  it("leaves the frame as it was while idle, to float rounding", () => {
    const without = render({ identity: {} }, []).identity;
    let worst = 0;
    for (let i = 0; i < without.length; i++) worst = Math.max(worst, Math.abs(frames.identity[i] - without[i]) / Math.max(Math.abs(without[i]), 1e-6));
    expect(worst).toBeLessThan(1e-6);
  });

  it.each(CASES)("matches darktable's result: %s", (name, p) => {
    const ref = contrastTexture(input, p);
    // The reference's change in green, sorted, for scale.
    const moved = errors(frames.identity, frames.identity, ref.out.data, input.data);
    const e = errors(frames.identity, frames[name], ref.out.data, input.data);
    expect(quantile(moved, 0.99), "the case changes the image").toBeGreaterThan(0.05);
    expect(quantile(e, 0.5)).toBeLessThan(0.002);
    expect(quantile(e, 0.99)).toBeLessThan(0.01);
    expect(e[e.length - 1]).toBeLessThan(0.08);
  });

  it("drops the finest levels when the draw count is short, and still renders", () => {
    const p = full({ medium: 1 });
    const levels = plan(W, p.detailLevel);
    expect(levels.length).toBeGreaterThan(1);
    const draws = cascadeDraws(W, p.detailLevel) - 1;
    const short = render({ short: { ...bagPatch(p), [qualified("draws")]: draws } }).short;
    const ref = contrastTexture(input, p);
    const e = errors(frames.identity, short, ref.out.data, input.data);
    expect(short.every(Number.isFinite)).toBe(true);
    expect(quantile(e, 0.5)).toBeLessThan(0.2);
  });
});
