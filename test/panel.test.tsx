import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { activate } from "../src/index";
import { DEFAULT_PARAMS, drawCount } from "../src/model";
import { ContrastTexturePanel } from "../src/Panel";
import { qualified } from "../src/params";
import { React } from "../src/rt";
import { fakeApi } from "./support/fake-api";

function setup(params: Record<string, unknown> = {}) {
  const rig = fakeApi(params);
  activate(rig.api);
  const view = render(<ContrastTexturePanel />);
  const slider = (label: string) => {
    const found = rig.sliders(view.container).find((s) => s.label === label);
    if (!found) throw new Error(`no slider ${label}`);
    return found;
  };
  return { rig, view, slider };
}

afterEach(cleanup);

describe("the panel", () => {
  it("lists the module's controls in its order", () => {
    const { rig, view } = setup();
    expect(rig.sliders(view.container).map((s) => s.label)).toEqual([
      "Detail level",
      "Highlights",
      "Shadows",
      "Coarse",
      "Medium",
      "Fine",
      "Halo control",
      "Noise bias",
    ]);
    expect([...view.container.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Local contrast", "Filter"]);
  });

  it("shows darktable's defaults and soft ranges, gains and halo control in percent", () => {
    const { slider } = setup();
    expect(slider("Detail level")).toMatchObject({ value: 5, min: 1, max: 10, defaultValue: 5 });
    expect(slider("Medium")).toMatchObject({ value: 0, min: -100, max: 150, defaultValue: 0 });
    expect(slider("Halo control")).toMatchObject({ min: -500, max: 500 });
    expect(slider("Noise bias")).toMatchObject({ value: 0.001, min: 0, max: 0.2, step: 0.0001 });
  });

  it("writes the value and the draw count as a slider moves, and one undo step on release", () => {
    const { rig, slider } = setup();
    act(() => slider("Fine").onChange(80));
    expect(rig.params()).toEqual({
      [qualified("fine")]: 0.8,
      [qualified("draws")]: drawCount({ ...DEFAULT_PARAMS, fine: 0.8 }),
    });
    expect(slider("Fine").value).toBeCloseTo(80, 10);
    act(() => slider("Fine").onCommit?.());
    expect(rig.commits).toEqual(["Contrast & Texture fine"]);
  });

  it("sizes the draw count by the detail level the edit holds", () => {
    const { rig, slider } = setup({ [qualified("medium")]: 1 });
    act(() => slider("Detail level").onChange(2));
    expect(rig.params()[qualified("draws")]).toBe(drawCount({ ...DEFAULT_PARAMS, medium: 1, detailLevel: 2 }));
  });

  it("drops the draw count to 0 when the last gain goes back to 0", () => {
    const { rig, slider } = setup({ [qualified("shadows")]: 1 });
    act(() => slider("Shadows").onChange(0));
    expect(rig.params()[qualified("draws")]).toBe(0);
  });
});
