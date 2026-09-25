import { definitionFor, type EffectInstance, type EffectParameter } from "./studio";

export function scoreControls(effect: EffectInstance): EffectParameter[] {
  const controls = definitionFor(effect.type).parameters.filter(p => !p.choices && !((effect.type === "palette-cycle" || effect.type === "surface-motion") && (p.id === "speed" || p.id.endsWith("Color"))));
  const control = (id: string, label: string, value: number, min = 0, max = 1, step = .01): EffectParameter => ({ id, label, default: value, min, max, step, description: "Compose this control through the loop." });
  if (effect.wizprocess) {
    const w = effect.wizprocess;
    controls.push(...(["mass", "structure", "grain", "tide"] as const).map(key => control(`wizprocess.${key}`, key === "tide" ? "Wiz Tide" : key[0].toUpperCase()+key.slice(1), w[key])));
    controls.push(control("wizprocess.compression", "Compression", w.compression, 1, 1200, 1), control("wizprocess.expansion", "Expansion", w.expansion, 0, 1200, 1));
    if (w.channels === "together") controls.push(control("wizprocess.channelPhase", "Channel Phase", w.channelPhase, -48, 48, 1));
  }
  for (const [index, row] of (effect.ultimateSort?.recipes ?? []).entries()) {
    const add = (key: keyof typeof row, label: string, min = 0, max = 1, step = .01) => controls.push(control(`ultimateSort.${row.id}.${key}`, `${index+1}. ${row.method} · ${label}`, Number(row[key]), min, max, step));
    if (row.action !== "wand" && row.method !== "scatter") add("amount", row.method === "glimmer" ? "Glimmer amount" : "Sort amount");
    if (row.method === "scatter" && row.action !== "wand") add("scatterRefresh", "Scatter changes", 0, 120, 1);
    if (["edges", "light", "dark"].includes(row.territory)) add("gate", "Selection cutoff", 0, row.territory === "edges" ? 1200 : 255, 1);
    if (["white", "black", "gray", "colorful", "midtones"].includes(row.territory)) add("toneTolerance", row.territory === "colorful" ? "Color minimum" : row.territory === "midtones" ? "Midtone width" : "Color tolerance");
    if (row.method === "glimmer") { add("glimmerSize", "Star size", .5, 12, .5); add("glimmerSpeed", "Noise drift", 0, 1, .05); }
    else {
      add("selectionSpeed", "Selection speed", 0, 12, .1);
      if (row.resolution !== "pixel") { add("minBlock", "Small blocks", 1, 32, 1); add("maxBlock", "Large blocks", 1, 32, 1); }
    }
    if (row.territory === "body") { add("bodyColorReach", "Body reach", .01, 1); add("bodyShadeLoyalty", "Shade loyalty"); add("bodyEdgeLoyalty", "Contour loyalty"); add("bodyExpansion", "Grow / shrink", -.08, .18, .01); }
  }
  return controls;
}

export function authoredScoreValue(effect: EffectInstance, parameter: string): number | undefined {
  const parts = parameter.split(".");
  if (parts[0] === "wizprocess") return Number((effect.wizprocess as unknown as Record<string, unknown>)?.[parts[1]]);
  if (parts[0] === "ultimateSort") return Number((effect.ultimateSort?.recipes.find(r => r.id === parts[1]) as unknown as Record<string, unknown>)?.[parts[2]]);
  return effect.parameters[parameter];
}
