// darktable's contrast & texture, CPU path (contrastntexture.c process() at
// master 7d7dac363d, with eigf.h, fast_guided_filter.h's interpolate_bilinear,
// gaussian.c's order-0 Deriche blur and luminance_mask.h), transcribed for the
// tests in float32 as the C runs. test/reference/dtref.test.ts holds it to
// darktable's own output.
//
// GPL-3.0-or-later. © 2026 the darktable developers (the module), © the
// darktable authors (the filters).

import { DEFAULT_PARAMS, MAX_ITERATIONS, type Params } from "../../src/model";

const f = Math.fround;
const NORM_MIN = 2 ** -16;
const MIN_FLOAT = 2 ** -16;

/** Linear RGB, three floats per pixel. */
export interface Rgb {
  width: number;
  height: number;
  data: Float32Array;
}

interface Data {
  gains: number[];
  slopeShadows: number;
  slopeHighlights: number;
  poly: [number, number, number];
  maxDetail: number;
  radius: number[];
  maxUsed: number;
  noiseBias: number[];
  feathering: number;
}

function commit(p: Params, maxImageSize: number, longEdge: number): Data {
  const slopeShadows = f(2 ** -p.shadows);
  const slopeHighlights = f(2 ** p.highlights);
  const w = f(0.3);
  const maxDetail = f(f(Math.log2(maxImageSize)) - f(p.detailLevel) - 1);
  const scale = Array.from({ length: MAX_ITERATIONS }, (_, l) => f(2 ** f(-p.detailLevel - l)));
  const radius = scale.map((s) => f(f(0.5 * Math.min(s, 0.5)) * longEdge));
  let maxUsed = MAX_ITERATIONS - 1;
  for (let l = MAX_ITERATIONS - 1; l >= 0; l--) if (radius[l] < 2) maxUsed = l;
  const noiseBias = scale.map((_, l) => f(f(p.noiseBias) * f(2 ** Math.min(f(l - maxDetail), 0))));
  const band = (b: number, l: number) => {
    const q = l / maxDetail;
    let t = Number.isNaN(q) ? 0.5 : f(q - 0.5);
    t = Math.max(Math.min(t, 0.5), -0.5);
    const s = b === 0 ? (t < 0 ? f(Math.sin(f(Math.PI * t))) : 0) : b === 1 ? f(Math.cos(f(Math.PI * t))) : t >= 0 ? f(Math.sin(f(Math.PI * t))) : 0;
    return f(s * s);
  };
  const gains = scale.map((_, l) => {
    if (l > maxUsed) return 0;
    let g = 0;
    g = f(g + f(f(p.coarse) * band(0, l)));
    g = f(g + f(f(p.medium) * band(1, l)));
    g = f(g + f(f(p.fine) * band(2, l)));
    return g;
  });
  return {
    gains,
    slopeShadows,
    slopeHighlights,
    poly: [f(-slopeShadows * w), slopeShadows, f(f(slopeHighlights - slopeShadows) / f(4 * w))],
    maxDetail,
    radius,
    maxUsed,
    noiseBias,
    feathering: f(0.2 * f(2 ** -p.haloControl)),
  };
}

/** interpolate_bilinear for `ch` interleaved channels. */
function bilinear(src: Float32Array, wIn: number, hIn: number, wOut: number, hOut: number, ch: number): Float32Array {
  const out = new Float32Array(wOut * hOut * ch);
  for (let i = 0; i < hOut; i++) {
    for (let j = 0; j < wOut; j++) {
      const xIn = f(f(j / wOut) * wIn);
      const yIn = f(f(i / hOut) * hIn);
      let xp = Math.floor(xIn);
      let xn = xp + 1;
      let yp = Math.floor(yIn);
      let yn = yp + 1;
      xp = Math.min(xp, wIn - 1);
      xn = Math.min(xn, wIn - 1);
      yp = Math.min(yp, hIn - 1);
      yn = Math.min(yn, hIn - 1);
      const dyNext = f(yn - yIn);
      const dyPrev = f(1 - dyNext);
      const dxNext = f(xn - xIn);
      const dxPrev = f(1 - dxNext);
      for (let c = 0; c < ch; c++) {
        const nw = src[(yp * wIn + xp) * ch + c];
        const ne = src[(yp * wIn + xn) * ch + c];
        const se = src[(yn * wIn + xn) * ch + c];
        const sw = src[(yn * wIn + xp) * ch + c];
        out[(i * wOut + j) * ch + c] = f(f(dyPrev * f(f(sw * dxNext) + f(se * dxPrev))) + f(dyNext * f(f(nw * dxNext) + f(ne * dxPrev))));
      }
    }
  }
  return out;
}

/** dt_gaussian_blur, order 0: vertical then horizontal, reads clamped to [lo, hi] per channel. */
function deriche(src: Float32Array, w: number, h: number, ch: number, sigma: number, lo: number[], hi: number[]): Float32Array {
  const alpha = f(1.695 / sigma);
  const ema = f(Math.exp(-alpha));
  const ema2 = f(Math.exp(f(-2 * alpha)));
  const b1 = f(-2 * ema);
  const b2 = ema2;
  const k = f(f(f(1 - ema) * f(1 - ema)) / f(f(1 + f(f(2 * alpha) * ema)) - ema2));
  const a0 = k;
  const a1 = f(f(k * f(alpha - 1)) * ema);
  const a2 = f(f(k * f(alpha + 1)) * ema);
  const a3 = f(-k * ema2);
  const coefp = f(f(a0 + a1) / f(f(1 + b1) + b2));
  const coefn = f(f(a2 + a3) / f(f(1 + b1) + b2));
  const clamp = (v: number, c: number) => (v >= lo[c] ? (v <= hi[c] ? v : hi[c]) : lo[c]);

  const pass = (input: Float32Array, n: number, m: number, at: (i: number, j: number) => number): Float32Array => {
    // n lines of m samples; at(line, index) is the element offset.
    const out = new Float32Array(input.length);
    for (let line = 0; line < n; line++) {
      for (let c = 0; c < ch; c++) {
        let xp = clamp(input[at(line, 0) + c], c);
        let yb = f(xp * coefp);
        let yp = yb;
        for (let j = 0; j < m; j++) {
          const xc = clamp(input[at(line, j) + c], c);
          const yc = f(f(f(f(a0 * xc) + f(a1 * xp)) - f(b1 * yp)) - f(b2 * yb));
          out[at(line, j) + c] = yc;
          xp = xc;
          yb = yp;
          yp = yc;
        }
        let xn = clamp(input[at(line, m - 1) + c], c);
        let xa = xn;
        let yn = f(xn * coefn);
        let ya = yn;
        for (let j = m - 1; j >= 0; j--) {
          const xc = clamp(input[at(line, j) + c], c);
          const yc = f(f(f(f(a2 * xn) + f(a3 * xa)) - f(b1 * yn)) - f(b2 * ya));
          xa = xn;
          xn = xc;
          ya = yn;
          yn = yc;
          out[at(line, j) + c] = f(out[at(line, j) + c] + yc);
        }
      }
    }
    return out;
  };
  const vertical = pass(src, w, h, (col, row) => (row * w + col) * ch);
  return pass(vertical, h, w, (row, col) => (row * w + col) * ch);
}

/** fast_eigf_surface_blur, guide = mask, linear blending, no quantization; in place. */
function fastEigf(image: Float32Array, w: number, h: number, sigma: number, feathering: number): void {
  const scaling = f(Math.max(Math.min(sigma, 4), 1));
  const dsSigma = f(Math.max(f(sigma / scaling), 1));
  const dsH = Math.trunc(f(h / scaling));
  const dsW = Math.trunc(f(w / scaling));
  const ds = bilinear(image, w, h, dsW, dsH, 1);
  const stack = new Float32Array(dsW * dsH * 2);
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (let k = 0; k < ds.length; k++) {
    const g = ds[k];
    const g2 = f(g * g);
    stack[2 * k] = g;
    stack[2 * k + 1] = g2;
    lo[0] = Math.min(lo[0], g);
    hi[0] = Math.max(hi[0], g);
    lo[1] = Math.min(lo[1], g2);
    hi[1] = Math.max(hi[1], g2);
  }
  const av = deriche(stack, dsW, dsH, 2, dsSigma, lo, hi);
  for (let k = 0; k < dsW * dsH; k++) av[2 * k + 1] = f(av[2 * k + 1] - f(av[2 * k] * av[2 * k]));
  const full = bilinear(av, dsW, dsH, w, h, 2);
  for (let k = 0; k < w * h; k++) {
    const avg = full[2 * k];
    const variance = full[2 * k + 1];
    const norm = Math.max(f(avg * image[k]), f(1e-6));
    const v = f(variance / norm);
    const a = f(v / f(v + feathering));
    const b = f(avg - f(a * avg));
    image[k] = Math.max(f(f(image[k] * a) + b), MIN_FLOAT);
  }
}

export interface Result {
  out: Rgb;
  /** The detail sum and the base lowpass, per pixel. */
  corrections: Float32Array;
  lowpass: Float32Array;
}

/** process() over `rgb` as the export pipe runs it: the image is the full image. */
export function contrastTexture(rgb: Rgb, params: Partial<Params>, maxImageSize?: number): Result {
  const p = { ...DEFAULT_PARAMS, ...params };
  const { width: w, height: h } = rgb;
  const d = commit(p, maxImageSize ?? Math.max(w, h), Math.max(w, h));
  const n = w * h;
  let lowpass = new Float32Array(n);
  const bias = d.noiseBias[d.maxUsed];
  for (let k = 0; k < n; k++) {
    const r = rgb.data[3 * k];
    const g = rgb.data[3 * k + 1];
    const b = rgb.data[3 * k + 2];
    const norm = Math.max(f(Math.sqrt(f(f(f(r * r) + f(g * g)) + f(b * b)))), MIN_FLOAT);
    lowpass[k] = f(f(f(1 / Math.sqrt(3)) * norm) + bias);
  }
  const corrections = new Float32Array(n);
  for (let level = d.maxUsed; level >= 0; level--) {
    const high = lowpass.slice();
    fastEigf(lowpass, w, h, d.radius[level], d.feathering);
    const nb = d.noiseBias[level];
    for (let k = 0; k < n; k++) {
      const lp = Math.log2(Math.max(high[k], NORM_MIN));
      const ls = Math.log2(Math.max(lowpass[k], NORM_MIN));
      const cp = f(lowpass[k] * lowpass[k]);
      const wiener = f(Math.max(f(cp - f(nb * nb)), 0) / Math.max(cp, NORM_MIN));
      corrections[k] = f(corrections[k] + f(d.gains[level] * f(wiener * Math.max(Math.min(f(lp - ls), 5), -5))));
      if (level > 0) lowpass[k] = f(lowpass[k] - f(nb - d.noiseBias[level - 1]));
    }
  }
  lowpass = lowpass.slice();
  const out = new Float32Array(rgb.data.length);
  const pivot = f(Math.log2(f(d.noiseBias[0] + 0.1845)));
  const mw = f(0.3);
  for (let k = 0; k < n; k++) {
    const ev = f(Math.log2(Math.max(lowpass[k], NORM_MIN)) - pivot);
    let curve: number;
    if (ev <= -mw) curve = f(d.slopeShadows * ev);
    else if (ev >= mw) curve = f(d.slopeHighlights * ev);
    else {
      const s = f(ev + mw);
      curve = f(f(d.poly[0] + f(d.poly[1] * s)) + f(f(d.poly[2] * s) * s));
    }
    const mult = f(2 ** f(corrections[k] + f(curve - ev)));
    for (let c = 0; c < 3; c++) out[3 * k + c] = f(rgb.data[3 * k + c] * mult);
  }
  return { out: { width: w, height: h, data: out }, corrections, lowpass };
}
