// The CPU transcription the GPU spec compares against, held to darktable's
// own output: darktable.json is the nightly's contrast & texture on a 64 × 48
// scene (see its `about`).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Params } from "../../src/model";
import { contrastTexture } from "./dtref";

interface Fixture {
  width: number;
  height: number;
  input: string;
  cases: { name: string; params: Partial<Params>; output: string }[];
}

const fixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "darktable.json"), "utf8")) as Fixture;

const floats = (b64: string) => {
  const bytes = Buffer.from(b64, "base64");
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};

const input = { width: fixture.width, height: fixture.height, data: floats(fixture.input) };

describe("the transcription", () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))("renders darktable's output: %s", (_name, c) => {
    const want = floats(c.output);
    const got = contrastTexture(input, c.params).out.data;
    let worst = 0;
    let moved = 0;
    for (let i = 0; i < want.length; i++) {
      worst = Math.max(worst, Math.abs(Math.log2(got[i] / want[i])));
      moved = Math.max(moved, Math.abs(Math.log2(want[i] / input.data[i])));
    }
    expect(moved, "darktable changed the scene").toBeGreaterThan(0.1);
    expect(worst).toBeLessThan(2e-4);
  });
});
