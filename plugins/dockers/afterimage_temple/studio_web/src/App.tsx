import {FormStackControls,FormPlacementControls} from "./FormStackControls";
import {addFormPart,formParts} from "./formStack";
import {defaultKoneForm} from "./studio";
import {selectFormKind,selectedFormKind} from "./formComposition";
import { PaletteLibrary } from './PaletteLibrary';
import { FormColors, PrintedFoldControls } from './FormColors';
import {StructureControls} from './StructureControls';
import {makeEmojiAtlas,type EmojiChoice} from './emojiMix';
import { FigureControls } from "./FigureControls";
import { watchCyclePalette, paletteLoopRepeats, paletteLoopFrames, type CycleColor } from "./paletteCycle";
import { KnotControls } from "./KnotControls";
import { knotDefaults } from "./knot";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { uploadImage } from "./afterimageBridge";
import { listen } from "@tauri-apps/api/event";
import { open as chooseDirectory } from "@tauri-apps/plugin-dialog";
import "./App.css";
import { LivePreview, type LivePreviewHandle, type TargetSample } from "./LivePreview";
import { TimeMaterials } from "./TimeMaterials";
import {
  applyPaletteSettings,
  asciiBanks,
  cleanPassRecipe,
  createEffect,
  defaultCharacterField,
  defaultUltimateSortRecipe,
  defaultLanguageBody,
  defaultRecipe,
  definitionFor,
  effectDefinitions,
  formFamilies,
  formFamilyStartingValues,
  koneFormDefinition,
  nextColors,
  nextIteration,
  nextKoneForm,
  nextKoneIteration,
  newPassFamilyId,
  nextZhuyinIteration,
  nextStructure,
  normalizeRecipe,
  paletteStructures,
  petsciiPalette,
  parameterPrecision,
  whereModes,
  zhuyinBanks,
  type EffectParameter,
  type EffectInstance,
  type EffectType,
  type CharacterField,
  type LanguageBody,
  type ZhuyinField,
  type PaletteSettings,
  type PaletteStructure,
  type StudioLayer,
  type StudioRecipe,
  type UltimateSortRecipe,
  type UltimateSortStack,
  type Wizprocess,
  type FormFamily,
} from "./studio";
import { wizColorSpaceOptions } from "./colorSpaces";

type ParameterDefinition = { id: string; label: string; description: string; kind?: "color"; min: number; max: number; step: number; default: number };
type OutputRecord = {
  id: string; kind: "still" | "gif" | "mp4" | "capture"; filePath: string; previewDataUrl?: string;
  sourceImage?: string; sourcePreviewDataUrl?: string; createdAt: string; seed: number;
  parameters: Record<string, number>; recipe?: StudioRecipe; width: number; height: number;
};
type TempleSnapshot = {
  workspacePath: string; sketchPath: string; processingPath: string;
  manifest: { title: string; description: string; parameters: ParameterDefinition[] };
  current: { seed: number; parameters: Record<string, number>; recipe?: StudioRecipe; latestOutput?: string; sourceImage?: string };
  sourcePreviewDataUrl?: string; outputs: OutputRecord[]; sourceRevision: number; latestError?: string; rendering: boolean;
};
type RenderResult = { output: OutputRecord; stdout: string };
type SourceImage = { filePath: string; previewDataUrl: string; width?: number; height?: number; name?: string };
type CuratedGalleryEntry = {
  id: string; name: string; filePath: string; previewDataUrl: string; output?: OutputRecord;
};
type RenderProgress = { completedFrames: number; totalFrames: number; encoding: boolean };
type EffectSource = { effectType: string; functionName: string; filePath: string; startLine: number; endLine: number; code: string };
type ProcessRecipeRecord = {
  name: string;
  scope: "ultimate-sort-mix" | "glitch-steps";
  createdAt: string;
  path: string;
  payload: { ultimateSort?: UltimateSortStack; effects?: EffectInstance[]; loopFps?: number };
};
type StudioCommand = {
  id: string; author?: string; description?: string; preconditionRevision?: number;
  command: { type: string; [key: string]: unknown };
};
type StudioMode = "glitch" | "form" | "language" | "text" | "zhuyin" | "petscii" | "gallery";

const GALLERY_FOLDER_STORAGE = "glitch-temple:gallery-folder";

const primaryStudioModes: { id: StudioMode; label: string; description: string }[] = [
  { id: "form", label: "Form", description: "Generate a body from an empty field" },
  { id: "glitch", label: "Glitch", description: "Break and mix the material you chose" },
  { id: "gallery", label: "Gallery", description: "Return to the discoveries you chose to keep" },
];
const textStudioModes: { id: StudioMode; label: string; description: string }[] = [
  { id: "language", label: "Language Body", description: "Whole phrases gather into figures, signals, and territories" },
  { id: "text", label: "ASCII", description: "Less is more: characters, grid, rhythm, and territory" },
  { id: "zhuyin", label: "Zhuyin", description: "Patterned phonetic signs, layered like ink" },
  { id: "petscii", label: "PETSCII Study", description: "Rebuild the image through a fixed tile grammar" },
];
const visibleAsciiBanks = asciiBanks.filter((bank) => ["density", "punctuation", "custom"].includes(bank.id));
const asciiTerritoryModes = whereModes.filter((mode) => ["whole", "light", "dark", "edges", "saturated", "muted", "hue"].includes(mode.value));
const sampledWhereModes = new Set(["color-kin", "found-body", "shape-relatives"]);
const isGlitchEffect = (effect: EffectInstance) => !["ascii-field", "zhuyin-weave", "petscii-study"].includes(effect.type);
const asciiFundamentalParameters = new Set(["cellSize", "coverage", "imageLoyalty", "edgeVoice", "invertDensity", "bodyGate"]);
const asciiTransmissionParameters = new Set(["signalMemory", "mutationTide", "bitRot", "overstrike", "carriageDrift", "lineFeedFault", "tabGap", "dropout"]);
const focusedEffectType = (mode: StudioMode): EffectType | null =>
  mode === "language" ? "language-body" : mode === "text" ? "ascii-field" : mode === "zhuyin" ? "zhuyin-weave" : mode === "petscii" ? "petscii-study" : null;
const roomForEffectType = (type: EffectType): StudioMode =>
  type === "language-body" ? "language" : type === "ascii-field" ? "text" : type === "zhuyin-weave" ? "zhuyin" : type === "petscii-study" ? "petscii" : "glitch";

const koneBodyGroups = [
  { label: "Body", description: "Mass, scale difference, separation, and position", ids: new Set(["bodyRadius", "koneSizeDifference", "koneSeparation", "konePositionScatter", "axisStretch", "turn", "molt"]) },
  { label: "Breath", description: "The pulse moving around the skin", ids: new Set(["lobes", "breathDepth", "wound"]) },
  { label: "Break", description: "Open, rib, twist, and fold the body", ids: new Set(["opening", "ribCount", "twist", "foldDepth"]) },
];
const growthParameterIds = new Set(["budding", "flowerSize", "growthReach", "graftDepth", "flowerPositionScatter", "flowerClustering", "surfaceAttraction", "bridgeGrowth", "ribEscape"]);
const bloomSiteOptions = [
  { value: 0, label: "Orbit" },
  { value: 1, label: "Wounds" },
  { value: 2, label: "Rib ends" },
];
const mouthsParameterIds = new Set(["mouths"]);
const orchidAnatomyOptions = [
  { id: "orchidBackPetals", label: "Back petals", default: 1 },
  { id: "orchidSepals", label: "Sepals", default: 1 },
  { id: "orchidWidePetals", label: "Wide petals", default: 1 },
  { id: "orchidLip", label: "Lip", default: 1 },
  { id: "orchidThroat", label: "Throat oval", default: 1 },
  { id: "orchidColumn", label: "Center oval", default: 1 },
  { id: "orchidVeins", label: "Short veins", default: 0 },
];
const pouchAnatomyOptions = [
  { id: "pouchLeaves", label: "Paired leaves", default: 1 },
  { id: "pouchBody", label: "Living chamber", default: 1 },
  { id: "pouchVeins", label: "Contour veins", default: 1 },
];
const pouchPressureIds = new Set(["pouchScale", "pouchInflation", "pouchOpening", "pouchSplit", "pouchInversion"]);
const spiralAnatomyOptions = [
  { id: "spiralLeaves", label: "Grass leaves", default: 1 },
  { id: "spiralStalk", label: "Signal stalk", default: 1 },
  { id: "spiralBlooms", label: "Tiny blooms", default: 1 },
];
const spiralSignalIds = new Set(["spiralHeight", "spiralBloomSize", "spiralTurns", "spiralBloomCount", "spiralMissingBeats", "spiralDrift"]);
const tectonicLensGroups = [
  { label: "TERRITORIES", description: "Where the image decides it can remain connected", ids: new Set(["territoryDetail", "boundarySignal", "boundarySensitivity", "minimumTerritory"]) },
  { label: "LENS LAWS", description: "How each connected body bends its own coordinates", ids: new Set(["dominantLaw", "lensSignal", "lensPressure", "lawDiversity"]) },
  { label: "SEGMENT RIOT", description: "How territories separate, echo, vanish, infect, and move", ids: new Set(["separation", "rotation", "echo", "absence", "boundaryInfection", "sourceMemory", "motion"]) },
];
const signalReliefGroups = [
  { label: "LIGHT FIELD", description: "Spacing, emitter body, scale, and color", ids: new Set(["density", "body", "emitterSize", "lightColor"]) },
  { label: "APPARITION", description: "What image evidence becomes light or absence", ids: new Set(["lightSignal", "threshold", "signalCurve", "polarity"]) },
  { label: "RELIEF & LIFE", description: "How the field buckles, glows, and moves", ids: new Set(["reliefSource", "reliefDepth", "fieldYield", "flicker", "afterglow"]) },
];
const almostAliveGroups = [
  { label: "EVIDENCE", description: "How little of the image can still suggest a being", ids: new Set(["evidenceScale", "lifeSignal", "recognition", "breathingRoom"]) },
  { label: "BODY LANGUAGE", description: "The marks and fragile relations that assemble its body", ids: new Set(["markBody", "bodySize", "lifeSigns", "webReach"]) },
  { label: "WORLD & TEMPER", description: "A calm room for color, mischief, and restless life", ids: new Set(["world", "colorLife", "colorMischief", "restlessness"]) },
];
const audioBendingTypes = new Set<EffectType>(["pcm-possession", "tape-transport", "phase-choir", "spectral-surgery", "echo-architecture", "clip-furnace", "silence-knife"]);
const audioRoutingIds = new Set(["readingPath", "trackBody", "trackReunion"]);
const audioReturnIds = new Set(["sourceMemory", "motion"]);

const formatTime = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
const colorToHex = (value: number) => `#${Math.round(value).toString(16).padStart(6, "0").slice(-6)}`;
const hexToColor = (value: string) => Number.parseInt(value.slice(1), 16);
const sourceName = (path: string) => path.split(/[\\/]/).pop()?.replace(/^\d{8}-\d{6}-\d{3}-/, "") ?? "source image";
const clampOutputDimension = (value: number, maximum = 6000) => Math.max(320, Math.min(maximum, Math.round(value)));
const isLoopOutput = (record: OutputRecord) => record.kind === "gif" || record.kind === "mp4";

function PetsciiTileAtlas() {
  return <div className="petscii-atlas" aria-label="Sixteen quadrant tiles used by PETSCII Study">
    {Array.from({ length: 16 }, (_, mask) => <span key={mask} title={`Tile ${mask}`}>
      {[1, 2, 4, 8].map((bit) => <i key={bit} data-filled={Boolean(mask & bit)}/>)}
    </span>)}
  </div>;
}

const ultimateMethodOptions: { value: UltimateSortRecipe["method"]; label: string }[] = [
  { value: "bubble", label: "Bubble" }, { value: "insertion", label: "Insertion" }, { value: "selection", label: "Selection" },
  { value: "merge", label: "Merge" }, { value: "permute", label: "Permute — Motion" }, { value: "scatter", label: "Permute — Scatter" }, { value: "roll", label: "Roll" },
  { value: "heap", label: "Heap — ordered tails" }, { value: "shell", label: "Shell — comb gaps" }, { value: "quick", label: "Quick — partition fractures" },
  { value: "smooth", label: "Smooth — Leonardo gaps" }, { value: "one-color", label: "One Color — flood" }, { value: "color-bands", label: "One Color — bands" },
  { value: "glimmer", label: "Moving Glimmer" },
];
const ultimateActionOptions: { value: UltimateSortRecipe["action"]; label: string }[] = [
  { value: "sort", label: "Sort" }, { value: "sort-outline", label: "Sort + outline" }, { value: "wand", label: "Wand only" },
];
const ultimateTerritoryOptions: { value: UltimateSortRecipe["territory"]; label: string }[] = [
  { value: "white", label: "White" }, { value: "black", label: "Black" }, { value: "gray", label: "Gray" }, { value: "colorful", label: "Colorful" }, { value: "midtones", label: "Midtones" },
  { value: "whole", label: "Whole" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "edges", label: "Edges" },
  { value: "red", label: "Red" }, { value: "orange", label: "Orange" }, { value: "yellow", label: "Yellow" }, { value: "green", label: "Green" },
  { value: "cyan", label: "Cyan" }, { value: "blue", label: "Blue" }, { value: "pink", label: "Pink" }, { value: "body", label: "Body Wand" },
];

const isRegionProcess=(type?:string)=>type==="palette-cycle"||type==="surface-motion";
function SurfaceMotionEditor({effect,playing,duration,onPlay,onChange}:{effect:EffectInstance;playing:boolean;duration:number;onPlay:()=>void;onChange:(effect:EffectInstance)=>void}){
 const p=effect.parameters,defs=definitionFor("surface-motion").parameters;
 const update=(id:string,value:number)=>onChange({...effect,parameters:{...p,[id]:value}});
 return <section className="surface-motion-editor palette-cycle-editor">
  <div className="palette-cycle-heading"><button onClick={onPlay}>{playing?"Pause":"Play"}</button><small>Surface motion is independent of FORM motion. Complete loop: {duration.toFixed(2)} seconds.</small></div>
  <div className="palette-cycle-choices" role="group" aria-label="Surface speed"><span>Speed</span>{[[0,"Hold"],[.125,"1/8x"],[.25,"1/4x"],[.5,"1/2x"],[1,"1x"],[2,"2x"],[4,"4x"]].map(([value,label])=><button key={label} aria-pressed={p.speed===value} className={p.speed===value?"selected":""} onClick={()=>update("speed",Number(value))}>{label}</button>)}</div>
  <div className="palette-cycle-choices" role="group" aria-label="Surface direction"><span>Direction</span>{[[1,"Forward"],[-1,"Reverse"]].map(([value,label])=><button key={label} aria-pressed={Math.sign(p.cycles)===value} className={Math.sign(p.cycles)===value?"selected":""} onClick={()=>update("cycles",Number(value)*Math.max(1,Math.abs(p.cycles)))}>{label}</button>)}</div>
  {defs.filter(c=>c.choices && (c.id!=="colorMode"||p.material>0)).map(c=><div className="palette-cycle-choices" key={c.id} role="group" aria-label={c.label}><span>{c.label}</span>{c.choices!.map((name,i)=><button key={name} aria-pressed={p[c.id]===i} className={p[c.id]===i?"selected":""} onClick={()=>update(c.id,i)}>{name}</button>)}</div>)}
  {p.material===2 && <label className="surface-alphabet"><span>Characters</span><input aria-label="Surface characters" value={(effect.characterField?.glyphs??Array.from(".:/|+")).join("")} maxLength={64} onChange={event=>onChange({...effect,characterField:{...defaultCharacterField(),...effect.characterField,bank:"custom",glyphs:Array.from(event.target.value).filter(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)<=126)}})}/><small>Printable ASCII, in your chosen order from dark to light. Start with five; an empty alphabet draws no characters.</small></label>}
  {p.material>0 && <div className="region-color-inputs">{(p.colorMode>=.5?["inkColor","groundColor"]:["groundColor"]).map(id=><label key={id}><span>{id==="inkColor"?"Ink":"Background"}</span><input type="color" aria-label={`Surface ${id==="inkColor"?"ink":"background"}`} value={colorToHex(p[id])} onChange={event=>update(id,hexToColor(event.target.value))}/></label>)}</div>}
  <div className="effect-parameters">{defs.filter(c=>!c.choices && !["speed","inkColor","groundColor"].includes(c.id) && (c.id!=="angle"||p.behavior===0) && (!["cellSize","gap","materialMix"].includes(c.id)||p.material>0)).map(c=><ExactParameterControl key={c.id} parameter={c} value={p[c.id]} onCommit={value=>update(c.id,value)}/>)}</div>
  <small>Keep silhouette protects dark and transparent areas. Regions also clip the moving surface. Use Free surface with Whole image to let separated sections travel beyond the original body.</small>
 </section>;
}

function PaletteCycleEditor({effect, duration, playing, onPlay, onChange}: {effect: EffectInstance; duration:number; playing:boolean; onPlay:()=>void; onChange:(parameters:Record<string,number>)=>void}) {
  const [colors,setColors]=useState<CycleColor[]>([]);
  useEffect(()=>{setColors([]);return watchCyclePalette(effect.id,setColors);},[effect.id]);
  const p=effect.parameters,parameters=definitionFor("palette-cycle").parameters;
  const update=(id:string,value:number)=>{const next={...p,[id]:value};if(id==="paletteSource" && value===2){for(let i=0;i<32;i++){const c=colors[i%Math.max(1,colors.length)]??[0,0,0];next[`regionColor${i}`]??=(c[0]<<16)|(c[1]<<8)|c[2];}}if(id==="firstColor")next.lastColor=Math.max(value,p.lastColor);if(id==="lastColor")next.firstColor=Math.min(value,p.firstColor);onChange(next);};
  return <section className="palette-cycle-editor">
    <div className="palette-cycle-heading"><button aria-pressed={playing} onClick={onPlay}>{playing?"Pause":"Play"}</button><small>Playback runs the whole recipe. For a stationary FORM knot, set its Motion amount to 0.</small></div>
    <div className="palette-cycle-choices" role="group" aria-label="Cycle speed"><span>Speed</span>{[[0,"Hold"],[.125,"1/8x"],[.25,"1/4x"],[.5,"1/2x"],[1,"1x"],[2,"2x"],[4,"4x"]].map(([value,label])=><button key={label} aria-pressed={(p.speed??1)===value} className={(p.speed??1)===value?"selected":""} onClick={()=>update("speed",Number(value))}>{label}</button>)}</div>
    <div className="palette-cycle-choices" role="group" aria-label="Cycle direction"><span>Direction</span>{[[1,"Forward"],[-1,"Reverse"]].map(([sign,label])=><button key={label} aria-pressed={Math.sign(p.cycles)===sign} className={Math.sign(p.cycles)===sign?"selected":""} onClick={()=>update("cycles",Number(sign)*Math.max(1,Math.abs(p.cycles)))}>{label}</button>)}</div>
    {Math.min(p.colors,p.lastColor)<=Math.min(p.colors,p.firstColor) && <div className="palette-cycle-heading"><small>Only one palette color is selected. Select at least two to see cycling.</small><button onClick={()=>onChange({...p,firstColor:1,lastColor:p.colors})}>Cycle all colors</button></div>}
    <small>Complete loop: {duration.toFixed(2)} seconds. Slower palette speeds extend the loop; other motion keeps its pace.</small>
    {parameters.filter(c=>c.choices).map(c=><div className="palette-cycle-choices" role="group" aria-label={c.label} key={c.id}><span>{c.label}</span>{c.choices!.map((name,i)=><button key={name} aria-pressed={Math.round(p[c.id]??c.default)===i} className={Math.round(p[c.id]??c.default)===i?"selected":""} onClick={()=>update(c.id,i)}>{name}</button>)}</div>)}
    <div className="cycle-swatches" aria-label="Numbered base palette">{colors.map((c,i)=><div key={i} title={`Color ${i+1}: ${c.join(", ")}`} style={{backgroundColor:`rgb(${c.join(",")})`,color:(c[0]+c[1]+c[2])>384?"#111":"#fff"}}>{i+1}</div>)}</div>
    {p.paletteSource===2 && <div className="region-color-inputs">{Array.from({length:p.colors},(_,i)=><label key={i}><span>{i+1}</span><input type="color" aria-label={`Region color ${i+1}`} value={colorToHex(p[`regionColor${i}`]??0)} onChange={event=>update(`regionColor${i}`,hexToColor(event.target.value))}/></label>)}</div>}
    <small>Numbers identify the base colors. Image colors are sampled again if an earlier process changes the image.</small>
    <div className="effect-parameters">{parameters.filter(c=>!c.choices && c.id!=="speed" && (c.id!=="bands"||p.mapping>0) && (c.id!=="angle"||p.mapping===2) && (!["centerX","centerY"].includes(c.id)||p.mapping===3)).map(c=>{const slot=c.id==="firstColor"||c.id==="lastColor";const max=slot?p.colors:c.max;return <ExactParameterControl key={c.id} parameter={{...c,max}} value={Math.min(max,p[c.id]??c.default)} onCommit={value=>update(c.id,value)}/>;})}</div>
  </section>;
}

function UltimateSortEditor({ stack, loopFrames, loopFps, pickingRecipeId, onPickBody, onChange, onFpsChange }: { stack: UltimateSortStack; loopFrames: number; loopFps: number; pickingRecipeId?: string; onPickBody: (recipeId: string) => void; onChange: (stack: UltimateSortStack) => void; onFpsChange: (fps: number) => void }) {
  const update = (id: string, patch: Partial<UltimateSortRecipe>) => onChange({ ...stack, recipes: stack.recipes.map((recipe) => recipe.id === id ? { ...recipe, ...patch } : recipe) });
  const move = (index: number, delta: -1 | 1) => {
    const target = Math.max(0, Math.min(stack.recipes.length - 1, index + delta));
    if (target === index) return;
    const recipes = [...stack.recipes];
    const [held] = recipes.splice(index, 1);
    recipes.splice(target, 0, held);
    onChange({ ...stack, recipes });
  };
  return <section className="ultimate-sort-editor">
    <div className="ultimate-sort-heading">
      <div><span className="eyebrow">ORDERED METHODS</span><small>Each row receives the image left by the row above it.</small></div>
      <label className="ultimate-sort-speed"><span>Sort speed</span><select value={loopFps} onChange={(event) => onFpsChange(Number(event.target.value))}>{[3,4,6,8,12,18,24,30].map((fps) => <option value={fps} key={fps}>{fps} fps · {(loopFrames / fps).toFixed(1)} sec</option>)}</select><small>Lower FPS moves more slowly and keeps the loop seamless.</small></label>
      <button onClick={() => onChange({ ...stack, recipes: [...stack.recipes, defaultUltimateSortRecipe()] })}>Add method</button>
    </div>
    <div className="ultimate-sort-stack">{stack.recipes.map((recipe, index) => { const isGlimmer = recipe.method === "glimmer"; const isScatter = recipe.method === "scatter"; const isBody = recipe.territory === "body"; const hasGate = ["edges","light","dark"].includes(recipe.territory); return <article className={`${recipe.enabled ? "ultimate-sort-recipe" : "ultimate-sort-recipe bypassed"}${isGlimmer ? " glimmer-recipe" : ""}${isBody ? " body-wand-recipe" : ""}`} key={recipe.id}>
      <div className="ultimate-recipe-order"><b>{index + 1}</b><button onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button onClick={() => move(index, 1)} disabled={index === stack.recipes.length - 1}>↓</button></div>
      <div className="ultimate-recipe-fields">
      <label><span>Method</span><select value={recipe.method} onChange={(event) => update(recipe.id, { method: event.target.value as UltimateSortRecipe["method"] })}>{ultimateMethodOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      {!isScatter && <label><span>{isGlimmer ? "Glimmer amount" : "Sort amount"}</span><input type="number" min="0" max="1" step="0.01" value={recipe.amount} disabled={!isGlimmer && recipe.action === "wand"} onChange={(event) => update(recipe.id, { amount: Math.max(0, Math.min(1, Number(event.target.value))) })}/></label>}
      {isScatter && recipe.action !== "wand" && <label><span>Scatter changes</span><input type="number" min="0" max="120" step="1" value={recipe.scatterRefresh} title="Fresh full shuffles per loop. 0 holds one arrangement; high values create Generate Me flicker." onChange={(event) => update(recipe.id, { scatterRefresh: Math.max(0, Math.min(120, Math.round(Number(event.target.value)))) })}/></label>}
      {!isGlimmer && <label><span>Action</span><select value={recipe.action} onChange={(event) => update(recipe.id, { action: event.target.value as UltimateSortRecipe["action"] })}>{ultimateActionOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>}
      {!isGlimmer && recipe.action !== "wand" && <label><span>Travel</span><select value={recipe.direction} onChange={(event) => update(recipe.id, { direction: event.target.value as UltimateSortRecipe["direction"] })}>{["left","right","up","down"].map((value) => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>}
      {(isGlimmer || (!isScatter && recipe.action !== "wand")) && <label><span>{isGlimmer ? "Light signal" : "Sort signal"}</span><select value={recipe.signal} onChange={(event) => update(recipe.id, { signal: event.target.value as UltimateSortRecipe["signal"] })}>{["red","green","blue","hue","saturation","brightness","white","black","gray","luma","chroma"].map((value) => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>}
      <label><span>Territory</span><select value={recipe.territory} onChange={(event) => update(recipe.id, { territory: event.target.value as UltimateSortRecipe["territory"] })}>{ultimateTerritoryOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      {["white","black","gray","colorful","midtones"].includes(recipe.territory) && <label title="White/Black: distance from that color. Gray: allowed color difference, including black and white. Colorful: minimum color difference. Midtones: width around middle luma."><span>{recipe.territory === "colorful" ? "Color minimum" : recipe.territory === "midtones" ? "Midtone width" : "Color tolerance"}</span><input type="number" min="0" max="100" step="1" value={Math.round(recipe.toneTolerance * 100)} onChange={(event) => update(recipe.id, { toneTolerance: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })}/></label>}
      {hasGate && <label><span>{recipe.territory === "edges" ? "Edge strength" : "Light cutoff"}</span><input type="number" min="0" max={recipe.territory === "edges" ? 1200 : 255} step="1" value={recipe.gate} onChange={(event) => update(recipe.id, { gate: Math.max(0, Math.min(1200, Number(event.target.value))) })}/></label>}
      {isGlimmer && <label><span>Star size</span><input type="number" min="0.5" max="12" step="0.5" value={recipe.glimmerSize} onChange={(event) => update(recipe.id, { glimmerSize: Math.max(0.5, Math.min(12, Number(event.target.value))) })}/></label>}
      {isGlimmer && <label><span>Noise drift</span><input type="number" min="0" max="1" step="0.05" value={recipe.glimmerSpeed} title="0 holds the noise still; low values drift slowly." onChange={(event) => update(recipe.id, { glimmerSpeed: Math.max(0, Math.min(1, Number(event.target.value))) })}/></label>}
      {!isGlimmer && recipe.action !== "wand" && <label><span>Resolution</span><select value={recipe.resolution} onChange={(event) => update(recipe.id, { resolution: event.target.value as UltimateSortRecipe["resolution"] })}><option value="pixel">Pixel</option><option value="fixed">Fixed blocks</option><option value="wake">Resolution Wake</option></select></label>}
      {!isGlimmer && recipe.action !== "wand" && recipe.resolution !== "pixel" && <label><span>Smallest block</span><input type="number" min="1" max="32" step="1" value={recipe.minBlock} onChange={(event) => { const value = Math.max(1, Math.min(32, Math.round(Number(event.target.value)))); update(recipe.id, { minBlock: value, maxBlock: Math.max(value, recipe.maxBlock) }); }}/></label>}
      {!isGlimmer && recipe.action !== "wand" && recipe.resolution !== "pixel" && <label><span>Largest block</span><input type="number" min="1" max="32" step="1" value={recipe.maxBlock} onChange={(event) => update(recipe.id, { maxBlock: Math.max(recipe.minBlock, Math.min(32, Math.round(Number(event.target.value)))) })}/></label>}
      {!isGlimmer && recipe.action !== "sort" && <label><span>Outline speed</span><input type="number" min="0" max="12" step="1" value={recipe.selectionSpeed} title="Whole outline cycles per seamless loop. 0 freezes it." onChange={(event) => update(recipe.id, { selectionSpeed: Math.max(0, Math.min(12, Math.round(Number(event.target.value)))) })}/></label>}
      {isBody && <section className="ultimate-body-controls">
        <div className="ultimate-body-identity"><span className="eyebrow">BODY WAND</span><small>Pick one visual body, then decide which side the method enters.</small></div>
        <div className="ultimate-body-fields">
          <div className="ultimate-body-pick"><button className={pickingRecipeId === recipe.id ? "selected" : ""} onClick={() => onPickBody(recipe.id)}>{pickingRecipeId === recipe.id ? "Cancel picking" : "Pick body"}</button><label title="The exact color held at the picked point"><input type="color" value={colorToHex(recipe.bodySampleColor)} onChange={(event) => update(recipe.id, { bodySampleColor: hexToColor(event.target.value) })}/><span>{colorToHex(recipe.bodySampleColor)}</span></label><small>{Math.round(recipe.bodySampleX * 100)}% across · {Math.round(recipe.bodySampleY * 100)}% down</small></div>
          <label title="How far the picked color may extend into related colors"><span>Body Reach</span><input type="number" min="1" max="100" step="1" value={Math.round(recipe.bodyColorReach * 100)} onChange={(event) => update(recipe.id, { bodyColorReach: Math.max(0.01, Math.min(1, Number(event.target.value) / 100)) })}/></label>
          <label title="From leaking through boundaries to obeying the body's contours"><span>Contour Loyalty</span><input type="number" min="0" max="100" step="1" value={Math.round(recipe.bodyEdgeLoyalty * 100)} onChange={(event) => update(recipe.id, { bodyEdgeLoyalty: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })}/></label>
          <label title="Negative values cut into the body; positive values let it overgrow"><span>Grow / Shrink</span><input type="number" min="-8" max="18" step="1" value={Math.round(recipe.bodyExpansion * 100)} onChange={(event) => update(recipe.id, { bodyExpansion: Math.max(-0.08, Math.min(0.18, Number(event.target.value) / 100)) })}/></label>
          <label><span>Side</span><select value={recipe.bodyInvert ? "outside" : "inside"} onChange={(event) => update(recipe.id, { bodyInvert: event.target.value === "outside" })}><option value="inside">Inside body</option><option value="outside">Outside body</option></select></label>
          <label><span>Memory</span><select value={recipe.bodyTargetMemory} onChange={(event) => update(recipe.id, { bodyTargetMemory: event.target.value as UltimateSortRecipe["bodyTargetMemory"] })}><option value="source">Source</option><option value="current">Current Image</option><option value="held">Held Ghost</option></select></label>
        </div>
      </section>}
      </div>
      <div className="ultimate-recipe-actions"><button onClick={() => update(recipe.id, { enabled: !recipe.enabled })}>{recipe.enabled ? "Bypass" : "Enable"}</button><button onClick={() => onChange({ ...stack, recipes: [...stack.recipes.slice(0, index + 1), { ...recipe, id: defaultUltimateSortRecipe().id }, ...stack.recipes.slice(index + 1)] })}>Duplicate</button><button disabled={stack.recipes.length === 1} onClick={() => onChange({ ...stack, recipes: stack.recipes.filter((item) => item.id !== recipe.id) })}>Delete</button></div>
    </article>; })}</div>
  </section>;
}

function LanguageBodyEditor({ body, inverted, onChange, onToggleInvert, playing, onTogglePlay, traceColor }: { body: LanguageBody; inverted: boolean; onChange: (body: LanguageBody) => void; onToggleInvert: () => void; playing:boolean; onTogglePlay:()=>void; traceColor:number }) {
  const update = (patch: Partial<LanguageBody>) => onChange({ ...body, ...patch });
  const infantryDove = () => onChange({
    ...body,
    phrases: ["ADVANCE", "HOLD THE LINE", "NO RETREAT", "OBEY", "RETURN FIRE"],
    phraseA: "ADVANCE",
    phraseB: "HOLD THE LINE",
    flow: "organic",
    body: "infantry-dove",
    phraseLogic: "alternate",
    composition: "field",
    loopMode: "metamorphose",
  });
  const phrase = (value: string) => Array.from(value.replace(/\s/gu, " ")).filter((glyph) => { const code = glyph.codePointAt(0) ?? 0; return code >= 32 && (code < 127 || code > 159); }).slice(0, 280).join("");
  const phrases = body.phrases?.length ? body.phrases : [body.phraseA, body.phraseB].filter(Boolean);
  const updatePhrases = (next: string[]) => onChange({ ...body, phrases: next, phraseA: next[0] || "Almost", phraseB: next[1] || next[0] || "Human" });
  return <section className="language-body-editor">
    <div className="language-phrases">
      <div className="language-phrase-list">{phrases.map((voice, index) => <label key={index}><span>Text {String(index + 1).padStart(2, "0")} · {Array.from(voice).length}/280</span><span className="language-phrase-input"><textarea rows={2} value={voice} maxLength={280} placeholder="Type a word, phrase, or full sentence" onChange={(event) => updatePhrases(phrases.map((item, itemIndex) => itemIndex === index ? phrase(event.target.value) : item))}/><button disabled={phrases.length === 1} title="Remove this text" onClick={() => updatePhrases(phrases.filter((_, itemIndex) => itemIndex !== index))}>−</button></span></label>)}</div>

      <div className="language-phrase-actions"><button onClick={()=>update({body:"knot",knot:body.knot ?? {...knotDefaults,knotMaterial:4},inkMode:body.inkMode === "source" ? "chosen" : body.inkMode})}><strong>Knot / Happiness</strong><small>Let these voices fill or follow a knot</small></button><button disabled={phrases.length >= 64} onClick={() => updatePhrases([...phrases, ""])}><strong>+ Add text</strong><small>{phrases.length} voice{phrases.length === 1 ? "" : "s"} in this body</small></button><button onClick={() => onChange(defaultLanguageBody())}><strong>Almost Human</strong><small>Restore the original two voices</small></button><button onClick={infantryDove}><strong>Infantry / Dove</strong><small>Keep the commands as the body changes allegiance</small></button></div>
    </div>
      {body.body === "knot" && <KnotControls values={body.knot ?? knotDefaults} onChange={knot=>update({knot})} playing={playing} onTogglePlay={onTogglePlay}/>}
    <div className="language-grammar">
      {body.body !== "knot" && <label><span>Flow</span><select value={body.flow} onChange={(event) => update({ flow: event.target.value as LanguageBody["flow"] })}><option value="organic">Organic tissue</option><option value="rings">Concentric rings</option><option value="rays">Radial rays</option><option value="grid">Disturbed grid</option></select></label>}
      <label><span>Body</span><select value={body.body} onChange={(event) => update({ body: event.target.value as LanguageBody["body"], ...(event.target.value === "knot" ? {knot:body.knot ?? {...knotDefaults,knotMaterial:4},inkMode:body.inkMode === "source" ? "chosen" : body.inkMode} : {}) })}><option value="knot">Knot / Double Happiness</option><option value="figure">Almost Human figure</option><option value="infantry-dove">Infantry becoming dove</option><option value="image">Image mass</option><option value="where">Where territory</option></select></label>
      {body.body !== "knot" && <label><span>Phrase Logic</span><select value={body.phraseLogic} onChange={(event) => update({ phraseLogic: event.target.value as LanguageBody["phraseLogic"] })}><option value="alternate">Cycle phrases</option><option value="noise">Noise field</option><option value="near-far">Distance bands</option><option value="image">Image signal</option></select></label>}
      <label><span>Canvas</span><select value={body.composition} onChange={(event) => update({ composition: event.target.value as LanguageBody["composition"] })}><option value="field">Pure field</option><option value="inlay">Inlay image</option></select></label>
      <label><span>Ink</span><select value={body.inkMode} onChange={(event) => update({ inkMode: event.target.value as LanguageBody["inkMode"] })}><option value="chosen">One ink</option><option value="palette">Temple palette</option>{body.body !== "knot" && <option value="source">Sample source</option>}</select></label>
      {body.body !== "knot" && <label><span>Loop</span><select value={body.loopMode} onChange={(event) => update({ loopMode: event.target.value as LanguageBody["loopMode"] })}><option value="held">Held</option><option value="orbit">Orbit</option><option value="breathe">Breathe</option><option value="collapse">Collapse</option><option value="metamorphose">Metamorphose</option></select></label>}
      {body.body === "knot" && <label className="language-color"><span>Trace color</span><input aria-label="Trace color" type="color" value={colorToHex((body.knot?.knotTraceColor ?? -1)>=0?body.knot!.knotTraceColor:traceColor)} onChange={event=>update({knot:{...(body.knot ?? knotDefaults),knotTraceColor:hexToColor(event.target.value)}})}/></label>}
      <label className="language-color"><span>Ink color</span><input type="color" value={colorToHex(body.inkColor)} onChange={(event) => update({ inkColor: hexToColor(event.target.value) })}/></label>
      <label className="language-color"><span>Ground</span><input type="color" value={colorToHex(body.groundColor)} onChange={(event) => update({ groundColor: hexToColor(event.target.value) })}/></label>
      {body.body === "image" && <button className={inverted ? "language-invert selected" : "language-invert"} onClick={onToggleInvert}>{inverted ? "Image mass inverted" : "Invert image mass"}</button>}
    </div>
  </section>;
}

function WizprocessEditor({ process, onChange }: { process: Wizprocess; onChange: (process: Wizprocess) => void }) {
  const update = (patch: Partial<Wizprocess>) => onChange({ ...process, ...patch });
  const anatomy = [
    { key: "mass", label: "Mass", note: "Broad light and large forms" },
    { key: "structure", label: "Structure", note: "Contours and construction" },
    { key: "grain", label: "Grain", note: "Fine edges and texture" },
  ] as const;
  return <section className="wizprocess-editor">
    <div className="wizprocess-heading"><div><span className="eyebrow">SCALE ANATOMY</span><small>Choose which sizes of image memory survive reconstruction.</small></div></div>
    <div className="wizprocess-mutation">
      <div><span>NEW STRUCTURE</span><button className={process.newStructureScale ? "selected" : ""} onClick={() => update({ newStructureScale: !process.newStructureScale })}>Scale anatomy</button><button className={process.newStructureWhere ? "selected" : ""} onClick={() => update({ newStructureWhere: !process.newStructureWhere })}>Where</button></div>
      <div><span>NEW COLORS</span><button className={process.newColors ? "selected" : ""} onClick={() => update({ newColors: !process.newColors })}>Color behavior</button></div>
    </div>
    <div className="wizprocess-anatomy">{anatomy.map(({ key, label, note }) => <label key={key}><span>{label}<small>{note}</small></span><input type="number" min="0" max="100" step="1" value={Math.round(process[key] * 100)} onChange={(event) => update({ [key]: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })}/><i>%</i></label>)}</div>
    <div className="wizprocess-grid">
      <label><span>Compression<small>Higher values discard more signal precision.</small></span><input type="number" min="1" max="1200" step="1" value={process.compression} onChange={(event) => update({ compression: Math.max(1, Math.min(1200, Number(event.target.value))) })}/></label>
      <label><span>Expansion<small>How strongly the reconstructed signal returns.</small></span><input type="number" min="0" max="1200" step="1" value={process.expansion} onChange={(event) => update({ expansion: Math.max(0, Math.min(1200, Number(event.target.value))) })}/></label>
      <label><span>Color Space<small>{wizColorSpaceOptions.find(({ value }) => value === process.colorSpace)?.note}</small></span><select value={process.colorSpace} onChange={(event) => update({ colorSpace: event.target.value as Wizprocess["colorSpace"] })}>{wizColorSpaceOptions.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>Channels<small>Keep planes apart or let them contaminate.</small></span><select value={process.channels} onChange={(event) => update({ channels: event.target.value as Wizprocess["channels"] })}><option value="separate">Separate</option><option value="together">Together</option></select></label>
      <label><span>Channel Phase<small>Recover the old slipped-channel accident.</small></span><input type="number" min="-48" max="48" step="1" disabled={process.channels === "separate"} value={process.channelPhase} onChange={(event) => update({ channelPhase: Math.max(-48, Math.min(48, Math.round(Number(event.target.value)))) })}/></label>
      <label><span>Signal Path<small>Changes the physical grain of the damage.</small></span><select value={process.path} onChange={(event) => update({ path: event.target.value as Wizprocess["path"] })}><option value="rows">Rows</option><option value="columns">Columns</option><option value="snake">Snake</option><option value="clustered">Clustered</option></select></label>
      <label><span>Reconstruction<small>How escaped color values re-enter the image.</small></span><select value={process.reconstruction} onChange={(event) => update({ reconstruction: event.target.value as Wizprocess["reconstruction"] })}><option value="fold">Fold</option><option value="wrap">Wrap</option><option value="clip">Clip</option><option value="reflect">Reflect</option></select></label>
      <label><span>Wiz Tide<small>Closed-loop breathing through image scales.</small></span><div className="wizprocess-tide"><input type="number" min="0" max="100" step="1" value={Math.round(process.tide * 100)} onChange={(event) => update({ tide: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })}/><i>%</i></div></label>
    </div>
  </section>;
}

function constrainRatioPair(width: number, height: number, maximumEdge = 6000) {
  let nextWidth = width, nextHeight = height;
  const minimum = Math.min(nextWidth, nextHeight);
  if (minimum < 320) { const scale = 320 / minimum; nextWidth *= scale; nextHeight *= scale; }
  const largest = Math.max(nextWidth, nextHeight);
  if (largest > maximumEdge) { const scale = maximumEdge / largest; nextWidth *= scale; nextHeight *= scale; }
  return { width: clampOutputDimension(nextWidth, maximumEdge), height: clampOutputDimension(nextHeight, maximumEdge) };
}

function dimensionsAtRatio(ratio: number, longestEdge: number) {
  const safeRatio = Math.max(1 / 12, Math.min(12, ratio));
  const width = safeRatio >= 1 ? longestEdge : longestEdge * safeRatio;
  const height = safeRatio >= 1 ? longestEdge / safeRatio : longestEdge;
  return constrainRatioPair(width, height);
}

const paletteParameters: { key: keyof Omit<PaletteSettings, "structure">; definition: EffectParameter }[] = [
  { key: "hue", definition: { id: "palette-hue", label: "Hue anchor", description: "The degree where this color system begins.", min: 0, max: 359, step: 1, default: 22, suggestions: [0, 30, 60, 120, 180, 240, 300].map((value, index) => ({ value, label: ["red", "orange", "yellow", "green", "cyan", "blue", "magenta"][index] })) } },
  { key: "hueSpread", definition: { id: "palette-spread", label: "Hue spread", description: "How far permitted hues can separate.", min: 0, max: 180, step: 1, default: 34, suggestions: [0, 10, 25, 45, 90, 135, 180].map((value, index) => ({ value, label: ["single", "tight", "near", "open", "wide", "tense", "opposed"][index] })) } },
  { key: "saturation", definition: { id: "palette-saturation", label: "Saturation", description: "The overall intensity of the color family.", min: 0, max: 100, step: 1, default: 28, suggestions: [0, 8, 20, 35, 55, 75, 100].map((value, index) => ({ value, label: ["none", "dust", "soft", "held", "present", "strong", "pure"][index] })) } },
  { key: "saturationRange", definition: { id: "palette-saturation-range", label: "Saturation range", description: "How differently the four roles carry intensity.", min: 0, max: 100, step: 1, default: 18, suggestions: [0, 8, 18, 30, 45, 65, 90].map((value, index) => ({ value, label: ["even", "slight", "held", "varied", "broad", "wild", "split"][index] })) } },
  { key: "lightnessFloor", definition: { id: "palette-light-floor", label: "Light floor", description: "The darkest permitted tonal territory.", min: 0, max: 100, step: 1, default: 8, suggestions: [0, 5, 12, 22, 35, 50, 70].map((value, index) => ({ value, label: ["black", "near", "deep", "dark", "middle", "lifted", "pale"][index] })) } },
  { key: "lightnessCeiling", definition: { id: "palette-light-ceiling", label: "Light ceiling", description: "The brightest permitted tonal territory.", min: 0, max: 100, step: 1, default: 94, suggestions: [25, 40, 55, 70, 82, 94, 100].map((value, index) => ({ value, label: ["low", "dim", "middle", "open", "light", "paper", "white"][index] })) } },
];

function imageFacts(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The image dimensions could not be read."));
    image.src = dataUrl;
  });
}

async function hydrateSource(source: Pick<SourceImage, "filePath" | "previewDataUrl">, name?: string): Promise<SourceImage> {
  const dimensions = await imageFacts(source.previewDataUrl);
  return { ...source, ...dimensions, name: name ?? sourceName(source.filePath) };
}

async function paletteFromImage(dataUrl: string): Promise<StudioRecipe["palette"]> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The source colors could not be sampled.")); image.src = dataUrl; });
  const canvas = document.createElement("canvas");
  canvas.width = 72; canvas.height = 72;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let offset = 0; offset < pixels.length; offset += 16) {
    if (pixels[offset + 3] < 128) continue;
    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count += 1; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
  }
  const colors = [...bins.values()].map((bin) => {
    const r = Math.round(bin.r / bin.count), g = Math.round(bin.g / bin.count), b = Math.round(bin.b / bin.count);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return { packed: (r << 16) | (g << 8) | b, r, g, b, light: (max + min) / 510, saturation: max === 0 ? 0 : (max - min) / max, score: bin.count * (0.3 + (max - min) / 255) };
  }).sort((a, b) => b.score - a.score);
  const chosen: typeof colors = [];
  for (const color of colors) {
    if (chosen.every((prior) => Math.hypot(color.r - prior.r, color.g - prior.g, color.b - prior.b) > 58)) chosen.push(color);
    if (chosen.length === 4) break;
  }
  while (chosen.length < 4 && colors[chosen.length]) chosen.push(colors[chosen.length]);
  if (!chosen.length) throw new Error("The source did not contain readable color.");
  const vivid = [...chosen].sort((a, b) => b.saturation - a.saturation);
  const darkest = [...chosen].sort((a, b) => a.light - b.light)[0];
  const lightest = [...chosen].sort((a, b) => b.light - a.light)[0];
  return [vivid[0].packed, (vivid[1] ?? vivid[0]).packed, lightest.packed, darkest.packed];
}

function ExactParameterControl({ parameter, value, onCommit }: { parameter: EffectParameter; value: number; onCommit: (value: number) => void }) {
  const precision = parameterPrecision(parameter.step);
  const formatted = parameter.choices ? String(Math.round(value)) : value.toFixed(precision);
  const [draft, setDraft] = useState(formatted);
  const [invalid, setInvalid] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) { setDraft(formatted); setInvalid(false); } }, [editing, formatted]);

  if (parameter.choices) {
    return <label className="exact-parameter choice-parameter"><span><strong>{parameter.label}</strong><small>{parameter.description}</small></span><select value={Math.round(value)} onChange={(event) => onCommit(Number(event.target.value))}>{parameter.choices.map((choice, index) => <option key={choice} value={index}>{index} · {choice}</option>)}</select></label>;
  }

  const accept = (text: string) => {
    setDraft(text);
    const parsed = Number(text);
    const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed >= parameter.min && parsed <= parameter.max;
    setInvalid(!valid);
    if (valid) onCommit(parsed);
  };
  const nudge = (direction: -1 | 1, coarse: boolean, fine: boolean) => {
    const amount = parameter.step * (coarse ? 10 : fine ? 0.1 : 1);
    const next = Math.max(parameter.min, Math.min(parameter.max, value + direction * amount));
    accept(next.toFixed(fine ? Math.min(6, precision + 1) : precision));
  };

  return <div className="exact-parameter" data-invalid={invalid}>
    <div className="parameter-line"><span><strong>{parameter.label}</strong><small>{parameter.description}</small></span><input type="text" aria-label={`${parameter.label} exact value`} inputMode="decimal" value={draft} onFocus={() => setEditing(true)} onChange={(event) => accept(event.target.value)} onBlur={() => { setEditing(false); if (invalid) { setDraft(formatted); setInvalid(false); } }} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); nudge(event.key === "ArrowUp" ? 1 : -1, event.shiftKey, event.altKey); } }}/></div>
    <div className="parameter-orientation"><span>{parameter.min}—{parameter.max}</span><span>{invalid ? "outside safe range" : `step ${parameter.step}`}</span></div>
  </div>;
}

function FormElementActions({ enabled, onBypass, onDelete }: { enabled: boolean; onBypass: () => void; onDelete: () => void }) {
  return <div className="form-element-actions"><button onClick={onBypass}>{enabled ? "Bypass" : "Enable"}</button><button className="remove-effect" onClick={onDelete}>Delete</button></div>;
}

function OutputDimensionInput({ outputKind, label, value, onCommit }: { outputKind: "PNG" | "Loop"; label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { if (!editing) { setDraft(String(value)); setInvalid(false); } }, [editing, value]);
  const accept = (text: string) => {
    setDraft(text);
    const parsed = Number(text);
    const maximum = outputKind === "PNG" ? 6000 : 3840;
    const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed >= 320 && parsed <= maximum;
    setInvalid(!valid);
    if (valid) onCommit(Math.round(parsed));
  };
  return <label className="output-dimension" data-invalid={invalid}><span>{label}</span><input type="text" inputMode="numeric" aria-label={`${outputKind} ${label.toLowerCase()}`} value={draft} onFocus={() => setEditing(true)} onChange={(event) => accept(event.target.value)} onBlur={() => { setEditing(false); if (invalid) { setDraft(String(value)); setInvalid(false); } }} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); accept(String(clampOutputDimension(value + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 100 : 1), outputKind === "PNG" ? 6000 : 3840))); } }}/></label>;
}

function legacyParameters(recipe: StudioRecipe, definitions: ParameterDefinition[]) {
  const band = recipe.effects.find((effect) => effect.type === "band-rupture");
  const signal = recipe.effects.find((effect) => effect.type === "signal-echo");
  const source: Record<string, number> = {
    rupture: band?.parameters.rupture ?? 0.46,
    channelDrift: signal?.parameters.separation ?? 13,
    scarDensity: band?.parameters.scar ?? 0.27,
    erosion: 0.32,
    memory: band?.parameters.memory ?? 0.64,
    pulse: 0.42,
    primaryColor: recipe.palette[0], secondaryColor: recipe.palette[1], accentColor: recipe.palette[2],
  };
  return Object.fromEntries(definitions.map((definition) => [definition.id, source[definition.id] ?? definition.default]));
}

function mutateFromCommand(recipe: StudioRecipe, envelope: StudioCommand): StudioRecipe {
  const command = envelope.command;
  switch (command.type) {
    case "replace-recipe": return { ...normalizeRecipe(command.recipe as StudioRecipe), revision: recipe.revision + 1 };
    case "patch-recipe": {
      const patch = command.patch as Partial<StudioRecipe>;
      const koneForm = patch.koneForm
        ? { ...recipe.koneForm, ...patch.koneForm, parameters: { ...recipe.koneForm.parameters, ...patch.koneForm.parameters } }
        : recipe.koneForm;
      return normalizeRecipe({ ...recipe, ...patch, koneForm, revision: recipe.revision + 1 });
    }
    case "randomize-structure": return nextStructure(recipe);
    case "randomize-colors": return nextColors(recipe);
    case "new-iteration": return nextIteration(recipe);
    case "set-form-family": {
      const family = command.family as FormFamily;
      if (!formFamilies.some((entry) => entry.id === family)) return recipe;
      return normalizeRecipe({
        ...recipe,
        baseMode: "kone",
        processStage: "form",
        revision: recipe.revision + 1,
        koneForm: { ...recipe.koneForm, family, parameters: { ...recipe.koneForm.parameters, ...formFamilyStartingValues[family] } },
      });
    }
    case "set-form-param": {
      const parameter = String(command.parameter);
      const definition = koneFormDefinition.parameters.find((entry) => entry.id === parameter);
      const value = Number(command.value);
      if (!definition || !Number.isFinite(value)) return recipe;
      return normalizeRecipe({ ...recipe, baseMode: "kone", processStage: "form", revision: recipe.revision + 1, koneForm: { ...recipe.koneForm, parameters: { ...recipe.koneForm.parameters, [parameter]: value } } });
    }
    case "set-palette": {
      const palette = command.palette as number[];
      if (!Array.isArray(palette) || palette.length !== 4) return recipe;
      return { ...recipe, revision: recipe.revision + 1, paletteSettings: { ...recipe.paletteSettings, structure: "custom" }, palette: palette.map((value) => Math.max(0, Math.min(0xffffff, Math.round(value)))) as StudioRecipe["palette"] };
    }
    case "add-effect": {
      const type = command.effectType as EffectType;
      if (!effectDefinitions.some((definition) => definition.type === type)) return recipe;
      const effect = createEffect(type, recipe.seed + recipe.effects.length);
      return { ...recipe, revision: recipe.revision + 1, effects: [...recipe.effects, { ...effect, parameters: { ...effect.parameters, ...((command.parameters as Record<string, number>) ?? {}) } }] };
    }
    case "remove-effect": return { ...recipe, revision: recipe.revision + 1, effects: recipe.effects.filter((effect) => effect.id !== command.effectId) };
    case "toggle-effect": return { ...recipe, revision: recipe.revision + 1, effects: recipe.effects.map((effect) => effect.id === command.effectId ? { ...effect, enabled: command.enabled === undefined ? !effect.enabled : Boolean(command.enabled) } : effect) };
    case "move-effect": {
      const from = recipe.effects.findIndex((effect) => effect.id === command.effectId);
      const to = Math.max(0, Math.min(recipe.effects.length - 1, Number(command.index)));
      if (from < 0 || !Number.isFinite(to)) return recipe;
      const effects = [...recipe.effects];
      const [moved] = effects.splice(from, 1);
      effects.splice(to, 0, moved);
      return { ...recipe, revision: recipe.revision + 1, effects };
    }
    case "set-effect-param": return {
      ...recipe, revision: recipe.revision + 1,
      effects: recipe.effects.map((effect) => effect.id === command.effectId ? { ...effect, parameters: { ...effect.parameters, [String(command.parameter)]: Number(command.value) } } : effect),
    };
    default: return recipe;
  }
}

function App() {
  const [snapshot, setSnapshot] = useState<TempleSnapshot | null>(null);
  const [recipe, setRecipe] = useState<StudioRecipe>(defaultRecipe);
  const [figureDragTarget,setFigureDragTarget]=useState("figure");
  const figurePicker=useRef<HTMLInputElement>(null);
  const moveFigure=(target:string,x:number,y:number)=>setRecipe(current=>({...current,revision:current.revision+1,koneForm:{...current.koneForm,parameters:{...current.koneForm.parameters,...(target==="groupPick"?{groupSelected:x,groupException:1}:{[target+"X"]:Math.round(x*1000)/1000,[target+"Y"]:Math.round(y*1000)/1000})}}}));
  const [selected, setSelected] = useState<OutputRecord | null>(null);
  const [timeMaterialsOpen, setTimeMaterialsOpen] = useState(false);
  const [workspaceTool, setWorkspaceTool] = useState<"time" | null>(null);
  const [scorePlaying, setScorePlaying] = useState(false);
  const [auditionPosition, setAuditionPosition] = useState(0);
  useEffect(() => {
    if (!scorePlaying) return;
    const timer = window.setInterval(() => setAuditionPosition(livePreview.current?.position() ?? 0), 100);
    return () => window.clearInterval(timer);
  }, [scorePlaying]);
  const [busy, setBusy] = useState(false);
  const [renderingKind, setRenderingKind] = useState<"still" | "gif" | "mp4" | null>(null);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("Temple is waking up…");
  const [stateName, setStateName] = useState("");
  const [processRecipes, setProcessRecipes] = useState<ProcessRecipeRecord[]>([]);
  const [processRecipeName, setProcessRecipeName] = useState("");
  const [processRecipeOpen, setProcessRecipeOpen] = useState(false);
  const [codeChanged, setCodeChanged] = useState(false);
  const [sourceImage, setSourceImage] = useState<SourceImage | null>(null);
  const [activeEffectId, setActiveEffectId] = useState("");
  const [lastSazedChange, setLastSazedChange] = useState<{ description: string; before: StudioRecipe } | null>(null);
  const [machinery, setMachinery] = useState<EffectSource | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<StudioMode>("glitch");
  const [showOriginal, setShowOriginal] = useState(false);
  const [targetPreviewEffectId, setTargetPreviewEffectId] = useState<string | null>(null);
  const [targetPickEffectId, setTargetPickEffectId] = useState<string | null>(null);
  const [ultimateTargetPick, setUltimateTargetPick] = useState<{ effectId: string; recipeId: string } | null>(null);
  const [ultimateWhereOpen, setUltimateWhereOpen] = useState(false);
  const [layerDataUrls, setLayerDataUrls] = useState<Record<string, string>>({});
  const [markText, setMarkText] = useState("GLITCH ☻");
  const [markKind, setMarkKind] = useState<"glyph" | "checker" | "stripes" | "dots">("glyph");
  const [markSize, setMarkSize] = useState(72);
  const [markRepeat, setMarkRepeat] = useState(7);
  const [markRotation, setMarkRotation] = useState(-8);
  const [markColor, setMarkColor] = useState("#1f1d1a");
  const [galleryEntries, setGalleryEntries] = useState<CuratedGalleryEntry[]>([]);
  const [galleryFolder, setGalleryFolder] = useState(() => window.localStorage.getItem(GALLERY_FOLDER_STORAGE) ?? "");
  const galleryOutputFolder = `${snapshot?.workspacePath ?? ""}/outputs/gallery`;
  const curatedGalleryFolder = `${snapshot?.workspacePath ?? ""}/curated-gallery`;
  const [gallerySelectionId, setGallerySelectionId] = useState<string | null>(null);
  const [galleryLiveId, setGalleryLiveId] = useState<string | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryDragId, setGalleryDragId] = useState<string | null>(null);
  const [galleryExportOpen, setGalleryExportOpen] = useState(false);
  const [pngSizeOpen, setPngSizeOpen] = useState(false);
  const [loopExportOpen, setLoopExportOpen] = useState(false);
  const [asciiWoundsOpen, setAsciiWoundsOpen] = useState(false);
  const [glitchUpperDepth, setGlitchUpperDepth] = useState(() => {
    const stored = Number(window.localStorage.getItem("glitch-temple:glitch-upper-depth"));
    return Number.isFinite(stored) && stored >= 14 && stored <= 52 ? stored : 30;
  });
  const [studioPreviewWidth, setStudioPreviewWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem("glitch-temple:studio-preview-width"));
    return Number.isFinite(stored) && stored >= 42 && stored <= 70 ? stored : 58;
  });
  const [galleryPreviewWidth, setGalleryPreviewWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem("glitch-temple:gallery-preview-width"));
    return Number.isFinite(stored) && stored >= 36 && stored <= 70 ? stored : 54;
  });
  const [galleryStoryDepth, setGalleryStoryDepth] = useState(() => {
    const stored = Number(window.localStorage.getItem("glitch-temple:gallery-story-depth"));
    return Number.isFinite(stored) && stored >= 18 && stored <= 64 ? stored : 24;
  });
  const livePreview = useRef<LivePreviewHandle>(null);
  const studioGrid = useRef<HTMLDivElement>(null);
  const controlAltar = useRef<HTMLElement>(null);
  const galleryStoryBody = useRef<HTMLDivElement>(null);
  const imagePicker = useRef<HTMLInputElement>(null);
  const formElementStack = useRef<HTMLDivElement>(null);
  const recipeRef = useRef(recipe);
  const handledStudioCommands = useRef(new Set<string>());
  const galleryOrderSaves = useRef<Promise<unknown>>(Promise.resolve());
  recipeRef.current = recipe;

  useEffect(() => {
    window.localStorage.setItem("glitch-temple:studio-preview-width", String(studioPreviewWidth));
  }, [studioPreviewWidth]);

  useEffect(() => {
    window.localStorage.setItem("glitch-temple:gallery-preview-width", String(galleryPreviewWidth));
  }, [galleryPreviewWidth]);

  useEffect(() => {
    window.localStorage.setItem("glitch-temple:gallery-story-depth", String(galleryStoryDepth));
  }, [galleryStoryDepth]);

  useEffect(() => {
    window.localStorage.setItem("glitch-temple:glitch-upper-depth", String(glitchUpperDepth));
  }, [glitchUpperDepth]);

  useEffect(() => {
    if (studioMode !== "form") return;
    if (recipe.baseMode === "kone" && recipe.koneForm.family === "kone" && (recipe.koneForm.parameters.seam ?? 0) === 0) return;
    setRecipe((current) => ({
      ...current,
      revision: current.revision + 1,
      baseMode: "kone",
      processStage: "form",
      koneForm: {
        ...current.koneForm,
        family: "kone",
        parameters: { ...current.koneForm.parameters, seam: 0 },
      },
    }));
    setSelected(null);
    setNotice("KONE is itself again: its second body and botanical growth remain, while the distracting spiral seam is gone.");
  }, [recipe.baseMode, recipe.koneForm.family, recipe.koneForm.parameters, studioMode]);

  useEffect(() => {
    let active = true;
    Promise.all([...recipe.layers.map(layer=>({id:layer.id,filePath:layer.filePath})),...(recipe.formStack?formParts(recipe).filter(part=>part.sourceImage&&part.id!==recipe.formSelected).map(part=>({id:`form:${part.id}`,filePath:part.sourceImage!})):[])].map(async (layer) => [layer.id, await invoke<string>("preview_material", { path: layer.filePath })] as const))
      .then((entries) => { if (active) setLayerDataUrls(Object.fromEntries(entries)); })
      .catch((cause) => { if (active) setError(`A layer could not be loaded: ${String(cause)}`); });
    return () => { active = false; };
  }, [recipe.layers,recipe.formStack,recipe.formSelected]);

  useEffect(()=>{if(!recipe.formStack||recipe.sourceImage===sourceImage?.filePath)return;let active=true;if(!recipe.sourceImage){setSourceImage(null);return;}const path=recipe.sourceImage;setSourceImage(null);invoke<string>("preview_material",{path}).then(previewDataUrl=>hydrateSource({filePath:path,previewDataUrl})).then(source=>{if(active)setSourceImage(source);}).catch(cause=>{if(active)setError(String(cause));});return ()=>{active=false;};},[recipe.formSelected,recipe.sourceImage]);

  useEffect(() => {
    if (renderingKind === null || renderingKind === "still") {
      setRenderProgress(null);
      return;
    }
    let active = true;
    const update = async () => {
      try {
        const progress = await invoke<RenderProgress>("render_progress");
        if (active) setRenderProgress(progress);
      } catch {
        // The audition remains useful even if a progress sample arrives between render stages.
      }
    };
    update();
    const timer = window.setInterval(update, 300);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [renderingKind]);

  const refresh = useCallback(async (preserveControls = true) => {
    try {
      const next = await invoke<TempleSnapshot>("get_snapshot");
      setSnapshot(next);
      setGalleryFolder((current) => current || `${next.workspacePath}/outputs/gallery`);
      if (!preserveControls) {
        const restored = { ...normalizeRecipe(next.current.recipe), sourceImage: next.current.sourceImage };
        setRecipe(restored);
        setStudioMode(restored.processStage === "form" ? "form" : "glitch");
        setActiveEffectId(restored.effects[0]?.id ?? "");
        if (next.current.sourceImage && next.sourcePreviewDataUrl) {
          setSourceImage({ filePath: next.current.sourceImage, previewDataUrl: next.sourcePreviewDataUrl, name: sourceName(next.current.sourceImage) });
          hydrateSource({ filePath: next.current.sourceImage, previewDataUrl: next.sourcePreviewDataUrl })
            .then(setSourceImage)
            .catch(() => undefined);
        } else setSourceImage(null);
        setSelected(next.outputs[0] ?? null);
      }
      setError(next.latestError ?? null);
      if (!preserveControls) setNotice(next.outputs.length ? "The shared studio is live." : "Ready for the first preserved accident.");
    } catch (cause) {
      setError(String(cause));
      setNotice("The Temple could not establish the current truth.");
    }
  }, []);

  const refreshGallery = useCallback(async (folder = galleryFolder, resetSelection = false) => {
    setGalleryLoading(true);
    try {
      const entries = await invoke<CuratedGalleryEntry[]>("get_curated_gallery", { galleryPath: folder });
      setGalleryEntries(entries);
      setGallerySelectionId((current) => !resetSelection && current && entries.some((entry) => entry.id === current) ? current : entries[0]?.id ?? null);
      setGalleryLiveId((current) => !resetSelection && current && entries.some((entry) => entry.id === current) ? current : null);
      setError(null);
      setNotice(entries.length ? `${entries.length} images are waiting in this Gallery folder.` : "This Gallery folder has no supported images yet.");
    } catch (cause) {
      setError(String(cause));
      setNotice("The artwork remains safe, but the Gallery could not read this folder.");
    } finally {
      setGalleryLoading(false);
    }
  }, [galleryFolder]);

  const refreshProcessRecipes = useCallback(async () => {
    try {
      setProcessRecipes(await invoke<ProcessRecipeRecord[]>("list_process_recipes"));
    } catch (cause) {
      setError(`The artwork remains safe, but the process recipe library could not be read: ${String(cause)}`);
    }
  }, []);

  const applyPendingCommand = useCallback(async () => {
    const envelope = await invoke<StudioCommand | null>("get_pending_studio_command");
    if (!envelope) return;
    if (handledStudioCommands.current.has(envelope.id)) return;
    handledStudioCommands.current.add(envelope.id);
    const current = recipeRef.current;
    if (envelope.preconditionRevision !== undefined && envelope.preconditionRevision !== current.revision) {
      const message = `The studio moved after Sazed last looked (expected revision ${envelope.preconditionRevision}, now ${current.revision}).`;
      await invoke("acknowledge_studio_command", { commandId: envelope.id, applied: false, message, beforeRevision: current.revision, afterRevision: current.revision });
      setNotice(`${message} Nothing was overwritten.`);
      return;
    }
    const next = mutateFromCommand(current, envelope);
    if (next === current) {
      await invoke("acknowledge_studio_command", { commandId: envelope.id, applied: false, message: "Unknown or invalid studio command.", beforeRevision: current.revision, afterRevision: current.revision });
      return;
    }
    setLastSazedChange({ description: envelope.description ?? "the live recipe", before: current });
    setRecipe(next);
    if (next.processStage === "form" && current.processStage !== "form") setStudioMode("form");
    setActiveEffectId(next.effects.find((effect) => !current.effects.some((prior) => prior.id === effect.id))?.id ?? activeEffectId);
    setSelected(null);
    const description = envelope.description ?? "the live recipe";
    setNotice(`Sazed changed ${description}. It is live now.`);
    await invoke("acknowledge_studio_command", { commandId: envelope.id, applied: true, message: `Applied at revision ${next.revision}.`, beforeRevision: current.revision, afterRevision: next.revision });
  }, [activeEffectId]);

  useEffect(() => {
    refresh(false).then(applyPendingCommand);
    void refreshProcessRecipes();
    const sketchListener = listen<string>("sketch-changed", (event) => {
      if (event.payload.includes(".pde") || event.payload.includes("temple.json")) {
        setCodeChanged(true);
        setNotice("Sazed changed the render engine. The next master render will use it.");
      }
    });
    const bridgeListener = listen<string>("studio-command", () => { window.setTimeout(applyPendingCommand, 80); });
    // The bridge is an optional local control surface, not an app dependency.
    // The file watcher handles live commands; this slow pass only reconciles a
    // command if Windows happened to miss a filesystem notification.
    const bridgePoll = window.setInterval(() => { void applyPendingCommand().catch(() => undefined); }, 5000);
    return () => { window.clearInterval(bridgePoll); sketchListener.then((dispose) => dispose()); bridgeListener.then((dispose) => dispose()); };
  }, []);

  const parameters = useMemo(() => snapshot ? legacyParameters(recipe, snapshot.manifest.parameters) : {}, [recipe, snapshot]);
  useEffect(() => {
    if (!snapshot) return;
    const handle = window.setTimeout(() => {
      invoke("persist_live_draft", { request: { seed: recipe.seed, parameters, recipe, sourceImage: sourceImage?.filePath } }).catch((cause) => setError(String(cause)));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [parameters, recipe, snapshot, sourceImage]);

  const activeOutput = selected;
  const renderingLoop = renderingKind === "gif" || renderingKind === "mp4";
  const figureUsesSource = (recipe.koneForm.parameters.symbolField??0)<2 && (recipe.koneForm.parameters.figureActive ?? 0) >= .5 && (recipe.koneForm.parameters.figureSource ?? 0) === 1;
  const effectiveSourcePath = recipe.baseMode === "kone" && !figureUsesSource ? undefined : sourceImage?.filePath;
  const isLiveDraft = !activeOutput || recipe.revision !== (activeOutput.recipe?.revision ?? -1) || effectiveSourcePath !== activeOutput.sourceImage;
  const activeGallery = galleryEntries.find((entry) => entry.id === gallerySelectionId) ?? galleryEntries[0];
  const activeGalleryIndex = activeGallery ? galleryEntries.findIndex((entry) => entry.id === activeGallery.id) : -1;
  const galleryStoryMode = galleryStoryDepth < 34 ? "strip" : galleryStoryDepth < 54 ? "table" : "board";
  const galleryRecipeIsLive = studioMode !== "gallery" || Boolean(activeGallery && galleryLiveId === activeGallery.id);
  const canRender = Boolean(snapshot) && !busy && galleryRecipeIsLive;
  const modeEffects = recipe.effects.filter((effect) =>
    studioMode === "form"
      ? false
      : studioMode === "language"
      ? effect.type === "language-body"
      : studioMode === "text"
      ? effect.type === "ascii-field"
      : studioMode === "zhuyin"
        ? effect.type === "zhuyin-weave"
        : studioMode === "petscii"
          ? effect.type === "petscii-study"
          : isGlitchEffect(effect)
  );
  const activeEffect = modeEffects.find((effect) => effect.id === activeEffectId) ?? modeEffects[0];
  const ultimateEffect = recipe.effects.find((effect) => effect.type === "ultimate-sort" && effect.ultimateSort);
  const activeDefinition = activeEffect ? definitionFor(activeEffect.type) : null;
  const visibleActiveParameters = activeEffect && activeDefinition ? activeDefinition.parameters.filter((parameter) => {
    if (activeEffect.type === "language-body" && activeEffect.languageBody?.body === "knot") return false;
    if (activeEffect.type === "ascii-field") {
      if (!asciiFundamentalParameters.has(parameter.id)) return false;
      if (activeEffect.characterField?.glyphLogic === "repeat" && ["imageLoyalty", "invertDensity"].includes(parameter.id)) return false;
      if (parameter.id === "bodyGate" && activeEffect.characterField?.placement === "whole") return false;
    }
    if (activeEffect.type === "zhuyin-weave" && parameter.id === "bodyGate" && activeEffect.zhuyinField?.placement === "whole") return false;
    if (activeEffect.type === "petscii-study" && parameter.id === "rulePressure" && activeEffect.tileField?.tileLogic === "image") return false;
    return true;
  }) : [];
  const renderWidth = recipe.renderWidth;
  const renderHeight = recipe.renderHeight;
  const gifWidth = recipe.gifWidth;
  const gifHeight = recipe.gifHeight;

  function changeOutputDimension(kind: "png" | "gif", axis: "width" | "height", value: number) {
    setRecipe((current) => {
      const currentWidth = kind === "png" ? current.renderWidth : current.gifWidth;
      const currentHeight = kind === "png" ? current.renderHeight : current.gifHeight;
      const locked = kind === "png" ? current.aspectLocked : current.gifAspectLocked;
      const maximum = kind === "png" ? 6000 : 3840;
      let width = axis === "width" ? clampOutputDimension(value, maximum) : currentWidth;
      let height = axis === "height" ? clampOutputDimension(value, maximum) : currentHeight;
      if (locked) {
        const ratio = currentWidth / currentHeight;
        if (axis === "width") height = width / ratio;
        else width = height * ratio;
        const constrained = constrainRatioPair(width, height, maximum);
        width = constrained.width; height = constrained.height;
      }
      return kind === "png"
        ? { ...current, revision: current.revision + 1, renderWidth: width, renderHeight: height, renderSize: Math.max(width, height) }
        : { ...current, revision: current.revision + 1, gifWidth: width, gifHeight: height };
    });
    setSelected(null);
  }

  function chooseOutputRatio(kind: "png" | "gif", value: string) {
    const currentWidth = kind === "png" ? renderWidth : gifWidth;
    const currentHeight = kind === "png" ? renderHeight : gifHeight;
    const ratio = value === "source" && sourceImage?.width && sourceImage?.height
      ? sourceImage.width / sourceImage.height
      : value === "square" ? 1
      : value === "four-five" ? 4 / 5
      : value === "three-two" ? 3 / 2
      : value === "sixteen-nine" ? 16 / 9
      : currentWidth / currentHeight;
    const dimensions = dimensionsAtRatio(ratio, Math.max(currentWidth, currentHeight));
    setRecipe((current) => kind === "png"
      ? { ...current, revision: current.revision + 1, renderWidth: dimensions.width, renderHeight: dimensions.height, renderSize: Math.max(dimensions.width, dimensions.height), aspectLocked: true }
      : { ...current, revision: current.revision + 1, gifWidth: dimensions.width, gifHeight: dimensions.height, gifAspectLocked: true });
    setSelected(null);
  }

  async function render(kind: "still" | "gif" | "mp4") {
    if (!snapshot) return;
    const isLoop = kind !== "still";
    const format = kind.toUpperCase();
    setBusy(true); setRenderingKind(kind); setRenderProgress(null); setError(null); setCodeChanged(false);
    setNotice(isLoop ? `Building the ${format} loop from this exact recipe…` : "Processing this recipe at the chosen size and ratio…");
    try {
      const width = isLoop ? gifWidth : renderWidth;
      const height = isLoop ? gifHeight : renderHeight;
      const outputScope = studioMode === "gallery" ? "gallery" : studioMode === "form" ? "form" : "glitch";
      const outputName = studioMode === "gallery" ? activeGallery?.filePath : undefined;
      const result = await invoke<RenderResult>("render", { request: { seed: recipe.seed, parameters, recipe: !isLoop && scorePlaying ? { ...recipe, scorePosition: livePreview.current?.position() ?? 0 } : recipe, kind, width, height, sourceImage: effectiveSourcePath, outputScope, outputName } });
      setSelected(result.output);
      setNotice(isLoop ? `${format} loop preserved with its complete recipe.` : "Processing PNG saved. The preview has not moved.");
      await refresh(true);
    } catch (cause) { setError(String(cause)); setNotice("The render failed honestly. The live recipe and earlier work remain safe."); }
    finally { setBusy(false); setRenderingKind(null); }
  }

  async function applyCurrentRecipe() {
    if (!snapshot) return;
    setBusy(true); setRenderingKind("still"); setError(null);
    try {
      const result = await invoke<{ layerId: string }>("render_apply", { recipe });
      setNotice(`Current recipe rendered at canvas size and added as an editable Afterimage layer (${result.layerId.slice(0, 8)}).`);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); setRenderingKind(null); }
  }

  async function preserveHeldPreview() {
    if (!snapshot) return;
    const capture = livePreview.current?.capture();
    if (!capture) {
      setError("The held preview was not available to save. Nothing was changed.");
      return;
    }
    setBusy(true); setRenderingKind(null); setRenderProgress(null); setError(null);
    setNotice("Saving the exact held preview without recomposing it…");
    try {
      const held = await uploadImage(await (await fetch(capture.dataUrl)).blob(), "held-preview.png");
      await invoke<RenderResult>("preserve_preview", { request: {
        seed: recipe.seed,
        parameters,
        recipe: scorePlaying || recipe.scorePosition !== undefined || recipe.timeScore?.length ? { ...recipe, scorePosition: livePreview.current?.position() ?? recipe.scorePosition } : recipe,
        filePath: held.filePath, width: capture.width, height: capture.height,
        sourceImage: effectiveSourcePath,
        outputScope: studioMode === "form" ? "form" : "glitch",
      } });
      setNotice(`Exact preview saved at ${capture.width}×${capture.height}. The held image has not moved.`);
      await refresh(true);
    } catch (cause) {
      setError(String(cause));
      setNotice("The exact preview could not be saved. The held image and earlier work remain safe.");
    } finally {
      setBusy(false);
    }
  }

  function bringAsciiIntoTransmission(effect: EffectInstance) {
    const replacement = createEffect("ascii-field", recipe.seed + recipe.effects.length + 1701);
    const legacy = effect.characterField;
    const characterField: CharacterField = {
      ...defaultCharacterField(),
      bank: legacy?.bank ?? "density",
      glyphs: [...(legacy?.glyphs?.length ? legacy.glyphs : defaultCharacterField().glyphs)],
      composition: legacy?.composition ?? "field",
      glyphLogic: legacy?.glyphLogic === "repeat" ? "repeat" : "hybrid",
      inkMode: legacy?.inkMode ?? "source",
      inkColor: legacy?.inkColor ?? 0xf2eee7,
      groundColor: legacy?.groundColor ?? 0x151319,
    };
    const upgraded: EffectInstance = {
      ...replacement,
      enabled: true,
      where: { ...effect.where },
      characterField,
      parameters: {
        ...replacement.parameters,
        cellSize: effect.parameters.cellSize ?? replacement.parameters.cellSize,
        coverage: effect.parameters.coverage ?? replacement.parameters.coverage,
        imageLoyalty: effect.parameters.imageLoyalty ?? replacement.parameters.imageLoyalty,
        edgeVoice: effect.parameters.edgeVoice ?? replacement.parameters.edgeVoice,
        invertDensity: effect.parameters.invertDensity ?? replacement.parameters.invertDensity,
        bitRot: effect.parameters.instability ?? replacement.parameters.bitRot,
        mutationTide: Math.max(0.08, effect.parameters.instability ?? replacement.parameters.mutationTide),
        dropout: effect.parameters.vacancy ?? replacement.parameters.dropout,
        carriageDrift: effect.parameters.gridDamage ?? replacement.parameters.carriageDrift,
        lineFeedFault: Math.min(1, (effect.parameters.gridDamage ?? 0) * 0.35),
      },
    };
    setRecipe((current) => {
      const at = current.effects.findIndex((candidate) => candidate.id === effect.id);
      const effects = current.effects.map((candidate) => candidate.id === effect.id ? { ...candidate, enabled: false } : candidate);
      effects.splice(Math.max(0, at + 1), 0, upgraded);
      return { ...current, revision: current.revision + 1, effects };
    });
    setActiveEffectId(upgraded.id);
    setNotice("The original ASCII Field is preserved and bypassed. Its new Transmission copy is live.");
  }

  async function captureAsciiText() {
    const capture = livePreview.current?.captureAsciiText();
    if (!capture || !snapshot) {
      setError("The held Transmission grid is not available yet. Nothing was written.");
      return;
    }
    setError(null);
    try {
      const result = await invoke<{ filePath: string }>("capture_ascii_text", { request: {
        ...capture,
        seed: recipe.seed,
        recipe,
        sourceImage: effectiveSourcePath,
      } });
      setNotice(`Printable ASCII captured beside this source: ${result.filePath}`);
    } catch (cause) {
      setError(String(cause));
      setNotice("Text capture failed honestly. The held image and earlier work remain safe.");
    }
  }

  async function recover(record: OutputRecord) {
    const normalized = normalizeRecipe(record.recipe ?? { ...defaultRecipe(), seed: record.seed });
    const restored = { ...normalized, sourceImage: record.sourceImage ?? normalized.sourceImage };
    setSelected(record); setRecipe(restored); setStudioMode(restored.processStage === "form" ? "form" : "glitch"); setActiveEffectId(restored.effects[0]?.id ?? "");
    if (record.sourceImage) {
      try {
        const previewDataUrl = record.sourcePreviewDataUrl ?? await invoke<string>("preview_material", { path: record.sourceImage });
        setSourceImage({ filePath: record.sourceImage, previewDataUrl, name: sourceName(record.sourceImage) });
        void hydrateSource({ filePath: record.sourceImage, previewDataUrl }).then(setSourceImage).catch(() => undefined);
      } catch {
        setSourceImage(null);
        setError("The preserved recipe was recovered, but its earlier source image is no longer available at the recorded path.");
      }
    } else setSourceImage(null);
    setNotice(`Recovered ${record.id}. Its complete chain is live again; change anything to branch it.`);
  }

  function alterEffect(effectId: string, change: (effect: EffectInstance) => EffectInstance) {
    setRecipe((current) => ({ ...current, revision: current.revision + 1, effects: current.effects.map((effect) => effect.id === effectId ? change(effect) : effect) }));
    setSelected(null);
  }

  function holdTargetSample(sample: TargetSample) {
    if (ultimateTargetPick) {
      const { effectId, recipeId } = ultimateTargetPick;
      alterEffect(effectId, (effect) => ({
        ...effect,
        ultimateSort: effect.ultimateSort ? {
          ...effect.ultimateSort,
          recipes: effect.ultimateSort.recipes.map((item) => item.id === recipeId ? { ...item, bodySampleColor: sample.color, bodySampleX: sample.x, bodySampleY: sample.y } : item),
        } : effect.ultimateSort,
      }));
      setUltimateTargetPick(null);
      setNotice(`Body held at ${colorToHex(sample.color)}. This wand row can now enter it, surround it, or remember it as a ghost.`);
      return;
    }
    const effectId = targetPickEffectId;
    if (!effectId) return;
    alterEffect(effectId, (effect) => ({
      ...effect,
      where: { ...effect.where, sampleColor: sample.color, sampleX: sample.x, sampleY: sample.y },
      ...(isRegionProcess(effect.type) && effect.parameters.regionPending ? {enabled:true,parameters:{...effect.parameters,regionPending:0}} : {}),
    }));
    setTargetPickEffectId(null);
    if(isRegionProcess(recipe.effects.find(e=>e.id===effectId)?.type))setTargetPreviewEffectId(effectId);
    setNotice(isRegionProcess(recipe.effects.find(e=>e.id===effectId)?.type) ? "Selected area is white; protected area is black. Adjust Color tolerance, then Hide selection or Play." : `Target held at ${colorToHex(sample.color)}. This process can now follow its color kin or connected body.`);
  }

  function addEffect(type: EffectType) {
    const effect = createEffect(type, recipe.seed + recipe.effects.length * 41);
    setRecipe((current) => ({ ...current, revision: current.revision + 1, effects: [...current.effects, effect] }));
    setActiveEffectId(effect.id); setSelected(null); setNotice(`${definitionFor(type).name} joined the chain. Order now matters.`);
  }

  async function preserveProcessRecipe(scope: ProcessRecipeRecord["scope"]) {
    const name = processRecipeName.trim();
    if (!name) {
      setError("Give this process recipe a short name first.");
      return;
    }
    if (scope === "ultimate-sort-mix" && !ultimateEffect?.ultimateSort) {
      setError("Add or select an Ultimate Sort process before saving a method mix.");
      return;
    }
    const payload = scope === "ultimate-sort-mix"
      ? { ultimateSort: ultimateEffect!.ultimateSort, loopFps: recipe.loopFps }
      : { effects: recipe.effects.filter(isGlitchEffect).map(({ materialId: _materialId, ...effect }) => effect), loopFps: recipe.loopFps };
    try {
      const saved = await invoke<ProcessRecipeRecord>("save_process_recipe", { name, scope, payload });
      setProcessRecipeName("");
      await refreshProcessRecipes();
      setNotice(`${scope === "ultimate-sort-mix" ? "Ultimate Sort mix" : "Glitch Steps"} “${saved.name}” saved as reusable process material.`);
    } catch (cause) {
      setError(String(cause));
    }
  }

  function applyProcessRecipe(saved: ProcessRecipeRecord) {
    const savedFps = Number(saved.payload.loopFps);
    if (saved.scope === "ultimate-sort-mix") {
      if (!saved.payload.ultimateSort) {
        setError(`The saved mix “${saved.name}” has no Ultimate Sort methods.`);
        return;
      }
      const existingId = ultimateEffect?.id;
      const added = existingId ? null : createEffect("ultimate-sort", recipe.seed + recipe.effects.length * 41);
      const selectedId = existingId ?? added!.id;
      setRecipe((current) => {
        if (existingId) return {
          ...current,
          revision: current.revision + 1,
          loopFps: Number.isFinite(savedFps) ? savedFps : current.loopFps,
          effects: current.effects.map((effect) => effect.id === selectedId ? { ...effect, ultimateSort: structuredClone(saved.payload.ultimateSort!) } : effect),
        };
        return {
          ...current,
          revision: current.revision + 1,
          processStage: "chain",
          loopFps: Number.isFinite(savedFps) ? savedFps : current.loopFps,
          effects: [...current.effects, { ...added!, ultimateSort: structuredClone(saved.payload.ultimateSort!) }],
        };
      });
      setActiveEffectId(selectedId);
    } else {
      if (!saved.payload.effects?.length) {
        setError(`The saved Steps recipe “${saved.name}” has no processes.`);
        return;
      }
      const savedEffects = structuredClone(saved.payload.effects).map(({ materialId: _materialId, ...effect }) => effect);
      setRecipe((current) => {
        const retained = current.effects.filter((effect) => !isGlitchEffect(effect));
        const normalizedEffects = normalizeRecipe({ ...current, effects: savedEffects }).effects.filter(isGlitchEffect);
        return {
          ...current,
          revision: current.revision + 1,
          processStage: "chain",
          loopFps: Number.isFinite(savedFps) ? savedFps : current.loopFps,
          effects: [...normalizedEffects, ...retained],
        };
      });
      setActiveEffectId(savedEffects[0]?.id ?? "");
    }
    setStudioMode("glitch");
    setSelected(null);
    setProcessRecipeOpen(false);
    setUltimateTargetPick(null);
    setTargetPickEffectId(null);
    setTargetPreviewEffectId(null);
    setNotice(`${saved.scope === "ultimate-sort-mix" ? "Ultimate Sort mix" : "Glitch Steps"} “${saved.name}” is live on this image. The source and artwork settings stayed in place.`);
  }

  function enterStudioMode(mode: StudioMode) {
    setStudioMode(mode);
    if (mode === "gallery") {
      setGalleryLiveId(null);
      setGalleryExportOpen(false);
      void refreshGallery();
      return;
    }
    if (mode === "form") {
      setRecipe((current) => ({
        ...current,
        revision: current.revision + 1,
        baseMode: "kone",
        processStage: "form",
        outputFamily: undefined,
        koneForm: {
          ...current.koneForm,
          family: "kone",
          parameters: { ...current.koneForm.parameters, seam: 0 },
        },
      }));
      setActiveEffectId("");
      setSelected(null);
      setNotice("KONE is forming on the canvas. Its folded body is the material; Glitch can act on it afterward.");
      return;
    }
    setRecipe((current) => current.processStage === "chain" && current.outputFamily ? current : { ...current, revision: current.revision + 1, processStage: "chain", outputFamily: current.processStage === "form" ? newPassFamilyId() : current.outputFamily ?? newPassFamilyId() });
    const type = focusedEffectType(mode);
    if (!type) return;
    const existing = recipe.effects.find((effect) => effect.type === type);
    if (existing) {
      setActiveEffectId(existing.id);
      return;
    }
    const effect = createEffect(type, recipe.seed + recipe.effects.length * 41);
    if (effect.characterField) effect.characterField.placement = recipe.baseMode === "kone" ? "body" : "whole";
    if (effect.zhuyinField) {
      effect.zhuyinField.spatialLogic = "call-response";
      effect.zhuyinField.placement = recipe.baseMode === "kone" ? "body" : "whole";
    }
    setRecipe((current) => ({ ...current, revision: current.revision + 1, effects: [...current.effects, effect] }));
    setActiveEffectId(effect.id);
    setSelected(null);
    setNotice(`${definitionFor(type).name} is live. The mode begins directly on the canvas.`);
  }

  function openRouteEffect(effect: EffectInstance) {
    setStudioMode(roomForEffectType(effect.type));
    setActiveEffectId(effect.id);
    setSelected(null);
  }

  function openRouteSource() {
    if (recipe.baseMode !== "kone") return;
    setStudioMode("form");
    setRecipe((current) => ({ ...current, revision: current.revision + 1, processStage: "form" }));
    setActiveEffectId("");
    setSelected(null);
  }

  function reopenGalleryEntry(entry: CuratedGalleryEntry, continueInGlitch = false) {
    if (!entry.output) {
      setError("This curated image has no matching Glitch Temple recipe metadata. It remains viewable and untouched.");
      return;
    }
    recover(entry.output);
    setGalleryLiveId(entry.id);
    setStudioMode(continueInGlitch ? (entry.output.recipe?.processStage === "form" ? "form" : "glitch") : "gallery");
    setNotice(continueInGlitch
      ? "The chosen discovery is open in the studio. Change anything to branch it."
      : "This chosen recipe is live for PNG, GIF, and MP4 export. The gallery copy remains untouched.");
  }

  async function useGalleryFolder(folder: string) {
    setGalleryFolder(folder);
    window.localStorage.setItem(GALLERY_FOLDER_STORAGE, folder);
    setGalleryExportOpen(false);
    setGalleryLiveId(null);
    await refreshGallery(folder, true);
  }

  async function chooseGalleryFolder() {
    try {
      const chosen = await chooseDirectory({
        directory: true,
        multiple: false,
        defaultPath: galleryFolder,
        title: "Choose a Gallery folder",
      });
      if (typeof chosen === "string") await useGalleryFolder(chosen);
    } catch (cause) {
      setError(String(cause));
      setNotice("The folder chooser could not open. Nothing in the Gallery moved.");
    }
  }

  function commitGalleryOrder(next: CuratedGalleryEntry[]) {
    setGalleryEntries(next);
    const order = next.map((entry) => entry.id);
    galleryOrderSaves.current = galleryOrderSaves.current
      .catch(() => undefined)
      .then(() => invoke<string[]>("save_curated_gallery_order", { order, galleryPath: galleryFolder }))
      .catch((cause) => {
        setError(String(cause));
        setNotice("The screen order changed here, but could not be preserved for the next opening.");
      });
  }

  function placeGalleryEntry(movingId: string, beforeId: string) {
    if (movingId === beforeId) return;
    const movingIndex = galleryEntries.findIndex((entry) => entry.id === movingId);
    const beforeIndex = galleryEntries.findIndex((entry) => entry.id === beforeId);
    if (movingIndex < 0 || beforeIndex < 0) return;
    const next = [...galleryEntries];
    const [moving] = next.splice(movingIndex, 1);
    const destination = next.findIndex((entry) => entry.id === beforeId);
    next.splice(destination < 0 ? next.length : destination, 0, moving);
    commitGalleryOrder(next);
    setNotice("The screen order changed. The artwork files remain untouched.");
  }

  function moveActiveGallery(direction: -1 | 1) {
    if (!activeGallery || activeGalleryIndex < 0) return;
    const destination = activeGalleryIndex + direction;
    if (destination < 0 || destination >= galleryEntries.length) return;
    const next = [...galleryEntries];
    [next[activeGalleryIndex], next[destination]] = [next[destination], next[activeGalleryIndex]];
    commitGalleryOrder(next);
    setNotice(`This screen moved ${direction < 0 ? "earlier" : "later"} in the visual narrative.`);
  }

  function setGalleryWidthFromPointer(clientX: number) {
    const bounds = studioGrid.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const unclamped = ((clientX - bounds.left) / bounds.width) * 100;
    const bounded = Math.max(36, Math.min(70, unclamped));
    const magnetic = [38, 54, 68].find((position) => Math.abs(position - bounded) <= 1.8);
    setGalleryPreviewWidth(Math.round((magnetic ?? bounded) * 10) / 10);
  }

  function setStudioWidthFromPointer(clientX: number) {
    const bounds = studioGrid.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const unclamped = ((clientX - bounds.left) / bounds.width) * 100;
    const bounded = Math.max(42, Math.min(70, unclamped));
    const magnetic = [46, 58, 68].find((position) => Math.abs(position - bounded) <= 1.8);
    setStudioPreviewWidth(Math.round((magnetic ?? bounded) * 10) / 10);
  }

  function beginStudioResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setStudioWidthFromPointer(event.clientX);
    document.body.classList.add("resizing-studio");
    const move = (next: PointerEvent) => setStudioWidthFromPointer(next.clientX);
    const finish = () => {
      document.body.classList.remove("resizing-studio");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function setGlitchUpperDepthFromPointer(clientY: number) {
    const bounds = controlAltar.current?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;
    const unclamped = ((clientY - bounds.top) / bounds.height) * 100;
    const bounded = Math.max(14, Math.min(52, unclamped));
    const magnetic = [18, 30, 44].find((position) => Math.abs(position - bounded) <= 1.8);
    setGlitchUpperDepth(Math.round((magnetic ?? bounded) * 10) / 10);
  }

  function beginGlitchDepthResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setGlitchUpperDepthFromPointer(event.clientY);
    document.body.classList.add("resizing-glitch-depth");
    const move = (next: PointerEvent) => setGlitchUpperDepthFromPointer(next.clientY);
    const finish = () => {
      document.body.classList.remove("resizing-glitch-depth");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function beginGalleryResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setGalleryWidthFromPointer(event.clientX);
    document.body.classList.add("resizing-gallery");
    const move = (next: PointerEvent) => setGalleryWidthFromPointer(next.clientX);
    const finish = () => {
      document.body.classList.remove("resizing-gallery");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function setGalleryStoryDepthFromPointer(clientY: number) {
    const bounds = galleryStoryBody.current?.getBoundingClientRect();
    if (!bounds || bounds.height <= 0) return;
    const unclamped = ((clientY - bounds.top) / bounds.height) * 100;
    const bounded = Math.max(18, Math.min(64, unclamped));
    const magnetic = [24, 43, 62].find((position) => Math.abs(position - bounded) <= 1.8);
    setGalleryStoryDepth(Math.round((magnetic ?? bounded) * 10) / 10);
  }

  function beginGalleryStoryResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setGalleryStoryDepthFromPointer(event.clientY);
    document.body.classList.add("resizing-gallery-story");
    const move = (next: PointerEvent) => setGalleryStoryDepthFromPointer(next.clientY);
    const finish = () => {
      document.body.classList.remove("resizing-gallery-story");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function setGalleryPngSize(orientation: "landscape" | "portrait") {
    const width = orientation === "landscape" ? 6000 : 4000;
    const height = orientation === "landscape" ? 4000 : 6000;
    setRecipe((current) => ({ ...current, revision: current.revision + 1, renderWidth: width, renderHeight: height, renderSize: 6000, aspectLocked: true }));
    setSelected(null);
    setNotice(`${width} × ${height} Processing PNG selected. Image reconstruction remains nearest-neighbor.`);
  }

  function newIteration() {
    if (studioMode === "form") {
      setRecipe(nextKoneIteration);
      setSelected(null);
      setNotice((recipe.koneForm.parameters.figureActive??0)>=.5 ? "New iteration, same material and body proportions." : (recipe.koneForm.parameters.knotActive ?? 0) >= .5 ? "New held knot gesture, same controls." : "New iteration, same form settings. KONE and its flowers found another gesture.");
      return;
    }
    const type = focusedEffectType(studioMode);
    const existing = type ? recipe.effects.find((effect) => effect.type === type) : undefined;
    const created = type && !existing ? createEffect(type, recipe.seed + recipe.effects.length * 41) : null;
    setRecipe((current) => {
      const next = studioMode === "zhuyin" ? nextZhuyinIteration(current) : nextIteration(current);
      return created ? { ...next, effects: [...current.effects, created] } : next;
    });
    if (created) setActiveEffectId(created.id);
    setSelected(null);
    const mutationMode = existing?.zhuyinField?.mutationMode;
    setNotice(studioMode === "zhuyin" && mutationMode && mutationMode !== "held"
      ? `New iteration. The Zhuyin sequence ${mutationMode === "drift" ? "drifted slightly" : "fractured into a stronger mutation"}, and this exact result is held.`
      : "New iteration, same exact settings. The image is holding another moment.");
  }

  function toggleKnotMotion() {
    if(scorePlaying) setRecipe(current=>({...current,scorePosition:livePreview.current?.position() ?? 0,revision:current.revision+1}));
    setScorePlaying(value=>!value);setSelected(null);
  }

  function newForm() {
    setRecipe(nextKoneForm);
    setSelected(null);
    setNotice((recipe.koneForm.parameters.figureActive??0)>=.5 ? "New iteration, same material and body proportions." : (recipe.koneForm.parameters.knotActive ?? 0) >= .5 ? "New knot anatomy, same silhouette and construction." : "New Form mutated the complete anatomy while keeping your KONE and flower choices.");
  }

  function alterKoneFormParameter(parameterId: string, value: number) {
    setRecipe((current) => ({
      ...current,
      baseMode: "kone",
      processStage: "form",
      revision: current.revision + 1,
      koneForm: { ...current.koneForm, parameters: { ...current.koneForm.parameters, [parameterId]: value } },
    }));
    setSelected(null);
  }

  function setKoneFlowerKind(orchidPresence: number) {
    setRecipe((current) => ({
      ...current,
      baseMode: "kone",
      processStage: "form",
      revision: current.revision + 1,
      koneForm: {
        ...current.koneForm,
        parameters: {
          ...current.koneForm.parameters,
          flowerElement: 1,
          flowerPresence: 1,
          budding: (current.koneForm.parameters.orchidSpecies ?? 0) >= 0.5
            ? Math.max(current.koneForm.parameters.budding ?? 0, 0.08)
            : Math.max(current.koneForm.parameters.budding ?? 0, 0.75),
          flowerSize: current.koneForm.parameters.flowerSize ?? 0.65,
          orchidPresence,
          seam: 0,
          shellPresence: 1,
        },
      },
    }));
    setSelected(null);
    const orchidSpecies = recipe.koneForm.parameters.orchidSpecies ?? 0;
    const orchidName = orchidSpecies >= 1.5 ? "Spiral Stem" : orchidSpecies >= 0.5 ? "Pouch" : "Cattleya";
    setNotice(orchidPresence === 0 ? "Four-petal flowers selected." : orchidPresence === 1 ? `${orchidName} orchids selected.` : `Four-petal flowers and ${orchidName} orchids will grow together.`);
  }

  function setBloomSites(bloomSites: number) {
    setRecipe((current) => ({
      ...current,
      baseMode: "kone",
      processStage: "form",
      revision: current.revision + 1,
      koneForm: {
        ...current.koneForm,
        parameters: {
          ...current.koneForm.parameters,
          koneElement: bloomSites > 0 ? 1 : current.koneForm.parameters.koneElement,
          shellPresence: bloomSites > 0 ? 1 : current.koneForm.parameters.shellPresence,
          flowerElement: 1,
          flowerPresence: 1,
          growthElement: 1,
          growthPresence: 1,
          budding: Math.max(current.koneForm.parameters.budding ?? 0, 0.35),
          bloomSites,
          graftDepth: bloomSites > 0 ? Math.max(current.koneForm.parameters.graftDepth ?? 0, 0.72) : 0,
        },
      },
    }));
    setSelected(null);
    setNotice(bloomSites === 1
      ? "Wound Bloom: flowers now seek the ribs KONE has lost. Graft Depth controls how completely they enter the wound."
      : bloomSites === 2
        ? "Rib Ends: flowers now grow from KONE's folded termini."
        : "Orbit restored: flowers and KONE can separate again.");
  }

  function setOrchidSpecies(orchidSpecies: number) {
    setRecipe((current) => ({
      ...current,
      baseMode: "kone",
      processStage: "form",
      revision: current.revision + 1,
      koneForm: {
        ...current.koneForm,
        parameters: {
          ...current.koneForm.parameters,
          flowerElement: 1,
          flowerPresence: 1,
          budding: orchidSpecies >= 0.5 ? 0.08 : Math.max(current.koneForm.parameters.budding ?? 0, 0.75),
          flowerSize: orchidSpecies >= 1.5
            ? Math.max(0.55, Math.min(current.koneForm.parameters.flowerSize ?? 0.65, 0.8))
            : orchidSpecies >= 0.5
              ? Math.min(current.koneForm.parameters.flowerSize ?? 0.65, 0.45)
              : (current.koneForm.parameters.flowerSize ?? 0.65),
          orchidPresence: Math.max(current.koneForm.parameters.orchidPresence ?? 0, 1),
          orchidSpecies,
          seam: 0,
        },
      },
    }));
    setSelected(null);
    setNotice(orchidSpecies >= 1.5
      ? "Spiral Stem entered the Orchid Greenhouse: a nearly empty line carries tiny flowers like an interrupted signal."
      : orchidSpecies >= 0.5
        ? "Pouch entered the Orchid Greenhouse: one chamber begins with two quiet leaves. Growth Spread can make a colony."
        : "Cattleya orchid selected.");
  }

  function setKoneBodyCount(twoKones: boolean) {
    setRecipe((current) => ({
      ...current,
      baseMode: "kone",
      processStage: "form",
      revision: current.revision + 1,
      koneForm: {
        ...current.koneForm,
        parameters: {
          ...current.koneForm.parameters,
          molt: twoKones ? Math.max(current.koneForm.parameters.molt ?? 0, 0.35) : 0,
          seam: 0,
          shellPresence: 1,
        },
      },
    }));
    setSelected(null);
    setNotice(twoKones ? "Two KONEs selected. Second KONE controls how strongly the bodies overlap." : "One KONE selected.");
  }

  function toggleOrchidAnatomy(parameterId: string, defaultValue: number) {
    const currentValue = recipe.koneForm.parameters[parameterId] ?? defaultValue;
    alterKoneFormParameter(parameterId, currentValue >= 0.5 ? 0 : 1);
    const part = [...orchidAnatomyOptions, ...pouchAnatomyOptions, ...spiralAnatomyOptions].find((candidate) => candidate.id === parameterId);
    setNotice(`${part?.label ?? "Orchid part"} ${currentValue >= 0.5 ? "off" : "on"}.`);
  }

  function changeFormElement(element: "kone" | "flower" | "growth" | "mouths", action: "bypass" | "delete" | "add") {
    const elementKey = `${element}Element`;
    const presenceKey = element === "kone" ? "shellPresence" : `${element}Presence`;
    setRecipe((current) => {
      const parameters = { ...current.koneForm.parameters };
      if (action === "delete") {
        parameters[elementKey] = 0;
        parameters[presenceKey] = 0;
      } else if (action === "add") {
        parameters[elementKey] = 1;
        parameters[presenceKey] = 1;
        if (element === "flower" && (parameters.budding ?? 0) <= 0.01) parameters.budding = 0.75;
      } else {
        parameters[presenceKey] = (parameters[presenceKey] ?? 1) >= 0.5 ? 0 : 1;
      }
      return {
        ...current,
        baseMode: "kone",
        processStage: "form",
        revision: current.revision + 1,
        koneForm: { ...current.koneForm, parameters: { ...parameters, seam: 0 } },
      };
    });
    setSelected(null);
    const label = element === "kone" ? "KONE body" : element === "flower" ? "Flower body" : element === "mouths" ? "Center Ovals" : "Growth";
    setNotice(action === "delete" ? `${label} removed from the Form stack. Add it back to recover its held settings.` : action === "add" ? `${label} returned with its held settings.` : `${label} bypass toggled.`);
  }

  function moveEffect(effectId: string, movement: -1 | 1) {
    setRecipe((current) => {
      const from = current.effects.findIndex((effect) => effect.id === effectId);
      const to = Math.max(0, Math.min(current.effects.length - 1, from + movement));
      if (from < 0 || from === to) return current;
      const effects = [...current.effects];
      const [moved] = effects.splice(from, 1); effects.splice(to, 0, moved);
      return { ...current, revision: current.revision + 1, effects };
    });
    setSelected(null);
  }

  function revealFormCard(element: "kone" | "flower" | "growth" | "mouths") {
    const selector = element === "kone" ? ".form-element-card:not(.flower-element-card):not(.growth-element-card):not(.mouths-element-card)" : `.${element}-element-card`;
    window.setTimeout(() => formElementStack.current?.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }

  function addLibraryForm(kind:"Kone"|"Knot"|"Figure",label:string) {
    setRecipe(current=>{const form=defaultKoneForm(Math.floor(Math.random()*2000000000));form.parameters={...selectFormKind(form.parameters,kind),formMix:0};return addFormPart(current,form,label);});setSelected(null);
  }
  function chooseFormLibraryItem(item: "kone" | "four-petals" | "cattleya" | "pouch" | "spiral-stem" | "growth" | "mouths") {
    const names={kone:"KONE","four-petals":"Four Petals",cattleya:"Cattleya",pouch:"Pouch","spiral-stem":"Spiral Stem",growth:"Growth",mouths:"Center Ovals"};
    addLibraryForm("Kone",names[item]);
    if (item === "four-petals") setKoneFlowerKind(0);
    else if (item === "cattleya") setOrchidSpecies(0);
    else if (item === "pouch") setOrchidSpecies(1);
    else if (item === "spiral-stem") setOrchidSpecies(2);
    else changeFormElement(item,"add");
    revealFormCard(item==="kone"?"kone":item==="growth"?"growth":item==="mouths"?"mouths":"flower");
  }

  async function readMachinery(type: EffectType) {
    try {
      const source = await invoke<EffectSource>("read_effect_source", { effectType: type });
      setMachinery(source);
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function chooseLibraryEmoji(choices:EmojiChoice[],mix?:boolean) {
    const dataUrl=await makeEmojiAtlas(choices);
    const imported=await uploadImage(await (await fetch(dataUrl)).blob(), "emoji-mix.png");
    const hydrated=await hydrateSource(imported,"Emoji mix");
    setSourceImage(hydrated);
    setRecipe(current=>{
      const old=current.koneForm.emojiSelection??[],parameters:Record<string,number>={...selectFormKind(current.koneForm.parameters,"Figure"),figureSource:1,emojiCount:choices.length,...(mix?{symbolField:1,fieldMix:1}:{})};
      choices.forEach((choice,i)=>{const previous=old.findIndex(entry=>entry.id===choice.id);parameters[`emojiWeight${i}`]=previous<0?1:current.koneForm.parameters[`emojiWeight${previous}`]??1;});
      return {...current,sourceImage:imported.filePath,baseMode:"kone",processStage:"form",revision:current.revision+1,koneForm:{...current.koneForm,emojiSelection:choices,parameters}};
    });
    setSelected(null);setError(null);setNotice(`${choices.length} emoji ready.`);
  }

  async function bringImage(file: File, forFigure = false) {
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) { setError("Choose a PNG, JPEG, or WebP image."); return; }
    if (file.size > 100 * 1024 * 1024) { setError("Choose an image smaller than 100 MB."); return; }
    setNotice("Preserving a safe working copy of the source image…");
    try {
      const imported = await uploadImage(file, file.name);
      const hydrated = await hydrateSource(imported, file.name);
      setSourceImage(hydrated);
      setRecipe((current) => {
        if(forFigure)return {...current,sourceImage:imported.filePath,baseMode:"kone",processStage:"form",revision:current.revision+1,koneForm:{...current.koneForm,emojiSelection:undefined,parameters:{...selectFormKind(current.koneForm.parameters,"Figure"),figureSource:1,emojiCount:0}}};
        const clean = cleanPassRecipe(current, imported.filePath);
        const ratio = (hydrated.width ?? 1) / (hydrated.height ?? 1);
        const dimensions = dimensionsAtRatio(ratio, Math.max(current.renderWidth, current.renderHeight));
        const gifDimensions = dimensionsAtRatio(ratio, Math.max(current.gifWidth, current.gifHeight));
        return { ...clean, renderWidth: dimensions.width, renderHeight: dimensions.height, renderSize: Math.max(dimensions.width, dimensions.height), aspectLocked: true, gifWidth: gifDimensions.width, gifHeight: gifDimensions.height, gifAspectLocked: true };
      });
      setSelected(null); setError(null); setNotice(forFigure ? `${file.name} is ready in Figures / Symbols.` : `${file.name} · ${hydrated.width}×${hydrated.height} begins a clean breaking pass at the same image ratio. The original remains untouched.`);
    } catch (cause) { setError(String(cause)); }
  }

  async function feedBack(retainChain: boolean) {
    const capture = livePreview.current?.capture();
    if (!capture) return;
    setBusy(true); setError(null); setNotice(retainChain ? "Preserving this frame as new material with its chain…" : "Preserving this frame and opening a clean pass…");
    try {
      const held = await uploadImage(await (await fetch(capture.dataUrl)).blob(), "feedback.png");
      const imported = await invoke<Pick<SourceImage, "filePath" | "previewDataUrl">>("feed_preview_as_source", { request: {
        filePath: held.filePath, width: capture.width, height: capture.height, recipe, parentSource: sourceImage?.filePath, retainChain,
      } });
      const hydrated = await hydrateSource(imported, `feedback ${new Date().toLocaleTimeString()}`);
      setSourceImage(hydrated);
      setRecipe((current) => retainChain
        ? { ...current, baseMode: "field", revision: current.revision + 1, seed: Math.floor(Math.random() * 2_000_000_000), iteration: 0, sourceImage: imported.filePath, colorMode: "source" }
        : cleanPassRecipe(current, imported.filePath));
      setSelected(null); setNotice(retainChain ? "Feedback material is live with the chain retained." : "A clean pass is live. The parent remains preserved.");
    } catch (cause) { setError(String(cause)); setNotice("The feedback pass failed; the current image and parent remain unchanged."); }
    finally { setBusy(false); }
  }

  async function useOutputAsSource(record: OutputRecord) {
    if (isLoopOutput(record)) {
      setError("A loop contains many possible source frames. Keep or render a still first so Glitch Temple does not silently choose one for you.");
      return;
    }
    if (!record.filePath || isLoopOutput(record)) {
      setError("This preserved output does not have a reusable PNG image. Reveal it if you want to choose another exported version.");
      return;
    }
    setBusy(true); setError(null); setNotice("Protecting this preserved output as the material for a new clean pass…");
    try {
      const parentRecipe = record.recipe ?? recipe;
      const imported = await invoke<Pick<SourceImage, "filePath" | "previewDataUrl">>("feed_preview_as_source", { request: {
        filePath: record.filePath, width: record.width, height: record.height, recipe: parentRecipe,
        parentSource: record.sourceImage, retainChain: false,
      } });
      const hydrated = await hydrateSource(imported, `preserved ${formatTime(record.createdAt)}`);
      const dimensions = dimensionsAtRatio(record.width / record.height, Math.max(recipe.renderWidth, recipe.renderHeight));
      const gifDimensions = dimensionsAtRatio(record.width / record.height, Math.max(recipe.gifWidth, recipe.gifHeight));
      setSourceImage(hydrated);
      setRecipe((current) => ({
        ...cleanPassRecipe(current, imported.filePath),
        renderWidth: dimensions.width, renderHeight: dimensions.height,
        renderSize: Math.max(dimensions.width, dimensions.height), aspectLocked: true,
        gifWidth: gifDimensions.width, gifHeight: gifDimensions.height, gifAspectLocked: true,
      }));
      setSelected(null);
      setNotice("The preserved output is now protected source material for a clean pass. Its parent remains unchanged.");
    } catch (cause) {
      setError(String(cause));
      setNotice("The preserved output could not begin a new pass. The output and current source remain safe.");
    } finally {
      setBusy(false);
    }
  }

  function addLayer(record: OutputRecord) {
    const layer: StudioLayer = {
      id: `layer-${Date.now().toString(36)}`,
      label: `${record.kind} · ${formatTime(record.createdAt)}`,
      filePath: record.filePath,
      enabled: true,
      opacity: 0.72,
      blendMode: "difference",
      maskMode: "whole",
      maskScale: 48,
      seed: recipe.seed + recipe.layers.length * 7919,
    };
    setRecipe((current) => ({ ...current, revision: current.revision + 1, layers: [...current.layers, layer] }));
    setSelected(null); setNotice(`${layer.label} entered the mixer as Difference.`);
  }

  function alterLayer(layerId: string, change: (layer: StudioLayer) => StudioLayer) {
    setRecipe((current) => ({ ...current, revision: current.revision + 1, layers: current.layers.map((layer) => layer.id === layerId ? change(layer) : layer) }));
    setSelected(null);
  }

  function moveLayer(layerId: string, movement: -1 | 1) {
    setRecipe((current) => {
      const from = current.layers.findIndex((layer) => layer.id === layerId);
      const to = Math.max(0, Math.min(current.layers.length - 1, from + movement));
      if (from < 0 || from === to) return current;
      const layers = [...current.layers]; const [moved] = layers.splice(from, 1); layers.splice(to, 0, moved);
      return { ...current, revision: current.revision + 1, layers };
    });
    setSelected(null);
  }

  async function addMarkLayer() {
    const capture = livePreview.current?.capture();
    if (!capture) return;
    const canvas = document.createElement("canvas");
    canvas.width = capture.width; canvas.height = capture.height;
    const context = canvas.getContext("2d")!;
    const random = (() => { let state = (recipe.seed + recipe.revision * 997) >>> 0; return () => { state = Math.imul(state ^ state >>> 15, 1 | state); return ((state ^ state >>> 14) >>> 0) / 4294967296; }; })();
    context.fillStyle = markColor;
    if (markKind === "glyph") {
      context.font = `800 ${markSize}px "Segoe UI Emoji","Arial Black","Segoe UI",sans-serif`;
      context.textAlign = "center"; context.textBaseline = "middle";
      for (let index = 0; index < markRepeat; index += 1) {
        const x = (index + 0.5) / markRepeat * canvas.width + (random() - 0.5) * markSize;
        const y = (0.18 + random() * 0.64) * canvas.height;
        context.save(); context.translate(x, y); context.rotate((markRotation + (random() - 0.5) * 18) * Math.PI / 180); context.fillText(markText || " ", 0, 0); context.restore();
      }
    } else {
      const unit = Math.max(4, markSize);
      for (let y = 0; y < canvas.height; y += unit) for (let x = 0; x < canvas.width; x += unit) {
        if (markKind === "checker" && (Math.floor(x / unit) + Math.floor(y / unit)) % 2 === 0) context.fillRect(x, y, unit, unit);
        else if (markKind === "stripes" && Math.floor(x / unit) % 2 === 0) context.fillRect(x, y, unit, unit);
        else if (markKind === "dots") { context.beginPath(); context.arc(x + unit / 2, y + unit / 2, unit * 0.28, 0, Math.PI * 2); context.fill(); }
      }
    }
    setBusy(true);
    try {
      const mark = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not preserve the mark material.")), "image/png"));
      const held = await uploadImage(mark, "mark.png");
      const imported = await invoke<Pick<SourceImage, "filePath" | "previewDataUrl">>("feed_preview_as_source", { request: {
        filePath: held.filePath, width: canvas.width, height: canvas.height, recipe, parentSource: sourceImage?.filePath, retainChain: true,
      } });
      const layer: StudioLayer = {
        id: `mark-${Date.now().toString(36)}`, label: markKind === "glyph" ? `“${markText}”` : `${markKind} pattern`,
        filePath: imported.filePath, enabled: true, opacity: 1, blendMode: "normal", maskMode: "whole", maskScale: Math.max(4, markSize), seed: recipe.seed,
      };
      setRecipe((current) => ({ ...current, revision: current.revision + 1, layers: [...current.layers, layer] }));
      setSelected(null); setNotice(`${layer.label} entered as protected mark material.`);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }

  async function choosePaletteStructure(structure: PaletteStructure) {
    if (structure === "source") {
      if (!sourceImage) { setError("Bring an image first, then Glitch Temple can extract its palette."); return; }
      try {
        const palette = await paletteFromImage(sourceImage.previewDataUrl);
        setRecipe((current) => ({ ...current, revision: current.revision + 1, paletteSettings: { ...current.paletteSettings, structure }, palette }));
        setSelected(null); setError(null); setNotice("Four colors were extracted from the protected source copy.");
      } catch (cause) { setError(String(cause)); }
      return;
    }
    setRecipe((current) => applyPaletteSettings(current, { structure }));
    setSelected(null);
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("textarea, [contenteditable='true'], input:not([type]), input[type='text'], input[type='search']")) return;
      if (event.key.toLowerCase() === "o" && !event.repeat) { event.preventDefault(); setShowOriginal(true); }
      if (studioMode === "gallery" && (event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.repeat) {
        event.preventDefault();
        if (galleryEntries.length) {
          const current = Math.max(0, galleryEntries.findIndex((entry) => entry.id === gallerySelectionId));
          const movement = event.key === "ArrowRight" ? 1 : -1;
          const next = (current + movement + galleryEntries.length) % galleryEntries.length;
          setGallerySelectionId(galleryEntries[next].id);
          setGalleryLiveId(null);
        }
      }
      else if ((event.code === "Space" || event.key === " ") && !event.repeat && !busy && studioMode !== "gallery") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void preserveHeldPreview();
      }
      else if (event.key.toLowerCase() === "n" && !event.repeat && !busy && studioMode !== "gallery") { event.preventDefault(); newIteration(); }
      else if (event.key.toLowerCase() === "r" && !event.repeat && !busy) {
        event.preventDefault();
        if (studioMode === "gallery") return;
        if (studioMode === "form") newForm();
        else { setRecipe(nextStructure); setSelected(null); setNotice("New structure, same colors. Space saves a master PNG."); }
      }
      else if (event.key.toLowerCase() === "c" && !event.repeat && !busy && studioMode !== "gallery") { event.preventDefault(); setRecipe(nextColors); setSelected(null); setNotice(studioMode === "form" ? "New colors, same KONE body. Space saves this exact form." : "New colors, same structure. Space saves a master PNG."); }
    };
    const releaseKey = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "o") setShowOriginal(false); };
    window.addEventListener("keydown", handleKey, true); window.addEventListener("keyup", releaseKey);
    return () => { window.removeEventListener("keydown", handleKey, true); window.removeEventListener("keyup", releaseKey); };
  }, [busy, galleryEntries, gallerySelectionId, recipe, sourceImage, snapshot, studioMode]);

  if (!snapshot) return <main className="wake-screen"><div className="wake-mark">GT</div><p>{notice}</p>{error && <pre className="fatal-error">{error}</pre>}</main>;

  const paletteControls = <>
<div className="palette-structure-grid">{paletteStructures.map((structure) => <button key={structure.value} className={recipe.paletteSettings.structure === structure.value ? "selected" : ""} disabled={structure.value === "source" && !sourceImage} onClick={() => choosePaletteStructure(structure.value)}><strong>{structure.label}</strong><small>{structure.description}</small></button>)}</div>
        {(recipe.paletteSettings.structure === "custom" || recipe.paletteSettings.structure === "source")
          ? <div className="palette-direct-note"><strong>{recipe.paletteSettings.structure === "source" ? "Extracted source colors" : "Direct custom colors"}</strong><span>The four swatches remain exact. Choose a geometric structure above to generate them from hue, saturation, and lightness boundaries.</span></div>
          : <div className="palette-parameter-grid">{paletteParameters.map(({ key, definition }) => <ExactParameterControl key={key} parameter={definition} value={recipe.paletteSettings[key]} onCommit={(value) => { setRecipe((current) => applyPaletteSettings(current, { [key]: value })); setSelected(null); }}/>)}</div>}
  </>;

  return (
    <main className={`temple-shell${studioMode === "gallery" ? " gallery-shell" : ""}`} style={{ "--control-panel-start": `${studioPreviewWidth}%` } as CSSProperties}>
      <header className="temple-header">
        <div className="identity"><span className="sigil">◩</span><div><h1>Glitch Temple</h1><p>TAI MEI × SAZED · LIVING INSTRUMENT</p></div></div>
        <div className="header-actions">
          <button className="quiet-button import-button" onClick={() => imagePicker.current?.click()}>Choose material</button>
          <input ref={imagePicker} className="hidden-picker" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) bringImage(file); event.target.value = ""; }}/>
          {studioMode !== "gallery" && <div className="preserve-row"><input aria-label="Name this branch" value={stateName} onChange={(event) => setStateName(event.target.value)} placeholder="Name this branch…"/><button onClick={async () => { try { const saved = await invoke<{name:string}>("save_state", { name: stateName, recipe }); setNotice(`State “${saved.name}” preserved.`); setStateName(""); } catch (cause) { setError(String(cause)); } }}>Preserve state</button></div>}
          <button className="quiet-button" onClick={() => invoke("open_in_explorer", { path: snapshot.workspacePath })}>Open vault</button>
        </div>
      </header>

      <section className="truth-strip" data-alert={Boolean(codeChanged || error)}><span className="truth-light"/><span>{notice}</span><span className="truth-meta">recipe {recipe.revision} · {recipe.baseMode === "kone" ? `${recipe.koneForm.family} ${recipe.koneForm.seed}` : `structure ${recipe.seed} · iteration ${recipe.iteration}`} · color {recipe.colorSeed}</span>{lastSazedChange && <button className="undo-sazed" onClick={() => { setRecipe({ ...lastSazedChange.before, revision: recipe.revision + 1 }); setLastSazedChange(null); setNotice("Sazed's last mutation was undone. Nothing else moved."); }}>Undo Sazed</button>}</section>

      <nav className="studio-modes" aria-label="Glitch Temple modes">
        {primaryStudioModes.map((mode, index) => <button key={mode.id} className={`primary-mode${studioMode === mode.id ? " selected" : ""}`} aria-pressed={studioMode === mode.id} onClick={() => enterStudioMode(mode.id)}>
          <small>0{index + 1}</small><span><strong>{mode.label}</strong></span>
        </button>)}
        <span className="mode-group-label">TEXT &amp; TILES</span>
        {textStudioModes.map((mode) => <button key={mode.id} className={`secondary-mode${studioMode === mode.id ? " selected" : ""}`} aria-pressed={studioMode === mode.id} onClick={() => enterStudioMode(mode.id)}><span><strong>{mode.label}</strong></span></button>)}
      </nav>

      <div ref={studioGrid} className="studio-grid adjustable-split" style={{ gridTemplateColumns: `minmax(0, ${studioMode === "gallery" ? galleryPreviewWidth : studioPreviewWidth}fr) 14px minmax(0, ${100 - (studioMode === "gallery" ? galleryPreviewWidth : studioPreviewWidth)}fr)` }}>
        <section className="image-chamber">
          <div className="image-stage" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) bringImage(file); }}>
            {studioMode === "gallery" && activeGallery
              ? <img className="curated-gallery-image" src={activeGallery.previewDataUrl} alt={`Gallery image ${galleryEntries.indexOf(activeGallery) + 1}`}/>
              : scorePlaying || showOriginal || targetPreviewEffectId || targetPickEffectId || ultimateTargetPick || isLiveDraft || renderingLoop
                ? <LivePreview figureDragTarget={studioMode === "form" ? recipe.formStack?"formPart":(recipe.koneForm.parameters.formMix??0)>=.5?`formMix${selectedFormKind(recipe.koneForm.parameters)}`:(recipe.koneForm.parameters.structureMode??0)>0?"structure":(recipe.koneForm.parameters.figureActive??0)>=.5?figureDragTarget:undefined : undefined} onFigureMove={moveFigure} ref={livePreview} recipe={recipe} sourceDataUrl={sourceImage?.previewDataUrl} layerDataUrls={layerDataUrls} showOriginal={showOriginal} targetPreviewEffectId={targetPreviewEffectId ?? undefined} pickTargetEffectId={ultimateTargetPick?.effectId ?? targetPickEffectId ?? undefined} pickTargetRecipeId={ultimateTargetPick?.recipeId} onTargetPick={holdTargetSample} animate={renderingLoop || scorePlaying}/>
                : activeOutput?.kind === "mp4"
                  ? <video src={convertFileSrc(activeOutput.filePath)} aria-label={`Glitch Temple output ${activeOutput.id}`} autoPlay loop muted playsInline/>
                  : activeOutput?.previewDataUrl
                    ? <img src={activeOutput.previewDataUrl} alt={`Glitch Temple output ${activeOutput.id}`}/>
                    : <LivePreview figureDragTarget={studioMode === "form" ? recipe.formStack?"formPart":(recipe.koneForm.parameters.formMix??0)>=.5?`formMix${selectedFormKind(recipe.koneForm.parameters)}`:(recipe.koneForm.parameters.structureMode??0)>0?"structure":(recipe.koneForm.parameters.figureActive??0)>=.5?figureDragTarget:undefined : undefined} onFigureMove={moveFigure} ref={livePreview} recipe={recipe} sourceDataUrl={sourceImage?.previewDataUrl} layerDataUrls={layerDataUrls} showOriginal={showOriginal} onTargetPick={holdTargetSample} animate={scorePlaying}/>}
            {busy && <div className={`render-veil compact-render-status ${renderingLoop ? "loop-audition" : "still-save-status"}`}><div className="render-glyph"/><div><strong>{renderingLoop ? "Loop audition" : renderingKind === "still" ? "Processing reinterpretation" : "Saving exact preview"}</strong>{renderingLoop && <small>{renderProgress?.encoding ? `${paletteLoopFrames(recipe)} / ${paletteLoopFrames(recipe)} · encoding master ${renderingKind?.toUpperCase()}` : `${renderProgress?.completedFrames ?? 0} / ${renderProgress?.totalFrames || paletteLoopFrames(recipe)} master frames`}</small>}</div>{renderingKind && <button onClick={async () => { await invoke("cancel_render"); setNotice("Stopping the private Temple render…"); }}>Stop render</button>}</div>}
          </div>
          {studioMode !== "gallery" && <div className="preview-transport" role="group" aria-label="Preview playback">
            <button aria-pressed={scorePlaying} disabled={busy} title="Play or pause the current recipe" onClick={() => { setTargetPreviewEffectId(null); setTargetPickEffectId(null); setUltimateTargetPick(null); toggleKnotMotion(); }}>{scorePlaying ? "Pause" : "Play"}</button>
            <span>{scorePlaying ? "Playing loop" : "Paused"} · {(paletteLoopFrames(recipe) / recipe.loopFps).toFixed(2)} s</span>
          </div>}
          {studioMode === "gallery"
            ? <div className="image-caption gallery-caption"><span>GALLERY {activeGallery ? String(galleryEntries.indexOf(activeGallery) + 1).padStart(2, "0") : "—"} / {String(galleryEntries.length).padStart(2, "0")}</span><span>{activeGallery?.output ? galleryLiveId === activeGallery.id ? "complete recipe live" : "complete recipe available" : "image only · recipe unavailable"}</span>{activeGallery && <button onClick={() => invoke("open_in_explorer", { path: activeGallery.filePath })}>Reveal file</button>}</div>
            : <div className="image-caption"><span>{showOriginal ? "UNPROCESSED COMPOSITE · HOLD O" : isLiveDraft ? "HELD SHARED DRAFT" : `${activeOutput?.kind.toUpperCase()} · ${activeOutput?.width}×${activeOutput?.height}`}</span><span>{recipe.baseMode === "kone" ? (recipe.koneForm.parameters.figureActive??0)>=.5 ? "Figures / Symbols" : `${recipe.koneForm.family} form · blank canvas` : sourceImage ? "selected material · protected copy" : "generated field"}{recipe.layers.length ? ` · ${recipe.layers.length} layers` : ""}</span><button onClick={() => setMixerOpen(true)}>Passes & layers</button>{activeOutput && !isLiveDraft && <button className="reuse-output" disabled={activeOutput.kind === "gif"} title={activeOutput.kind === "gif" ? "Keep or render a still before reusing a loop." : "Protect this output and begin a clean pass from it."} onClick={() => useOutputAsSource(activeOutput)}>Use as new source</button>}{activeOutput && <button onClick={() => invoke("open_in_explorer", { path: activeOutput.filePath })}>Reveal file</button>}</div>}
        </section>

        {studioMode === "gallery"
          ? <div className="gallery-divider" role="separator" aria-label="Resize the viewing room and story table" aria-orientation="vertical" aria-valuemin={36} aria-valuemax={70} aria-valuenow={Math.round(galleryPreviewWidth)} tabIndex={0} title="Drag to resize · double-click for Balance" onPointerDown={beginGalleryResize} onDoubleClick={() => setGalleryPreviewWidth(54)} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setGalleryPreviewWidth((current) => Math.max(36, current - 2)); } else if (event.key === "ArrowRight") { event.preventDefault(); setGalleryPreviewWidth((current) => Math.min(70, current + 2)); } else if (event.key === "Home") { event.preventDefault(); setGalleryPreviewWidth(54); } }}><span/></div>
          : <div className="studio-divider" role="separator" aria-label="Resize the artwork preview and controls" aria-orientation="vertical" aria-valuemin={42} aria-valuemax={70} aria-valuenow={Math.round(studioPreviewWidth)} tabIndex={0} title="Drag to resize · double-click for Balance" onPointerDown={beginStudioResize} onDoubleClick={() => setStudioPreviewWidth(58)} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setStudioPreviewWidth((current) => Math.max(42, current - 2)); } else if (event.key === "ArrowRight") { event.preventDefault(); setStudioPreviewWidth((current) => Math.min(70, current + 2)); } else if (event.key === "Home") { event.preventDefault(); setStudioPreviewWidth(58); } }}><span/></div>}

        <aside ref={controlAltar} className="control-altar" data-mode={studioMode} style={{ "--glitch-upper-depth": `${glitchUpperDepth}%` } as CSSProperties}>
          {studioMode === "gallery" ? <section className="gallery-workspace">
            <header className="gallery-heading"><div><span className="eyebrow">GALLERY MODE</span><h2>Visual narrative</h2></div><div><button onClick={() => void chooseGalleryFolder()}>Choose folder</button><button onClick={() => invoke("open_in_explorer", { path: galleryFolder })}>Open</button><button onClick={() => void refreshGallery()} disabled={galleryLoading}>{galleryLoading ? "Reading…" : "Refresh"}</button></div></header>
            <div className="gallery-folder-bar"><div><span className="eyebrow">CURRENT FOLDER</span><strong>{galleryFolder.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? galleryFolder}</strong><small title={galleryFolder}>{galleryFolder}</small></div><div>{galleryFolder.toLowerCase() !== galleryOutputFolder.toLowerCase() && <button onClick={() => void useGalleryFolder(galleryOutputFolder)}>Gallery outputs</button>}{galleryFolder.toLowerCase() !== curatedGalleryFolder.toLowerCase() && <button onClick={() => void useGalleryFolder(curatedGalleryFolder)}>Curated seven</button>}</div></div>
            <div ref={galleryStoryBody} className="gallery-story-body">
              <div className="gallery-sequence" data-depth={galleryStoryMode} style={{ flexBasis: `${galleryStoryDepth}%` }} aria-label={`Gallery story order · ${galleryStoryMode}`}>{galleryEntries.map((entry, index) => <button key={entry.id} draggable className={`${activeGallery?.id === entry.id ? "selected" : ""}${galleryDragId === entry.id ? " dragging" : ""}`} onDragStart={(event) => { setGalleryDragId(entry.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", entry.id); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const movingId = galleryDragId ?? event.dataTransfer.getData("text/plain"); if (movingId) placeGalleryEntry(movingId, entry.id); setGalleryDragId(null); }} onDragEnd={() => setGalleryDragId(null)} onClick={() => { setGallerySelectionId(entry.id); setGalleryLiveId(null); setNotice(`Gallery image ${String(index + 1).padStart(2, "0")} selected. Looking has not changed the live recipe.`); }}><img src={entry.previewDataUrl} alt=""/><span>{String(index + 1).padStart(2, "0")}</span><small>{entry.output ? "recipe" : "image only"}</small></button>)}</div>
              <div className="gallery-story-divider" role="separator" aria-label="Resize the narrative table" aria-orientation="horizontal" aria-valuemin={18} aria-valuemax={64} aria-valuenow={Math.round(galleryStoryDepth)} tabIndex={0} title="Drag for Strip, Table, or Board · double-click for Table" onPointerDown={beginGalleryStoryResize} onDoubleClick={() => setGalleryStoryDepth(43)} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); setGalleryStoryDepth((current) => Math.max(18, current - 2)); } else if (event.key === "ArrowDown") { event.preventDefault(); setGalleryStoryDepth((current) => Math.min(64, current + 2)); } else if (event.key === "Home") { event.preventDefault(); setGalleryStoryDepth(43); } }}><span/><small>{galleryStoryMode}</small></div>
              {activeGallery ? <article className="gallery-return">
                <div><span className="eyebrow">SCREEN {String(galleryEntries.indexOf(activeGallery) + 1).padStart(2, "0")}</span><strong>{activeGallery.output ? `${activeGallery.output.recipe?.effects.filter((effect) => effect.enabled).length ?? 0} processes · seed ${activeGallery.output.seed}` : "Image only · recipe unavailable"}</strong></div>
                <div className="gallery-story-actions"><button onClick={() => moveActiveGallery(-1)} disabled={activeGalleryIndex <= 0}>← Earlier</button><button onClick={() => moveActiveGallery(1)} disabled={activeGalleryIndex < 0 || activeGalleryIndex >= galleryEntries.length - 1}>Later →</button>{activeGallery.output ? <><button className={galleryLiveId === activeGallery.id ? "selected" : ""} onClick={() => reopenGalleryEntry(activeGallery)}>{galleryLiveId === activeGallery.id ? "Recipe open" : "Open recipe"}</button><button onClick={() => reopenGalleryEntry(activeGallery, true)}>Continue in Glitch</button>{galleryLiveId === activeGallery.id && <button className={galleryExportOpen ? "selected" : ""} onClick={() => setGalleryExportOpen((open) => !open)}>{galleryExportOpen ? "Close export" : "Export"}</button>}</> : <span className="gallery-missing">View only</span>}</div>
              </article> : <div className="gallery-empty">No PNG, JPG, WebP, or GIF images are in this folder yet.</div>}
              <small className="gallery-key-note">Drag screens to compose · vertical seam resizes the rooms · lower seam opens Strip, Table, or Board.</small>
            </div>
          </section> : <>
          {studioMode === "glitch" && <section className="glitch-material-toolbar" aria-label="Source and color controls">
            <section className="source-tool"><strong className="eyebrow">SOURCE</strong>
            {sourceImage && recipe.baseMode !== "kone" ? <>
              <div className="source-fit-choices"><span>Fit</span>{(['contain', 'cover'] as const).map(fit => <button key={fit} aria-pressed={recipe.sourceFit === fit} onClick={() => { setRecipe(current => ({...current, revision: current.revision + 1, sourceFit: fit})); setSelected(null); }}>{fit === 'contain' ? 'Whole image' : 'Fill frame'}</button>)}</div>
              {recipe.sourceFit === 'contain' && <div className="source-background"><div className="color-mode"><button className={recipe.sourceBackground === "keep" ? "selected" : ""} onClick={() => { setRecipe((current) => ({ ...current, revision: current.revision + 1, sourceBackground: "keep" })); setSelected(null); }}>Keep rectangle</button><button className={recipe.sourceBackground === "cutout" ? "selected" : ""} onClick={() => { setRecipe((current) => ({ ...current, revision: current.revision + 1, sourceBackground: "cutout" })); setSelected(null); }}>Cut out background</button></div></div>}

            </> : <p>{recipe.baseMode === 'kone' ? 'Your source is FORM. Image fitting and background controls apply to imported images used as the base.' : 'Choose an image to adjust its fit and background.'}</p>}
          </section>
            <section className="material-logic"><div><span className="eyebrow">COLOR BEHAVIOR</span><div className="color-mode"><button className={recipe.colorMode === "source" ? "selected" : ""} onClick={() => { setRecipe((current) => ({ ...current, revision: current.revision + 1, colorMode: "source" })); setSelected(null); }}>Source color</button><button className={recipe.colorMode === "palette" ? "selected" : ""} onClick={() => { setRecipe((current) => ({ ...current, revision: current.revision + 1, colorMode: "palette" })); setSelected(null); }}>Palette color</button></div></div><label><span>Source presence</span><input type="number" min="0" max="100" step="1" value={Math.round(recipe.sourcePresence * 100)} onChange={(event) => { const value = Math.max(0, Math.min(100, Number(event.target.value))); setRecipe((current) => ({ ...current, revision: current.revision + 1, sourcePresence: value / 100 })); setSelected(null); }}/><small>% · hold O</small></label></section>
            <section className="palette-strip"><button className="palette-heading" onClick={() => setPaletteOpen(true)}><span className="eyebrow">PALETTE</span><small>{paletteStructures.find(item => item.value === recipe.paletteSettings.structure)?.label}</small></button>{recipe.palette.map((color, index) => <label key={index}><input type="color" value={colorToHex(color)} onChange={(event) => { const palette = [...recipe.palette] as StudioRecipe["palette"]; palette[index] = hexToColor(event.target.value); setRecipe((current) => ({ ...current, revision: current.revision + 1, paletteSettings: { ...current.paletteSettings, structure: "custom" }, palette })); setSelected(null); }}/><span>{["Body", "Ghost", "Trace", "Void"][index]}</span></label>)}</section>
            <button className="time-tool-button" aria-expanded={workspaceTool === 'time'} aria-controls="glitch-tool-panel" onClick={() => { setWorkspaceTool(current => current === 'time' ? null : 'time'); setMixerOpen(false); }}>Time &amp; Materials</button>
          </section>}
          {studioMode !== "glitch" && <nav className="workspace-tabs" aria-label="Editing workspace">
            <button aria-pressed={!timeMaterialsOpen} onClick={() => setTimeMaterialsOpen(false)}>Processes</button>
            <button aria-pressed={timeMaterialsOpen} onClick={() => { setTimeMaterialsOpen(true); setMixerOpen(false); setSelected(null); }}>Time &amp; Materials</button>
          </nav>}

          {timeMaterialsOpen && studioMode !== "glitch" ? <TimeMaterials recipe={recipe} auditionPosition={auditionPosition} playing={scorePlaying} onPlay={toggleKnotMotion} onChange={next => { setRecipe({ ...next, revision: recipe.revision + 1 }); setSelected(null); }}/> : <>
          {studioMode !== "glitch" && studioMode !== "form" && <section className="room-route">
            <div className="room-route-track">
              <button className="route-source" disabled={recipe.baseMode !== "kone"} onClick={openRouteSource}><small>SOURCE</small><span>{recipe.baseMode === "kone" ? "FORM" : sourceImage ? "IMAGE" : "FIELD"}</span></button>
              {recipe.effects.map((effect, index) => <button key={effect.id} className={`route-node${effect.id === activeEffect?.id ? " selected" : ""}${effect.enabled ? "" : " bypassed"}`} onClick={() => openRouteEffect(effect)}><small>{String(index + 1).padStart(2, "0")}</small><span>{definitionFor(effect.type).name}</span></button>)}
            </div>
            <button className="add-process-primary" onClick={newIteration}>New iteration <kbd>N</kbd></button>
          </section>}

          {studioMode === "glitch" && <div className="glitch-upper-controls" data-tool={workspaceTool ?? undefined}>
            {workspaceTool ? <div id="glitch-tool-panel" className={`workspace-tool-panel tool-${workspaceTool}`}>
              {workspaceTool === 'time' && <TimeMaterials recipe={recipe} auditionPosition={auditionPosition} playing={scorePlaying} onPlay={toggleKnotMotion} onChange={next => { setRecipe({ ...next, revision: recipe.revision + 1 }); setSelected(null); }}/>}
            </div> : <>

            <section className="effect-browser glitch-process-library">
              <div className="process-browser-title"><div><span className="eyebrow">PROCESS LIBRARY</span></div></div>
              <div>{effectDefinitions.filter((definition) => definition.type !== "ascii-field" && definition.type !== "zhuyin-weave" && definition.type !== "petscii-study").map((definition) => <button key={definition.type} onClick={() => addEffect(definition.type)}><small>{definition.category}</small>{definition.name}</button>)}</div>
            </section>
            <div className="mutation-pair"><button className="iteration-button" onClick={newIteration}>New iteration <kbd>N</kbd></button><button className="structure-button" onClick={() => { setRecipe(nextStructure); setSelected(null); setNotice("New structure, same colors. Space saves a master PNG."); }}>New structure <kbd>R</kbd></button><button className="color-button" onClick={() => { setRecipe(nextColors); setSelected(null); setNotice("New colors, same structure. Space saves a master PNG."); }}>New colors <kbd>C</kbd></button></div>

            </>}
          </div>}

          {studioMode === "form" && <div className="form-controls-scroll">
            <section className="mode-intro form-intro"><span className="eyebrow">FORM</span><span className="form-seed">{(recipe.koneForm.parameters.figureActive??0)>=.5 ? "FIGURE" : (recipe.koneForm.parameters.knotActive ?? 0) >= .5 ? "KNOT" : "KONE"} {recipe.koneForm.seed}</span></section>

            <section className="effect-browser glitch-process-library form-library">
              <div className="process-browser-title"><div><span className="eyebrow">FORM LIBRARY</span></div></div>
              <div>
                <button onClick={()=>addLibraryForm("Figure","Figures")}><small>ADD</small>Figures / Symbols</button>
                <button onClick={()=>addLibraryForm("Knot","Knot")}><small>ADD</small>Knot / Happiness</button>
                <button className={(recipe.koneForm.parameters.koneElement ?? 1) >= .5 && (recipe.koneForm.parameters.shellPresence ?? 1) >= .5 ? "selected" : ""} onClick={() => chooseFormLibraryItem("kone")}><small>BODY</small>KONE</button>
                <button className={(recipe.koneForm.parameters.flowerElement ?? 1) >= .5 && (recipe.koneForm.parameters.flowerPresence ?? 1) >= .5 && (recipe.koneForm.parameters.orchidPresence ?? 0) === 0 ? "selected" : ""} onClick={() => chooseFormLibraryItem("four-petals")}><small>BLOOM</small>Four Petals</button>
                <button className={(recipe.koneForm.parameters.flowerElement ?? 1) >= .5 && (recipe.koneForm.parameters.flowerPresence ?? 1) >= .5 && (recipe.koneForm.parameters.orchidPresence ?? 0) > 0 && (recipe.koneForm.parameters.orchidSpecies ?? 0) < .5 ? "selected" : ""} onClick={() => chooseFormLibraryItem("cattleya")}><small>ORCHID</small>Cattleya</button>
                <button className={(recipe.koneForm.parameters.flowerElement ?? 1) >= .5 && (recipe.koneForm.parameters.flowerPresence ?? 1) >= .5 && (recipe.koneForm.parameters.orchidPresence ?? 0) > 0 && (recipe.koneForm.parameters.orchidSpecies ?? 0) >= .5 && (recipe.koneForm.parameters.orchidSpecies ?? 0) < 1.5 ? "selected" : ""} onClick={() => chooseFormLibraryItem("pouch")}><small>GREENHOUSE</small>Pouch</button>
                <button className={(recipe.koneForm.parameters.flowerElement ?? 1) >= .5 && (recipe.koneForm.parameters.flowerPresence ?? 1) >= .5 && (recipe.koneForm.parameters.orchidPresence ?? 0) > 0 && (recipe.koneForm.parameters.orchidSpecies ?? 0) >= 1.5 ? "selected" : ""} onClick={() => chooseFormLibraryItem("spiral-stem")}><small>GREENHOUSE</small>Spiral Stem</button>
                <button className={(recipe.koneForm.parameters.growthElement ?? 1) >= .5 && (recipe.koneForm.parameters.growthPresence ?? 1) >= .5 ? "selected" : ""} onClick={() => chooseFormLibraryItem("growth")}><small>ECOLOGY</small>Growth</button>
                <button className={(recipe.koneForm.parameters.mouthsElement ?? 1) >= .5 && (recipe.koneForm.parameters.mouthsPresence ?? 1) >= .5 ? "selected" : ""} onClick={() => chooseFormLibraryItem("mouths")}><small>APERTURE</small>Center Ovals</button>
              </div>
            </section>
            <FormStackControls recipe={recipe} onChange={next=>{setRecipe(next);setSelected(null);}}/>
            <div className="form-mutation-pair"><button style={(recipe.koneForm.parameters.figureActive??0)>=.5?{display:"none"}:undefined} className="iteration-button" onClick={newIteration}>New iteration <kbd>N</kbd></button><button className="structure-button" onClick={newForm}>{(recipe.koneForm.parameters.figureActive??0)>=.5?"New iteration":"New Form"} <kbd>R</kbd></button><button className="color-button" onClick={() => { setRecipe(nextColors); setSelected(null); setNotice("New colors, same form. Space saves this exact form."); }}>New colors <kbd>C</kbd></button></div>
            <FormColors recipe={recipe} onOpenPalette={() => setPaletteOpen(true)} onChange={next => { setRecipe(next); setSelected(null); }} />
            <StructureControls placement={<FormPlacementControls recipe={recipe} onChange={next=>{setRecipe(next);setSelected(null);}}/>} values={recipe.koneForm.parameters} onChange={parameters=>setRecipe(current=>({...current,revision:current.revision+1,koneForm:{...current.koneForm,parameters}}))} playing={scorePlaying} onPlay={()=>{if(scorePlaying)setRecipe(current=>({...current,revision:current.revision+1,scorePosition:livePreview.current?.position()??0}));if(!scorePlaying&&(recipe.koneForm.parameters.structureMotion??0)===0)setRecipe(current=>({...current,revision:current.revision+1,koneForm:{...current.koneForm,parameters:{...current.koneForm.parameters,structureMotion:.3}}}));setScorePlaying(v=>!v);setSelected(null);}}/>
            {(recipe.koneForm.parameters.knotActive ?? 0) >= .5 && <KnotControls playing={scorePlaying} onTogglePlay={toggleKnotMotion} values={recipe.koneForm.parameters} text={recipe.koneForm.knotText} onTextChange={knotText=>setRecipe(current=>({...current,revision:current.revision+1,koneForm:{...current.koneForm,knotText}}))} onChange={parameters => setRecipe(current=>({...current,revision:current.revision+1,koneForm:{...current.koneForm,parameters}}))}/>}
            {(recipe.koneForm.parameters.figureActive??0)>=.5 && <><input ref={figurePicker} className="hidden-picker" type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.target.files?.[0];if(file)bringImage(file,true);event.target.value="";}}/><FigureControls position={recipe.scorePosition??(recipe.iteration%recipe.loopFrames)/recipe.loopFrames} onSeek={position=>{setScorePlaying(false);setSelected(null);setRecipe(current=>({...current,revision:current.revision+1,scorePosition:position}));}} selectedSource={sourceImage?.filePath} emojiSelection={recipe.koneForm.emojiSelection} onLibraryPick={chooseLibraryEmoji} onPalette={colors=>{setRecipe(current=>({...current,revision:current.revision+1,palette:colors as StudioRecipe["palette"],paletteSettings:{...current.paletteSettings,structure:"custom"}}));setSelected(null);}} playing={scorePlaying} onPlay={()=>{if(scorePlaying)setRecipe(current=>({...current,scorePosition:livePreview.current?.position()??0,revision:current.revision+1}));setScorePlaying(v=>!v);setSelected(null);}} values={recipe.koneForm.parameters} hasSource={Boolean(sourceImage)} onImport={()=>figurePicker.current?.click()} onDragTarget={setFigureDragTarget} onChange={parameters=>{setRecipe(current=>({...current,revision:current.revision+1,koneForm:{...current.koneForm,parameters}}));setSelected(null);}}/></>}

            <section className="form-workspace" style={(recipe.koneForm.parameters.knotActive ?? 0) >= .5 || (recipe.koneForm.parameters.figureActive??0)>=.5 ? {display:"none"} : undefined}>
              <div className="form-stack-heading"><div><span className="eyebrow">FORM ELEMENTS</span><h2>Separate bodies, one recoverable composition</h2></div>{[(recipe.koneForm.parameters.koneElement ?? 1) < .5 && ["kone", "Add KONE"], (recipe.koneForm.parameters.flowerElement ?? 1) < .5 && ["flower", "Add Flower"], (recipe.koneForm.parameters.growthElement ?? 1) < .5 && ["growth", "Add Growth"], (recipe.koneForm.parameters.mouthsElement ?? 1) < .5 && ["mouths", "Add Center Ovals"]].filter(Boolean).length > 0 && <div className="form-add-elements">{([(recipe.koneForm.parameters.koneElement ?? 1) < .5 && ["kone", "Add KONE"], (recipe.koneForm.parameters.flowerElement ?? 1) < .5 && ["flower", "Add Flower"], (recipe.koneForm.parameters.growthElement ?? 1) < .5 && ["growth", "Add Growth"], (recipe.koneForm.parameters.mouthsElement ?? 1) < .5 && ["mouths", "Add Center Ovals"]].filter(Boolean) as ["kone" | "flower" | "growth" | "mouths", string][]).map(([element, label]) => <button key={element} onClick={() => changeFormElement(element, "add")}>+ {label}</button>)}</div>}</div>
              <div className="form-element-stack" ref={formElementStack}>
                {(recipe.koneForm.parameters.koneElement ?? 1) >= .5 && <article className={`form-element-card${(recipe.koneForm.parameters.shellPresence ?? 1) < .5 ? " bypassed" : ""}`}><header><div><span className="eyebrow">KONE BODY</span><strong>Folded mathematical body</strong></div><FormElementActions enabled={(recipe.koneForm.parameters.shellPresence ?? 1) >= .5} onBypass={() => changeFormElement("kone", "bypass")} onDelete={() => changeFormElement("kone", "delete")}/></header><div className="form-choice-line"><span>BODY COUNT</span><div className="form-generation-mode"><button className={(recipe.koneForm.parameters.molt ?? 0) <= .01 ? "selected" : ""} onClick={() => setKoneBodyCount(false)}>One KONE</button><button className={(recipe.koneForm.parameters.molt ?? 0) > .01 ? "selected" : ""} onClick={() => setKoneBodyCount(true)}>Two KONEs</button></div></div><PrintedFoldControls values={recipe.koneForm.parameters} onChange={patch => { setRecipe(current => ({ ...current, revision: current.revision + 1, koneForm: { ...current.koneForm, parameters: { ...current.koneForm.parameters, ...patch } } })); setSelected(null); }} /><div className="form-groups form-kone-groups">{koneBodyGroups.map((group) => <section key={group.label}><div><span className="eyebrow">{group.label}</span><small>{group.description}</small></div><div>{koneFormDefinition.parameters.filter((parameter) => group.ids.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={recipe.koneForm.parameters[parameter.id] ?? parameter.default} onCommit={(value) => alterKoneFormParameter(parameter.id, value)}/>)}</div></section>)}</div></article>}
                {(recipe.koneForm.parameters.flowerElement ?? 1) >= .5 && <article className={`form-element-card flower-element-card${(recipe.koneForm.parameters.flowerPresence ?? 1) < .5 ? " bypassed" : ""}`}>
                  <header><div><span className="eyebrow">FLOWER BODY</span><strong>Choose what kind of bloom exists</strong></div><FormElementActions enabled={(recipe.koneForm.parameters.flowerPresence ?? 1) >= .5} onBypass={() => changeFormElement("flower", "bypass")} onDelete={() => changeFormElement("flower", "delete")}/></header>
                  <div className="form-flower-kind"><span>FLOWER</span><button className={(recipe.koneForm.parameters.orchidPresence ?? 0) === 0 ? "selected" : ""} onClick={() => setKoneFlowerKind(0)}>Four petals</button><button className={(recipe.koneForm.parameters.orchidPresence ?? 0) === 1 ? "selected" : ""} onClick={() => setKoneFlowerKind(1)}>Orchid</button><button className={(recipe.koneForm.parameters.orchidPresence ?? 0) > 0 && (recipe.koneForm.parameters.orchidPresence ?? 0) < 1 ? "selected" : ""} onClick={() => setKoneFlowerKind(.5)}>Mix</button></div>
                  {(recipe.koneForm.parameters.orchidPresence ?? 0) > 0 && <>
                    <div className="form-flower-kind orchid-species-kind"><span>ORCHID</span><button className={(recipe.koneForm.parameters.orchidSpecies ?? 0) < .5 ? "selected" : ""} onClick={() => setOrchidSpecies(0)}>Cattleya</button><button className={(recipe.koneForm.parameters.orchidSpecies ?? 0) >= .5 && (recipe.koneForm.parameters.orchidSpecies ?? 0) < 1.5 ? "selected" : ""} onClick={() => setOrchidSpecies(1)}>Pouch</button><button className={(recipe.koneForm.parameters.orchidSpecies ?? 0) >= 1.5 ? "selected" : ""} onClick={() => setOrchidSpecies(2)}>Spiral Stem</button></div>
                    {(recipe.koneForm.parameters.orchidSpecies ?? 0) < .5
                      ? <div className="form-orchid-anatomy"><span>ORCHID PARTS</span>{orchidAnatomyOptions.map((part) => { const enabled = (recipe.koneForm.parameters[part.id] ?? part.default) >= .5; return <button key={part.id} className={enabled ? "selected" : ""} aria-pressed={enabled} onClick={() => toggleOrchidAnatomy(part.id, part.default)}>{part.label} {enabled ? "On" : "Off"}</button>; })}</div>
                      : (recipe.koneForm.parameters.orchidSpecies ?? 0) < 1.5
                        ? <><div className="form-orchid-anatomy"><span>POUCH PARTS</span>{pouchAnatomyOptions.map((part) => { const enabled = (recipe.koneForm.parameters[part.id] ?? part.default) >= .5; return <button key={part.id} className={enabled ? "selected" : ""} aria-pressed={enabled} onClick={() => toggleOrchidAnatomy(part.id, part.default)}>{part.label} {enabled ? "On" : "Off"}</button>; })}</div><div className="form-growth-controls pouch-pressure-controls">{koneFormDefinition.parameters.filter((parameter) => pouchPressureIds.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={recipe.koneForm.parameters[parameter.id] ?? parameter.default} onCommit={(value) => alterKoneFormParameter(parameter.id, value)}/>)}</div></>
                        : <><div className="form-orchid-anatomy"><span>SPIRAL PARTS</span>{spiralAnatomyOptions.map((part) => { const enabled = (recipe.koneForm.parameters[part.id] ?? part.default) >= .5; return <button key={part.id} className={enabled ? "selected" : ""} aria-pressed={enabled} onClick={() => toggleOrchidAnatomy(part.id, part.default)}>{part.label} {enabled ? "On" : "Off"}</button>; })}</div><div className="form-growth-controls pouch-pressure-controls">{koneFormDefinition.parameters.filter((parameter) => spiralSignalIds.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={recipe.koneForm.parameters[parameter.id] ?? parameter.default} onCommit={(value) => alterKoneFormParameter(parameter.id, value)}/>)}</div></>}
                  </>}
                </article>}
                {(recipe.koneForm.parameters.mouthsElement ?? 1) >= .5 && <article className={`form-element-card mouths-element-card${(recipe.koneForm.parameters.mouthsPresence ?? 1) < .5 ? " bypassed" : ""}`}><header><div><span className="eyebrow">CENTER OVALS</span><strong>Dark apertures formerly called False Mouths</strong></div><FormElementActions enabled={(recipe.koneForm.parameters.mouthsPresence ?? 1) >= .5} onBypass={() => changeFormElement("mouths", "bypass")} onDelete={() => changeFormElement("mouths", "delete")}/></header><div className="form-growth-controls">{koneFormDefinition.parameters.filter((parameter) => mouthsParameterIds.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={{ ...parameter, label: "Oval Amount", description: "How many dark outlined apertures gather around the center." }} value={recipe.koneForm.parameters[parameter.id] ?? parameter.default} onCommit={(value) => alterKoneFormParameter(parameter.id, value)}/>)}</div></article>}
                {(recipe.koneForm.parameters.growthElement ?? 1) >= .5 && <article className={`form-element-card growth-element-card${(recipe.koneForm.parameters.growthPresence ?? 1) < .5 ? " bypassed" : ""}`}><header><div><span className="eyebrow">GROWTH</span><strong>Flower spread and botanical reach</strong></div><FormElementActions enabled={(recipe.koneForm.parameters.growthPresence ?? 1) >= .5} onBypass={() => changeFormElement("growth", "bypass")} onDelete={() => changeFormElement("growth", "delete")}/></header><div className="form-flower-kind bloom-site-kind"><span>BLOOM SITES</span>{bloomSiteOptions.map((option) => <button key={option.value} className={Math.round(recipe.koneForm.parameters.bloomSites ?? 0) === option.value ? "selected" : ""} onClick={() => setBloomSites(option.value)}>{option.label}</button>)}</div><div className="form-growth-controls">{koneFormDefinition.parameters.filter((parameter) => growthParameterIds.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={recipe.koneForm.parameters[parameter.id] ?? parameter.default} onCommit={(value) => alterKoneFormParameter(parameter.id, value)}/>)}</div></article>}
              </div>
            </section>
          </div>}

          {studioMode === "glitch" && <div className="glitch-depth-divider" role="separator" aria-label="Resize the process workspace" aria-orientation="horizontal" aria-valuemin={14} aria-valuemax={52} aria-valuenow={Math.round(glitchUpperDepth)} tabIndex={0} title="Drag up for more process room · double-click for Balance" onPointerDown={beginGlitchDepthResize} onDoubleClick={() => setGlitchUpperDepth(30)} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); setGlitchUpperDepth((current) => Math.max(14, current - 2)); } else if (event.key === "ArrowDown") { event.preventDefault(); setGlitchUpperDepth((current) => Math.min(52, current + 2)); } else if (event.key === "Home") { event.preventDefault(); setGlitchUpperDepth(30); } }}><span/><small>drag for process room</small></div>}

          {(studioMode === "glitch" || modeEffects.length > 0) && <section className={`chain-panel${studioMode !== "glitch" ? " focused-chain-panel" : ""} ${activeEffect?.type === "ultimate-sort" ? "ultimate-chain-panel" : ""}${processRecipeOpen && studioMode === "glitch" ? " recipe-shelf-open" : ""}`}>
            {studioMode === "glitch" && <><div className="panel-title"><div><span className="eyebrow">ACTIVE CHAIN</span><h2>Steps</h2></div><span>{modeEffects.length} active</span></div><div className="chain-track"><button className={`process-recipes-entry${processRecipeOpen ? " selected" : ""}`} onClick={() => setProcessRecipeOpen((open) => !open)}>Process Recipes</button>{modeEffects.map((effect, index) => <button key={effect.id} className={`chain-node ${effect.id === activeEffect?.id ? "selected" : ""} ${effect.enabled ? "" : "bypassed"}`} onClick={() => setActiveEffectId(effect.id)}><small>{index + 1}</small><span>{definitionFor(effect.type).name}</span></button>)}</div></>}
            {studioMode === "glitch" && processRecipeOpen && <section className="process-recipe-shelf">
              <div className="process-recipe-save"><label><span>NAME THIS PROCESS RECIPE</span><input value={processRecipeName} onChange={(event) => setProcessRecipeName(event.target.value)} placeholder="for example: Diamond Sutra drift"/></label><button onClick={() => void preserveProcessRecipe("glitch-steps")}>Save Steps</button><button disabled={!ultimateEffect} onClick={() => void preserveProcessRecipe("ultimate-sort-mix")}>Save Mix</button><button className="open-recipe-folder" onClick={() => snapshot && invoke("open_in_explorer", { path: `${snapshot.workspacePath}\\process-recipes` })}>Open folder</button></div>
              <div className="process-recipe-list">{processRecipes.length ? processRecipes.map((saved) => <button key={saved.path} onClick={() => applyProcessRecipe(saved)}><small>{saved.scope === "ultimate-sort-mix" ? "ULTIMATE MIX" : "GLITCH STEPS"}</small><strong>{saved.name}</strong><span>{saved.scope === "ultimate-sort-mix" ? `${saved.payload.ultimateSort?.recipes.length ?? 0} methods` : `${saved.payload.effects?.length ?? 0} steps`} · {saved.payload.loopFps ?? recipe.loopFps} fps</span></button>) : <p>Your saved mixtures will wait here, independent of the source image.</p>}</div>
            </section>}
            {activeEffect && activeDefinition && <div className={`effect-editor ${activeEffect.type === "ascii-field" || activeEffect.type === "zhuyin-weave" ? "ascii-effect-editor" : activeEffect.type === "language-body" ? "language-body-effect-editor" : activeEffect.type === "petscii-study" ? "petscii-effect-editor" : activeEffect.type === "dither-field" ? "dither-effect-editor" : activeEffect.type === "ultimate-sort" ? "ultimate-effect-editor" : activeEffect.type === "wizprocess" ? "wizprocess-effect-editor" : activeEffect.type === "tectonic-lens" ? "tectonic-effect-editor" : activeEffect.type === "signal-relief" ? "signal-relief-effect-editor" : activeEffect.type === "almost-alive" ? "almost-alive-effect-editor" : audioBendingTypes.has(activeEffect.type) ? "audio-bending-effect-editor" : ""}`}>
              <div className="effect-head"><div><strong>{activeDefinition.name}</strong>{activeEffect.type !== "ultimate-sort" && activeDefinition.description && <small>{activeDefinition.description}</small>}</div><div className="effect-actions"><button className="read-code" onClick={() => readMachinery(activeEffect.type)}>Read code</button><button onClick={() => moveEffect(activeEffect.id, -1)} disabled={recipe.effects[0]?.id === activeEffect.id}>←</button><button onClick={() => moveEffect(activeEffect.id, 1)} disabled={recipe.effects[recipe.effects.length - 1]?.id === activeEffect.id}>→</button><button onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, enabled: !effect.enabled }))}>{activeEffect.enabled ? "Bypass" : "Enable"}</button><button className="remove-effect" onClick={() => { setRecipe((current) => ({ ...current, revision: current.revision + 1, effects: current.effects.filter((effect) => effect.id !== activeEffect.id) })); setActiveEffectId(recipe.effects.find((effect) => effect.id !== activeEffect.id)?.id ?? ""); }}>Delete process</button></div></div>
              {activeEffect.type === "ultimate-sort" && activeEffect.ultimateSort && <UltimateSortEditor stack={activeEffect.ultimateSort} loopFrames={recipe.loopFrames} loopFps={recipe.loopFps} pickingRecipeId={ultimateTargetPick?.effectId === activeEffect.id ? ultimateTargetPick.recipeId : undefined} onPickBody={(recipeId) => { const picking = ultimateTargetPick?.effectId !== activeEffect.id || ultimateTargetPick.recipeId !== recipeId; setUltimateTargetPick(picking ? { effectId: activeEffect.id, recipeId } : null); setTargetPickEffectId(null); setTargetPreviewEffectId(null); setNotice(picking ? "The preview now shows the image reaching this exact wand row. Click the body you want it to recognize." : "Body picking cancelled; the recipe remains unchanged."); }} onFpsChange={(loopFps) => setRecipe((current) => ({ ...current, revision: current.revision + 1, loopFps }))} onChange={(ultimateSort) => alterEffect(activeEffect.id, (effect) => ({ ...effect, ultimateSort }))}/>}
              {activeEffect.type === "wizprocess" && activeEffect.wizprocess && <WizprocessEditor process={activeEffect.wizprocess} onChange={(wizprocess) => alterEffect(activeEffect.id, (effect) => ({ ...effect, wizprocess }))}/>}
              {activeEffect.type === "language-body" && activeEffect.languageBody && <LanguageBodyEditor playing={scorePlaying} onTogglePlay={toggleKnotMotion} traceColor={activeEffect.languageBody.inkMode === "palette" ? recipe.palette[2] : activeEffect.languageBody.inkColor} body={activeEffect.languageBody} inverted={activeEffect.where.invert} onToggleInvert={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, invert: !effect.where.invert } }))} onChange={(languageBody) => alterEffect(activeEffect.id, (effect) => ({ ...effect, languageBody }))}/>}
              {activeEffect.type === "ascii-field" && activeEffect.characterField && <section className={`ascii-material${activeEffect.characterField.asciiVersion === 2 ? " ascii-transmission" : " ascii-legacy"}`}>
                {activeEffect.characterField.asciiVersion !== 2 && <div className="ascii-upgrade"><div><span className="eyebrow">ORIGINAL ASCII FIELD</span><small>This saved renderer remains untouched. Make a recoverable Transmission copy to enter the new instrument.</small></div><button onClick={() => bringAsciiIntoTransmission(activeEffect)}>Bring into Transmission</button></div>}
                <div className="ascii-methods">
                  <div><span className="eyebrow">RESULT</span><div className="ascii-bank-tabs"><button className={activeEffect.characterField.composition === "inlay" ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), composition: "inlay" } }))}>Over source</button><button className={activeEffect.characterField.composition === "field" ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), composition: "field" } }))}>ASCII only</button></div></div>
                  <div><span className="eyebrow">PLACEMENT</span><div className="ascii-bank-tabs">{(["whole", "body", "outline", "outside"] as const).map((placement) => <button key={placement} className={activeEffect.characterField?.placement === placement ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), placement } }))}>{placement[0].toUpperCase() + placement.slice(1)}</button>)}</div></div>
                  <div><span className="eyebrow">ARRANGEMENT</span><div className="ascii-bank-tabs"><button className={activeEffect.characterField.glyphLogic !== "repeat" ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), glyphLogic: "hybrid", alphabetOrder: "measured" } }))}>Reconstruct</button><button className={activeEffect.characterField.glyphLogic === "repeat" ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), glyphLogic: "repeat", alphabetOrder: "entered" } }))}>Pattern</button></div></div>
                </div>
                <div className="ascii-bank-heading"><span className="eyebrow">CHARACTERS</span><div className="ascii-bank-tabs">{visibleAsciiBanks.map((bank) => <button key={bank.id} className={activeEffect.characterField?.bank === bank.id ? "selected" : ""} title={bank.description} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), bank: bank.id, glyphs: [...bank.glyphs] } }))}>{bank.label}</button>)}</div></div>
                <label className="glyph-vocabulary"><span>Sequence</span><input value={activeEffect.characterField.glyphs.join("")} onChange={(event) => { const glyphs = Array.from(event.target.value).filter((glyph) => { const code = glyph.codePointAt(0) ?? 0; return code >= 32 && code <= 126; }).slice(0, 64); alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), bank: "custom", glyphs: glyphs.length ? glyphs : [" "] } })); }}/><small>{activeEffect.characterField.glyphs.map((glyph, index) => <i key={`${glyph}-${index}`}>{glyph === " " ? "·" : glyph}</i>)}</small></label>
                <div className="ascii-color-controls"><div className="ascii-color-heading"><span className="eyebrow">COLOR</span></div><label><span>Source</span><select value={activeEffect.characterField.inkMode} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), inkMode: event.target.value as CharacterField["inkMode"] } }))}><option value="chosen">One ink</option><option value="palette">Palette</option><option value="source">Image</option></select></label><label><span>Ink</span><input type="color" value={colorToHex(activeEffect.characterField.inkColor)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), inkColor: hexToColor(event.target.value) } }))}/></label><label><span>Ground</span><input type="color" value={colorToHex(activeEffect.characterField.groundColor)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, characterField: { ...(effect.characterField ?? activeEffect.characterField!), groundColor: hexToColor(event.target.value) } }))}/></label>{activeEffect.characterField.asciiVersion === 2 && <button className="ascii-capture" onClick={() => void captureAsciiText()}>Capture .txt</button>}</div>
                {activeEffect.characterField.asciiVersion === 2 && <div className={`ascii-wounds${asciiWoundsOpen ? " open" : ""}`}><button className="ascii-wounds-summary" onClick={() => setAsciiWoundsOpen((open) => !open)}><span><b>DAMAGE</b></span><strong>{asciiWoundsOpen ? "Close" : "Open"}</strong></button>{asciiWoundsOpen && <div>{activeDefinition.parameters.filter((parameter) => asciiTransmissionParameters.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={activeEffect.parameters[parameter.id] ?? parameter.default} onCommit={(nextValue) => alterEffect(activeEffect.id, (effect) => ({ ...effect, parameters: { ...effect.parameters, [parameter.id]: nextValue } }))}/>)}</div>}</div>}
              </section>}
              {activeEffect.type === "zhuyin-weave" && activeEffect.zhuyinField && <section className="ascii-material zhuyin-material">
                <div className="ascii-methods zhuyin-methods"><div><span className="eyebrow">RESULT</span><div className="ascii-bank-tabs"><button className={activeEffect.zhuyinField.composition === "inlay" ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), composition: "inlay" } }))}>Over source</button><button className={activeEffect.zhuyinField.composition === "field" ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), composition: "field" } }))}>Zhuyin only</button></div></div><div><span className="eyebrow">SPATIAL LOGIC</span><div className="ascii-bank-tabs">{(["weave", "syllable", "call-response"] as const).map((logic) => <button key={logic} className={activeEffect.zhuyinField?.spatialLogic === logic ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), spatialLogic: logic } }))}>{logic === "call-response" ? "Call / Response" : logic[0].toUpperCase() + logic.slice(1)}</button>)}</div></div><div><span className="eyebrow">PLACEMENT</span><div className="ascii-bank-tabs">{(["whole", "body", "outline", "outside"] as const).map((placement) => <button key={placement} className={activeEffect.zhuyinField?.placement === placement ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), placement } }))}>{placement[0].toUpperCase() + placement.slice(1)}</button>)}</div></div><div><span className="eyebrow">NEW ITERATION</span><div className="ascii-bank-tabs"><button className={activeEffect.zhuyinField.mutationMode === "held" ? "selected" : ""} title="Keep the exact sequence" onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), mutationMode: "held" } }))}>Hold</button><button className={activeEffect.zhuyinField.mutationMode === "drift" ? "selected" : ""} title="One recoverable mutation" onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), mutationMode: "drift" } }))}>Drift</button><button className={activeEffect.zhuyinField.mutationMode === "fracture" ? "selected" : ""} title="Several recoverable mutations" onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), mutationMode: "fracture" } }))}>Fracture</button></div></div></div>
                <div className="ascii-bank-heading"><span className="eyebrow">SIGNS</span><div className="ascii-bank-tabs">{zhuyinBanks.map((bank) => <button key={bank.id} className={activeEffect.zhuyinField?.bank === bank.id ? "selected" : ""} title={bank.description} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), bank: bank.id, glyphs: [...bank.glyphs] } }))}>{bank.label}</button>)}</div></div>
                <label className="glyph-vocabulary zhuyin-vocabulary"><span>Repeating sequence</span><input lang="zh-Bopo" value={activeEffect.zhuyinField.glyphs.join("")} onChange={(event) => { const glyphs = Array.from(event.target.value).filter((glyph) => !/\s/u.test(glyph)).slice(0, 64); alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), bank: "custom", glyphs: glyphs.length ? glyphs : ["ㄅ"] } })); }}/><small>{activeEffect.zhuyinField.glyphs.map((glyph, index) => <i key={`${glyph}-${index}`}>{glyph}</i>)}</small></label>
                <div className="ascii-color-controls"><div className="ascii-color-heading"><span className="eyebrow">COLOR</span></div><label><span>Source</span><select value={activeEffect.zhuyinField.inkMode} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), inkMode: event.target.value as ZhuyinField["inkMode"] } }))}><option value="chosen">One ink</option><option value="palette">Voices</option><option value="source">Image</option></select></label><label><span>Ink</span><input type="color" value={colorToHex(activeEffect.zhuyinField.inkColor)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), inkColor: hexToColor(event.target.value) } }))}/></label><label><span>Ground</span><input type="color" value={colorToHex(activeEffect.zhuyinField.groundColor)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, zhuyinField: { ...(effect.zhuyinField ?? activeEffect.zhuyinField!), groundColor: hexToColor(event.target.value) } }))}/></label></div>
              </section>}
              {activeEffect.type === "petscii-study" && activeEffect.tileField && <section className="petscii-material">
                <div className="petscii-rules"><span className="eyebrow">TILE RULE</span><div className="ascii-bank-tabs">{(["image", "infection", "gravity"] as const).map((logic) => <button key={logic} className={activeEffect.tileField?.tileLogic === logic ? "selected" : ""} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, tileField: { ...(effect.tileField ?? activeEffect.tileField!), tileLogic: logic } }))}>{logic[0].toUpperCase() + logic.slice(1)}</button>)}</div></div>
                <div className="petscii-vocabulary"><span className="eyebrow">16 TILES · 40 × 25</span><PetsciiTileAtlas/></div>
                <div className="petscii-colors"><span className="eyebrow">FOREGROUND</span><div className="petscii-swatches">{petsciiPalette.map((color) => <button key={`ink-${color}`} className={activeEffect.tileField?.foregroundColor === color ? "selected" : ""} aria-label={`Choose foreground ${colorToHex(color)}`} style={{ backgroundColor: colorToHex(color) }} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, tileField: { ...(effect.tileField ?? activeEffect.tileField!), foregroundColor: color } }))}/>)}</div></div>
                <div className="petscii-colors"><span className="eyebrow">GROUND</span><div className="petscii-swatches">{petsciiPalette.map((color) => <button key={`ground-${color}`} className={activeEffect.tileField?.backgroundColor === color ? "selected" : ""} aria-label={`Choose background ${colorToHex(color)}`} style={{ backgroundColor: colorToHex(color) }} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, tileField: { ...(effect.tileField ?? activeEffect.tileField!), backgroundColor: color } }))}/>)}</div></div>
              </section>}
              {isRegionProcess(activeEffect.type) && <section className="palette-region-list">
                <div className="palette-cycle-choices" role="group" aria-label={activeEffect.type==="surface-motion"?"Surface regions":"Palette regions"}><span>Regions</span>{recipe.effects.filter(e=>e.type===activeEffect.type && e.materialId===activeEffect.materialId).map((e,i)=><button key={e.id} className={e.id===activeEffect.id?"selected":""} aria-pressed={e.id===activeEffect.id} onClick={()=>{setActiveEffectId(e.id);setTargetPickEffectId(null);setTargetPreviewEffectId(null);}}>Region {i+1}{e.enabled?"":" (off)"}</button>)}<button onClick={()=>{const e=createEffect(activeEffect.type,recipe.seed+recipe.effects.length*41);e.materialId=activeEffect.materialId;e.enabled=false;e.parameters.regionPending=1;e.where={...e.where,mode:"found-body",targetMemory:"source"};setRecipe(current=>({...current,revision:current.revision+1,effects:[...current.effects,e]}));setSelected(null);setActiveEffectId(e.id);setTargetPickEffectId(e.id);setTargetPreviewEffectId(null);setUltimateTargetPick(null);setNotice("Click an area in the preview. The new region stays off until you pick it.");}}>Add region</button></div>
                <small>Each region has its own material and motion. Overlapping regions apply in chain order.</small>
              </section>}
              {activeEffect.type === "ultimate-sort" && !ultimateWhereOpen
                ? <button className="ultimate-where-summary" onClick={() => setUltimateWhereOpen(true)}><span><small>OPTIONAL WHOLE-STACK MASK</small><strong>{whereModes.find((mode) => mode.value === activeEffect.where.mode)?.label}{activeEffect.where.invert ? " · inverted" : ""}</strong></span><em>Open only when every ordered method needs one final shared boundary.</em><b>Open</b></button>
                : activeEffect.type !== "petscii-study" && (activeEffect.type !== "language-body" || activeEffect.languageBody?.body === "where") && <section className={`where-panel${activeEffect.type === "ultimate-sort" ? " ultimate-whole-stack-where" : ""}`}>
                <div className="where-identity"><span className="eyebrow">{activeEffect.type === "ascii-field" ? "ASCII TERRITORY" : activeEffect.type === "zhuyin-weave" ? "ZHUYIN TERRITORY" : activeEffect.type === "language-body" ? "LANGUAGE BODY TERRITORY" : activeEffect.type === "ultimate-sort" ? "WHOLE-STACK MASK" : isRegionProcess(activeEffect.type) ? "REGION SELECTION" : "WHERE THIS PROCESS ACTS"}</span>{whereModes.find((mode) => mode.value === activeEffect.where.mode)?.description && <small>{whereModes.find((mode) => mode.value === activeEffect.where.mode)?.description}</small>}{activeEffect.type === "ultimate-sort" && <button onClick={() => { setUltimateWhereOpen(false); setTargetPickEffectId(null); setTargetPreviewEffectId(null); }}>Close</button>}</div>
                {isRegionProcess(activeEffect.type) ? <div className="palette-cycle-choices" role="group" aria-label="Region selection">{whereModes.map(mode=><button key={mode.value} className={activeEffect.where.mode===mode.value?"selected":""} aria-pressed={activeEffect.where.mode===mode.value} onClick={()=>{setTargetPickEffectId(null);alterEffect(activeEffect.id,e=>({...e,where:{...e.where,mode:mode.value,targetMemory:"source"}}));}}>{({"found-body":"Connected area","color-kin":"Matching colors","shape-relatives":"Similar shapes"} as Record<string,string>)[mode.value]??mode.label}</button>)}</div> : <label className="where-mode"><span>{activeEffect.type === "ascii-field" || activeEffect.type === "zhuyin-weave" ? "Fill" : "Target"}</span><select value={activeEffect.where.mode} onChange={(event) => { const mode = event.target.value as EffectInstance["where"]["mode"]; if (!sampledWhereModes.has(mode)) setTargetPickEffectId(null); alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, mode, targetMemory: sampledWhereModes.has(mode) && !sampledWhereModes.has(effect.where.mode) ? "source" : effect.where.targetMemory } })); }}>{(activeEffect.type === "ascii-field" || activeEffect.type === "zhuyin-weave" || activeEffect.type === "language-body" ? asciiTerritoryModes : whereModes).map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>}
                {["light","dark","edges","saturated","muted","blocks"].includes(activeEffect.where.mode) && <label><span>{(activeEffect.type === "ascii-field" || activeEffect.type === "zhuyin-weave") && activeEffect.where.mode === "edges" ? "Edge threshold" : "Signal gate"}</span><input type="number" min="0" max="100" step="1" value={Math.round(activeEffect.where.threshold * 100)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, threshold: Math.max(0, Math.min(1, Number(event.target.value) / 100)) } }))}/></label>}
                {sampledWhereModes.has(activeEffect.where.mode) && <div className="where-found-body">
                  <div className="where-pick"><button className={targetPickEffectId === activeEffect.id ? "selected" : ""} onClick={() => { const picking = targetPickEffectId !== activeEffect.id; setTargetPickEffectId(picking ? activeEffect.id : null); setUltimateTargetPick(null); setTargetPreviewEffectId(null); setNotice(picking ? "The preview now shows what this process can recognize. Click the color or body you want it to hold." : "Target picking cancelled; the recipe remains unchanged."); }}>{targetPickEffectId === activeEffect.id ? "Cancel picking" : isRegionProcess(activeEffect.type) ? (activeEffect.where.mode==="color-kin"?"Pick color":"Pick area") : "Pick from image"}</button><label title="The exact held target color"><input type="color" value={colorToHex(activeEffect.where.sampleColor)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, sampleColor: hexToColor(event.target.value) } }))}/><span>{colorToHex(activeEffect.where.sampleColor)}</span></label><small>{Math.round(activeEffect.where.sampleX * 100)}% across · {Math.round(activeEffect.where.sampleY * 100)}% down</small></div>
                  <label><span>{isRegionProcess(activeEffect.type) ? "Color tolerance" : "Color Reach"}</span><input type="number" min="1" max="100" step="1" value={Math.round(activeEffect.where.colorReach * 100)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, colorReach: Math.max(0.01, Math.min(1, Number(event.target.value) / 100)) } }))}/><small>{isRegionProcess(activeEffect.type) ? "Lower selects closer colors; higher includes more." : "% · exact kin → extended family"}</small></label>
                  <label><span>{isRegionProcess(activeEffect.type) ? "Match brightness" : "Shade Loyalty"}</span><input type="number" min="0" max="100" step="1" value={Math.round(activeEffect.where.shadeLoyalty * 100)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, shadeLoyalty: Math.max(0, Math.min(1, Number(event.target.value) / 100)) } }))}/><small>{isRegionProcess(activeEffect.type) ? "Higher matches the picked brightness more closely." : "% · ignore shade → remember light and dark"}</small></label>
                  {activeEffect.where.mode !== "color-kin" && <><label><span>{isRegionProcess(activeEffect.type) ? "Stop at edges" : "Edge Loyalty"}</span><input type="number" min="0" max="100" step="1" value={Math.round(activeEffect.where.edgeLoyalty * 100)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, edgeLoyalty: Math.max(0, Math.min(1, Number(event.target.value) / 100)) } }))}/><small>{isRegionProcess(activeEffect.type) ? "Higher stops selection at stronger boundaries." : "% · leak through → obey contours"}</small></label><label><span>{isRegionProcess(activeEffect.type) ? "Expand selection" : "Body Expansion"}</span><input type="number" min="-8" max="18" step="1" value={Math.round(activeEffect.where.bodyExpansion * 100)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, bodyExpansion: Math.max(-0.08, Math.min(0.18, Number(event.target.value) / 100)) } }))}/><small>{isRegionProcess(activeEffect.type) ? "Negative shrinks; positive expands." : "% · erode → overgrow"}</small></label></>}
                  {activeEffect.where.mode === "shape-relatives" && <label><span>{isRegionProcess(activeEffect.type) ? "Shape similarity" : "Recognition"}</span><input type="number" min="0" max="100" step="1" value={Math.round(activeEffect.where.recognition * 100)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, recognition: Math.max(0, Math.min(1, Number(event.target.value) / 100)) } }))}/><small>{isRegionProcess(activeEffect.type) ? "Higher requires a closer shape match." : "% · suspicious family → strict relatives"}</small></label>}
                  {isRegionProcess(activeEffect.type) ? <div className="palette-cycle-choices" role="group" aria-label="Selection reference"><span>Select from</span>{([['source','Source'],['current','Current image'],['held','Held selection']] as const).map(([value,label])=><button key={value} className={activeEffect.where.targetMemory===value?'selected':''} onClick={()=>alterEffect(activeEffect.id,e=>({...e,where:{...e.where,targetMemory:value}}))}>{label}</button>)}</div> : <label><span>Target Memory</span><select value={activeEffect.where.targetMemory} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, targetMemory: event.target.value as EffectInstance["where"]["targetMemory"] } }))}><option value="source">Source · remembers before Glitch</option><option value="current">Current Image · follows the chain</option><option value="held">Held Ghost · freezes first recognition</option></select></label>}
                </div>}
                {activeEffect.type !== "ascii-field" && activeEffect.type !== "zhuyin-weave" && ["light","dark","edges","saturated","muted","hue","color-kin","found-body","shape-relatives"].includes(activeEffect.where.mode) && <label><span>{isRegionProcess(activeEffect.type) ? "Edge softness" : sampledWhereModes.has(activeEffect.where.mode) ? "Border Mercy" : "Softness"}</span><input type="number" min="0" max="50" step="1" value={Math.round(activeEffect.where.softness * 100)} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, softness: Math.max(0, Math.min(0.5, Number(event.target.value) / 100)) } }))}/></label>}
                {activeEffect.where.mode === "hue" && <><label><span>Hue</span><input type="number" min="0" max="359" step="1" value={activeEffect.where.hue} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, hue: Math.max(0, Math.min(359, Number(event.target.value))) } }))}/></label><label><span>Hue width</span><input type="number" min="1" max="180" step="1" value={activeEffect.where.hueWidth} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, hueWidth: Math.max(1, Math.min(180, Number(event.target.value))) } }))}/></label></>}
                {["random","checker","stripes","blocks"].includes(activeEffect.where.mode) && <label><span>{activeEffect.type === "ascii-field" ? "Territory scale" : "Scale"}</span><input type="number" min="2" max="240" step="1" value={activeEffect.where.scale} onChange={(event) => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, scale: Math.max(2, Math.min(240, Number(event.target.value))) } }))}/></label>}
                <button className={activeEffect.where.invert ? "where-toggle selected" : "where-toggle"} onClick={() => alterEffect(activeEffect.id, (effect) => ({ ...effect, where: { ...effect.where, invert: !effect.where.invert } }))}>{activeEffect.type === "ascii-field" || activeEffect.type === "zhuyin-weave" ? "Invert territory" : "Invert target"}</button>
                {isRegionProcess(activeEffect.type) ? <button className={targetPreviewEffectId===activeEffect.id?"where-preview selected":"where-preview"} aria-pressed={targetPreviewEffectId===activeEffect.id} onClick={()=>{setTargetPickEffectId(null);setTargetPreviewEffectId(targetPreviewEffectId===activeEffect.id?null:activeEffect.id);}}>{targetPreviewEffectId===activeEffect.id?"Hide selection":"Show selection"}</button> : <button className="where-preview" onPointerDown={() => setTargetPreviewEffectId(activeEffect.id)} onPointerUp={() => setTargetPreviewEffectId(null)} onPointerLeave={() => setTargetPreviewEffectId(null)} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); event.stopPropagation(); setTargetPreviewEffectId(activeEffect.id); } }} onKeyUp={(event) => { event.preventDefault(); event.stopPropagation(); setTargetPreviewEffectId(null); }}>{activeEffect.type === "ascii-field" || activeEffect.type === "zhuyin-weave" ? "Hold to see territory" : "Hold to see target"}</button>}
              </section>}
              {activeEffect.type === "surface-motion" && <SurfaceMotionEditor effect={activeEffect} playing={scorePlaying} duration={paletteLoopFrames(recipe)/recipe.loopFps} onPlay={()=>{setTargetPreviewEffectId(null);setTargetPickEffectId(null);toggleKnotMotion();}} onChange={effect=>{setRecipe(current=>{const next={...current,revision:current.revision+1,effects:current.effects.map(e=>e.id===effect.id?effect:e)};const position=scorePlaying?(livePreview.current?.position()??0):(current.scorePosition??(current.iteration%current.loopFrames)/current.loopFrames);if(effect.parameters.speed!==activeEffect.parameters.speed)next.scorePosition=(position*paletteLoopRepeats(current)/paletteLoopRepeats(next))%1;return next;});setSelected(null);}}/>}
              {activeEffect.type === "palette-cycle" && <PaletteCycleEditor effect={activeEffect} duration={paletteLoopFrames(recipe)/recipe.loopFps} playing={scorePlaying} onPlay={()=>{setTargetPreviewEffectId(null);setTargetPickEffectId(null);toggleKnotMotion();}} onChange={parameters=>{setRecipe(current=>{const next={...current,revision:current.revision+1,effects:current.effects.map(e=>e.id===activeEffect.id?{...e,parameters}:e)};const position=scorePlaying?(livePreview.current?.position()??0):(current.scorePosition??(current.iteration%current.loopFrames)/current.loopFrames);if(parameters.speed!==activeEffect.parameters.speed)next.scorePosition=(position*paletteLoopRepeats(current)/paletteLoopRepeats(next))%1;return next;});setSelected(null);}}/>}
              {activeEffect.type === "tectonic-lens" && <div className="tectonic-groups">{tectonicLensGroups.map((group) => <section key={group.label}><div><span className="eyebrow">{group.label}</span><small>{group.description}</small></div><div>{activeDefinition.parameters.filter((parameter) => group.ids.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={activeEffect.parameters[parameter.id] ?? parameter.default} onCommit={(nextValue) => alterEffect(activeEffect.id, (effect) => ({ ...effect, parameters: { ...effect.parameters, [parameter.id]: nextValue } }))}/>)}</div></section>)}</div>}
              {activeEffect.type === "signal-relief" && <div className="signal-relief-groups">{signalReliefGroups.map((group) => <section key={group.label}><div><span className="eyebrow">{group.label}</span><small>{group.description}</small></div><div>{activeDefinition.parameters.filter((parameter) => group.ids.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={activeEffect.parameters[parameter.id] ?? parameter.default} onCommit={(nextValue) => alterEffect(activeEffect.id, (effect) => ({ ...effect, parameters: { ...effect.parameters, [parameter.id]: nextValue } }))}/>)}</div></section>)}</div>}
              {activeEffect.type === "almost-alive" && <div className="almost-alive-groups">{almostAliveGroups.map((group) => <section key={group.label}><div><span className="eyebrow">{group.label}</span><small>{group.description}</small></div><div>{activeDefinition.parameters.filter((parameter) => group.ids.has(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={activeEffect.parameters[parameter.id] ?? parameter.default} onCommit={(nextValue) => alterEffect(activeEffect.id, (effect) => ({ ...effect, parameters: { ...effect.parameters, [parameter.id]: nextValue } }))}/>)}</div></section>)}</div>}
              {audioBendingTypes.has(activeEffect.type) && <div className="audio-bending-groups">{[
                { label: "SIGNAL ROUTING", description: "How image space becomes time and color becomes tracks", accepts: (id: string) => audioRoutingIds.has(id) },
                { label: "PROCESS ANATOMY", description: "The exact wound owned by this processor", accepts: (id: string) => !audioRoutingIds.has(id) && !audioReturnIds.has(id) },
                { label: "RETURN & MOTION", description: "What survives and how the signal moves in a loop", accepts: (id: string) => audioReturnIds.has(id) },
              ].map((group) => <section key={group.label}><div><span className="eyebrow">{group.label}</span><small>{group.description}</small></div><div>{activeDefinition.parameters.filter((parameter) => group.accepts(parameter.id)).map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={activeEffect.parameters[parameter.id] ?? parameter.default} onCommit={(nextValue) => alterEffect(activeEffect.id, (effect) => ({ ...effect, parameters: { ...effect.parameters, [parameter.id]: nextValue } }))}/>)}</div></section>)}</div>}
              {!isRegionProcess(activeEffect.type) && activeEffect.type !== "tectonic-lens" && activeEffect.type !== "signal-relief" && activeEffect.type !== "almost-alive" && !audioBendingTypes.has(activeEffect.type) && visibleActiveParameters.length > 0 && <div className="effect-parameters">{visibleActiveParameters.map((parameter) => <ExactParameterControl key={parameter.id} parameter={parameter} value={activeEffect.parameters[parameter.id] ?? parameter.default} onCommit={(nextValue) => alterEffect(activeEffect.id, (effect) => ({ ...effect, parameters: { ...effect.parameters, [parameter.id]: nextValue, ...(effect.type === "dither-field" ? { ditherVersion: 2 } : {}) } }))}/>)}</div>}
            </div>}
          </section>}
          </>}
          </>}

          <div className={studioMode === "gallery" ? `gallery-export-drawer${galleryExportOpen ? " open" : ""}` : "studio-export-surface"}>
          {studioMode === "gallery" && <header><span className="eyebrow">EXPORT CHOSEN RECIPE</span><div><button onClick={() => invoke("open_in_explorer", { path: galleryOutputFolder })}>Open gallery folder</button><button onClick={() => setGalleryExportOpen(false)}>Close</button></div></header>}
          <section className={`source-render-row${studioMode === "gallery" ? " gallery-output-row" : ""}`}>
            {studioMode === "gallery" ? <div className="output-size-control gallery-output-size">
              <div className="output-size-heading"><span>PROCESSING PNG SIZE</span>{studioMode === "gallery" && <small>Nearest-neighbor master</small>}</div>
              <div className="output-size-fields"><OutputDimensionInput outputKind="PNG" label="Width" value={renderWidth} onCommit={(value) => changeOutputDimension("png", "width", value)}/><b>×</b><OutputDimensionInput outputKind="PNG" label="Height" value={renderHeight} onCommit={(value) => changeOutputDimension("png", "height", value)}/></div>
              <div className="output-size-actions"><button className={recipe.aspectLocked ? "ratio-lock selected" : "ratio-lock"} onClick={() => setRecipe((current) => ({ ...current, revision: current.revision + 1, aspectLocked: !current.aspectLocked }))}>{recipe.aspectLocked ? "Ratio locked" : "Ratio free"}</button><select aria-label="PNG ratio choice" value="" onChange={(event) => chooseOutputRatio("png", event.target.value)}><option value="" disabled>Choose ratio…</option>{sourceImage && <option value="source">Source image</option>}<option value="square">Square 1:1</option><option value="four-five">Portrait 4:5</option><option value="three-two">Landscape 3:2</option><option value="sixteen-nine">Wide 16:9</option></select></div>
              <div className="gallery-size-presets"><button onClick={() => setGalleryPngSize("landscape")}>6000 × 4000</button><button onClick={() => setGalleryPngSize("portrait")}>4000 × 6000</button></div>
            </div> : <section className={`png-size-control${pngSizeOpen ? " open" : ""}`}>
              <button type="button" className="png-size-summary" aria-expanded={pngSizeOpen} onClick={() => setPngSizeOpen((open) => !open)}>
                <span>PROCESSING PNG</span>
                <strong>{renderWidth} × {renderHeight}</strong>
                <small>{recipe.aspectLocked ? "ratio locked" : "ratio free"}</small>
                <b>{pngSizeOpen ? "Hide" : "Adjust"}</b>
              </button>
              {pngSizeOpen && <div className="png-size-settings">
                <div className="output-size-fields"><OutputDimensionInput outputKind="PNG" label="Width" value={renderWidth} onCommit={(value) => changeOutputDimension("png", "width", value)}/><b>×</b><OutputDimensionInput outputKind="PNG" label="Height" value={renderHeight} onCommit={(value) => changeOutputDimension("png", "height", value)}/></div>
                <div className="output-size-actions"><button className={recipe.aspectLocked ? "ratio-lock selected" : "ratio-lock"} onClick={() => setRecipe((current) => ({ ...current, revision: current.revision + 1, aspectLocked: !current.aspectLocked }))}>{recipe.aspectLocked ? "Ratio locked" : "Ratio free"}</button><select aria-label="PNG ratio choice" value="" onChange={(event) => chooseOutputRatio("png", event.target.value)}><option value="" disabled>Choose ratio…</option>{sourceImage && <option value="source">Source image</option>}<option value="square">Square 1:1</option><option value="four-five">Portrait 4:5</option><option value="three-two">Landscape 3:2</option><option value="sixteen-nine">Wide 16:9</option></select></div>
              </div>}
            </section>}
            <section className={`loop-export-control${loopExportOpen ? " open" : ""}`}>
              <button type="button" className="loop-export-summary" aria-expanded={loopExportOpen} onClick={() => setLoopExportOpen((open) => !open)}>
                <span>LOOP EXPORT</span>
                <strong>{gifWidth} × {gifHeight}</strong>
                <small>{paletteLoopFrames(recipe)} frames · {recipe.loopFps} fps · {(paletteLoopFrames(recipe) / recipe.loopFps).toFixed(1)} sec</small>
                <b>{loopExportOpen ? "Hide" : "Adjust"}</b>
              </button>
              {loopExportOpen && <div className="loop-export-settings">
                <div className="loop-setting-heading"><span>SIZE</span><small>Shared by GIF and MP4</small></div>
                <div className="output-size-fields"><OutputDimensionInput outputKind="Loop" label="Width" value={gifWidth} onCommit={(value) => changeOutputDimension("gif", "width", value)}/><b>×</b><OutputDimensionInput outputKind="Loop" label="Height" value={gifHeight} onCommit={(value) => changeOutputDimension("gif", "height", value)}/></div>
                <div className="output-size-actions"><button className={recipe.gifAspectLocked ? "ratio-lock selected" : "ratio-lock"} onClick={() => setRecipe((current) => ({ ...current, revision: current.revision + 1, gifAspectLocked: !current.gifAspectLocked }))}>{recipe.gifAspectLocked ? "Ratio locked" : "Ratio free"}</button><select aria-label="Loop ratio choice" value="" onChange={(event) => chooseOutputRatio("gif", event.target.value)}><option value="" disabled>Choose ratio…</option>{sourceImage && <option value="source">Source image</option>}<option value="square">Square 1:1</option><option value="four-five">Portrait 4:5</option><option value="three-two">Landscape 3:2</option><option value="sixteen-nine">Wide 16:9</option></select></div>
                <label className="loop-export-select"><span>Frames</span><select value={recipe.loopFrames} onChange={(event) => setRecipe((current) => ({ ...current, revision: current.revision + 1, loopFrames: Number(event.target.value) }))}>{[12,24,36,48,72,96].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                <label className="loop-export-select"><span>FPS</span><select value={recipe.loopFps} onChange={(event) => setRecipe((current) => ({ ...current, revision: current.revision + 1, loopFps: Number(event.target.value) }))}>{[6,8,12,18,24,30].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
              </div>}
            </section>
          </section>
          {studioMode === "gallery"
            ? <div className="render-buttons gallery-render-buttons"><button className="render-secondary" disabled={!canRender} onClick={() => render("still")}>PNG</button><button className="render-secondary" disabled={!canRender} onClick={() => render("gif")}>GIF</button><button className="render-secondary" disabled={!canRender} onClick={() => render("mp4")}>MP4</button></div>
            : <div className="render-buttons"><button className="render-primary" disabled={!canRender} onClick={preserveHeldPreview}>Save Preview PNG <kbd>Space</kbd></button><button className="render-secondary" disabled={!canRender} onClick={() => render("still")}>Processing PNG</button><button className="render-secondary" disabled={!canRender} onClick={() => void applyCurrentRecipe()}>Apply to Afterimage layer</button><button className="render-secondary" disabled={!canRender} onClick={() => render("gif")}>GIF</button><button className="render-secondary" disabled={!canRender} onClick={() => render("mp4")}>MP4</button></div>}
          </div>
          {paletteOpen && <PaletteLibrary recipe={recipe} onChange={next => { setRecipe(next); setSelected(null); }} onClose={() => setPaletteOpen(false)} settings={paletteControls}/>}
        </aside>
      </div>

      {studioMode !== "gallery" && <section className="lower-dock">
        <div className="history-track">{snapshot.outputs.slice(0, 10).map((record) => <article className={`history-card ${activeOutput?.id === record.id ? "selected" : ""}`} key={record.id}><button className="history-recover" onClick={() => recover(record)}>{record.previewDataUrl ? <img src={record.previewDataUrl} alt=""/> : record.kind === "mp4" ? <b className="loop-file-mark">MP4</b> : null}<span>{formatTime(record.createdAt)}</span><small>{record.kind} · {record.width}px</small></button><button className="history-source" disabled={isLoopOutput(record)} title={isLoopOutput(record) ? "Keep or render a still before reusing a loop." : "Begin a clean pass from this preserved output."} onClick={() => useOutputAsSource(record)}>{isLoopOutput(record) ? "Loop" : "Use as source"}</button></article>)}</div>
      </section>}

      {error && <section className="error-drawer"><div><strong>Current reality is broken.</strong><span>The live recipe and earlier outputs remain safe.</span></div><pre>{error}</pre><button onClick={() => setError(null)}>Keep working</button></section>}
      {mixerOpen && <section className="mixer-drawer" role="dialog" aria-label="Layer composite beside the live preview">
        <header><div><span className="eyebrow">LAYER COMPOSITE</span><h2>Judge layers against the live preview</h2><p>The image remains visible while you change order, blend, opacity, and masks.</p></div><button onClick={() => setMixerOpen(false)}>Return to processes</button></header>
        <div className="pass-actions"><button onClick={() => feedBack(false)}><strong>Canvas → clean pass</strong><small>Protect this frame as the new source and begin with Resolution Quilt only.</small></button><button onClick={() => feedBack(true)}><strong>Canvas → keep chain</strong><small>Protect this frame as the new source and keep accumulating the current damage.</small></button><div><strong>Hold O</strong><small>Temporarily reveal the unprocessed source and layer composite.</small></div></div>
        <div className="mixer-grid">
          <section className="layer-stack"><div className="drawer-title"><div><span className="eyebrow">LAYER COMPOSITE</span><h3>{recipe.layers.length ? `${recipe.layers.length} material layers` : "No added layers"}</h3></div></div>{recipe.layers.map((layer, index) => <article className="layer-card" key={layer.id} data-disabled={!layer.enabled}><div className="layer-card-head"><strong>{index + 1} · {layer.label}</strong><div><button onClick={() => moveLayer(layer.id, -1)} disabled={index === 0}>↑</button><button onClick={() => moveLayer(layer.id, 1)} disabled={index === recipe.layers.length - 1}>↓</button><button onClick={() => alterLayer(layer.id, (current) => ({ ...current, enabled: !current.enabled }))}>{layer.enabled ? "Bypass" : "Enable"}</button><button onClick={() => setRecipe((current) => ({ ...current, revision: current.revision + 1, layers: current.layers.filter((item) => item.id !== layer.id) }))}>×</button></div></div><div className="layer-controls"><label>Blend<select value={layer.blendMode} onChange={(event) => alterLayer(layer.id, (current) => ({ ...current, blendMode: event.target.value as StudioLayer["blendMode"] }))}>{["normal","difference","overlay","hard-mix","screen","multiply","lighten","darken"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label><label>Opacity<input type="number" min="0" max="100" step="1" value={Math.round(layer.opacity * 100)} onChange={(event) => alterLayer(layer.id, (current) => ({ ...current, opacity: Math.max(0, Math.min(1, Number(event.target.value) / 100)) }))}/></label><label>Mask<select value={layer.maskMode} onChange={(event) => alterLayer(layer.id, (current) => ({ ...current, maskMode: event.target.value as StudioLayer["maskMode"] }))}>{["whole","checker","stripes","blocks","light","dark","edges"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label><label>Mask scale<input type="number" min="2" max="240" step="1" value={layer.maskScale} onChange={(event) => alterLayer(layer.id, (current) => ({ ...current, maskScale: Math.max(2, Math.min(240, Number(event.target.value))) }))}/></label></div></article>)}</section>
          <div className="material-column">
            <section className="mark-maker">
              <div className="drawer-title"><div><span className="eyebrow">MARK PRESS</span><h3>Text, emoji, and repeating pattern material</h3></div></div>
              <div className="mark-kind">
                {(["glyph", "checker", "stripes", "dots"] as const).map((kind) => <button key={kind} className={markKind === kind ? "selected" : ""} onClick={() => setMarkKind(kind)}>{kind === "glyph" ? "Text / emoji" : kind}</button>)}
              </div>
              {markKind === "glyph" && <label className="mark-text"><span>Mark</span><input type="text" value={markText} onChange={(event) => setMarkText(event.target.value)} placeholder="type text or emoji…"/></label>}
              <div className="mark-controls">
                <label><span>{markKind === "glyph" ? "Size" : "Cell size"}</span><input type="number" min="4" max="720" step="1" value={markSize} onChange={(event) => setMarkSize(Math.max(4, Math.min(720, Number(event.target.value))))}/></label>
                <label><span>Repeats</span><input type="number" min="1" max="48" step="1" value={markRepeat} disabled={markKind !== "glyph"} onChange={(event) => setMarkRepeat(Math.max(1, Math.min(48, Number(event.target.value))))}/></label>
                <label><span>Rotation</span><input type="number" min="-180" max="180" step="1" value={markRotation} disabled={markKind !== "glyph"} onChange={(event) => setMarkRotation(Math.max(-180, Math.min(180, Number(event.target.value))))}/></label>
                <label><span>Ink</span><input type="color" value={markColor} onChange={(event) => setMarkColor(event.target.value)}/></label>
              </div>
              <button className="add-mark" disabled={busy || (markKind === "glyph" && !markText.trim())} onClick={addMarkLayer}>Add protected mark layer</button>
              <small className="mark-note">It enters the layer stack intact. Difference, Hard Mix, masks, and effect passes can then tear it into the image.</small>
            </section>
            <section className="material-library"><div className="drawer-title"><div><span className="eyebrow">PRESERVED DISCOVERIES</span><h3>Add material without moving its file</h3></div></div><div>{snapshot.outputs.slice(0, 18).map((record) => <article key={record.id}>{record.previewDataUrl && <img src={record.previewDataUrl} alt=""/>}<span>{formatTime(record.createdAt)} · {record.kind}</span><button disabled={isLoopOutput(record)} title={isLoopOutput(record) ? "Render a still before using a loop as layer material." : undefined} onClick={() => addLayer(record)}>{isLoopOutput(record) ? "Loop" : "Add as layer"}</button></article>)}</div></section>
          </div>
        </div>
      </section>}
      {machinery && activeDefinition && <section className="machinery-drawer" role="dialog" aria-modal="true" aria-label={`${activeDefinition.name} Processing machinery`}>
        <header><div><span className="eyebrow">READ THE MACHINERY</span><h2>{activeDefinition.name} · {machinery.functionName}()</h2><p>{machinery.filePath} · lines {machinery.startLine}—{machinery.endLine}</p></div><div><button onClick={() => invoke("open_in_explorer", { path: machinery.filePath })}>Open full PDE</button><button onClick={() => setMachinery(null)}>Close</button></div></header>
        <div className="machinery-parameters">{activeDefinition.parameters.map((parameter) => <span key={parameter.id}><code>{parameter.id}</code> = {activeEffect?.parameters[parameter.id] ?? parameter.default}<small>{parameter.description}</small></span>)}</div>
        <div className="machinery-grid"><article><h3>Actual Processing function</h3><pre><code>{machinery.code}</code></pre></article><article><h3>Exact held recipe</h3><pre><code>{JSON.stringify(recipe, null, 2)}</code></pre></article></div>
      </section>}
    </main>
  );
}

export default App;
