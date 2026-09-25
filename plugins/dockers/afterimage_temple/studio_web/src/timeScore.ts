import type { StudioRecipe } from "./studio";

export type ScorePoint = { time: number; value: number; ease: "linear" | "smooth" | "hold" };
export type ScoreTrack = { id: string; target: "effect" | "form" | "layer"; owner: string; parameter: string; enabled: boolean; points: ScorePoint[] };
export function normalizeScore(tracks: ScoreTrack[] | undefined): ScoreTrack[] {
  return (Array.isArray(tracks) ? tracks : []).filter(t => t && ["effect", "form", "layer"].includes(t.target)).map(t => ({
    ...t, enabled: t.enabled !== false,
    points: (Array.isArray(t.points) ? t.points : []).filter(p => p && Number.isFinite(p.time) && Number.isFinite(p.value))
      .map(p => ({ time: Math.max(0, Math.min(.999999, p.time)), value: p.value, ease: (["linear", "smooth", "hold"].includes(p.ease) ? p.ease : "smooth") as ScorePoint["ease"] }))
      .sort((a,b) => a.time - b.time).filter((p,i,all) => i === 0 || p.time !== all[i-1].time),
  }));
}
export function scoreValue(points: ScorePoint[], time: number): number | undefined {
  if (!points.length) return undefined;
  if (points.length === 1) return points[0].value;
  const t = ((time % 1) + 1) % 1;
  const next = points.findIndex(p => p.time > t);
  const b = points[next < 0 ? 0 : next];
  const a = points[next <= 0 ? points.length - 1 : next - 1];
  const start = a.time > t ? a.time - 1 : a.time;
  const end = b.time <= start ? b.time + 1 : b.time;
  let mix = (t - start) / (end - start);
  if (a.ease === "hold") mix = 0;
  if (a.ease === "smooth") mix = mix * mix * (3 - 2 * mix);
  return a.value + (b.value - a.value) * mix;
}
export function scoreRecipe(recipe: StudioRecipe, time: number): StudioRecipe {
  if (!recipe.timeScore?.some(t => t.enabled && t.points.length)) return recipe;
  const result = { ...recipe, effects: recipe.effects.map(e => ({ ...e, parameters: { ...e.parameters } })), layers: recipe.layers.map(l => ({ ...l })), koneForm: { ...recipe.koneForm, parameters: { ...recipe.koneForm.parameters } } };
  for (const track of recipe.timeScore) {
    if (!track.enabled) continue;
    const value = scoreValue(track.points, time);
    if (value === undefined) continue;
    if (track.target === "effect") {
      const effect = result.effects.find(e => e.id === track.owner);
      if (effect) {
        const parts = track.parameter.split(".");
        if (parts[0] === "wizprocess" && effect.wizprocess && parts[1] in effect.wizprocess) effect.wizprocess = { ...effect.wizprocess, [parts[1]]: value };
        else if (parts[0] === "ultimateSort" && effect.ultimateSort) effect.ultimateSort = { ...effect.ultimateSort, recipes: effect.ultimateSort.recipes.map(row => row.id === parts[1] && parts[2] in row ? { ...row, [parts[2]]: value } : row) };
        else if (parts.length === 1) effect.parameters[track.parameter] = value;
      }
    } else if (track.target === "form") result.koneForm.parameters[track.parameter] = value;
    else { const layer = result.layers.find(l => l.id === track.owner); if (layer) layer.opacity = Math.max(0, Math.min(1, value)); }
  }
  return result;
}
