// The stage contract the host relies on, and what a draw may cost. Unit tests
// can't run GLSL; the GPU spec (test/gpu) renders it.

import { describe, expect, it } from "vitest";
import { FIR_RADIUS, MAX_DRAWS } from "../src/model";
import { INLINE_GLSL, MAX_TAPS_PER_DRAW, PASS_GLSL, PASS_HELPERS, REGION_GLSL, glslLiteral } from "../src/glsl";
import { EDIT_KEYS } from "../src/params";
import { INLINE_KEYS, PASS_KEYS, detailStage } from "../src/stage";

const stage = detailStage();

describe("the stage", () => {
  it("reads the edited image in linear Rec. 2020, darktable's default working space", () => {
    expect(stage).toMatchObject({ phase: "scene-linear", reads: "current", space: { encoding: "linear", primaries: "rec2020" } });
  });

  it("runs one four-channel pass for as many draws as the bag says", () => {
    expect(stage.passes).toHaveLength(1);
    expect(stage.passes?.[0]).toMatchObject({ channels: 4, iterations: { key: "draws", max: MAX_DRAWS } });
  });

  it("declares every edit key once, the cascade's in the pass", () => {
    const pass = stage.passes?.[0].uniforms?.map((u) => u.key) ?? [];
    const inline = stage.uniforms.map((u) => u.key);
    expect(pass).toEqual([...PASS_KEYS]);
    expect(inline).toEqual([...INLINE_KEYS, "draws"]);
    expect([...pass, ...INLINE_KEYS].sort()).toEqual([...EDIT_KEYS].sort());
  });

  it("is dormant while every gain and slope is 0", () => {
    expect(stage.dormantWhen).toEqual({ coarse: 0, medium: 0, fine: 0, shadows: 0, highlights: 0 });
  });

  it("changes nothing until the pass has drawn", () => {
    expect(INLINE_GLSL.trim().startsWith("if (draws > 0) {")).toBe(true);
  });

  it("can run inside masks", () => {
    expect(stage.mask).toEqual({ maskable: true });
  });
});

describe("a draw's cost", () => {
  it("reads at most the 21-tap blur's taps", () => {
    expect(MAX_TAPS_PER_DRAW).toBe(21);
    expect(PASS_GLSL).toContain(`for (int n = -${FIR_RADIUS}; n <= ${FIR_RADIUS}; n++)`);
    // The only loop that reads the target is the blur's; the others walk the levels.
    const reads = PASS_GLSL.split("\n").filter((line) => /ctx(At|Stats|StatsAt)\(/.test(line));
    const outsideLoop = reads.filter((line) => !line.includes("sum +="));
    const fetches = outsideLoop.reduce((n, line) => n + (line.match(/ctx(At|Stats|StatsAt)\(/g)?.length ?? 0), 0);
    expect(fetches).toBeLessThanOrEqual(16);
  });

  it("runs every loop that reads the target for at most that many taps", () => {
    const lines = PASS_GLSL.split("\n");
    const loops = lines.flatMap((line, i) => {
      const m = line.match(/for \(int \w+ = (-?\d+); \w+ (<=?) (-?\d+);/);
      if (!m) return [];
      const body = lines.slice(i + 1, i + 8).join("\n");
      if (!/ctx(At|Stats|StatsAt)\(/.test(body)) return [];
      return [Number(m[3]) - Number(m[1]) + (m[2] === "<=" ? 1 : 0)];
    });
    expect(loops).toEqual([MAX_TAPS_PER_DRAW, 16, 15]);
  });

  // Most draws change a small grid in the corner; the host draws only what the
  // region names, so the rest of the frame costs nothing.
  it("draws only the texels it or the draw before it changes", () => {
    expect(stage.passes?.[0].region).toBe(REGION_GLSL);
    expect(PASS_HELPERS).toMatch(/ivec4 ctxRegion\(\)/);
    expect(PASS_GLSL).not.toContain("discard");
  });

  it("schedules the region and the draw alike", () => {
    expect(PASS_HELPERS.match(/ctxSchedule\(/g)?.length).toBe(2);
    expect(PASS_GLSL).toContain("ctxSchedule(size, level, phase, maxLevel, total);");
  });

  it("names no GLSL built-in as a variable", () => {
    for (const name of ["step", "smooth", "filter", "active", "input", "output", "sample"]) {
      expect(PASS_GLSL).not.toMatch(new RegExp(`\\b(int|float|vec2|vec4|ivec2)\\s+${name}\\b`));
    }
  });

  it("writes float literals GLSL ES accepts", () => {
    expect(glslLiteral(1)).toBe("1.0");
    expect(glslLiteral(0.1845)).toBe("0.1845");
    expect(Number(glslLiteral(2 ** -16))).toBeCloseTo(2 ** -16, 14);
    expect(glslLiteral(2 ** -16)).toContain(".");
    expect(PASS_HELPERS).not.toMatch(/[^\w.]\d+e-?\d/);
  });
});
