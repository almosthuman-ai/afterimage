export const wizColorSpaceOptions = [
  { value: "rgb", label: "RGB", note: "Direct red, green, and blue structure." },
  { value: "hsb", label: "HSB", note: "Hue, saturation, and brightness separate color identity from light." },
  { value: "ohta", label: "OHTA", note: "One intensity plane and two opponent-color differences." },
  { value: "cmy", label: "CMY", note: "Subtractive cyan, magenta, and yellow complements." },
  { value: "xyz", label: "XYZ", note: "CIE tristimulus light coordinates." },
  { value: "yxy", label: "Yxy", note: "Luminance separated from chromaticity coordinates." },
  { value: "hcl", label: "HCL", note: "Hue and chroma orbit a luma body." },
  { value: "luv", label: "LUV", note: "Perceptual lightness with chromatic displacement." },
  { value: "lab", label: "LAB", note: "Perceptual lightness with red-green and blue-yellow opposition." },
  { value: "hwb", label: "HWB", note: "Hue contaminated by whiteness and blackness." },
  { value: "rggbg", label: "R-G / G / B-G", note: "Green becomes the anchor for two wrapped difference planes." },
  { value: "ypbpr", label: "YPbPr", note: "Luma with wrapped blue and red difference signals." },
  { value: "ycbcr", label: "YCbCr", note: "Digital-video luma and chroma planes." },
  { value: "ydbdr", label: "YDbDr", note: "SECAM-like luma with wide color-difference axes." },
] as const;

export type WizColorSpace = typeof wizColorSpaceOptions[number]["value"];

type Channels = [number, number, number];

const clamp255 = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(255, value)) : 0;
const wrap256 = (value: number) => ((value % 256) + 256) % 256;
const D65_X = 0.950456;
const D65_Y = 1;
const D65_Z = 1.088754;
const CIE_EPSILON = 216 / 24389;
const CIE_K = 24389 / 27;
const D65_U = 4 * D65_X / (D65_X + 15 * D65_Y + 3 * D65_Z);
const D65_V = 9 * D65_Y / (D65_X + 15 * D65_Y + 3 * D65_Z);

function rgbToHsb(red: number, green: number, blue: number): Channels {
  const r = red / 255, g = green / 255, b = blue / 255;
  const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
  let hue = 0;
  if (delta > 0) {
    hue = high === r ? ((g - b) / delta) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }
  return [hue / 360 * 255, high <= 0 ? 0 : delta / high * 255, high * 255];
}

function hsbToRgb(hue: number, saturation: number, brightness: number): Channels {
  const h = wrap256(hue) / 255 * 360, s = clamp255(saturation) / 255, v = clamp255(brightness) / 255;
  const chroma = v * s, section = h / 60, middle = chroma * (1 - Math.abs((section % 2) - 1));
  const [r1, g1, b1] = section < 1 ? [chroma, middle, 0] : section < 2 ? [middle, chroma, 0]
    : section < 3 ? [0, chroma, middle] : section < 4 ? [0, middle, chroma]
      : section < 5 ? [middle, 0, chroma] : [chroma, 0, middle];
  const match = v - chroma;
  return [(r1 + match) * 255, (g1 + match) * 255, (b1 + match) * 255];
}

function rgbToXyz(red: number, green: number, blue: number): Channels {
  const linear = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel > 0.04045 ? ((channel + 0.055) / 1.055) ** 2.4 : channel / 12.92;
  });
  return [
    (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) * 100,
    (linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722) * 100,
    (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) * 100,
  ];
}

function xyzToRgb(xValue: number, yValue: number, zValue: number): Channels {
  const x = xValue / 100, y = yValue / 100, z = zValue / 100;
  const linear = [
    x * 3.2406 + y * -1.5372 + z * -0.4986,
    x * -0.9689 + y * 1.8758 + z * 0.0415,
    x * 0.0557 + y * -0.2040 + z * 1.057,
  ];
  return linear.map((channel) => 255 * (channel > 0.0031308 ? 1.055 * channel ** (1 / 2.4) - 0.055 : 12.92 * channel)) as Channels;
}

export function rgbToWizColorSpace(space: WizColorSpace, red: number, green: number, blue: number): Channels {
  const r = clamp255(red), g = clamp255(green), b = clamp255(blue);
  if (space === "rgb") return [r, g, b];
  if (space === "hsb") return rgbToHsb(r, g, b);
  if (space === "cmy") return [255 - r, 255 - g, 255 - b];
  if (space === "ohta") return [(r + g + b) / 3, 127.5 + 0.5 * (r - b), 127.5 - 0.25 * r + 0.5 * g - 0.25 * b].map(clamp255) as Channels;
  if (space === "rggbg") return [wrap256(r - g), g, wrap256(b - g)];
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (space === "ypbpr") return [luma, wrap256(b - luma), wrap256(r - luma)].map(clamp255) as Channels;
  if (space === "ycbcr") return [0.298839 * r + 0.586811 * g + 0.11435 * b, -0.168736 * r - 0.331264 * g + 0.5 * b + 127.5, 0.5 * r - 0.418688 * g - 0.081312 * b + 127.5].map(clamp255) as Channels;
  if (space === "ydbdr") return [0.299 * r + 0.587 * g + 0.114 * b, 127.5 + (-0.45 * r - 0.883 * g + 1.333 * b) / 2.666, 127.5 + (-1.333 * r + 1.116 * g + 0.217 * b) / 2.666].map(clamp255) as Channels;
  if (space === "hwb") {
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    if (high === low) return [255, low, 255 - high];
    const difference = r === low ? g - b : g === low ? b - r : r - g;
    const sector = r === low ? 3 : g === low ? 5 : 1;
    return [clamp255((sector - difference / (high - low)) / 6 * 254), low, 255 - high];
  }
  if (space === "hcl") {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const high = Math.max(rn, gn, bn), low = Math.min(rn, gn, bn), chroma = high - low;
    let hue = 0;
    if (chroma !== 0) hue = high === rn ? ((gn - bn) / chroma + 6) % 6 : high === gn ? (bn - rn) / chroma + 2 : (rn - gn) / chroma + 4;
    return [hue / 6 * 255, chroma * 255, (0.298839 * rn + 0.586811 * gn + 0.11435 * bn) * 255];
  }
  const xyz = rgbToXyz(r, g, b);
  if (space === "xyz") return xyz.map((value) => clamp255(value * 2.55)) as Channels;
  if (space === "yxy") {
    const sum = xyz[0] + xyz[1] + xyz[2];
    return [clamp255(xyz[1] * 2.55), sum > 0 ? xyz[0] / sum * 255 : 0, sum > 0 ? xyz[1] / sum * 255 : 0];
  }
  if (space === "lab") {
    const normalized = [xyz[0] / 100 / D65_X, xyz[1] / 100 / D65_Y, xyz[2] / 100 / D65_Z];
    const f = normalized.map((value) => value > CIE_EPSILON ? value ** (1 / 3) : (CIE_K * value + 16) / 116);
    return [clamp255(((116 * f[1] - 16) * 0.01) * 255), clamp255((0.5 * (f[0] - f[1]) + 0.5) * 255), clamp255((0.5 * (f[1] - f[2]) + 0.5) * 255)];
  }
  const denominator = xyz[0] + 15 * xyz[1] + 3 * xyz[2];
  const luminance = xyz[1] / 100;
  const lightness = luminance > CIE_EPSILON ? 116 * luminance ** (1 / 3) - 16 : CIE_K * luminance;
  if (denominator === 0) return [clamp255(lightness * 2.55), 128, 128];
  const u = 13 * lightness * (4 * xyz[0] / denominator - D65_U);
  const v = 13 * lightness * (9 * xyz[1] / denominator - D65_V);
  return [clamp255(lightness * 2.55), clamp255((u + 134) / 354 * 255), clamp255((v + 140) / 262 * 255)];
}

export function wizColorSpaceToRgb(space: WizColorSpace, first: number, second: number, third: number): Channels {
  const a = clamp255(first), b = clamp255(second), c = clamp255(third);
  let rgb: Channels;
  if (space === "rgb") rgb = [a, b, c];
  else if (space === "hsb") rgb = hsbToRgb(a, b, c);
  else if (space === "cmy") rgb = [255 - a, 255 - b, 255 - c];
  else if (space === "ohta") {
    const i2 = b - 127.5, i3 = c - 127.5;
    rgb = [a + i2 - 0.66668 * i3, a + 1.33333 * i3, a - i2 - 0.66668 * i3];
  } else if (space === "rggbg") rgb = [wrap256(a + b), b, wrap256(c + b)];
  else if (space === "ypbpr") {
    const blue = wrap256(b + a), red = wrap256(c + a);
    rgb = [red, (a - 0.2126 * red - 0.0722 * blue) / 0.7152, blue];
  } else if (space === "ycbcr") {
    const cb = b - 127.5, cr = c - 127.5;
    rgb = [a + 1.402 * cr, a - 0.344136 * cb - 0.714136 * cr, a + 1.772 * cb];
  } else if (space === "ydbdr") {
    const db = (b - 127.5) * 2.666, dr = (c - 127.5) * 2.666;
    rgb = [a + 9.23037e-5 * db - 0.52591 * dr, a - 0.12913 * db + 0.26789 * dr, a + 0.66467 * db - 7.92025e-5 * dr];
  } else if (space === "hwb") {
    const blackLimit = 255 - c;
    if (a === 255) rgb = [blackLimit, blackLimit, blackLimit];
    else {
      const hue = a / 254 * 6, sector = Math.floor(hue), fraction = (sector & 1) !== 0 ? 1 - (hue - sector) : hue - sector;
      const white = b / 255, value = blackLimit / 255, middle = white + fraction * (value - white);
      const normalized: Channels = sector === 1 ? [middle, value, white] : sector === 2 ? [white, value, middle]
        : sector === 3 ? [white, middle, value] : sector === 4 ? [middle, white, value]
          : sector === 5 ? [value, white, middle] : [value, middle, white];
      rgb = normalized.map((channel) => channel * 255) as Channels;
    }
  } else if (space === "hcl") {
    const hue = 6 * a / 255, chroma = b / 255, luma = c / 255, middle = chroma * (1 - Math.abs((hue % 2) - 1));
    const body: Channels = hue < 1 ? [chroma, middle, 0] : hue < 2 ? [middle, chroma, 0]
      : hue < 3 ? [0, chroma, middle] : hue < 4 ? [0, middle, chroma]
        : hue < 5 ? [middle, 0, chroma] : [chroma, 0, middle];
    const match = luma - (0.298839 * body[0] + 0.586811 * body[1] + 0.11435 * body[2]);
    rgb = body.map((channel) => (channel + match) * 255) as Channels;
  } else if (space === "xyz") rgb = xyzToRgb(a / 2.55, b / 2.55, c / 2.55);
  else if (space === "yxy") {
    const yValue = a / 2.55, x = b / 255, y = c / 255;
    rgb = xyzToRgb(y > 0 ? x * yValue / y : 0, yValue, y > 0 ? (1 - x - y) * yValue / y : 0);
  } else if (space === "lab") {
    const lightness = a / 255 * 100, aAxis = b / 255 * 2 - 1, bAxis = c / 255 * 2 - 1;
    let y = (lightness + 16) / 116, x = y + aAxis, z = y - bAxis;
    const xCube = x ** 3, yCube = y ** 3, zCube = z ** 3;
    x = xCube > CIE_EPSILON ? xCube : (116 * x - 16) / CIE_K;
    y = yCube > CIE_EPSILON ? yCube : lightness / CIE_K;
    z = zCube > CIE_EPSILON ? zCube : (116 * z - 16) / CIE_K;
    rgb = xyzToRgb(100 * D65_X * x, 100 * D65_Y * y, 100 * D65_Z * z);
  } else {
    const lightness = a / 255 * 100, u = 354 * b / 255 - 134, v = 262 * c / 255 - 140;
    if (lightness === 0) rgb = [0, 0, 0];
    else {
      const y = lightness > CIE_K * CIE_EPSILON ? ((lightness + 16) / 116) ** 3 : lightness / CIE_K;
      const uPrime = u / (13 * lightness) + D65_U, vPrime = v / (13 * lightness) + D65_V;
      rgb = xyzToRgb(100 * y * 9 * uPrime / (4 * vPrime), 100 * y, 100 * y * (12 - 3 * uPrime - 20 * vPrime) / (4 * vPrime));
    }
  }
  return rgb.map(clamp255) as Channels;
}
