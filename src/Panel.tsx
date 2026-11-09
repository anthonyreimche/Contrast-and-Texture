// The panel, in the order of the module it ports: the base detail level with
// the highlights and shadows it sets the size of, the three local contrast
// bands, then the filter. Gains and halo control show as percentages.
//
// It edits whatever useParamScope hands it: the photo's bag in the dock, a
// mask's in the Masking panel. A drag writes the value and the draw count
// live and commits on release, so one gesture is one undo step; each change
// reads the bag the scope holds now, as drags outrun renders.

import { DEFAULT_PARAMS, SOFT_RANGES, drawCount, type Params } from "./model";
import { DRAWS_KEY, qualified, readParams } from "./params";
import { React, api } from "./rt";

interface Control {
  key: keyof Params;
  label: string;
  /** Shown value per stored unit (100 for a percentage). */
  factor: number;
  step: number;
}

const control = (key: keyof Params, label: string, factor = 1, step = 0.01): Control => ({ key, label, factor, step });

const BASE: Control[] = [
  control("detailLevel", "Detail level"),
  control("highlights", "Highlights"),
  control("shadows", "Shadows"),
];
const BANDS: Control[] = [
  control("coarse", "Coarse", 100, 1),
  control("medium", "Medium", 100, 1),
  control("fine", "Fine", 100, 1),
];
const FILTER: Control[] = [control("haloControl", "Halo control", 100, 1), control("noiseBias", "Noise bias", 1, 0.0001)];

export function ContrastTexturePanel() {
  const { Slider } = api.components;
  const { Section } = api.ui;
  const scope = api.develop.useParamScope();
  const params = readParams(scope.getParams());

  const slider = (c: Control) => {
    const range = SOFT_RANGES[c.key];
    return (
      <Slider
        key={c.key}
        label={c.label}
        value={params[c.key] * c.factor}
        min={range.min * c.factor}
        max={range.max * c.factor}
        step={c.step}
        defaultValue={DEFAULT_PARAMS[c.key] * c.factor}
        onChange={(shown) => {
          const next = { ...readParams(scope.getParams()), [c.key]: shown / c.factor };
          scope.setParams({ [qualified(c.key)]: next[c.key], [qualified(DRAWS_KEY)]: drawCount(next) });
        }}
        onCommit={() => scope.commit(`Contrast & Texture ${c.label.toLowerCase()}`)}
      />
    );
  };

  return (
    <div style={{ padding: 8 }}>
      {BASE.map(slider)}
      <Section title="Local contrast">{BANDS.map(slider)}</Section>
      <Section title="Filter">{FILTER.map(slider)}</Section>
    </div>
  );
}
