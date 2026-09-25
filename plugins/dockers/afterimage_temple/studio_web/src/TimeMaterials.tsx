import { paletteLoopRepeats } from "./paletteCycle";
import { useState } from "react";
import { definitionFor, koneFormDefinition, type StudioRecipe } from "./studio";
import { normalizeScore, scoreValue, type ScoreTrack } from "./timeScore";
import { scoreControls, authoredScoreValue } from "./scoreControls";

export function TimeMaterials({ recipe, onChange, playing, auditionPosition, onPlay }: { recipe: StudioRecipe; onChange: (recipe: StudioRecipe) => void; playing: boolean; auditionPosition: number; onPlay: () => void }) {
  const position = playing ? auditionPosition : recipe.scorePosition ?? 0;
  const [selectedTrack, setSelectedTrack] = useState("");
  const [owner, setOwner] = useState(recipe.baseMode === "kone" ? "form" : recipe.effects[0]?.id ?? recipe.layers[0]?.id ?? "form");
  const [parameter, setParameter] = useState("");
  const tracks = recipe.timeScore ?? [];
  const track = tracks.find(t => t.id === selectedTrack) ?? tracks[0];
  const effect = recipe.effects.find(e => e.id === owner);
  const layer = recipe.layers.find(l => l.id === owner);
  const parameters = effect ? scoreControls(effect) : layer ? [{ id: "opacity", label: "Presence", min: 0, max: 1, step: .01, default: layer.opacity }] : recipe.baseMode === "kone" ? koneFormDefinition.parameters.filter(p => !p.choices) : [];
  const chosen = parameters.find(p => p.id === parameter) ?? parameters[0];
  const label = (t: ScoreTrack) => {
    if (t.target === "form") return `FORM · ${koneFormDefinition.parameters.find(p => p.id === t.parameter)?.label ?? t.parameter}`;
    if (t.target === "layer") return `${recipe.layers.find(l => l.id === t.owner)?.label ?? "Missing material"} · Presence`;
    const source = recipe.effects.find(e => e.id === t.owner);
    return `${source ? definitionFor(source.type).name : "Missing process"} · ${source ? scoreControls(source).find(p => p.id === t.parameter)?.label ?? t.parameter : t.parameter}`;
  };
  const updateTrack = (next: ScoreTrack) => onChange({ ...recipe, timeScore: normalizeScore(tracks.map(t => t.id === next.id ? next : t)) });
  const addTrack = () => {
    if (!chosen) return;
    const target = effect ? "effect" : layer ? "layer" : "form";
    const existing = tracks.find(t => t.target === target && t.owner === owner && t.parameter === chosen.id);
    if (existing) { setSelectedTrack(existing.id); return; }
    const value = effect ? authoredScoreValue(effect, chosen.id) ?? chosen.default : layer ? layer.opacity : recipe.koneForm.parameters[chosen.id] ?? chosen.default;
    const id = crypto.randomUUID();
    onChange({ ...recipe, timeScore: [...tracks, { id, target, owner, parameter: chosen.id, enabled: true, points: [{ time: 0, value, ease: "smooth" }, { time: .5, value, ease: "smooth" }] }] });
    setSelectedTrack(id);
  };
  const trackEffect = recipe.effects.find(e => e.id === track?.owner);
  const trackParameter = track?.target === "effect" && trackEffect ? scoreControls(trackEffect).find(p => p.id === track.parameter) : track?.target === "form" ? koneFormDefinition.parameters.find(p => p.id === track.parameter) : undefined;
  const min = trackParameter?.min ?? 0, max = trackParameter?.max ?? 1;
  const x = (time: number) => 12 + time * 376;
  const y = (value: number) => 112 - (value - min) / Math.max(.00001, max - min) * 100;
  const curve = track ? Array.from({ length: 201 }, (_, i) => `${x(i / 200)},${y(scoreValue(track.points, i / 200) ?? min)}`).join(" ") : "";
  const missingMaterials = recipe.effects.filter(e => e.materialId && e.materialId !== "base" && !recipe.layers.some(l => l.id === e.materialId));
  return <section className="time-materials" aria-label="Time and material journeys">
    <header><strong>Time & Materials</strong></header>
    {paletteLoopRepeats(recipe)>1 && <small>The authored score repeats {paletteLoopRepeats(recipe)} times during the extended palette loop. The position control spans the complete export.</small>}
    <div className="score-transport"><button onClick={onPlay}>{playing ? "Pause" : "Play loop"}</button><input aria-label="Loop position" type="range" min="0" max="0.999" step="0.001" value={position} onChange={e => { if (playing) onPlay(); onChange({ ...recipe, scorePosition: Number(e.target.value) }); }}/><span>{((position) * paletteLoopRepeats(recipe) * recipe.loopFrames / recipe.loopFps).toFixed(2)} / {(paletteLoopRepeats(recipe) * recipe.loopFrames / recipe.loopFps).toFixed(2)} s</span></div>
    <details open><summary>Material journeys</summary><p>Each material's processes run in order before it joins the image.</p>
      {missingMaterials.length > 0 && <p role="alert">A material was removed. {missingMaterials.map(e => definitionFor(e.type).name).join(", ")} will rest until you assign another material.</p>}
      {recipe.effects.map((e, i) => <label className="journey-row" key={e.id}><span>{i + 1}. {definitionFor(e.type).name}</span><select aria-label={`Material for process ${i+1}`} value={e.materialId ?? ""} onChange={event => onChange({ ...recipe, effects: recipe.effects.map(item => item.id === e.id ? { ...item, materialId: event.target.value || undefined } : item) })}>{e.materialId && e.materialId !== "base" && !recipe.layers.some(l => l.id === e.materialId) && <option value={e.materialId}>Missing material · resting</option>}<option value="">Joined image</option><option value="base">Base / FORM</option>{recipe.layers.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>)}
      {recipe.layers.map(l => <label className="journey-row" key={l.id}><span>{l.label} joins</span><select value={recipe.effects.some(e => e.id === l.joinAfter && !e.materialId) ? l.joinAfter : ""} onChange={event => onChange({ ...recipe, layers: recipe.layers.map(item => item.id === l.id ? { ...item, joinAfter: event.target.value || undefined } : item) })}><option value="">Before shared processes</option>{recipe.effects.filter(e => !e.materialId).map(e => <option key={e.id} value={e.id}>After {definitionFor(e.type).name}</option>)}</select></label>)}
      {!recipe.layers.length && <p>Add calligraphy or another image through Layers to give it an independent journey.</p>}
    </details>
    <details open><summary>Compose time</summary><div className="score-add"><select aria-label="Score material or process" value={owner} onChange={e => { setOwner(e.target.value); setParameter(""); }}>{recipe.baseMode === "kone" && <option value="form">FORM</option>}{recipe.effects.map((e,i) => <option key={e.id} value={e.id}>{i+1}. {definitionFor(e.type).name}</option>)}{recipe.layers.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select><select aria-label="Score control" value={chosen?.id ?? ""} onChange={e => setParameter(e.target.value)}>{parameters.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select><button disabled={!chosen} onClick={addTrack}>Add curve</button></div>
      <div className="score-tracks">{tracks.map(t => <button key={t.id} className={track?.id === t.id ? "selected" : ""} onClick={() => setSelectedTrack(t.id)}>{label(t)}{t.enabled ? "" : " · resting"}</button>)}</div>
      {track && <><div className="score-actions"><label><input type="checkbox" checked={track.enabled} onChange={e => updateTrack({ ...track, enabled: e.target.checked })}/>Animate</label><button onClick={() => onChange({ ...recipe, timeScore: tracks.filter(t => t.id !== track.id) })}>Remove curve</button></div>
        <svg viewBox="0 0 400 124" className="score-curve" aria-label={`${label(track)} loop curve`}><path d="M12 12V112H388" fill="none" stroke="currentColor" opacity=".3"/><polyline points={curve} fill="none" stroke="currentColor" strokeWidth="2"/>{track.points.map((p,i) => <circle key={i} cx={x(p.time)} cy={y(p.value)} r="5" fill="currentColor" style={{ cursor: "grab", touchAction: "none" }} onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e => { if (!(e.buttons & 1)) return; const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); const time = Math.max((track.points[i-1]?.time ?? -.001)+.001, Math.min((track.points[i+1]?.time ?? 1)-.001, ((e.clientX-rect.left)/rect.width*400-12)/376)); const raw = min+(112-(e.clientY-rect.top)/rect.height*124)/100*(max-min); const step = trackParameter?.step ?? .01; const value = Math.max(min,Math.min(max,Math.round(raw/step)*step)); updateTrack({...track,points:track.points.map((q,j)=>j===i?{...q,time,value:Number(value.toFixed(6))}:q)}); }}/>)}<line x1={x(position)} x2={x(position)} y1="8" y2="116" stroke="#a44"/></svg>
        <p>Each point controls the transition to the next. The last returns to the first.</p>
        {track.points.map((p,i) => <div className="score-point" key={i}><label>Loop %<input aria-label={`Point ${i+1} time`} type="number" min="0" max="99.9" step=".1" value={Math.round(p.time*1000)/10} onChange={e => updateTrack({ ...track, points: track.points.map((q,j) => j === i ? { ...q, time: Number(e.target.value)/100 } : q) })}/></label><label>Value<input aria-label={`Point ${i+1} value`} type="number" min={min} max={max} step={trackParameter?.step ?? .01} value={p.value} onChange={e => updateTrack({ ...track, points: track.points.map((q,j) => j === i ? { ...q, value: Math.max(min, Math.min(max, Number(e.target.value))) } : q) })}/></label><label>Travel<select value={p.ease} onChange={e => updateTrack({ ...track, points: track.points.map((q,j) => j === i ? { ...q, ease: e.target.value as typeof q.ease } : q) })}><option value="smooth">Ease</option><option value="linear">Steady</option><option value="hold">Hold, then jump</option></select></label><button disabled={track.points.length < 2} aria-label={`Remove point ${i+1}`} onClick={() => updateTrack({ ...track, points: track.points.filter((_,j) => j !== i) })}>×</button></div>)}
        <button onClick={() => { const gaps=track.points.map((p,i) => ({ start:p.time, gap: (track.points[i+1]?.time ?? track.points[0].time+1)-p.time })).sort((a,b)=>b.gap-a.gap); const time=(gaps[0].start+gaps[0].gap/2)%1; updateTrack({ ...track, points:[...track.points,{time,value:scoreValue(track.points,time) ?? min,ease:"smooth"}] }); }}>Add point</button></>}
    </details>
  </section>;
}
