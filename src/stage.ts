// The processing stage: the cascade in one four-channel pass (glsl.ts), and the
// inline that applies its detail and the shadows/highlights curve to every
// channel. darktable works on its RGB working space (linear Rec. 2020 by
// default), so the stage does too: the luminance is that space's RGB norm.

import { INLINE_GLSL, PASS_GLSL, PASS_HELPERS, REGION_GLSL } from "./glsl";
import { DEFAULT_PARAMS, MAX_DRAWS, RANGES, type Params } from "./model";
import { DRAWS_KEY, STAGE_ID } from "./params";
import type { ProcessingStageContribution, UniformDeclaration } from "./safelight";

const LABELS: Record<keyof Params, string> = {
  coarse: "Coarse",
  medium: "Medium",
  fine: "Fine",
  detailLevel: "Detail level",
  haloControl: "Halo control",
  noiseBias: "Noise bias",
  shadows: "Shadows",
  highlights: "Highlights",
};

const edit = (key: keyof Params): UniformDeclaration => ({
  key,
  glslType: "float",
  default: DEFAULT_PARAMS[key],
  range: { ...RANGES[key], step: key === "noiseBias" ? 0.0001 : 0.01 },
  label: LABELS[key],
});

const DRAWS: UniformDeclaration = { key: DRAWS_KEY, glslType: "int", default: 0 };

/** What the cascade reads: changing one of these reruns the pass. */
export const PASS_KEYS = ["coarse", "medium", "fine", "detailLevel", "haloControl", "noiseBias"] as const;
/** What only the inline reads: dragging these reuses the pass's result. */
export const INLINE_KEYS = ["shadows", "highlights"] as const;

export function detailStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Contrast & Texture",
    phase: "scene-linear",
    priority: 55,
    reads: "current",
    space: { encoding: "linear", primaries: "rec2020" },
    glsl: INLINE_GLSL,
    uniforms: [...INLINE_KEYS.map(edit), DRAWS],
    passes: [
      {
        channels: 4,
        glsl: PASS_GLSL,
        helpers: PASS_HELPERS,
        region: REGION_GLSL,
        iterations: { key: DRAWS_KEY, max: MAX_DRAWS },
        uniforms: PASS_KEYS.map(edit),
      },
    ],
    dormantWhen: { coarse: 0, medium: 0, fine: 0, shadows: 0, highlights: 0 },
    mask: { maskable: true },
  };
}
