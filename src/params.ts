// The param-bag contract. The edit is darktable's params as they are, under the
// stage's qualified keys; the shaders do commit_params()'s arithmetic. One
// derived key, `draws`, is the pass's draw count: 0 while the edit changes
// nothing, so an untouched photo never runs the cascade.

import { DEFAULT_PARAMS, RANGES, drawCount, type Params } from "./model";

export const EXT_ID = "contrast-texture";
export const STAGE_ID = `${EXT_ID}.detail`;

export type EditKey = keyof Params;
export const EDIT_KEYS: readonly EditKey[] = [
  "coarse",
  "medium",
  "fine",
  "detailLevel",
  "haloControl",
  "noiseBias",
  "shadows",
  "highlights",
];
export const DRAWS_KEY = "draws" as const;

export const qualified = (key: EditKey | typeof DRAWS_KEY): string => `${STAGE_ID}.${key}`;

type Bag = Readonly<Record<string, unknown>>;
type Patch = Record<string, number>;

const clamp = (v: number, key: EditKey) => Math.min(Math.max(v, RANGES[key].min), RANGES[key].max);

/** `bag` is the host's untyped per-photo bag; a missing or non-finite value reads as darktable's default. */
export function readParams(bag: Bag): Params {
  const out = { ...DEFAULT_PARAMS };
  for (const key of EDIT_KEYS) {
    const v = bag[qualified(key)];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = clamp(v, key);
  }
  return out;
}

/** The edit and its draw count. */
export function bagPatch(p: Params): Patch {
  const out: Patch = {};
  for (const key of EDIT_KEYS) out[qualified(key)] = p[key];
  out[qualified(DRAWS_KEY)] = drawCount(p);
  return out;
}

/** The draw count the bag's edit needs, when the bag holds a different one. */
export function rederivePatch(bag: Bag): Patch | null {
  if (!EDIT_KEYS.some((key) => qualified(key) in bag)) return null;
  const draws = drawCount(readParams(bag));
  return bag[qualified(DRAWS_KEY)] === draws ? null : { [qualified(DRAWS_KEY)]: draws };
}

export const resetPatch = (): Patch => bagPatch(DEFAULT_PARAMS);
