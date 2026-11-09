import { describe, expect, it } from "vitest";
import { PANEL_ID, activate, deactivate } from "../src/index";
import { DEFAULT_PARAMS, drawCount } from "../src/model";
import { STAGE_ID, qualified } from "../src/params";
import { fakeApi } from "./support/fake-api";

describe("activate", () => {
  it("registers the stage and a panel that also edits masks", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.stages.map((s) => s.id)).toEqual([STAGE_ID]);
    expect(rig.panels.map((p) => p.id)).toEqual([PANEL_ID]);
    expect(rig.panels[0].mask?.owns).toContain(qualified("draws"));
    deactivate();
  });

  it("re-derives the draw count of a pasted edit", () => {
    const rig = fakeApi();
    activate(rig.api);
    rig.replace({ [qualified("coarse")]: 1, [qualified("detailLevel")]: 3 });
    expect(rig.params()[qualified("draws")]).toBe(drawCount({ ...DEFAULT_PARAMS, coarse: 1, detailLevel: 3 }));
    deactivate();
  });

  it("re-derives a mask's", () => {
    const rig = fakeApi();
    activate(rig.api);
    rig.setMasks([{ id: "m1", bag: { [qualified("fine")]: 0.5 } }]);
    expect(rig.maskBag("m1")?.[qualified("draws")]).toBe(drawCount({ ...DEFAULT_PARAMS, fine: 0.5 }));
    deactivate();
  });

  it("stops re-deriving once deactivated", () => {
    const rig = fakeApi();
    activate(rig.api);
    deactivate();
    rig.replace({ [qualified("coarse")]: 1 });
    expect(rig.params()[qualified("draws")]).toBeUndefined();
  });
});
