# Contrast & Texture for Safelight

A [Safelight](https://github.com/anthonyreimche/SafeLight) extension that ports
[**darktable**](https://www.darktable.org/)'s *contrast & texture* module:
scene-referred local contrast. It brightens what is brighter than its
surroundings and darkens what is darker, at three sizes of detail, while
edge-aware filters keep strong edges from growing halos. It also lifts or
pulls down shadows and highlights at the size of the base detail level.

## The controls

- **Detail level** (1 to 15; the slider covers 1 to 10, default 5): the size
  of the coarsest detail the module works on, and the size shadows and
  highlights are judged at. Each step down doubles it: at 5 the coarsest
  level's radius is 1/64 of the photo's long edge. Higher values work on finer
  detail.
- **Highlights**, **Shadows** (−5 to 5; the sliders cover ±2): slopes for the
  bright and dark parts of the photo at the detail level's size, like a
  local tone curve. Positive shadows lift them; negative highlights pull them
  down.
- **Local contrast**: **Coarse**, **Medium** and **Fine** (−100 % to +500 %;
  the sliders cover −100 % to +150 %). Each boosts or softens the detail of one
  band of sizes, from the detail level down to two pixels; the bands blend
  into each other. −100 % removes the band's detail. Fine works as sharpening.
- **Filter**: **Halo control** (−1000 % to +1000 %; the slider covers ±500 %):
  higher holds edges more strictly, so no halos, at the cost of some detail
  next to edges; lower lets more local contrast through. **Noise bias** (0 to
  1, default 0.001): keeps shadow noise from being boosted as detail; higher
  values protect the shadows more and soften their real detail.

**In masks:** add Contrast & Texture to a mask from the Masking panel's
Adjust tab to apply it inside that mask only.

**Defaults:** with every local contrast slider and both slopes at 0 the
photo renders bit for bit unchanged and nothing runs.

## The math

Faithful to `src/iop/contrastntexture.c` (params version 2) at darktable
master 7d7dac363d (the module is newer than darktable 5.6), with
`src/common/eigf.h`, `fast_guided_filter.h`, `gaussian.c` and
`luminance_mask.h`. The luminance is the RGB norm over √3 plus the noise bias.
From the finest level (the first under two pixels) to the coarsest, an
exposure-independent guided filter smooths it; each level's detail is the log
ratio of the luminance before and after, weighed down where the noise bias
dominates, clamped to ±5 EV and scaled by the three sliders' squared
sine/cosine crossfade over the levels. The final smooth luminance drives the
shadows and highlights curve, and the photo is multiplied by 2 to the power
of the sum.

### How it maps onto Safelight

darktable runs the module in its working space, linear Rec. 2020 by
default; the stage declares that space, so the luminance is the same norm. It
reads the image as edited up to it, in the scene-linear phase.

The cascade runs on the GPU as one four-channel pass (Safelight 3.2.2's
`channels: 4`), a draw per step, reading the previous draw with exact texel
fetches (`fetchPrev4`): over a couple of hundred draws a filtered read's trace
of the neighbours adds up beside hard edges. The filter follows darktable's exactly:
statistics taken on its grid downscaled by up to 4 (the same bilinear
sampling, so the same aliasing), its recursive Deriche blur, then darktable's
bilinear upscale and blend. Where its sigma on the grid is 1 the blur is a
21-tap filter. Otherwise each of its causal and anticausal halves is a double
pole, the square of a product of factors that each double the reach; a draw
takes three of them at once, squared, as a 15-tap filter, so each draw reaches
eight times further, and the two halves run side by side. Each draw names
the region it writes, the texels it or the draw before it changes, and
Safelight draws only that: most draws only change the small grid in the
corner. The size of a level follows the image size the
pass runs at, as darktable's does with its zoom, and the band weights and
noise bias follow the full photo's size.

Differences from darktable to be aware of:

- The pass stores half floats. The guided filter's mean square is stored as a
  signed square root so that dim shadows keep their precision; even so, a
  **Halo control** near the top of its range (above about +300 %) can lose
  precision in smooth gradients, where darktable's float32 doesn't.
- darktable's mask previews (the buttons on its sliders) aren't ported yet.
- Renders larger than 16384 pixels on the long edge drop the finest level.
- Every change of a local contrast slider, the detail level, halo control or
  noise bias reruns the cascade, as does any edit before it in the pipeline;
  shadows and highlights don't. At the default detail level and Safelight's
  default 4096-pixel render size the cascade is 49 draws and the pass runs 71
  (the count is sized for renders up to 16384 pixels; the rest pass the result
  on). On an RTX 4070 Ti that's about 12 ms a change at detail level 5 and 15 ms
  at 3; both grow as the detail level goes down, and a slow GPU takes several
  times as long.
- Needs float render targets, as most GPUs have.

### Tests

```bash
npm install
npm run check      # typecheck, build, then the unit tests
npm run test:gpu   # the stage on Safelight's real renderer (needs a SafeLight checkout)
```

The unit tests pin the schedule and band weights against the C's arithmetic
and the panel's behaviour, and hold `test/reference/dtref.ts`, a float32
transcription of the module, to the darktable nightly's own output
(`test/reference/darktable.json`, within 2·10⁻⁴ EV). The GPU spec renders a
320 × 200 scene through the real renderer and compares it with that
transcription.

Against darktable itself (5.7.0+1894 nightly, `darktable-cli`), on the
reference rig's 256 × 192 chart (13 cases: each band, the detail level from 1
to 5, halo control, noise bias, shadows and highlights): ΔE2000 at most 0.012
on the patches and 0.05 at the 99th percentile of pixels, mean difference at
most 0.001 EV over every region. On a 1536 × 1024 photo (6 cases): the 99th
percentile of pixels is within 0.0024 EV and the worst pixel within 0.020 EV
(ΔE2000 at most 0.21).

## Licence

GPL-3.0-or-later, as the darktable code it ports.
