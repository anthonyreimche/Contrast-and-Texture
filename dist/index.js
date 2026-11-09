//#region src/model.ts
var e = {
	coarse: 0,
	medium: 0,
	fine: 0,
	detailLevel: 5,
	haloControl: 0,
	noiseBias: .001,
	shadows: 0,
	highlights: 0
}, t = {
	coarse: {
		min: -1,
		max: 5
	},
	medium: {
		min: -1,
		max: 5
	},
	fine: {
		min: -1,
		max: 5
	},
	detailLevel: {
		min: 1,
		max: 15
	},
	haloControl: {
		min: -10,
		max: 10
	},
	noiseBias: {
		min: 0,
		max: 1
	},
	shadows: {
		min: -5,
		max: 5
	},
	highlights: {
		min: -5,
		max: 5
	}
}, n = {
	coarse: {
		min: -1,
		max: 1.5
	},
	medium: {
		min: -1,
		max: 1.5
	},
	fine: {
		min: -1,
		max: 1.5
	},
	detailLevel: {
		min: 1,
		max: 10
	},
	haloControl: {
		min: -5,
		max: 5
	},
	noiseBias: {
		min: 0,
		max: .2
	},
	shadows: {
		min: -2,
		max: 2
	},
	highlights: {
		min: -2,
		max: 2
	}
}, r = .3, i = .1845, a = 2 ** -20, o = 16384, s = 1024;
function c(e, t, n) {
	return .5 * Math.min(2 ** (-t - n), .5) * e;
}
function l(e, t) {
	for (let n = 0; n < 20; n++) if (c(e, t, n) < 2) return n;
	return 19;
}
var u = (() => {
	let e = -Math.log(a), t = e;
	for (let n = 0; n < 50; n++) t -= (t - Math.log1p(t) - e) / (t / (1 + t));
	return t;
})();
function d(e) {
	let t = u * e / 1.695;
	return Math.min(Math.max(1, Math.ceil(Math.log2(t))), 16);
}
function f(e) {
	return Math.ceil(e / 3);
}
function p(e) {
	return e === 0 ? 2 : 2 * (1 + f(e));
}
function m(e, t, n) {
	let r = c(e, t, n), i = Math.max(Math.min(r, 4), 1), a = Math.max(r / i, 1), o = a > 1 ? d(a) : 0;
	return {
		level: n,
		sigma: r,
		scaling: i,
		dsSigma: a,
		steps: o,
		draws: 2 + p(o)
	};
}
function h(e, t) {
	let n = [];
	for (let r = l(e, t); r >= 0; r--) n.push(m(e, t, r));
	return n;
}
function g(e, t) {
	return h(e, t).reduce((e, t) => e + t.draws, 1);
}
function _(e) {
	return e.coarse !== 0 || e.medium !== 0 || e.fine !== 0 || e.shadows !== 0 || e.highlights !== 0;
}
function v(e) {
	return _(e) ? Math.min(g(o, e.detailLevel), s) : 0;
}
//#endregion
//#region src/params.ts
var y = "contrast-texture", b = `${y}.detail`, x = [
	"coarse",
	"medium",
	"fine",
	"detailLevel",
	"haloControl",
	"noiseBias",
	"shadows",
	"highlights"
], S = "draws", C = (e) => `${b}.${e}`, w = (e, n) => Math.min(Math.max(e, t[n].min), t[n].max);
function T(t) {
	let n = { ...e };
	for (let e of x) {
		let r = t[C(e)];
		typeof r == "number" && Number.isFinite(r) && (n[e] = w(r, e));
	}
	return n;
}
function E(e) {
	let t = {};
	for (let n of x) t[C(n)] = e[n];
	return t[C(S)] = v(e), t;
}
function D(e) {
	if (!x.some((t) => C(t) in e)) return null;
	let t = v(T(e));
	return e[C("draws")] === t ? null : { [C(S)]: t };
}
var O = () => E(e), k, A;
function j(e) {
	A = e, k = e.react;
}
//#endregion
//#region src/Panel.tsx
var M = (e, t, n = 1, r = .01) => ({
	key: e,
	label: t,
	factor: n,
	step: r
}), N = [
	M("detailLevel", "Detail level"),
	M("highlights", "Highlights"),
	M("shadows", "Shadows")
], P = [
	M("coarse", "Coarse", 100, 1),
	M("medium", "Medium", 100, 1),
	M("fine", "Fine", 100, 1)
], F = [M("haloControl", "Halo control", 100, 1), M("noiseBias", "Noise bias", 1, 1e-4)];
function I() {
	let { Slider: t } = A.components, { Section: r } = A.ui, i = A.develop.useParamScope(), a = T(i.getParams()), o = (r) => {
		let o = n[r.key];
		return /* @__PURE__ */ k.createElement(t, {
			key: r.key,
			label: r.label,
			value: a[r.key] * r.factor,
			min: o.min * r.factor,
			max: o.max * r.factor,
			step: r.step,
			defaultValue: e[r.key] * r.factor,
			onChange: (e) => {
				let t = {
					...T(i.getParams()),
					[r.key]: e / r.factor
				};
				i.setParams({
					[C(r.key)]: t[r.key],
					[C(S)]: v(t)
				});
			},
			onCommit: () => i.commit(`Contrast & Texture ${r.label.toLowerCase()}`)
		});
	};
	return /* @__PURE__ */ k.createElement("div", { style: { padding: 8 } }, N.map(o), /* @__PURE__ */ k.createElement(r, { title: "Local contrast" }, P.map(o)), /* @__PURE__ */ k.createElement(r, { title: "Filter" }, F.map(o)));
}
//#endregion
//#region src/glsl.ts
function L(e) {
	let t = e.toPrecision(10);
	if (/e/i.test(t)) {
		let [e, n] = t.split(/e/i);
		return `${e.includes(".") ? e : `${e}.0`}e${Number(n)}`;
	}
	return t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, ".0") : `${t}.0`;
}
var R = L, z = R(2 ** -16), B = `
vec4 ctxAt(ivec2 t) { return fetchPrev4(t); }
// 2^-n for a whole n, exactly, whatever the driver's exp2.
float ctxPow2(int n) { return intBitsToFloat((127 - n) << 23); }
// The statistics as stored (y as a signed square root) and as summed.
vec2 ctxDecode(vec2 s) { return vec2(s.x, s.y * abs(s.y)); }
vec2 ctxEncode(vec2 v) { return vec2(v.x, sign(v.y) * sqrt(abs(v.y))); }
vec2 ctxStatsAt(ivec2 t) { return ctxDecode(ctxAt(t).xy); }
// The coarsest level's radius; level l's is this times 2^-l, exactly as
// darktable's 0.5 * min(2^(-level - l), 0.5) * long edge, since the base
// detail level is at least 1. The whole part of the level's power of two is
// exact, so a radius of exactly 2 (level 5 at 4096 pixels) stays 2.
float ctxBaseRadius(ivec2 size) {
  float whole = floor(detailLevel);
  float scale = exp2(whole - detailLevel) * ctxPow2(int(whole));
  return 0.5 * min(scale, 0.5) * float(max(size.x, size.y));
}
float ctxRadius(float base, int level) { return base * ctxPow2(level); }
// modify_roi_in(): the first level whose radius is below 2 pixels.
int ctxMaxLevel(float base) {
  float r = base;
  for (int l = 0; l < 20; l++) {
    if (r < ${R(2)}) return l;
    r *= 0.5;
  }
  return 19;
}
float ctxScaling(float sigma) { return max(min(sigma, 4.0), 1.0); }
float ctxDsSigma(float sigma) { return max(sigma / ctxScaling(sigma), 1.0); }
// darktable's (size_t)(size / scaling). A GPU's division needn't round
// correctly, so the truncated quotient is checked by multiplying back.
int ctxDsAxis(int n, float scaling) {
  int q = int(float(n) / scaling);
  if (float(q + 1) * scaling <= float(n)) q += 1;
  if (q > 0 && float(q) * scaling > float(n)) q -= 1;
  return q;
}
ivec2 ctxDs(ivec2 size, float sigma) {
  float s = ctxScaling(sigma);
  return ivec2(ctxDsAxis(size.x, s), ctxDsAxis(size.y, s));
}
// The levels a recursion blurs: those whose radius is above 4 pixels, where
// the grid's sigma is above 1, the coarsest first.
int ctxScanLevels(float base) {
  float r = base;
  for (int l = 0; l < 20; l++) {
    if (r <= 4.0) return l;
    r *= 0.5;
  }
  return 20;
}
// The doublings a recursion takes, the first power of two past SCAN_REACH / α
// taps: ceil(log2(SCAN_REACH * dsSigma / 1.695)). The grid's sigma halves a
// level, so it is the coarsest level's count less the level. Every draw works
// the schedule out per texel; this keeps it to integer steps and one log2.
int ctxSteps0(float base) { return int(ceil(log2(${R(u / 6.78)} * base))); }
int ctxSteps(int level, int scanLevels, int steps0) {
  return level < scanLevels ? clamp(steps0 - level, 1, 16) : 0;
}
int ctxScanDraws(int steps) { return (steps + 2) / 3; }
int ctxBlurDraws(int steps) { return steps == 0 ? 2 : 2 * (1 + ctxScanDraws(steps)); }
// One draw's three doublings of a double pole, squared: (1 + a z + … + a^7 z^7)²,
// whose tap m, of 15, weighs this times a^m.
float ctxFactorCount(int m) { return float(8 - abs(m - 7)); }
int ctxLevelDraws(int steps) { return 2 + ctxBlurDraws(steps); }
float ctxMaxDetail() { return log2(max(uSourceSize.x, uSourceSize.y)) - detailLevel - 1.0; }
float ctxNoiseBias(int level) { return noiseBias * exp2(min(float(level) - ctxMaxDetail(), 0.0)); }
float ctxBand(int band, int level) {
  float m = ctxMaxDetail();
  float t = m == 0.0 ? 0.5 : float(level) / m - 0.5;
  t = clamp(t, -0.5, 0.5);
  float w = band == 0 ? (t < 0.0 ? sin(${R(Math.PI)} * t) : 0.0)
          : band == 1 ? cos(${R(Math.PI)} * t)
          : (t >= 0.0 ? sin(${R(Math.PI)} * t) : 0.0);
  return w * w;
}
float ctxGain(int level) {
  float g = 0.0;
  g += coarse * ctxBand(0, level);
  g += medium * ctxBand(1, level);
  g += fine * ctxBand(2, level);
  return g;
}
// The corner a level's step writes: the grid, the grid and the two halves to
// its right while a recursion runs, or the whole target for the blend.
ivec2 ctxChanged(int phase, int steps, ivec2 ds, ivec2 size) {
  if (phase > ctxBlurDraws(steps)) return size;
  if (phase == 0 || steps == 0) return ds;
  int draws = ctxScanDraws(steps);
  int per = 1 + draws;
  int j = (phase - 1) - ((phase - 1) / per) * per;
  return j < draws ? ivec2(3 * ds.x, ds.y) : ds;
}
// interpolate_bilinear's taps for output index j of n, from an input of m:
// lo/hi clamped to the input, and their weights (darktable computes them
// from the clamped indices).
// Which step of the cascade this draw runs: the level (-1 the luminance, -2 a
// copy past the cascade) and the phase within it, the finest level that runs,
// and the cascade's draw count.
void ctxSchedule(ivec2 size, out int level, out int phase, out int maxLevel, out int total) {
  float base = ctxBaseRadius(size);
  maxLevel = ctxMaxLevel(base);
  int scanLevels = ctxScanLevels(base);
  int steps0 = ctxSteps0(base);
  total = 1;
  for (int l = 0; l < 20; l++) {
    if (l > maxLevel) break;
    total += ctxLevelDraws(ctxSteps(l, scanLevels, steps0));
  }
  // A render larger than the draw count was sized for drops its finest levels.
  for (int l = 0; l < 20; l++) {
    if (total <= uPassCount || maxLevel == 0) break;
    total -= ctxLevelDraws(ctxSteps(maxLevel, scanLevels, steps0));
    maxLevel -= 1;
  }
  level = -2;
  phase = 0;
  if (uPassIndex == 0) {
    level = -1;
    return;
  }
  int left = uPassIndex - 1;
  for (int l = 19; l >= 0; l--) {
    if (l > maxLevel) continue;
    int n = ctxLevelDraws(ctxSteps(l, scanLevels, steps0));
    if (left < n) { level = l; phase = left; return; }
    left -= n;
  }
}
// The texels this draw or the one before it changes. The rest already hold
// their value in the target, the older of the ping-pong pair. The first draw
// of a level follows a full-size one, and only the first copy past the cascade
// changes anything; the host draws the stage's last draw whole.
ivec4 ctxRegion() {
  ivec2 size = ivec2(floor(1.0 / uTexel + 0.5));
  int level, phase, maxLevel, total;
  ctxSchedule(size, level, phase, maxLevel, total);
  if (level == -2) return uPassIndex == total ? ivec4(0, 0, size) : ivec4(0);
  if (level == -1 || phase == 0) return ivec4(0, 0, size);
  float base = ctxBaseRadius(size);
  float sigma = ctxRadius(base, level);
  ivec2 ds = ctxDs(size, sigma);
  int steps = ctxSteps(level, ctxScanLevels(base), ctxSteps0(base));
  return ivec4(0, 0, max(ctxChanged(phase, steps, ds, size), ctxChanged(phase - 1, steps, ds, size)));
}
void ctxTaps(int j, int n, int m, out int lo, out int hi, out float wLo, out float wHi) {
  float x = (float(j) / float(n)) * float(m);
  int f = int(floor(x));
  lo = min(f, m - 1);
  hi = min(f + 1, m - 1);
  wLo = float(hi) - x;
  wHi = 1.0 - wLo;
}
// The guided filter's mean and variance at a grid texel.
vec2 ctxStats(ivec2 t) {
  vec2 s = ctxStatsAt(t) / ${R(8)};
  return vec2(s.x, s.y / ${R(8)} - s.x * s.x);
}
// darktable's Deriche coefficients (gaussian.c, order 0): a0..a3, and r = e^−α.
void ctxDeriche(float sigma, out vec4 a, out float r) {
  float alpha = 1.695 / sigma;
  float ema = exp(-alpha);
  float ema2 = exp(-2.0 * alpha);
  float k = (1.0 - ema) * (1.0 - ema) / (1.0 + (2.0 * alpha * ema) - ema2);
  a = vec4(k, k * (alpha - 1.0) * ema, k * (alpha + 1.0) * ema, -k * ema2);
  r = ema;
}
`, V = "return ctxRegion();", H = `
ivec2 q = ivec2(gl_FragCoord.xy);
ivec2 size = ivec2(floor(1.0 / uTexel + 0.5));
int level, phase, maxLevel, total;
ctxSchedule(size, level, phase, maxLevel, total);
float base = ctxBaseRadius(size);
float sigma = ctxRadius(base, max(level, 0));
ivec2 ds = ctxDs(size, sigma);
float dsSigma = ctxDsSigma(sigma);
int steps = ctxSteps(level, ctxScanLevels(base), ctxSteps0(base));
int blur = ctxBlurDraws(steps);
if (level == -1) {
  // compute_luminance(): the RGB norm over sqrt(3), plus the finest level's bias.
  float lum = max(length(c.rgb), ${z}) * ${R(1 / Math.sqrt(3))} + ctxNoiseBias(maxLevel);
  c = vec4(0.0, 0.0, lum, 0.0);
} else if (level >= 0) {
  if (phase == 0) {
    // Downscale the luminance onto the grid.
    if (q.x < ds.x && q.y < ds.y) {
      int x0, x1, y0, y1;
      float wx0, wx1, wy0, wy1;
      ctxTaps(q.x, ds.x, size.x, x0, x1, wx0, wx1);
      ctxTaps(q.y, ds.y, size.y, y0, y1, wy0, wy1);
      float v = wy1 * (ctxAt(ivec2(x0, y1)).z * wx0 + ctxAt(ivec2(x1, y1)).z * wx1)
              + wy0 * (ctxAt(ivec2(x0, y0)).z * wx0 + ctxAt(ivec2(x1, y0)).z * wx1);
      float s = v * ${R(8)};
      c.xy = vec2(s, s);
    }
  } else if (phase <= blur) {
    int b = phase - 1;
    if (steps == 0) {
      // sigma 1 on the grid: the blur as a 21-tap filter, vertical then horizontal.
      if (q.x < ds.x && q.y < ds.y) {
        ivec2 e = b == 0 ? ivec2(0, 1) : ivec2(1, 0);
        vec4 a;
        float r;
        ctxDeriche(dsSigma, a, r);
        float alpha = 1.695 / dsSigma;
        vec2 sum = vec2(0.0);
        for (int n = -10; n <= 10; n++) {
          float an = float(abs(n));
          ivec2 t = clamp(q + e * n, ivec2(0), ds - 1);
          sum += a.x * (1.0 + alpha * an) * pow(r, an) * ctxStatsAt(t);
        }
        c.xy = ctxEncode(sum);
      }
    } else {
      // Wider: per axis, both halves' recursions side by side, then their sum.
      int draws = ctxScanDraws(steps);
      int per = 1 + draws;
      int axis = b / per;
      int j = b - axis * per;
      ivec2 e = axis == 0 ? ivec2(0, 1) : ivec2(1, 0);
      int region = q.y < ds.y ? q.x / ds.x : 3;
      ivec2 rel = q - ivec2(region * ds.x, 0);
      int len = axis == 0 ? ds.y : ds.x;
      int at = axis == 0 ? rel.y : rel.x;
      if (j < draws && (region == 1 || region == 2)) {
        // The causal half reads behind, the anticausal one ahead; reads past
        // the edge take the edge's texel, darktable's constant extension.
        int toward = region == 1 ? -1 : 1;
        int room = region == 1 ? at : len - 1 - at;
        vec4 a;
        float r;
        ctxDeriche(dsSigma, a, r);
        vec2 sum = vec2(0.0);
        if (j == 0) {
          // The half's first taps, a0 + a1 z or a2 z + a3 z², times the first factor, read from the grid.
          vec2 p = region == 1 ? a.xy : a.zw;
          int lead = region == 1 ? 0 : 1;
          float power = 1.0;
          float before = 0.0;
          for (int o = 0; o < 16; o++) {
            float tap = o < 15 ? ctxFactorCount(o) * power : 0.0;
            sum += (p.x * tap + p.y * before) * ctxStatsAt(rel + e * (toward * min(o + lead, room)));
            before = tap;
            power *= r;
          }
        } else {
          int d = 1 << (3 * j);
          float rd = exp(-1.695 / dsSigma * float(d));
          float power = 1.0;
          for (int m = 0; m < 15; m++) {
            sum += ctxFactorCount(m) * power * ctxStatsAt(q + e * (toward * min(m * d, room)));
            power *= rd;
          }
        }
        c.xy = ctxEncode(sum);
      } else if (j == draws && region == 0) {
        c.xy = ctxEncode(ctxStatsAt(rel + ivec2(ds.x, 0)) + ctxStatsAt(rel + ivec2(2 * ds.x, 0)));
      }
    }
  } else {
    // Upscale the statistics, blend (eigf_blending_no_mask), add the level's detail.
    int x0, x1, y0, y1;
    float wx0, wx1, wy0, wy1;
    ctxTaps(q.x, size.x, ds.x, x0, x1, wx0, wx1);
    ctxTaps(q.y, size.y, ds.y, y0, y1, wy0, wy1);
    vec2 st = wy1 * (ctxStats(ivec2(x0, y1)) * wx0 + ctxStats(ivec2(x1, y1)) * wx1)
            + wy0 * (ctxStats(ivec2(x0, y0)) * wx0 + ctxStats(ivec2(x1, y0)) * wx1);
    float lum = c.z;
    float feather = ${R(.2)} * exp2(-haloControl);
    float norm = max(st.x * lum, 1.0e-6);
    // Half-float statistics can leave the variance a little below 0, where
    // darktable's float32 has it at about 0.
    float v = max(st.y / norm, 0.0);
    float k = v / (v + feather);
    float smoothed = max(lum * k + (st.x - k * st.x), ${z});
    float bias = ctxNoiseBias(level);
    float power = smoothed * smoothed;
    float wiener = max(power - bias * bias, 0.0) / max(power, ${z});
    float detail = clamp(log2(max(lum, ${z})) - log2(max(smoothed, ${z})), -5.0, 5.0);
    float sum = c.w + ctxGain(level) * (wiener * detail);
    if (level > 0) {
      c = vec4(0.0, 0.0, smoothed - (bias - ctxNoiseBias(level - 1)), sum);
    } else {
      c = vec4(sum, smoothed, log2(bias + ${R(i)}), 0.0);
    }
  }
}
`, U = R(r), W = `
if (draws > 0) {
  float ev = log2(max(stageResult.y, ${z})) - stageResult.z;
  float slopeShadows = exp2(-shadows);
  float slopeHighlights = exp2(highlights);
  float curve;
  if (ev <= -${U}) {
    curve = slopeShadows * ev;
  } else if (ev >= ${U}) {
    curve = slopeHighlights * ev;
  } else {
    float shifted = ev + ${U};
    curve = -slopeShadows * ${U} + slopeShadows * shifted
          + (slopeHighlights - slopeShadows) / (4.0 * ${U}) * shifted * shifted;
  }
  lin *= exp2(stageResult.x + (curve - ev));
}
`, G = {
	coarse: "Coarse",
	medium: "Medium",
	fine: "Fine",
	detailLevel: "Detail level",
	haloControl: "Halo control",
	noiseBias: "Noise bias",
	shadows: "Shadows",
	highlights: "Highlights"
}, K = (n) => ({
	key: n,
	glslType: "float",
	default: e[n],
	range: {
		...t[n],
		step: n === "noiseBias" ? 1e-4 : .01
	},
	label: G[n]
}), q = {
	key: S,
	glslType: "int",
	default: 0
}, J = [
	"coarse",
	"medium",
	"fine",
	"detailLevel",
	"haloControl",
	"noiseBias"
], Y = ["shadows", "highlights"];
function X() {
	return {
		id: b,
		name: "Contrast & Texture",
		phase: "scene-linear",
		priority: 55,
		reads: "current",
		space: {
			encoding: "linear",
			primaries: "rec2020"
		},
		glsl: W,
		uniforms: [...Y.map(K), q],
		passes: [{
			channels: 4,
			glsl: H,
			helpers: B,
			region: V,
			iterations: {
				key: S,
				max: s
			},
			uniforms: J.map(K)
		}],
		dormantWhen: {
			coarse: 0,
			medium: 0,
			fine: 0,
			shadows: 0,
			highlights: 0
		},
		mask: { maskable: !0 }
	};
}
//#endregion
//#region src/index.tsx
var Z = `${y}.panel`, Q = null;
function $() {
	let e = A.stores.useDevelopStore.getState();
	e.setDynParams(O()), e.commitEdit("Contrast & Texture reset");
}
function ee(e) {
	j(e), e.registerProcessingStage(X()), e.registerPanel({
		id: Z,
		title: "Contrast & Texture",
		component: I,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 280
		},
		onReset: $,
		mask: {
			component: I,
			owns: [...x.map(C), C(S)]
		}
	}), Q?.(), Q = e.stores.useDevelopStore.subscribe((e, t) => {
		if (e.params.masks !== t.params.masks) for (let n of e.params.masks) {
			if (t.params.masks.some((e) => e.id === n.id && e.bag === n.bag)) continue;
			let r = n.bag ? D(n.bag) : null;
			r && e.updateMaskBag(n.id, r);
		}
		if (e.paramBag === t.paramBag) return;
		let n = D(e.paramBag);
		n && e.setDynParams(n);
	});
}
function te() {
	Q?.(), Q = null;
}
//#endregion
export { Z as PANEL_ID, ee as activate, te as deactivate };

//# sourceMappingURL=index.js.map