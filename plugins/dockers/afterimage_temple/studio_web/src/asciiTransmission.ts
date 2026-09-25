import atlasJson from "./ascii-atlas.json";

export const ASCII_FONT_ASSET = "source-code-pro-semibold-2.042";
export const ASCII_ATLAS_VERSION = 1;
export const ASCII_FONT_FAMILY = "Glitch Temple Source Code Pro";

export type AsciiGlyphFeature = {
  glyph: string;
  code: number;
  density: number;
  cx: number;
  cy: number;
  h: number;
  v: number;
  rise: number;
  fall: number;
  edge: number;
  corner: number;
};

export type AsciiSourceFeature = {
  mass: number;
  horizontal: number;
  vertical: number;
  rise: number;
  fall: number;
  edge: number;
};

const atlas = atlasJson as { version: number; fontAsset: string; glyphs: AsciiGlyphFeature[] };
const byGlyph = new Map(atlas.glyphs.map((feature) => [feature.glyph, feature]));

export function printableAsciiGlyphs(glyphs: string[]) {
  const result: string[] = [];
  for (const glyph of glyphs) {
    for (const character of Array.from(glyph)) {
      const code = character.charCodeAt(0);
      if (code >= 32 && code <= 126 && !result.includes(character)) result.push(character);
    }
  }
  return result.length ? result : [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"];
}

export function measuredAsciiGlyphs(glyphs: string[]) {
  return printableAsciiGlyphs(glyphs).sort((left, right) => {
    const a = byGlyph.get(left)?.density ?? 0;
    const b = byGlyph.get(right)?.density ?? 0;
    return a - b || left.charCodeAt(0) - right.charCodeAt(0);
  });
}

function normalizedDirections(feature: AsciiGlyphFeature) {
  const minimum = Math.min(feature.h, feature.v, feature.rise, feature.fall);
  const h = Math.max(0, feature.h - minimum);
  const v = Math.max(0, feature.v - minimum);
  const rise = Math.max(0, feature.rise - minimum);
  const fall = Math.max(0, feature.fall - minimum);
  const total = Math.max(0.000001, h + v + rise + fall);
  return { h: h / total, v: v / total, rise: rise / total, fall: fall / total };
}

export function chooseStructuralGlyph(
  glyphs: string[],
  source: AsciiSourceFeature,
  logic: "mass" | "bones" | "hybrid",
  loyalty: number,
  random: number,
) {
  const candidates = printableAsciiGlyphs(glyphs).map((glyph) => byGlyph.get(glyph)).filter((feature): feature is AsciiGlyphFeature => Boolean(feature));
  if (!candidates.length) return " ";
  const densities = candidates.map((feature) => feature.density);
  const minimumDensity = Math.min(...densities);
  const densitySpan = Math.max(0.000001, Math.max(...densities) - minimumDensity);
  const scored = candidates.map((feature) => {
    const directions = normalizedDirections(feature);
    const density = (feature.density - minimumDensity) / densitySpan;
    const massDistance = Math.abs(density - source.mass);
    const structureDistance =
      Math.abs(directions.h - source.horizontal) +
      Math.abs(directions.v - source.vertical) +
      Math.abs(directions.rise - source.rise) +
      Math.abs(directions.fall - source.fall) +
      Math.abs(feature.edge - source.edge) * 0.35;
    const distance = logic === "mass" ? massDistance : logic === "bones" ? structureDistance : massDistance * 0.48 + structureDistance * 0.52;
    return { glyph: feature.glyph, distance };
  }).sort((left, right) => left.distance - right.distance || left.glyph.charCodeAt(0) - right.glyph.charCodeAt(0));
  const searchWidth = Math.max(1, Math.min(scored.length, 1 + Math.round((1 - loyalty) * Math.min(7, scored.length - 1))));
  return scored[Math.min(searchWidth - 1, Math.floor(random * searchWidth))].glyph;
}

export function asciiBitRot(glyph: string, amount: number, random: number, secondRandom: number) {
  const code = glyph.charCodeAt(0);
  if (code < 32 || code > 126 || random >= amount) return glyph;
  const bit = 1 << Math.min(6, Math.floor(secondRandom * 7));
  let damaged = code ^ bit;
  if (damaged < 32 || damaged > 126) damaged = 32 + ((damaged - 32 + 95) % 95);
  return String.fromCharCode(damaged);
}

export function asciiLoopWave(phase: number, address: number) {
  return 0.5 + 0.5 * Math.cos(phase + address * Math.PI * 2);
}
