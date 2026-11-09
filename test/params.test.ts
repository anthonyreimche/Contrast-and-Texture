import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, drawCount } from "../src/model";
import { bagPatch, qualified, readParams, rederivePatch, resetPatch } from "../src/params";

describe("the bag", () => {
  it("reads darktable's defaults from an empty bag", () => {
    expect(readParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("reads each key, clamped to the module's limits, and skips what isn't a number", () => {
    const p = readParams({
      [qualified("medium")]: 0.4,
      [qualified("fine")]: 9,
      [qualified("detailLevel")]: "3",
      [qualified("haloControl")]: Number.NaN,
    });
    expect(p).toMatchObject({ medium: 0.4, fine: 5, detailLevel: 5, haloControl: 0 });
  });

  it("writes the edit with its draw count", () => {
    const p = { ...DEFAULT_PARAMS, coarse: 0.5, detailLevel: 3 };
    expect(bagPatch(p)).toMatchObject({ [qualified("coarse")]: 0.5, [qualified("draws")]: drawCount(p) });
  });

  it("resets to an idle edit", () => {
    expect(resetPatch()[qualified("draws")]).toBe(0);
  });
});

describe("re-deriving", () => {
  it("leaves a bag without the edit alone", () => {
    expect(rederivePatch({ "other.stage.key": 1 })).toBeNull();
  });

  it("leaves a consistent bag alone", () => {
    expect(rederivePatch(bagPatch({ ...DEFAULT_PARAMS, fine: 1 }))).toBeNull();
  });

  it("fixes the draw count of a bag that carried only the edit", () => {
    const bag = { [qualified("fine")]: 1, [qualified("detailLevel")]: 2 };
    expect(rederivePatch(bag)).toEqual({
      [qualified("draws")]: drawCount({ ...DEFAULT_PARAMS, fine: 1, detailLevel: 2 }),
    });
  });
});
