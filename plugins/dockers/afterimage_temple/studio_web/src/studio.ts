import {formPartControls,type FormPart} from "./formStack";
import {formMixControls,selectedFormKind} from "./formComposition";
import {structureControls} from './formStructure';
import { figureControls } from "./figureComposition";
import { knotControls, knotDefaults } from "./knot";
import { wizColorSpaceOptions, type WizColorSpace } from "./colorSpaces";
import { normalizeScore, type ScoreTrack } from "./timeScore";

export type EffectType =
  | "band-rupture"
  | "wrong-sort"
  | "median-filter"
  | "sorting-motion"
  | "ultimate-sort"
  | "wizprocess"
  | "wavelet-cartography"
  | "lz77-memory"
  | "pixel-drift"
  | "signal-echo"
  | "pcm-possession"
  | "tape-transport"
  | "phase-choir"
  | "spectral-surgery"
  | "echo-architecture"
  | "clip-furnace"
  | "silence-knife"
  | "dither-field"
  | "parliament-of-pixels"
  | "tectonic-lens"
  | "lens-warp"
  | "mirror-cut"
  | "palette-cycle"
  | "surface-motion"
  | "motion-leak"
  | "signal-relief"
  | "almost-alive"
  | "resolution-quilt"
  | "shard-field"
  | "cut-repeat"
  | "language-body"
  | "ascii-field"
  | "zhuyin-weave"
  | "petscii-study";

export const audioEffectTypes = new Set<EffectType>(["pcm-possession", "tape-transport", "phase-choir", "spectral-surgery", "echo-architecture", "clip-furnace", "silence-knife"]);

export type EffectParameter = {
  id: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
  choices?: string[];
  suggestions?: ParameterSuggestion[];
};

export type ParameterSuggestion = { value: number; label: string };

export type EffectDefinition = {
  type: EffectType;
  name: string;
  category: "Order" | "Decay" | "Signal" | "Audio" | "Spatial" | "Quantize" | "Fold" | "Temporal" | "Character";
  description: string;
  parameters: EffectParameter[];
};

export type EffectInstance = {
  materialId?: string;
  id: string;
  type: EffectType;
  enabled: boolean;
  where: EffectWhere;
  parameters: Record<string, number>;
  characterField?: CharacterField;
  languageBody?: LanguageBody;
  zhuyinField?: ZhuyinField;
  tileField?: TileField;
  ultimateSort?: UltimateSortStack;
  wizprocess?: Wizprocess;
};

export type Wizprocess = {
  kind: "wizprocess";
  mass: number;
  structure: number;
  grain: number;
  compression: number;
  expansion: number;
  colorSpace: WizColorSpace;
  channels: "together" | "separate";
  channelPhase: number;
  path: "rows" | "columns" | "snake" | "clustered";
  reconstruction: "fold" | "wrap" | "clip" | "reflect";
  tide: number;
  newStructureScale: boolean;
  newStructureWhere: boolean;
  newColors: boolean;
};

export const defaultWizprocess = (): Wizprocess => ({
  kind: "wizprocess",
  mass: 0.82,
  structure: 0.68,
  grain: 0.42,
  compression: 36,
  expansion: 42,
  colorSpace: "hsb",
  channels: "separate",
  channelPhase: 0,
  path: "rows",
  reconstruction: "fold",
  tide: 0.46,
  newStructureScale: true,
  newStructureWhere: true,
  newColors: true,
});

export type UltimateSortRecipe = {
  id: string;
  enabled: boolean;
  method: "bubble" | "insertion" | "selection" | "merge" | "permute" | "scatter" | "roll" | "heap" | "shell" | "quick" | "smooth" | "one-color" | "color-bands" | "glimmer";
  amount: number;
  action: "sort" | "sort-outline" | "wand";
  direction: "left" | "right" | "up" | "down";
  signal: "red" | "green" | "blue" | "hue" | "saturation" | "brightness" | "white" | "black" | "gray" | "luma" | "chroma";
  territory: "whole" | "light" | "dark" | "edges" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "pink" | "body" | "white" | "black" | "gray" | "colorful" | "midtones";
  toneTolerance: number;
  gate: number;
  bodySampleColor: number;
  bodySampleX: number;
  bodySampleY: number;
  bodyColorReach: number;
  bodyShadeLoyalty: number;
  bodyEdgeLoyalty: number;
  bodyExpansion: number;
  bodyInvert: boolean;
  bodyTargetMemory: "source" | "current" | "held";
  resolution: "pixel" | "fixed" | "wake";
  minBlock: number;
  maxBlock: number;
  selectionSpeed: number;
  scatterRefresh: number;
  glimmerSize: number;
  glimmerSpeed: number;
};

export type UltimateSortStack = {
  kind: "ultimate-sort";
  glimmerEnabled?: boolean;
  glimmerAmount?: number;
  glimmerSize?: number;
  glimmerSpeed?: number;
  recipes: UltimateSortRecipe[];
};

let ultimateRecipeCounter = 0;
export const defaultUltimateSortRecipe = (seed = Date.now()): UltimateSortRecipe => ({
  id: `sort-recipe-${Math.abs(Math.round(seed + ultimateRecipeCounter++ * 7919)).toString(36)}`,
  enabled: true,
  method: "permute",
  amount: 0.1,
  action: "sort",
  direction: "left",
  signal: "hue",
  territory: "green",
  gate: 280,
  toneTolerance: 0.2,
  bodySampleColor: 0xc83d58,
  bodySampleX: 0.5,
  bodySampleY: 0.5,
  bodyColorReach: 0.16,
  bodyShadeLoyalty: 0.68,
  bodyEdgeLoyalty: 0.58,
  bodyExpansion: 0,
  bodyInvert: false,
  bodyTargetMemory: "source",
  resolution: "wake",
  minBlock: 1,
  maxBlock: 18,
  selectionSpeed: 3,
  scatterRefresh: 12,
  glimmerSize: 4,
  glimmerSpeed: 0.18,
});

export const defaultUltimateGlimmerRecipe = (seed = Date.now()): UltimateSortRecipe => ({
  ...defaultUltimateSortRecipe(seed),
  id: `moving-glimmer-${Math.abs(Math.round(seed)).toString(36)}`,
  method: "glimmer",
  amount: 0.34,
  action: "sort",
  signal: "brightness",
  territory: "whole",
  resolution: "pixel",
  maxBlock: 1,
  selectionSpeed: 0,
  glimmerSize: 4,
  glimmerSpeed: 0.18,
});

export const defaultUltimateSortStack = (): UltimateSortStack => ({
  kind: "ultimate-sort",
  recipes: [
    {
      ...defaultUltimateSortRecipe(280),
      id: "selection-ghost",
      amount: 0.0001,
      action: "wand",
      signal: "brightness",
      territory: "edges",
      resolution: "pixel",
      maxBlock: 1,
    },
    {
      ...defaultUltimateSortRecipe(281),
      id: "green-resolution-wake",
    },
    {
      ...defaultUltimateGlimmerRecipe(282),
      id: "moving-glimmer",
    },
  ],
});

export type CharacterField = {
  kind: "ascii";
  asciiVersion: 1 | 2;
  bank: "density" | "punctuation" | "symbols" | "tiles" | "custom";
  glyphs: string[];
  composition: "field" | "inlay";
  glyphLogic: "mass" | "repeat" | "bones" | "hybrid";
  alphabetOrder: "entered" | "measured";
  placement: "whole" | "body" | "outline" | "outside";
  fontAsset: string;
  atlasVersion: number;
  inkMode: "source" | "palette" | "chosen";
  inkColor: number;
  groundColor: number;
};

export const asciiBanks: { id: CharacterField["bank"]; label: string; description: string; glyphs: string[] }[] = [
  { id: "density", label: "ASCII", description: "A classic light-to-dark density ramp.", glyphs: [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"] },
  { id: "punctuation", label: "Punctuation", description: "Nervous language fragments and small cuts.", glyphs: [" ", ".", ",", ":", ";", "!", "?", "'", "\"", "/", "\\", "|", "_", "~"] },
  { id: "symbols", label: "Symbols", description: "Stars, hearts, moons, circles, and signs.", glyphs: [" ", "·", "○", "●", "◇", "◆", "△", "▲", "♥", "☾", "☼", "✦", "✕"] },
  { id: "tiles", label: "Tiles", description: "Block elements that rebuild the image as masonry.", glyphs: [" ", "░", "▒", "▓", "█", "▀", "▄", "▌", "▐", "■", "□", "◆"] },
  { id: "custom", label: "Custom", description: "Your own ordered character vocabulary.", glyphs: [" ", ".", ":", "*", "#", "@"] },
];

export const defaultCharacterField = (): CharacterField => ({
  kind: "ascii",
  asciiVersion: 2,
  bank: "punctuation",
  glyphs: [...asciiBanks[1].glyphs],
  composition: "inlay",
  glyphLogic: "hybrid",
  alphabetOrder: "measured",
  placement: "whole",
  fontAsset: "source-code-pro-semibold-2.042",
  atlasVersion: 1,
  inkMode: "chosen",
  inkColor: 0xf2eee7,
  groundColor: 0x151319,
});

export type LanguageBody = {
  kind: "language-body";
  phrases: string[];
  phraseA: string;
  phraseB: string;
  flow: "organic" | "rings" | "rays" | "grid";
  body: "figure" | "infantry-dove" | "image" | "where" | "knot";
  knot?: Record<string, number>;
  phraseLogic: "alternate" | "noise" | "near-far" | "image";
  composition: "field" | "inlay";
  inkMode: "source" | "palette" | "chosen";
  inkColor: number;
  groundColor: number;
  loopMode: "held" | "orbit" | "breathe" | "collapse" | "metamorphose";
};

export const defaultLanguageBody = (): LanguageBody => ({
  kind: "language-body",
  phrases: ["Almost", "Human"],
  phraseA: "Almost",
  phraseB: "Human",
  flow: "organic",
  body: "figure",
  phraseLogic: "noise",
  composition: "field",
  inkMode: "chosen",
  inkColor: 0xf2eee7,
  groundColor: 0x050505,
  loopMode: "held",
});

export type ZhuyinField = {
  kind: "zhuyin";
  bank: "full" | "initials" | "finals" | "tones" | "custom";
  glyphs: string[];
  mutationMode: "held" | "drift" | "fracture";
  spatialLogic: "weave" | "syllable" | "call-response";
  placement: "whole" | "body" | "outline" | "outside";
  composition: "field" | "inlay";
  inkMode: "source" | "palette" | "chosen";
  inkColor: number;
  groundColor: number;
};

const zhuyinInitials = Array.from("ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ");
const zhuyinFinals = Array.from("ㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ");
const zhuyinTones = Array.from("ˉˊˇˋ˙");

export const zhuyinBanks: { id: ZhuyinField["bank"]; label: string; description: string; glyphs: string[] }[] = [
  { id: "full", label: "Full system", description: "Initials and finals in their standard Zhuyin order.", glyphs: [...zhuyinInitials, ...zhuyinFinals] },
  { id: "initials", label: "Initials", description: "The sharper consonant-bearing signs.", glyphs: [...zhuyinInitials] },
  { id: "finals", label: "Finals", description: "The rounder vowel and ending signs.", glyphs: [...zhuyinFinals] },
  { id: "tones", label: "Tone marks", description: "Five small directional accents.", glyphs: [...zhuyinTones] },
  { id: "custom", label: "Custom sequence", description: "A deliberate Zhuyin phrase, fragment, or reordered vocabulary.", glyphs: Array.from("ㄅㄆㄇㄈˊˇˋ˙") },
];

export const defaultZhuyinField = (): ZhuyinField => ({
  kind: "zhuyin",
  bank: "full",
  glyphs: [...zhuyinBanks[0].glyphs],
  mutationMode: "held",
  spatialLogic: "weave",
  placement: "whole",
  composition: "inlay",
  inkMode: "palette",
  inkColor: 0xf2eee7,
  groundColor: 0x151319,
});

export type TileField = {
  kind: "petscii-study";
  tileLogic: "image" | "infection" | "gravity";
  foregroundColor: number;
  backgroundColor: number;
};

export const petsciiPalette = [
  0x000000, 0xffffff, 0x813338, 0x75cec8,
  0x8e3c97, 0x56ac4d, 0x2e2c9b, 0xedf171,
  0x8e5029, 0x553800, 0xc46c71, 0x4a4a4a,
  0x7b7b7b, 0xa9ff9f, 0x706deb, 0xb2b2b2,
] as const;

export const defaultTileField = (): TileField => ({
  kind: "petscii-study",
  tileLogic: "infection",
  foregroundColor: petsciiPalette[14],
  backgroundColor: petsciiPalette[0],
});

export type EffectWhereMode = "whole" | "light" | "dark" | "edges" | "saturated" | "muted" | "hue" | "color-kin" | "found-body" | "shape-relatives" | "random" | "checker" | "stripes" | "blocks";
export type EffectTargetMemory = "source" | "current" | "held";
export type EffectWhere = {
  mode: EffectWhereMode;
  threshold: number;
  softness: number;
  hue: number;
  hueWidth: number;
  scale: number;
  invert: boolean;
  seed: number;
  sampleColor: number;
  sampleX: number;
  sampleY: number;
  colorReach: number;
  shadeLoyalty: number;
  edgeLoyalty: number;
  bodyExpansion: number;
  recognition: number;
  targetMemory: EffectTargetMemory;
};

export const whereModes: { value: EffectWhereMode; label: string; description: string }[] = [
  { value: "whole", label: "Whole image", description: "" },
  { value: "light", label: "Light regions", description: "Protect shadows and enter brighter territory." },
  { value: "dark", label: "Dark regions", description: "Protect highlights and enter darker territory." },
  { value: "edges", label: "Outline / edges", description: "Follow contours and abrupt changes in image structure." },
  { value: "saturated", label: "Saturated regions", description: "Enter territories carrying stronger color." },
  { value: "muted", label: "Muted regions", description: "Enter colorless and restrained territories." },
  { value: "hue", label: "Hue family", description: "Gather one neighborhood of the color wheel." },
  { value: "color-kin", label: "All Kin", description: "Follow every color related to one point picked from the image." },
  { value: "found-body", label: "Connected Body", description: "Hold only the color-relative body connected to the picked point." },
  { value: "shape-relatives", label: "Shape Relatives", description: "Invite connected bodies with related scale, proportion, fill, and boundary character." },
  { value: "random", label: "Random territory", description: "Choose recoverable scattered cells or clustered islands." },
  { value: "checker", label: "Checker", description: "Alternate protected and affected squares." },
  { value: "stripes", label: "Stripes", description: "Permit the process through alternating bands." },
  { value: "blocks", label: "Blocks", description: "Use a deterministic broken field of territories." },
];

export type LayerBlendMode = "normal" | "difference" | "overlay" | "hard-mix" | "screen" | "multiply" | "lighten" | "darken";
export type LayerMaskMode = "whole" | "checker" | "stripes" | "blocks" | "light" | "dark" | "edges";
export type StudioLayer = {
  joinAfter?: string;
  id: string;
  label: string;
  filePath: string;
  enabled: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
  maskMode: LayerMaskMode;
  maskScale: number;
  seed: number;
};

export type PaletteStructure =
  | "monochrome"
  | "duotone"
  | "analogous"
  | "complementary"
  | "split-complementary"
  | "triadic"
  | "source"
  | "custom";

export type PaletteSettings = {
  structure: PaletteStructure;
  hue: number;
  hueSpread: number;
  saturation: number;
  saturationRange: number;
  lightnessFloor: number;
  lightnessCeiling: number;
};

export const paletteStructures: { value: PaletteStructure; label: string; description: string }[] = [
  { value: "monochrome", label: "Monochrome", description: "One hue carried through a tonal ladder." },
  { value: "duotone", label: "Duotone", description: "Two hue families arguing across the image." },
  { value: "analogous", label: "Analogous", description: "Neighboring hues held inside a narrow weather system." },
  { value: "complementary", label: "Complementary", description: "A direct opposition across the color wheel." },
  { value: "split-complementary", label: "Split complementary", description: "One anchor facing two uneven opponents." },
  { value: "triadic", label: "Triadic", description: "Three equidistant signals with controlled intensity." },
  { value: "source", label: "Extracted from image", description: "Four colors sampled from the current source material." },
  { value: "custom", label: "Restricted custom", description: "The four swatches stay exactly as you set them." },
];

export type StudioRecipe = {
  formStack?: FormPart[];
  formSelected?: string;
  timeScore?: ScoreTrack[];
  scorePosition?: number;
  schemaVersion: 1;
  revision: number;
  seed: number;
  colorSeed: number;
  iteration: number;
  renderSize: number;
  renderWidth: number;
  renderHeight: number;
  processingOrientation: "recompose" | "rotate-cw" | "rotate-ccw";
  gifWidth: number;
  gifHeight: number;
  loopFrames: number;
  loopFps: number;
  aspectLocked: boolean;
  gifAspectLocked: boolean;
  sourceImage?: string;
  outputFamily?: string;
  baseMode: "field" | "kone";
  processStage: "form" | "chain";
  koneForm: KoneFormState;
  sourceFit: "cover" | "contain";
  sourceBackground: "keep" | "cutout";
  colorMode: "source" | "palette";
  sourcePresence: number;
  paletteSettings: PaletteSettings;
  palette: [number, number, number, number];
  layers: StudioLayer[];
  effects: EffectInstance[];
};

export type KoneFormState = {
  emojiSelection?: Array<{id:string;name:string}>;
  knotText?: string;
  kind: "kone-form";
  family: FormFamily;
  seed: number;
  parameters: Record<string, number>;
};

export type FormFamily = "kone" | "human" | "flower" | "plant";

export const formFamilies: Array<{ id: FormFamily; label: string; description: string }> = [
  { id: "kone", label: "KONE", description: "The original folded mathematical shell." },
  { id: "human", label: "Human", description: "A ribbed figure organized around heart, spine, and limbs." },
  { id: "flower", label: "Flower", description: "A radial bloom that can become aperture, wound, or machine." },
  { id: "plant", label: "Plant", description: "A branching organism with leaves and terminal bodies." },
];

export const formFamilyStartingValues: Record<FormFamily, Record<string, number>> = {
  kone: { bodyRadius: 0.26, axisStretch: 1, lobes: 5, breathDepth: 0.32, opening: 0.78, ribCount: 170, twist: 1.3, turn: 238, wound: 0.18, foldDepth: 0.08 },
  human: { bodyRadius: 0.31, axisStretch: 1.18, lobes: 5, breathDepth: 0.24, opening: 0.9, ribCount: 150, twist: 1.1, turn: 238, wound: 0.2, foldDepth: 0.06 },
  flower: { bodyRadius: 0.31, axisStretch: 1, lobes: 8, breathDepth: 0.48, opening: 1, ribCount: 190, twist: 1.7, turn: 238, wound: 0.26, foldDepth: 0.1 },
  plant: { bodyRadius: 0.3, axisStretch: 1.22, lobes: 7, breathDepth: 0.3, opening: 0.92, ribCount: 150, twist: 1.2, turn: 238, wound: 0.22, foldDepth: 0.08 },
};

export const koneFormParameters: EffectParameter[] = [
  { id: "printedFolds", label: "Printed folds", description: "Flat body and fold faces with separate ink lines.", min: 0, max: 1, step: 1, default: 0 },
  { id: "printSpacing", label: "Line spacing", description: "Space between ink ribs without changing the body geometry.", min: 1, max: 12, step: 1, default: 3 },
  { id: "printWeight", label: "Line weight", description: "Fine engraved lines through heavier ink.", min: .2, max: 2, step: .1, default: .7 },
  ...[0,1,2,3].map(i => ({ id: `printLock${i}`, label: "Keep color", description: "Keep this role when choosing a set or swapping colors.", min: 0, max: 1, step: 1, default: 0 })),
  ...formPartControls,
  ...formMixControls,
  ...structureControls,
  ...figureControls,
  { id: "knotActive", label: "Knot Body", description: "Rest existing anatomy and explore the knot body.", min: 0, max: 1, step: 1, default: 0 },
  ...knotControls.map(p => ({ ...p, description: p.label, choices: "choices" in p ? [...p.choices] : undefined })),
  { id: "koneElement", label: "KONE Element", description: "Keep the KONE body in the active Form stack.", min: 0, max: 1, step: 1, default: 1 },
  { id: "shellPresence", label: "KONE Shell", description: "Show the folded KONE ribbon or let its botanical growth live without the shell.", min: 0, max: 1, step: 1, default: 1 },
  { id: "flowerElement", label: "Flower Element", description: "Keep flower bodies in the active Form stack.", min: 0, max: 1, step: 1, default: 1 },
  { id: "flowerPresence", label: "Flower Presence", description: "Bypass or reveal flower bodies without losing their anatomy.", min: 0, max: 1, step: 1, default: 1 },
  { id: "growthElement", label: "Growth Element", description: "Keep flower spread and botanical reach in the active Form stack.", min: 0, max: 1, step: 1, default: 1 },
  { id: "growthPresence", label: "Growth Presence", description: "Bypass or reveal botanical reach without losing its settings.", min: 0, max: 1, step: 1, default: 1 },
  { id: "mouthsElement", label: "Center Ovals Element", description: "Keep the dark center apertures in the active Form stack.", min: 0, max: 1, step: 1, default: 1 },
  { id: "mouthsPresence", label: "Center Ovals Presence", description: "Bypass or reveal the center apertures without losing their amount.", min: 0, max: 1, step: 1, default: 1 },
  { id: "bodyRadius", label: "Body Radius", description: "Scale of the underlying ring relative to the shorter canvas edge.", min: 0.05, max: 0.48, step: 0.01, default: 0.26 },
  { id: "koneSizeDifference", label: "KONE Size Difference", description: "Make the second KONE smaller or larger than the first.", min: -1, max: 1, step: 0.01, default: 0 },
  { id: "koneSeparation", label: "KONE Separation", description: "Pull two KONE bodies apart along a seed-held direction.", min: 0, max: 1.5, step: 0.01, default: 0 },
  { id: "konePositionScatter", label: "KONE Position Scatter", description: "Let the complete KONE body drift away from the canvas center.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "axisStretch", label: "Axis Stretch", description: "Flatten the ring into a disc or pull it into a long pod.", min: 0.25, max: 2.5, step: 0.01, default: 1 },
  { id: "lobes", label: "Lobes", description: "How many repeated breaths gather around the body.", min: 1, max: 20, step: 1, default: 5 },
  { id: "breathDepth", label: "Breath Depth", description: "Strength of swelling and pinching; values above one can turn the body through itself.", min: 0, max: 1.25, step: 0.01, default: 0.32 },
  { id: "opening", label: "Opening", description: "Below one tears the circle open; above one makes overlapping revolutions.", min: 0.1, max: 2.5, step: 0.01, default: 0.78 },
  { id: "ribCount", label: "Rib Count", description: "From exposed graphic anatomy to dense veil and moire.", min: 24, max: 420, step: 1, default: 170 },
  { id: "twist", label: "Twist", description: "Pressure that changes how the ring turns into folded structure.", min: 0.1, max: 8, step: 0.1, default: 1.3 },
  { id: "turn", label: "Turn", description: "Rotate the body and its inner fold through a recoverable viewing angle.", min: 0, max: 359, step: 1, default: 238 },
  { id: "wound", label: "Wound", description: "Smooth connected swelling and constriction rather than independent static.", min: 0, max: 0.85, step: 0.01, default: 0.18 },
  { id: "foldDepth", label: "Fold Depth", description: "Move the third fold through and beyond the body; negative values reverse it.", min: -0.3, max: 0.35, step: 0.01, default: 0.08 },
  { id: "asymmetry", label: "Mutant Symmetry", description: "Let opposite and repeated parts develop unequal reach, weight, and direction.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "amputation", label: "Missing Organ", description: "Excise a deterministic territory so Void becomes part of the anatomy.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "innerBody", label: "Inner Body", description: "Grow a smaller inverted body inside or through the first.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "mouths", label: "False Mouths", description: "Open slits and apertures where this body should not be able to speak.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "budding", label: "Growth Spread", description: "Move from one flower body into a dense botanical event around KONE.", min: 0, max: 3, step: 0.01, default: 0 },
  { id: "flowerSize", label: "Flower Size", description: "Scale each flower body without changing how many grow.", min: 0.05, max: 3, step: 0.01, default: 0.65 },
  { id: "growthReach", label: "Growth Reach", description: "Contract the whole botanical ecology close to its source or let it travel across the field.", min: 0.1, max: 1.5, step: 0.01, default: 0.72 },
  { id: "bloomSites", label: "Bloom Sites", description: "Choose whether flowers orbit KONE, occupy its wounds, or grow from folded rib ends.", min: 0, max: 2, step: 1, default: 0 },
  { id: "graftDepth", label: "Graft Depth", description: "Move flowers from separate orbit into KONE's own folded anatomy.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "flowerPositionScatter", label: "Position Scatter", description: "Disperse flowers away from their orderly orbit using the held seed.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "flowerClustering", label: "Clustering", description: "Gather separate blooms into uneven colonies.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "surfaceAttraction", label: "Surface Attraction", description: "Pull flowers toward the breathing surface of KONE.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "bridgeGrowth", label: "Bridge Growth", description: "Grow flowers through the living interval between two KONE bodies.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "orchidPresence", label: "Orchid Presence", description: "Transform abstract buds into the selected orchid body.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "orchidSpecies", label: "Orchid Species", description: "Choose Cattleya, the Taiwan lady's-slipper Pouch, or Spiral Stem.", min: 0, max: 2, step: 1, default: 0 },
  { id: "orchidBackPetals", label: "Back Petals", description: "Keep the two faint petals behind the orchid body.", min: 0, max: 1, step: 1, default: 1 },
  { id: "orchidSepals", label: "Narrow Sepals", description: "Keep the three narrow sepals around the orchid.", min: 0, max: 1, step: 1, default: 1 },
  { id: "orchidWidePetals", label: "Wide Petals", description: "Keep the two broad side petals.", min: 0, max: 1, step: 1, default: 1 },
  { id: "orchidLip", label: "Ruffled Lip", description: "Keep the violet folded lip body.", min: 0, max: 1, step: 1, default: 1 },
  { id: "orchidThroat", label: "Throat Oval", description: "Keep the long pale oval inside the lip.", min: 0, max: 1, step: 1, default: 1 },
  { id: "orchidColumn", label: "Center Oval", description: "Keep the small central oval where the orchid gathers.", min: 0, max: 1, step: 1, default: 1 },
  { id: "orchidVeins", label: "Short Veins", description: "Draw the three short veins inside the orchid lip.", min: 0, max: 1, step: 1, default: 0 },
  { id: "pouchLeaves", label: "Paired Leaves", description: "Keep the two broad pleated leaves beneath the Pouch.", min: 0, max: 1, step: 1, default: 1 },
  { id: "pouchBody", label: "Living Chamber", description: "Keep the suspended pouch body and its interior cavity.", min: 0, max: 1, step: 1, default: 1 },
  { id: "pouchVeins", label: "Contour Veins", description: "Let fine botanical lines describe pressure across leaves and pouch.", min: 0, max: 1, step: 1, default: 1 },
  { id: "pouchScale", label: "Pouch Size", description: "Keep the chamber minute like field evidence or let it dominate its leaves.", min: 0.1, max: 1.2, step: 0.01, default: 0.65 },
  { id: "pouchInflation", label: "Chamber Pressure", description: "Collapse the pouch toward a thin husk or inflate it into a vessel.", min: 0, max: 1.5, step: 0.01, default: 0.72 },
  { id: "pouchOpening", label: "Mouth Opening", description: "Move the dark cavity from a sealed seam toward an exposed interior.", min: 0, max: 1, step: 0.01, default: 0.28 },
  { id: "pouchSplit", label: "Pouch Split", description: "Divide the chamber into two related but separating bodies.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "pouchInversion", label: "Pouch Inversion", description: "Turn the chamber away from its leaves until inside and outside exchange places.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "spiralLeaves", label: "Grass Leaves", description: "Keep the few narrow basal leaves that anchor the signal to the ground.", min: 0, max: 1, step: 1, default: 1 },
  { id: "spiralStalk", label: "Signal Stalk", description: "Keep the nearly empty line that carries the spiral bloom sequence.", min: 0, max: 1, step: 1, default: 1 },
  { id: "spiralBlooms", label: "Tiny Blooms", description: "Keep the small half-open orchid marks climbing around the stalk.", min: 0, max: 1, step: 1, default: 1 },
  { id: "spiralHeight", label: "Stalk Height", description: "Separate the height of the plant from the scale of its tiny flowers.", min: 0.35, max: 2, step: 0.01, default: 1 },
  { id: "spiralBloomSize", label: "Tiny Bloom Size", description: "Move the flowers from almost typographic signals toward individually readable bodies.", min: 0.1, max: 1.6, step: 0.01, default: 0.55 },
  { id: "spiralTurns", label: "Spiral Turns", description: "Loosen the flowers into a slow climb or tighten them into a botanical transmission.", min: 0.25, max: 8, step: 0.01, default: 3.2 },
  { id: "spiralBloomCount", label: "Bloom Count", description: "How many tiny orchid marks occupy the upper stalk.", min: 3, max: 48, step: 1, default: 18 },
  { id: "spiralMissingBeats", label: "Missing Beats", description: "Remove deterministic flowers so the spiral reads as an interrupted score.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "spiralDrift", label: "Signal Drift", description: "Bend the governing line without dissolving its upward rhythm.", min: 0, max: 1.5, step: 0.01, default: 0.16 },
  { id: "spineBreak", label: "Broken Spine", description: "Kink the body's governing axis until it recoils or kneels.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "ribEscape", label: "Leaf Reach", description: "Let botanical veins and petal spines extend farther from their growth.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "molt", label: "Second KONE", description: "Mix a displaced second KONE body with the first.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "seam", label: "Impossible Seam", description: "Cut and reconnect the surface along a displaced spiral fault.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "gravity", label: "Gravity Wound", description: "Make one territory sag as if its structure has become too heavy.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "possession", label: "Possession", description: "Let an invisible inner pressure push selected anatomy outward.", min: 0, max: 1, step: 0.01, default: 0 },
  { id: "ritual", label: "Ritual Mutation", description: "Grow invented crowns, horns, banners, and ceremonial extensions.", min: 0, max: 1, step: 0.01, default: 0 },
];

export const anatomyParameterIds = new Set([
  "asymmetry", "amputation", "innerBody", "mouths", "budding", "orchidPresence", "spineBreak",
  "ribEscape", "molt", "seam", "gravity", "possession", "ritual",
]);

export const orchidAnatomyParameterIds = new Set([
  "orchidBackPetals", "orchidSepals", "orchidWidePetals", "orchidLip",
  "orchidThroat", "orchidColumn", "orchidVeins",
]);

export const orchidIdentityParameterIds = new Set([
  "orchidSpecies", "pouchLeaves", "pouchBody", "pouchVeins",
  "pouchScale", "pouchInflation", "pouchOpening", "pouchSplit", "pouchInversion",
  "spiralLeaves", "spiralStalk", "spiralBlooms", "spiralHeight", "spiralBloomSize",
  "spiralTurns", "spiralBloomCount", "spiralMissingBeats", "spiralDrift",
]);

export const formElementParameterIds = new Set([
  "koneElement", "shellPresence", "flowerElement", "flowerPresence", "growthElement", "growthPresence", "mouthsElement", "mouthsPresence",
]);

export const livingFormEncounters: Array<{ id: string; label: string; description: string; values: Record<string, number> }> = [
  { id: "reliquary", label: "Reliquary Mutation", description: "A missing quadrant reveals an occupied inner body.", values: { asymmetry: 0.48, amputation: 0.54, innerBody: 0.72, seam: 0.32, possession: 0.28 } },
  { id: "colony", label: "Inner Colony", description: "Mouths and buds gather around a body within the body.", values: { innerBody: 0.84, mouths: 0.58, budding: 0.72, ribEscape: 0.26 } },
  { id: "idol", label: "Broken Idol", description: "A ritual body kneels beneath its own damaged architecture.", values: { asymmetry: 0.34, spineBreak: 0.76, gravity: 0.66, amputation: 0.28, ritual: 0.7 } },
  { id: "afterbody", label: "Afterbody", description: "The shell molts while its ribs and seam refuse to follow.", values: { molt: 0.76, ribEscape: 0.68, seam: 0.74, gravity: 0.24 } },
  { id: "possessed-bloom", label: "Possessed Bloom", description: "A flowering aperture is occupied from within.", values: { mouths: 0.64, possession: 0.82, budding: 0.46, innerBody: 0.38, asymmetry: 0.22 } },
  { id: "ritual-weed", label: "Ritual Weed", description: "Botanical growth mutates into banners, horns, and escaped veins.", values: { ritual: 0.86, budding: 0.62, ribEscape: 0.74, spineBreak: 0.36, gravity: 0.42 } },
];

export const koneFormDefinition = {
  name: "KONE Form",
  description: "Grow a folded mathematical ribbon into breathing shells, broken arcs, and wounded bodies.",
  parameters: koneFormParameters,
};

export const defaultKoneForm = (seed = 250405): KoneFormState => ({
  kind: "kone-form",
  family: "kone",
  seed: Math.max(0, Math.round(seed)),
  parameters: Object.fromEntries(koneFormParameters.map((parameter) => [parameter.id, parameter.default])),
});

export const effectDefinitions: EffectDefinition[] = [
  {
    type: "band-rupture", name: "Band Rupture", category: "Order",
    description: "Break horizontal memory into displaced bands and hard scars.",
    parameters: [
      { id: "rupture", label: "Rupture", description: "How far bands abandon alignment.", min: 0, max: 1, step: 0.01, default: 0.48 },
      { id: "bands", label: "Band Count", description: "Fewer creates slabs; more creates nervous strata.", min: 8, max: 160, step: 1, default: 72 },
      { id: "scar", label: "Scar Chance", description: "How often an interruption refuses the image.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "memory", label: "Retained Memory", description: "How strongly the source survives inside displaced bands.", min: 0, max: 1, step: 0.01, default: 0.72 },
    ],
  },
  {
    type: "wrong-sort", name: "Wrong Sort", category: "Order",
    description: "Sort only fragments, then deliberately abandon the rest.",
    parameters: [
      { id: "amount", label: "Completion", description: "How much of the image is allowed to become ordered.", min: 0, max: 1, step: 0.01, default: 0.42 },
      { id: "threshold", label: "Value Gate", description: "Which brightness territory is eligible to move.", min: 0, max: 1, step: 0.01, default: 0.32 },
      { id: "chunk", label: "Chunk", description: "The length of each local argument about order.", min: 4, max: 180, step: 1, default: 54 },
      { id: "direction", label: "Direction", description: "Horizontal or vertical sorting, forward or reversed.", min: 0, max: 3, step: 1, default: 0, choices: ["Right", "Left", "Down", "Up"] },
      { id: "channel", label: "Signal", description: "The channel whose value decides the order.", min: 0, max: 5, step: 1, default: 5, choices: ["Red", "Green", "Blue", "Hue", "Saturation", "Brightness"] },
    ],
  },
  {
    type: "median-filter", name: "Median Filter", category: "Order",
    description: "Order every 3 × 3 neighborhood by one color signal: the median heals noise, while off-center ranks grow painterly smears.",
    parameters: [
      { id: "position", label: "Neighborhood Rank", description: "Choose which of the nine locally ordered pixels replaces the center. Four is the true median.", min: 0, max: 8, step: 1, default: 3, choices: ["Lowest", "Low 2", "Low 3", "Near-median low", "True median", "Near-median high", "High 3", "High 2", "Highest"] },
      { id: "channel", label: "Ordering Signal", description: "The color evidence used to order each neighborhood; inverted signals reverse its pressure.", min: 0, max: 11, step: 1, default: 11, choices: ["Red", "Green", "Blue", "Hue", "Saturation", "Brightness", "Inverted red", "Inverted green", "Inverted blue", "Inverted hue", "Inverted saturation", "Inverted brightness"] },
      { id: "iterations", label: "Filter Passes", description: "Repeated passes let a subtle local choice spread into a larger liquid or brushed territory.", min: 1, max: 24, step: 1, default: 6 },
      { id: "blendMode", label: "Original Blend", description: "Optionally recombine the original image with the filtered result using the source sketch's blend logic.", min: 0, max: 6, step: 1, default: 0, choices: ["Filter only", "Overlay", "Hard light", "Screen", "Multiply", "Add", "Difference"] },
    ],
  },
  {
    type: "sorting-motion", name: "Sorting Motion", category: "Temporal",
    description: "Let a partial sorting method reach maximum order, release to the incoming image, and return in a seamless loop.",
    parameters: [
      { id: "method", label: "Method", description: "The temporal handwriting used to reorganize each fragment.", min: 0, max: 5, step: 1, default: 0, choices: ["Bubble", "Insertion", "Selection", "Merge", "Permute", "Roll"] },
      { id: "maximumOrder", label: "Maximum Order", description: "The strongest partial ordering reached at the loop boundary.", min: 0, max: 1, step: 0.01, default: 0.72 },
      { id: "span", label: "Fragment Span", description: "Length of each local interval allowed to negotiate a new order.", min: 8, max: 240, step: 1, default: 72 },
      { id: "channel", label: "Signal", description: "The color evidence that decides the order.", min: 0, max: 5, step: 1, default: 5, choices: ["Red", "Green", "Blue", "Hue", "Saturation", "Brightness"] },
      { id: "direction", label: "Travel", description: "The spatial direction receiving the reorganized fragments.", min: 0, max: 3, step: 1, default: 0, choices: ["Right", "Left", "Down", "Up"] },
      { id: "reverse", label: "Order Direction", description: "Choose whether low or high signal values lead each fragment.", min: 0, max: 1, step: 1, default: 0, choices: ["Low leads", "High leads"] },
    ],
  },
  {
    type: "ultimate-sort", name: "Ultimate Sort", category: "Order",
    description: "Stack independent sorting, selection-wand, and resolution recipes so different territories obey different rules.",
    parameters: [],
  },
  {
    type: "wizprocess", name: "Wizprocess", category: "Signal",
    description: "",
    parameters: [],
  },
  {
    type: "wavelet-cartography", name: "Wavelet Cartography", category: "Signal",
    description: "Wound the hidden two-dimensional map of scale and direction, then reconstruct its chromatic ruins.",
    parameters: [
      { id: "personality", label: "Personality", description: "Cartography maps coefficient territories; Chromatic Seance separates color memories; Wavelet Weather makes the map breathe.", min: 0, max: 2, step: 1, default: 0, choices: ["Cartography", "Chromatic Seance", "Wavelet Weather"] },
      { id: "transformBody", label: "Transform Body", description: "Pyramid concentrates damage through scale hierarchy; Packet Grid repeatedly subdivides the complete field.", min: 0, max: 1, step: 1, default: 0, choices: ["Pyramid", "Packet Grid"] },
      { id: "waveCharacter", label: "Wave Character", description: "The reconstruction handwriting carried by damaged coefficients.", min: 0, max: 5, step: 1, default: 1, choices: ["Block", "Flow", "Mirror", "Long Echo", "Bloom", "Shiver"] },
      { id: "transformScale", label: "Transform Scale", description: "Fine makes close textile grain; Balanced keeps the original map; Broad creates slower atmospheric bodies.", min: 0, max: 2, step: 1, default: 2, choices: ["Fine", "Balanced", "Broad"] },
      { id: "mapContinuity", label: "Map Continuity", description: "Repeat exposes the square apparatus; Wander misaligns each territory; Global transforms the image as one continuous field; Veil overlaps and softens tile borders.", min: 0, max: 3, step: 1, default: 2, choices: ["Repeat", "Wander", "Global", "Veil"] },
      { id: "colorBody", label: "Color Body", description: "RGB preserves component color; HSB lets hue, saturation, and brightness separate more violently.", min: 0, max: 1, step: 1, default: 0, choices: ["RGB", "HSB"] },
      { id: "channelBond", label: "Channel Bond", description: "Together shares one coefficient map; Separate lets the three color bodies disagree.", min: 0, max: 1, step: 1, default: 0, choices: ["Together", "Separate"] },
      { id: "territory", label: "Coefficient Territory", description: "The hidden geography made vulnerable to erasure and merging.", min: 0, max: 4, step: 1, default: 0, choices: ["Corners", "Borders", "Cross", "Interior", "XOR Islands"] },
      { id: "erasure", label: "Erasure", description: "How completely the chosen hidden territory loses information.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "coefficientMerge", label: "Coefficient Merge", description: "How strongly nearby coefficients collapse into larger structural echoes.", min: 0, max: 1, step: 0.01, default: 0.1 },
      { id: "colorIgnition", label: "Color Ignition", description: "Blend toward the source sketch's severe per-channel contrast equalization.", min: 0, max: 1, step: 0.01, default: 0.08 },
      { id: "sourceGhost", label: "Source Ghost", description: "How much intact incoming material returns through the reconstruction.", min: 0, max: 1, step: 0.01, default: 0.3 },
      { id: "mapDrift", label: "Map Drift", description: "Closed-loop travel through coefficient geography; still images remain held.", min: 0, max: 1, step: 0.01, default: 0.25 },
    ],
  },
  {
    type: "lz77-memory", name: "LZ77 Memory", category: "Signal",
    description: "Damage the backward references of compressed image memory so repeated material recalls the wrong place, duration, or value.",
    parameters: [
      { id: "memoryBody", label: "Memory Body", description: "Channel Memory lets three color streams remember separately; Raw Stream lets compression cross pixel and channel boundaries.", min: 0, max: 1, step: 1, default: 0, choices: ["Channel Memory", "Raw Stream"] },
      { id: "colorMemory", label: "Color Memory", description: "RGB retains component color; HSB lets hue, saturation, and brightness form independent histories in Channel Memory.", min: 0, max: 1, step: 1, default: 1, choices: ["RGB", "HSB"] },
      { id: "byteWeave", label: "Byte Weave", description: "Choose which pixel components sit beside one another in Raw Stream memory.", min: 0, max: 2, step: 1, default: 0, choices: ["ARGB", "RGBA", "BGRA"] },
      { id: "memoryReach", label: "Memory Reach", description: "How far backward the compressor may search for something the image has seen before.", min: 0, max: 3, step: 1, default: 2, choices: ["Near", "Room", "Deep", "Abyss"] },
      { id: "phraseSpan", label: "Phrase Span", description: "The longest repeated phrase that may be replaced by a memory instruction.", min: 0, max: 3, step: 1, default: 2, choices: ["Stutter", "Line", "Passage", "Long Echo"] },
      { id: "woundCharacter", label: "Wound Character", description: "Nudge perturbs gently; Misaddress wounds distance; Overrun wounds duration; Literal Fever wounds uncopied bytes; Mixed admits all three.", min: 0, max: 4, step: 1, default: 0, choices: ["Nudge", "Misaddress", "Overrun", "Literal Fever", "Mixed"] },
      { id: "attention", label: "Attention", description: "Choose which image evidence attracts damage to compressed phrases.", min: 0, max: 3, step: 1, default: 1, choices: ["Everywhere", "Light", "Saturation", "Red"] },
      { id: "damageAmount", label: "Damage Amount", description: "How many compression phrases become vulnerable.", min: 0, max: 1, step: 0.01, default: 0.06 },
      { id: "damageSeverity", label: "Damage Severity", description: "How far a wounded memory instruction may depart from what compression recorded.", min: 0, max: 1, step: 0.01, default: 0.34 },
      { id: "channelDivergence", label: "Channel Divergence", description: "How independently the three Channel Memory streams choose and alter their wounds.", min: 0, max: 1, step: 0.01, default: 0.28 },
      { id: "sourceGhost", label: "Source Ghost", description: "How much intact incoming material returns through damaged reconstruction.", min: 0, max: 1, step: 0.01, default: 0.3 },
      { id: "memoryTide", label: "Memory Tide", description: "Closed-loop movement through wounded phrases; still images hold one deterministic memory.", min: 0, max: 1, step: 0.01, default: 0.24 },
    ],
  },
  {
    type: "pixel-drift", name: "Pixel Drift", category: "Decay",
    description: "Let neighboring pixels pull the image into directional spectral erosion.",
    parameters: [
      { id: "distance", label: "Drift Distance", description: "How far each iteration reaches for its neighbor.", min: 1, max: 42, step: 1, default: 9 },
      { id: "iterations", label: "Decay Passes", description: "How many times the image forgets its prior boundary.", min: 1, max: 18, step: 1, default: 4 },
      { id: "hueMemory", label: "Hue Memory", description: "How stubbornly hue resists the drift.", min: 0, max: 1, step: 0.01, default: 0.82 },
      { id: "lightMemory", label: "Light Memory", description: "How stubbornly brightness resists the drift.", min: 0, max: 1, step: 0.01, default: 0.38 },
      { id: "direction", label: "Direction", description: "The direction of the erosion current.", min: 0, max: 3, step: 1, default: 0, choices: ["Right", "Left", "Down", "Up"] },
    ],
  },
  {
    type: "signal-echo", name: "Signal Echo", category: "Signal",
    description: "Misregister color signal, scan phase, and remembered transmissions.",
    parameters: [
      { id: "separation", label: "Channel Separation", description: "Distance between the color ghosts.", min: 0, max: 64, step: 1, default: 13 },
      { id: "bleed", label: "Chroma Bleed", description: "How far color spills outside form.", min: 0, max: 1, step: 0.01, default: 0.54 },
      { id: "scan", label: "Scan Pressure", description: "Visibility and violence of scanning structure.", min: 0, max: 1, step: 0.01, default: 0.28 },
      { id: "ghost", label: "Ghost Memory", description: "Strength of the delayed image echo.", min: 0, max: 1, step: 0.01, default: 0.46 },
    ],
  },
  {
    type: "pcm-possession", name: "PCM Possession", category: "Audio",
    description: "Misread ordered image bytes as incompatible audio samples until color acquires waveform scars.",
    parameters: [
      { id: "readingPath", label: "Reading Path", description: "The route that turns image space into signal time.", min: 0, max: 4, step: 1, default: 0, choices: ["Rows", "Columns", "Snake", "Reverse", "Broken Blocks"] },
      { id: "sampleFlesh", label: "Sample Flesh", description: "The incompatible sample body used to interpret image bytes.", min: 0, max: 4, step: 1, default: 1, choices: ["Unsigned 8-bit", "Signed 8-bit", "16-bit Little Endian", "16-bit Big Endian", "Floating Rupture"] },
      { id: "byteOrder", label: "Byte Order", description: "Which color bodies become neighboring samples in the stream.", min: 0, max: 5, step: 1, default: 0, choices: ["RGB", "BGR", "RGBA", "ARGB", "BGRA", "Opponent"] },
      { id: "sampleRate", label: "Sample Rate", description: "How quickly the possessed stream moves through the image.", min: 0.25, max: 4, step: 0.01, default: 1.08 },
      { id: "bitDepth", label: "Bit Depth", description: "How many amplitude steps survive the misreading.", min: 2, max: 8, step: 1, default: 7 },
      { id: "dcDisplacement", label: "DC Displacement", description: "Push the entire signal toward one chromatic electrical pole.", min: -1, max: 1, step: 0.01, default: 0.08 },
      { id: "channelIndependence", label: "Channel Independence", description: "How differently the three color tracks misunderstand time.", min: 0, max: 1, step: 0.01, default: 0.35 },
      { id: "sourceMemory", label: "Source Memory", description: "Intact incoming image returned after possession.", min: 0, max: 1, step: 0.01, default: 0.3 },
      { id: "motion", label: "Possession Motion", description: "Closed-loop drift through incompatible sample alignment.", min: 0, max: 1, step: 0.01, default: 0.2 },
    ],
  },
  {
    type: "tape-transport", name: "Tape Transport", category: "Audio",
    description: "Drag image time through damaged speed zones, reversals, splices, flutter, and dropout.",
    parameters: [
      { id: "readingPath", label: "Reading Path", description: "The route carried past the damaged tape head.", min: 0, max: 4, step: 1, default: 0, choices: ["Rows", "Columns", "Snake", "Reverse", "Broken Blocks"] },
      { id: "speedZones", label: "Speed Zones", description: "How many regions disagree about transport speed.", min: 1, max: 64, step: 1, default: 12 },
      { id: "speed", label: "Tape Speed", description: "The base rate of visual time through the transport.", min: 0.25, max: 3, step: 0.01, default: 1.08 },
      { id: "stretch", label: "Tape Stretch", description: "How far local speed zones may lengthen or compress anatomy.", min: 0, max: 1, step: 0.01, default: 0.26 },
      { id: "reverseSpan", label: "Reverse Span", description: "How much of a chosen splice travels backward.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "spliceSize", label: "Splice Size", description: "Length of each possible cut in signal time.", min: 2, max: 256, step: 1, default: 42 },
      { id: "spliceFrequency", label: "Splice Frequency", description: "How often the tape is cut and rejoined elsewhere.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "wow", label: "Wow", description: "Slow broad transport breathing.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "flutter", label: "Flutter", description: "Fast nervous transport vibration.", min: 0, max: 1, step: 0.01, default: 0.12 },
      { id: "dropout", label: "Dropout", description: "Probability that a splice loses signal entirely.", min: 0, max: 0.8, step: 0.01, default: 0.05 },
      { id: "sourceMemory", label: "Source Memory", description: "Intact incoming material returned after transport.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "motion", label: "Transport Motion", description: "Closed-loop travel through wow, flutter, and splice locations.", min: 0, max: 1, step: 0.01, default: 0.35 },
    ],
  },
  {
    type: "phase-choir", name: "Phase Choir", category: "Audio",
    description: "Let virtual color tracks arrive late, invert, crossfeed, amplify, and cancel one another.",
    parameters: [
      { id: "readingPath", label: "Reading Path", description: "The timeline shared by the virtual tracks.", min: 0, max: 4, step: 1, default: 0, choices: ["Rows", "Columns", "Snake", "Reverse", "Broken Blocks"] },
      { id: "trackBody", label: "Track Body", description: "How image color is divided into virtual audio tracks.", min: 0, max: 3, step: 1, default: 0, choices: ["RGB Choir", "Staggered Channels", "Opponent Twins", "Luma-Chroma"] },
      { id: "trackReunion", label: "Track Reunion", description: "How conflicting tracks are recombined into color.", min: 0, max: 5, step: 1, default: 3, choices: ["Standard", "Add", "Subtract", "Difference", "Maximum", "Minimum"] },
      { id: "redDelay", label: "Red Arrival", description: "Red track delay in signal samples.", min: -256, max: 256, step: 1, default: 18 },
      { id: "greenDelay", label: "Green Arrival", description: "Green track delay in signal samples.", min: -256, max: 256, step: 1, default: -8 },
      { id: "blueDelay", label: "Blue Arrival", description: "Blue track delay in signal samples.", min: -256, max: 256, step: 1, default: 34 },
      { id: "redPolarity", label: "Red Polarity", description: "Let red agree with or electrically oppose itself.", min: 0, max: 1, step: 1, default: 0, choices: ["Forward", "Inverted"] },
      { id: "greenPolarity", label: "Green Polarity", description: "Let green agree with or electrically oppose itself.", min: 0, max: 1, step: 1, default: 0, choices: ["Forward", "Inverted"] },
      { id: "bluePolarity", label: "Blue Polarity", description: "Let blue agree with or electrically oppose itself.", min: 0, max: 1, step: 1, default: 1, choices: ["Forward", "Inverted"] },
      { id: "crossfeed", label: "Crossfeed", description: "How much each track leaks into the next.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "phaseDrift", label: "Phase Drift", description: "Continuous disagreement between track timing.", min: 0, max: 1, step: 0.01, default: 0.28 },
      { id: "cancellation", label: "Cancellation Depth", description: "How deeply opposing tracks carve dark absence.", min: 0, max: 1, step: 0.01, default: 0.42 },
      { id: "sourceMemory", label: "Source Memory", description: "Intact incoming material returned beneath the choir.", min: 0, max: 1, step: 0.01, default: 0.22 },
      { id: "motion", label: "Choir Motion", description: "Closed-loop phase breathing between tracks.", min: 0, max: 1, step: 0.01, default: 0.36 },
    ],
  },
  {
    type: "spectral-surgery", name: "Spectral Surgery", category: "Audio",
    description: "Open short frequency windows and operate on magnitude, phase, or both before reconstruction.",
    parameters: [
      { id: "readingPath", label: "Reading Path", description: "Analyze horizontal or vertical signal time.", min: 0, max: 1, step: 1, default: 0, choices: ["Rows", "Columns"] },
      { id: "windowScale", label: "Window Scale", description: "From fine spectral grain to broad harmonic architecture.", min: 0, max: 3, step: 1, default: 2, choices: ["8 samples", "16 samples", "32 samples", "64 samples"] },
      { id: "windowOverlap", label: "Window Overlap", description: "How strongly neighboring spectral decisions inhabit one another.", min: 0, max: 3, step: 1, default: 1, choices: ["None", "Quarter", "Half", "Three-quarter"] },
      { id: "spectralEvidence", label: "Spectral Evidence", description: "Operate on energy, timing, or both kinds of frequency evidence.", min: 0, max: 2, step: 1, default: 0, choices: ["Magnitude", "Phase", "Both"] },
      { id: "frequencyTerritory", label: "Frequency Territory", description: "The portion of the spectrum placed under the knife.", min: 0, max: 5, step: 1, default: 2, choices: ["Bass", "Mid", "Treble", "Peaks", "Valleys", "Custom"] },
      { id: "bandCenter", label: "Band Center", description: "Center of the custom vulnerable frequency body.", min: 0, max: 1, step: 0.01, default: 0.5 },
      { id: "bandWidth", label: "Band Width", description: "Reach of the custom vulnerable frequency body.", min: 0.02, max: 1, step: 0.01, default: 0.28 },
      { id: "operation", label: "Operation", description: "The surgical act performed on selected frequencies.", min: 0, max: 6, step: 1, default: 4, choices: ["Erase", "Shift", "Stretch", "Freeze", "Smear", "Mirror", "Wrap"] },
      { id: "pressure", label: "Surgical Pressure", description: "How far selected frequency evidence departs from its original body.", min: 0, max: 1, step: 0.01, default: 0.46 },
      { id: "channelBond", label: "Channel Bond", description: "Whether channels share one spectral decision or split apart.", min: 0, max: 1, step: 1, default: 0, choices: ["Together", "Separate"] },
      { id: "sourceMemory", label: "Source Memory", description: "Intact incoming image returned after reconstruction.", min: 0, max: 1, step: 0.01, default: 0.32 },
      { id: "motion", label: "Spectral Motion", description: "Closed-loop migration through vulnerable frequencies.", min: 0, max: 1, step: 0.01, default: 0.24 },
    ],
  },
  {
    type: "echo-architecture", name: "Echo Architecture", category: "Audio",
    description: "Construct image space from multi-tap delay, feedback, cross-channel return, and comb resonance.",
    parameters: [
      { id: "readingPath", label: "Reading Path", description: "The timeline through which echoes return.", min: 0, max: 4, step: 1, default: 0, choices: ["Rows", "Columns", "Snake", "Reverse", "Broken Blocks"] },
      { id: "trackBody", label: "Track Body", description: "How image color enters the delay network.", min: 0, max: 3, step: 1, default: 0, choices: ["RGB Choir", "Staggered Channels", "Opponent Twins", "Luma-Chroma"] },
      { id: "trackReunion", label: "Track Reunion", description: "How delayed tracks rebuild the image.", min: 0, max: 5, step: 1, default: 1, choices: ["Standard", "Add", "Subtract", "Difference", "Maximum", "Minimum"] },
      { id: "delayDistance", label: "Delay Distance", description: "Signal distance to the first returning image memory.", min: 1, max: 512, step: 1, default: 38 },
      { id: "taps", label: "Echo Taps", description: "Number of independently decaying returns.", min: 1, max: 8, step: 1, default: 3 },
      { id: "feedback", label: "Feedback", description: "How strongly echoes become material for later echoes.", min: 0, max: 1, step: 0.01, default: 0.46 },
      { id: "decay", label: "Decay", description: "How quickly successive returns relinquish the image.", min: 0, max: 1, step: 0.01, default: 0.7 },
      { id: "crossFeedback", label: "Cross-channel Feedback", description: "How much one color track returns through another.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "reverseFeedback", label: "Reverse Feedback", description: "How much returning signal travels backward.", min: 0, max: 1, step: 0.01, default: 0.14 },
      { id: "combResonance", label: "Comb Resonance", description: "Regular interference between original and delayed signal.", min: 0, max: 1, step: 0.01, default: 0.22 },
      { id: "delayMutation", label: "Delay Mutation", description: "Seeded disagreement among echo distances.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "sourceMemory", label: "Source Memory", description: "Intact incoming image returned beneath the echoes.", min: 0, max: 1, step: 0.01, default: 0.22 },
      { id: "motion", label: "Echo Motion", description: "Closed-loop breathing of delay positions.", min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
  },
  {
    type: "clip-furnace", name: "Clip Furnace", category: "Audio",
    description: "Drive image amplitude through explicit clipping, folding, wrapping, and crushing bodies.",
    parameters: [
      { id: "readingPath", label: "Reading Path", description: "The signal route entering the furnace.", min: 0, max: 4, step: 1, default: 0, choices: ["Rows", "Columns", "Snake", "Reverse", "Broken Blocks"] },
      { id: "trackBody", label: "Track Body", description: "How color is divided before amplitude damage.", min: 0, max: 3, step: 1, default: 0, choices: ["RGB Choir", "Staggered Channels", "Opponent Twins", "Luma-Chroma"] },
      { id: "trackReunion", label: "Track Reunion", description: "How burned tracks re-form color.", min: 0, max: 5, step: 1, default: 0, choices: ["Standard", "Add", "Subtract", "Difference", "Maximum", "Minimum"] },
      { id: "furnaceBody", label: "Furnace Body", description: "The nonlinear material governing signal beyond its thresholds.", min: 0, max: 4, step: 1, default: 2, choices: ["Hard Clip", "Soft Clip", "Foldback", "Wrap", "Crush"] },
      { id: "inputGain", label: "Input Gain", description: "How hard the image is driven into the furnace.", min: 0.25, max: 8, step: 0.01, default: 1.8 },
      { id: "positiveThreshold", label: "Positive Threshold", description: "Upper amplitude boundary before damage.", min: 0.05, max: 1, step: 0.01, default: 0.72 },
      { id: "negativeThreshold", label: "Negative Threshold", description: "Lower amplitude boundary before damage.", min: 0.05, max: 1, step: 0.01, default: 0.65 },
      { id: "dcBias", label: "DC Bias", description: "Lean the furnace toward light or dark electrical pressure.", min: -1, max: 1, step: 0.01, default: 0.08 },
      { id: "bitDepth", label: "Bit Depth", description: "Amplitude steps surviving after the furnace.", min: 2, max: 8, step: 1, default: 6 },
      { id: "channelSpread", label: "Channel Threshold Spread", description: "How differently each color track reaches its threshold.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "sourceMemory", label: "Burn Return", description: "Intact incoming material returned after burning.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "motion", label: "Furnace Motion", description: "Closed-loop breathing of gain and thresholds.", min: 0, max: 1, step: 0.01, default: 0.12 },
    ],
  },
  {
    type: "silence-knife", name: "Silence Knife", category: "Audio",
    description: "Cut rhythmic absence through the image using signal evidence, attack, release, and repeated holds.",
    parameters: [
      { id: "readingPath", label: "Reading Path", description: "The timeline along which silence is cut.", min: 0, max: 4, step: 1, default: 0, choices: ["Rows", "Columns", "Snake", "Reverse", "Broken Blocks"] },
      { id: "trackBody", label: "Track Body", description: "The virtual track evidence presented to the gate.", min: 0, max: 3, step: 1, default: 0, choices: ["RGB Choir", "Staggered Channels", "Opponent Twins", "Luma-Chroma"] },
      { id: "gateSignal", label: "Gate Signal", description: "The image evidence deciding when signal becomes silence.", min: 0, max: 6, step: 1, default: 0, choices: ["Light", "Hue", "Saturation", "Red", "Green", "Blue", "Amplitude"] },
      { id: "gateThreshold", label: "Gate Threshold", description: "The boundary between living signal and deliberate absence.", min: 0, max: 1, step: 0.01, default: 0.48 },
      { id: "attack", label: "Attack", description: "How sharply silence enters.", min: 0, max: 1, step: 0.01, default: 0.08 },
      { id: "release", label: "Release", description: "How slowly image signal returns after a cut.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "silenceSpan", label: "Silence Span", description: "Length of each possible dead signal body.", min: 1, max: 256, step: 1, default: 32 },
      { id: "repetition", label: "Repetition", description: "Rhythmic divisions governing repeated cuts.", min: 1, max: 32, step: 1, default: 6 },
      { id: "hold", label: "Hold", description: "How stubbornly a cut refuses returning signal.", min: 0, max: 1, step: 0.01, default: 0.36 },
      { id: "fillBody", label: "Silence Body", description: "The material occupying gated signal.", min: 0, max: 4, step: 1, default: 0, choices: ["Black", "White", "Transparent", "Previous Signal", "Neighbor Track"] },
      { id: "sourceMemory", label: "Source Memory", description: "Intact incoming image returned beneath the cuts.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "motion", label: "Gate Motion", description: "Closed-loop movement of rhythmic silence.", min: 0, max: 1, step: 0.01, default: 0.28 },
    ],
  },
  {
    type: "dither-field", name: "Dither Field", category: "Quantize",
    description: "Let error travel coherently, then allow selected habitats to crystallize as varied pixel material.",
    parameters: [
      { id: "travel", label: "Error Travel", description: "The route quantization error takes through the image.", min: 0, max: 4, step: 1, default: 1, choices: ["Ordered Weave", "Forward Current", "Serpentine Current", "Blue Dust", "Boundary Leak"] },
      { id: "paletteLogic", label: "Palette Truth", description: "Whether color follows the source or the Temple palette and its order.", min: 0, max: 3, step: 1, default: 2, choices: ["Source Steps", "Nearest Temple", "Tonal Ladder", "Broken Ladder"] },
      { id: "body", label: "Dither Body", description: "The physical mark used to reconstruct every sampled cell.", min: 0, max: 4, step: 1, default: 0, choices: ["Pixel", "Circle", "Line", "Shard", "Window"] },
      { id: "habitat", label: "Dither Habitat", description: "Where dither becomes matter instead of covering the image as one uniform surface.", min: 0, max: 3, step: 1, default: 2, choices: ["Uniform Field", "Tonal Islands", "Weather Patches", "Edge Colonies"] },
      { id: "reach", label: "Dither Reach", description: "How much of the chosen habitat is allowed to crystallize into dither material.", min: 0.05, max: 1, step: 0.01, default: 0.56 },
      { id: "habitatScale", label: "Habitat Scale", description: "Size of the regions that share one local dither climate.", min: 8, max: 240, step: 1, default: 72 },
      { id: "diversity", label: "Material Diversity", description: "How strongly neighboring habitats differ in mark scale, body, and palette allegiance.", min: 0, max: 1, step: 0.01, default: 0.68 },
      { id: "grain", label: "Cell Scale", description: "Size of the sampled cells and their reconstructed marks.", min: 1, max: 24, step: 1, default: 4 },
      { id: "levels", label: "Color Steps", description: "How many signal levels remain available before palette interpretation.", min: 2, max: 16, step: 1, default: 5 },
      { id: "pressure", label: "Error Pressure", description: "How strongly quantization error travels into neighboring cells.", min: 0, max: 1.5, step: 0.01, default: 0.82 },
      { id: "sourceReturn", label: "Source Return", description: "How much intact incoming image breathes back through the dither body.", min: 0, max: 1, step: 0.01, default: 0.16 },
      { id: "channelOffset", label: "Channel Offset", description: "Separates red and blue sampling when Source Steps is active.", min: 0, max: 24, step: 1, default: 0 },
    ],
  },
  {
    type: "parliament-of-pixels", name: "Parliament of Pixels", category: "Quantize",
    description: "Let pixel districts argue over color and misread the same image as incompatible file dialects.",
    parameters: [
      { id: "districtSize", label: "District Size", description: "Scale of each local electorate; small districts chatter while large districts become competing territories.", min: 8, max: 180, step: 1, default: 54 },
      { id: "parties", label: "Color Parties", description: "How many quantized positions remain available during the vote.", min: 2, max: 8, step: 1, default: 5 },
      { id: "dialect", label: "File Dialect", description: "Mixed lets every district misidentify the file independently; the others impose one shared delusion.", min: 0, max: 4, step: 1, default: 0, choices: ["Mixed Parliament", "Indexed GIF", "Raw RGB", "One-bit Fax", "Broken Video"] },
      { id: "ballotGrain", label: "Ballot Grain", description: "Size of the ordered, noisy, striped, or fax-like dither marks used to cast each vote.", min: 1, max: 12, step: 1, default: 2 },
      { id: "majorityRule", label: "Majority Rule", description: "How strongly each district forces its dominant color onto individual pixels.", min: 0, max: 1, step: 0.01, default: 0.64 },
      { id: "minorityPersistence", label: "Minority Persistence", description: "How often dissenting local color survives the district decision.", min: 0, max: 1, step: 0.01, default: 0.3 },
      { id: "migration", label: "Border Migration", description: "How far districts borrow pixels from neighboring territories.", min: 0, max: 1, step: 0.01, default: 0.46 },
      { id: "coup", label: "Coup Chance", description: "How often a district abruptly changes its palette allegiance or file dialect.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "channelDisagreement", label: "Channel Disagreement", description: "How independently red, green, and blue interpret the result.", min: 0, max: 1, step: 0.01, default: 0.48 },
      { id: "sourceMemory", label: "Source Memory", description: "How much intact incoming image remains beneath the political reconstruction.", min: 0, max: 1, step: 0.01, default: 0.2 },
    ],
  },
  {
    type: "tectonic-lens", name: "Tectonic Lens", category: "Spatial",
    description: "Break the image into organic territories, then let each body obey its own lens law.",
    parameters: [
      { id: "territoryDetail", label: "Territory Detail", description: "Higher values follow smaller structures; lower values produce larger tectonic bodies.", min: 24, max: 180, step: 1, default: 84 },
      { id: "boundarySignal", label: "Boundary Signal", description: "Which disagreement between neighbors decides where faults appear.", min: 0, max: 4, step: 1, default: 0, choices: ["RGB Distance", "Hue", "Light", "Saturation", "Edge Conflict"] },
      { id: "boundarySensitivity", label: "Boundary Sensitivity", description: "How strongly unlike neighbors may still join the same territory.", min: 0.05, max: 1, step: 0.01, default: 0.46 },
      { id: "minimumTerritory", label: "Smallest Territory", description: "Tiny fragments below this body size merge through their quietest boundary.", min: 1, max: 64, step: 1, default: 8 },
      { id: "dominantLaw", label: "Dominant Law", description: "The coordinate law most territories inherit before diversity intervenes.", min: 0, max: 3, step: 1, default: 2, choices: ["Linear Drift", "Power Fold", "Sinusoidal Current", "Polar Vortex"] },
      { id: "lensSignal", label: "Lens Signal", description: "Which color evidence inside each territory drives its displacement.", min: 0, max: 6, step: 1, default: 1, choices: ["Light", "Hue", "Saturation", "Red", "Green", "Blue", "Opponent"] },
      { id: "lensPressure", label: "Lens Pressure", description: "How forcefully image signal bends coordinates inside each territory.", min: 0, max: 1.5, step: 0.01, default: 0.48 },
      { id: "lawDiversity", label: "Law Diversity", description: "From one shared law to independent coordinate laws across territories.", min: 0, max: 1, step: 0.01, default: 0.72 },
      { id: "separation", label: "Separation", description: "How far territories abandon their original positions.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "rotation", label: "Rotation", description: "How strongly territories disagree about their local orientation.", min: 0, max: 1, step: 0.01, default: 0.14 },
      { id: "echo", label: "Echo", description: "Chance that a territory samples a displaced neighboring memory.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "absence", label: "Absence", description: "Chance that a territory refuses reconstruction and becomes ground.", min: 0, max: 0.8, step: 0.01, default: 0.08 },
      { id: "boundaryInfection", label: "Boundary Infection", description: "Chromatic displacement concentrated along faults between territories.", min: 0, max: 1, step: 0.01, default: 0.46 },
      { id: "sourceMemory", label: "Source Memory", description: "How much intact incoming image survives beneath the territorial reconstruction.", min: 0, max: 1, step: 0.01, default: 0.32 },
      { id: "motion", label: "Loop Motion", description: "Closed-loop breathing of displacement and rotation while territory borders remain stable.", min: 0, max: 1, step: 0.01, default: 0.28 },
    ],
  },
  {
    type: "lens-warp", name: "Lens Warp", category: "Spatial",
    description: "Use the image's own signal as a lens that bends its coordinates.",
    parameters: [
      { id: "bendX", label: "Horizontal Bend", description: "How much signal displaces the horizontal axis.", min: 0, max: 1, step: 0.01, default: 0.22 },
      { id: "bendY", label: "Vertical Bend", description: "How much signal displaces the vertical axis.", min: 0, max: 1, step: 0.01, default: 0.14 },
      { id: "frequency", label: "Lens Frequency", description: "How often the lens changes its mind across the image.", min: 0.2, max: 12, step: 0.1, default: 3.4 },
      { id: "mode", label: "Lens Shape", description: "Linear, sinusoidal, or polar coordinate pressure.", min: 0, max: 2, step: 1, default: 1, choices: ["Linear", "Sinusoidal", "Polar"] },
    ],
  },
  {
    type: "mirror-cut", name: "Mirror Cut", category: "Fold",
    description: "Fold axes and diagonals into asymmetric copied architecture.",
    parameters: [
      { id: "mode", label: "Fold", description: "Axis, diagonal, shifted, or kaleidoscopic copy.", min: 0, max: 5, step: 1, default: 2, choices: ["Left", "Right", "Top", "Bottom", "Diagonal", "Shifted"] },
      { id: "offset", label: "Cut Offset", description: "Where the copied structure stops obeying symmetry.", min: -1, max: 1, step: 0.01, default: 0.16 },
      { id: "mix", label: "Fold Memory", description: "Balance between the prior image and its folded replacement.", min: 0, max: 1, step: 0.01, default: 0.74 },
    ],
  },
  {type:"surface-motion",name:"Surface Motion",category:"Temporal",description:"Slip, ripple or separate a surface; rebuild it with pixels or your own ASCII alphabet. Each region has its own motion.",parameters:[{"id": "behavior", "label": "Behavior", "description": "Behavior", "min": 0, "max": 2, "step": 1, "default": 0, "choices": ["Slip", "Ripple", "Separate"]},{"id": "material", "label": "Material", "description": "Material", "min": 0, "max": 2, "step": 1, "default": 1, "choices": ["Image", "Pixels", "ASCII"]},{"id": "motion", "label": "Motion amount", "description": "Motion amount", "min": 0, "max": 1, "step": 0.005, "default": 0.25},{"id": "scale", "label": "Wave / section count", "description": "Wave / section count", "min": 1, "max": 24, "step": 0.1, "default": 6},{"id": "angle", "label": "Flow angle", "description": "Flow angle", "min": -180, "max": 180, "step": 1, "default": 90},{"id": "speed", "label": "Speed", "description": "Speed", "min": 0, "max": 4, "step": 0.125, "default": 1},{"id": "cycles", "label": "Cycles per base loop", "description": "Cycles per base loop", "min": -8, "max": 8, "step": 1, "default": 1},{"id": "cellSize", "label": "Cell size", "description": "Cell size", "min": 2, "max": 48, "step": 0.25, "default": 8},{"id": "gap", "label": "Gaps", "description": "Gaps", "min": 0, "max": 0.85, "step": 0.005, "default": 0.12},{"id": "materialMix", "label": "Material mix", "description": "Material mix", "min": 0, "max": 1, "step": 0.005, "default": 0.7},{"id": "keepShape", "label": "Boundary", "description": "Boundary", "min": 0, "max": 1, "step": 1, "default": 1, "choices": ["Free surface", "Keep silhouette"]},{"id": "cutoff", "label": "Dark cutoff", "description": "Dark cutoff", "min": 0, "max": 0.8, "step": 0.005, "default": 0.025},{"id": "colorMode", "label": "Material colors", "description": "Material colors", "min": 0, "max": 1, "step": 1, "default": 0, "choices": ["Image colors", "Two colors"]},{"id": "inkColor", "label": "Ink", "description": "Ink", "min": 0, "max": 16777215, "step": 1, "default": 15984846},{"id": "groundColor", "label": "Background", "description": "Background", "min": 0, "max": 16777215, "step": 1, "default": 526605},{"id": "amount", "label": "Effect mix", "description": "Effect mix", "min": 0, "max": 1, "step": 0.005, "default": 1}]},
  {
    type: "palette-cycle", name: "Palette Cycle", category: "Temporal",
    description: "Keep pixels fixed while colors circulate through an indexed palette. Use image colors or send studio colors through light bands and spatial paths.",
    parameters: [
      { id: "speed", label: "Cycle speed", description: "Palette-only speed multiplier. Slower rates extend the seamless export while other motion repeats.", min: 0, max: 4, step: .125, default: 1 },
      { id: "paletteSource", label: "Colors from", description: "Image extracts a palette from the image arriving at this step; Studio uses your four palette colors.", min: 0, max: 2, step: 1, default: 0, choices: ["Image", "Studio", "Custom"] },
      { id: "mapping", label: "Color placement", description: "Choose what determines each fixed palette index.", min: 0, max: 3, step: 1, default: 0, choices: ["Image colors", "Light bands", "Along direction", "Around center"] },
      { id: "blend", label: "Transitions", description: "Stepped changes whole palette slots; Blended interpolates between them.", min: 0, max: 1, step: 1, default: 1, choices: ["Stepped", "Blended"] },
      { id: "colors", label: "Color count", description: "Number of fixed palette slots.", min: 2, max: 32, step: 1, default: 16 },
      { id: "firstColor", label: "First cycling color", description: "First numbered slot participating in the cycle.", min: 1, max: 32, step: 1, default: 1 },
      { id: "lastColor", label: "Last cycling color", description: "Last numbered slot; slots outside the range keep their original pixels.", min: 1, max: 32, step: 1, default: 32 },
      { id: "cycles", label: "Cycles per loop", description: "Whole palette turns per exported loop. Negative reverses; zero holds the colors.", min: -8, max: 8, step: 1, default: 1 },
      { id: "offset", label: "Color offset", description: "Move the starting point through the selected palette range.", min: 0, max: 1, step: .005, default: 0 },
      { id: "bands", label: "Band count", description: "How many times the palette repeats across the light or spatial map.", min: 1, max: 24, step: 1, default: 3 },
      { id: "angle", label: "Flow angle", description: "Direction of the fixed color bands in degrees.", min: -180, max: 180, step: 1, default: 0 },
      { id: "centerX", label: "Center X", description: "Horizontal center of circular color flow.", min: 0, max: 1, step: .005, default: .5 },
      { id: "centerY", label: "Center Y", description: "Vertical center of circular color flow.", min: 0, max: 1, step: .005, default: .5 },
      { id: "amount", label: "Cycle mix", description: "Blend indexed cycling with the incoming image. Zero restores it exactly.", min: 0, max: 1, step: .005, default: 1 },
    ],
  },
  {
    type: "motion-leak", name: "Motion Leak", category: "Temporal",
    description: "Make a still misremember itself as damaged predictive video blocks.",
    parameters: [
      { id: "block", label: "Prediction Block", description: "Size of the false codec memory units.", min: 4, max: 64, step: 2, default: 16 },
      { id: "vector", label: "Motion Vector", description: "How far a block reaches into the wrong remembered place.", min: 0, max: 96, step: 1, default: 28 },
      { id: "leak", label: "Reference Leak", description: "How many blocks accept the false prediction.", min: 0, max: 1, step: 0.01, default: 0.58 },
      { id: "residual", label: "Residual Memory", description: "How much of the current image survives over predicted blocks.", min: 0, max: 1, step: 0.01, default: 0.34 },
      { id: "coherence", label: "Vector Coherence", description: "From granular block noise to a shared directional failure.", min: 0, max: 1, step: 0.01, default: 0.67 },
    ],
  },
  {
    type: "signal-relief", name: "Signal Relief", category: "Spatial",
    description: "Reconstruct the image as separated lights whose brightness, absence, depth, and flicker form a living low-resolution terrain.",
    parameters: [
      { id: "density", label: "Field Density", description: "Number of luminous columns: sparse fields become apparitions, dense fields retain more evidence.", min: 18, max: 180, step: 1, default: 72 },
      { id: "body", label: "Emitter Body", description: "The physical mark carried by every point of light.", min: 0, max: 4, step: 1, default: 1, choices: ["Pin", "Halo", "Slit", "Cross", "Temple Window"] },
      { id: "emitterSize", label: "Emitter Size", description: "Size of each luminous body relative to the darkness between emitters.", min: 0.12, max: 1.4, step: 0.01, default: 0.44 },
      { id: "lightSignal", label: "Light Signal", description: "Image evidence that decides which emitters wake.", min: 0, max: 4, step: 1, default: 0, choices: ["Brightness", "Darkness", "Edges", "Saturation", "Weather"] },
      { id: "threshold", label: "Light Threshold", description: "The point where weak evidence becomes darkness and stronger evidence becomes light.", min: 0, max: 1, step: 0.01, default: 0.34 },
      { id: "signalCurve", label: "Signal Curve", description: "From a mist of weak lights to severe on-off constellations.", min: 0.25, max: 4, step: 0.01, default: 1.35 },
      { id: "polarity", label: "Figure Polarity", description: "Let image evidence illuminate the figure or extinguish it inside a living field.", min: 0, max: 1, step: 1, default: 0, choices: ["Light Apparition", "Dark Absence"] },
      { id: "reliefSource", label: "Relief Source", description: "A second signal that decides the height and slope of the luminous terrain.", min: 0, max: 3, step: 1, default: 2, choices: ["Brightness", "Darkness", "Edges", "Weather"] },
      { id: "reliefDepth", label: "Relief Depth", description: "Apparent height, shadow, and perspective carried by the emitter field.", min: 0, max: 1, step: 0.01, default: 0.42 },
      { id: "fieldYield", label: "Field Yield", description: "How far the orderly lattice submits to local relief slopes and buckles around the image.", min: 0, max: 1, step: 0.01, default: 0.58 },
      { id: "flicker", label: "Flicker Life", description: "Seamless electrical variation carried independently by every emitter.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "afterglow", label: "Afterglow", description: "Halo and faint memory surrounding active light bodies.", min: 0, max: 1, step: 0.01, default: 0.34 },
      { id: "lightColor", label: "Light Color", description: "White emitters, one Temple color family, or sampled incoming color.", min: 0, max: 2, step: 1, default: 0, choices: ["White Light", "Temple Palette", "Source Color"] },
    ],
  },
  {
    type: "almost-alive", name: "Almost Alive", category: "Spatial",
    description: "Reduce the image to just enough blocks, threads, scratches, and color for the mind to invent a living thing.",
    parameters: [
      { id: "evidenceScale", label: "Evidence Scale", description: "How many possible life signs cross the image: low values become blunt apparitions, high values retain finer clues.", min: 16, max: 120, step: 1, default: 48 },
      { id: "lifeSignal", label: "Life Signal", description: "The image evidence from which the apparition learns to exist.", min: 0, max: 4, step: 1, default: 2, choices: ["Light", "Dark", "Edges", "Color", "Weather"] },
      { id: "recognition", label: "Recognition Gate", description: "How strong a clue must become before the mind is allowed to see it.", min: 0, max: 0.95, step: 0.01, default: 0.34 },
      { id: "breathingRoom", label: "Breathing Room", description: "Remove convincing marks too, leaving space for the viewer to complete the organism.", min: 0, max: 0.95, step: 0.01, default: 0.46 },
      { id: "markBody", label: "Mark Body", description: "The small physical gesture from which the apparition is assembled.", min: 0, max: 3, step: 1, default: 1, choices: ["Dust", "Thread", "Block", "Scratch"] },
      { id: "bodySize", label: "Body Size", description: "The weight of each surviving mark without changing how many are alive.", min: 0.15, max: 1.8, step: 0.01, default: 0.72 },
      { id: "lifeSigns", label: "Life Signs", description: "How eagerly nearby fragments recognize one another and form a web body.", min: 0, max: 1, step: 0.01, default: 0.42 },
      { id: "webReach", label: "Web Reach", description: "How far a mark may reach across absence to find a companion.", min: 1, max: 4, step: 1, default: 2 },
      { id: "world", label: "World", description: "A quiet paper room or a dark screen in which the evidence glows.", min: 0, max: 1, step: 1, default: 1, choices: ["Paper", "Night"] },
      { id: "colorLife", label: "Color Life", description: "Graphite restraint, tender softened color, electric palette life, or remembered source color.", min: 0, max: 3, step: 1, default: 2, choices: ["Ink", "Tender", "Electric", "Source"] },
      { id: "colorMischief", label: "Color Mischief", description: "Let neighboring colors exchange identities and channels without changing the organism's skeleton.", min: 0, max: 1, step: 0.01, default: 0.32 },
      { id: "restlessness", label: "Restlessness", description: "Seamless local rearrangement: the apparition stays recognizable while its evidence refuses to settle.", min: 0, max: 1, step: 0.01, default: 0.14 },
    ],
  },
  {
    type: "resolution-quilt", name: "Resolution Quilt", category: "Spatial",
    description: "Build one image from unequal territories of sharp, soft, and broken resolution.",
    parameters: [
      { id: "minChunk", label: "Smallest Chunk", description: "The smallest local territory allowed to retain its own resolution.", min: 4, max: 160, step: 1, default: 18 },
      { id: "maxChunk", label: "Largest Chunk", description: "The largest slab that can interrupt the finer field.", min: 16, max: 480, step: 1, default: 180 },
      { id: "resolutionDrop", label: "Resolution Drop", description: "How aggressively regions collapse into fewer pixels.", min: 0, max: 1, step: 0.01, default: 0.64 },
      { id: "softness", label: "Soft Enlargement", description: "From hard pixel edges to blurred resampling.", min: 0, max: 1, step: 0.01, default: 0.32 },
      { id: "displacement", label: "Block Travel", description: "How far resampled territories leave their original coordinates.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "vacancy", label: "Missing Territory", description: "How often a region becomes deliberate absence.", min: 0, max: 1, step: 0.01, default: 0.08 },
    ],
  },
  {
    type: "shard-field", name: "Shard Field", category: "Spatial",
    description: "Detach rectangular pieces, rotate them, repeat them, and leave the image structurally incomplete.",
    parameters: [
      { id: "pieces", label: "Piece Count", description: "How many pieces negotiate a new arrangement.", min: 3, max: 140, step: 1, default: 34 },
      { id: "minSpan", label: "Smallest Piece", description: "Minimum piece size as a fraction of the image.", min: 0.01, max: 0.3, step: 0.01, default: 0.04 },
      { id: "maxSpan", label: "Largest Piece", description: "Maximum piece size as a fraction of the image.", min: 0.05, max: 0.85, step: 0.01, default: 0.28 },
      { id: "travel", label: "Shard Travel", description: "How far detached pieces can abandon their source.", min: 0, max: 1, step: 0.01, default: 0.24 },
      { id: "rotation", label: "Rotation", description: "Angular instability of detached pieces.", min: 0, max: 1, step: 0.01, default: 0.12 },
      { id: "repetition", label: "Repetition", description: "Chance that one piece echoes into another position.", min: 0, max: 1, step: 0.01, default: 0.22 },
      { id: "absence", label: "Absence", description: "Chance that a detached region refuses replacement.", min: 0, max: 1, step: 0.01, default: 0.12 },
    ],
  },
  {
    type: "cut-repeat", name: "Cut / Repeat", category: "Order",
    description: "Select strips by signal, stretch them, repeat them, and cut holes in the expected sequence.",
    parameters: [
      { id: "selector", label: "Selection Signal", description: "Which image evidence decides what can be cut.", min: 0, max: 3, step: 1, default: 3, choices: ["Bright", "Dark", "Edges", "Chance"] },
      { id: "cuts", label: "Cut Count", description: "Number of candidate fragments.", min: 2, max: 120, step: 1, default: 26 },
      { id: "span", label: "Cut Span", description: "Typical width of selected material.", min: 0.01, max: 0.5, step: 0.01, default: 0.12 },
      { id: "stretch", label: "Stretch", description: "How far a fragment changes proportion.", min: 0, max: 1, step: 0.01, default: 0.38 },
      { id: "repetition", label: "Repeat Count", description: "How many echoes a chosen fragment may produce.", min: 1, max: 12, step: 1, default: 4 },
      { id: "drift", label: "Sequence Drift", description: "Distance between repeated fragments.", min: 0, max: 1, step: 0.01, default: 0.16 },
      { id: "absence", label: "Cut Away", description: "How often selection produces a gap rather than a copy.", min: 0, max: 1, step: 0.01, default: 0.14 },
    ],
  },
  {
    type: "language-body", name: "Language Body", category: "Character",
    description: "Gather whole phrases into a figure, image mass, or chosen territory through organic rows, rings, rays, or a disturbed grid.",
    parameters: [
      { id: "languageDensity", label: "Language Density", description: "How tightly phrases gather along the selected flow.", min: 0.4, max: 2, step: 0.01, default: 1 },
      { id: "typeScale", label: "Type Scale", description: "The base size of each intact phrase.", min: 7, max: 48, step: 1, default: 16 },
      { id: "sizeBreath", label: "Size Breath", description: "How far phrase scale can move between quiet and emphatic marks.", min: 0, max: 1, step: 0.01, default: 0.72 },
      { id: "flowCenterX", label: "Flow Center X", description: "Horizontal gravitational center for the body and its paths.", min: 0, max: 1, step: 0.01, default: 0.5 },
      { id: "flowCenterY", label: "Flow Center Y", description: "Vertical gravitational center for the body and its paths.", min: 0, max: 1, step: 0.01, default: 0.45 },
      { id: "bodyGate", label: "Body Gate", description: "The brightness boundary used when Image mass becomes the body.", min: 0, max: 1, step: 0.01, default: 0.5 },
      { id: "motion", label: "Motion", description: "Strength of orbit, breathing, or collapse in a seamless loop.", min: 0, max: 1, step: 0.01, default: 0.52 },
    ],
  },
  {
    type: "ascii-field", name: "ASCII Field", category: "Character",
    description: "Redraw incoming material with a chosen printable alphabet.",
    parameters: [
      { id: "cellSize", label: "Cell Size", description: "The scale of each character cell, held proportionally across preview and export.", min: 7, max: 56, step: 1, default: 15 },
      { id: "coverage", label: "Presence", description: "How many eligible cells receive a character.", min: 0, max: 1, step: 0.01, default: 1 },
      { id: "imageLoyalty", label: "Tone", description: "How faithfully character weight rebuilds the source's light and dark masses.", min: 0, max: 1, step: 0.01, default: 0.88 },
      { id: "edgeVoice", label: "Contour", description: "How strongly directional strokes draw source boundaries.", min: 0, max: 1, step: 0.01, default: 0.28 },
      { id: "bodyGate", label: "Body Gate", description: "How different a cell must be from the source ground before it belongs to the body.", min: 0.03, max: 0.8, step: 0.01, default: 0.16 },
      { id: "instability", label: "Alphabet Instability", description: "Legacy character mutation retained for older recipes.", min: 0, max: 1, step: 0.01, default: 0 },
      { id: "vacancy", label: "Vacancy", description: "Legacy random silence retained for older recipes.", min: 0, max: 0.9, step: 0.01, default: 0 },
      { id: "gridDamage", label: "Grid Damage", description: "Legacy grid displacement retained for older recipes.", min: 0, max: 1, step: 0.01, default: 0 },
      { id: "invertDensity", label: "Density", description: "Choose whether dark or light regions carry the heaviest marks.", min: 0, max: 1, step: 1, default: 0, choices: ["Dark is dense", "Light is dense"] },
      { id: "signalMemory", label: "Signal Memory", description: "How long each addressed cell keeps its character identity before the mutation tide can reach it.", min: 0, max: 1, step: 0.01, default: 0.82 },
      { id: "mutationTide", label: "Mutation Tide", description: "How many cells become eligible to change during the closed loop.", min: 0, max: 1, step: 0.01, default: 0.18 },
      { id: "bitRot", label: "Bit Rot", description: "Flip bits inside printable seven-bit character codes, producing related damaged identities.", min: 0, max: 1, step: 0.01, default: 0.08 },
      { id: "overstrike", label: "Backspace / Overstrike", description: "Retain an earlier glyph as a displaced impression beneath the current signal.", min: 0, max: 1, step: 0.01, default: 0.12 },
      { id: "carriageDrift", label: "Carriage Drift", description: "Let rows lose their horizontal writing position and wrap across themselves.", min: 0, max: 1, step: 0.01, default: 0.1 },
      { id: "lineFeedFault", label: "Line Feed Fault", description: "Repeat, skip, or compress addressed rows without becoming generic displacement.", min: 0, max: 1, step: 0.01, default: 0.04 },
      { id: "tabGap", label: "Tab Gap", description: "Create aligned jumps and deliberate runs of terminal silence.", min: 0, max: 1, step: 0.01, default: 0.04 },
      { id: "dropout", label: "DEL / Dropout", description: "Erase addressed cells as missing transmitted characters.", min: 0, max: 0.9, step: 0.01, default: 0.03 },
    ],
  },
  {
    type: "zhuyin-weave", name: "Zhuyin Weave", category: "Character",
    description: "Layer patterned Zhuyin signs as woven ink inside selected image territories.",
    parameters: [
      { id: "cellSize", label: "Cell Size", description: "The scale of the repeating Zhuyin cell.", min: 9, max: 64, step: 1, default: 22 },
      { id: "coverage", label: "Pattern Fill", description: "How many cells inside the chosen territory receive the weave.", min: 0, max: 1, step: 0.01, default: 0.82 },
      { id: "voices", label: "Voices", description: "How many related symbol layers inhabit the same territory.", min: 1, max: 4, step: 1, default: 2 },
      { id: "misregistration", label: "Misregistration", description: "How far the layered voices slip apart like imperfect printing.", min: 0, max: 1, step: 0.01, default: 0.22 },
      { id: "rowDrift", label: "Row Drift", description: "How strongly each row advances through the symbol sequence.", min: 0, max: 1, step: 0.01, default: 0.42 },
      { id: "imageRhythm", label: "Image Rhythm", description: "How much source brightness bends the repeating symbol phase.", min: 0, max: 1, step: 0.01, default: 0.38 },
      { id: "bodyGate", label: "Body Gate", description: "How different a cell must be from the source ground before it belongs to the body.", min: 0.03, max: 0.8, step: 0.01, default: 0.16 },
      { id: "motion", label: "Loop Motion", description: "How far row phase and layered registration travel during a closed loop.", min: 0, max: 1, step: 0.01, default: 0.32 },
    ],
  },
  {
    type: "petscii-study", name: "PETSCII Study", category: "Character",
    description: "Rebuild the complete image from a fixed 40 × 25 vocabulary of quadrant tiles.",
    parameters: [
      { id: "threshold", label: "Tile Threshold", description: "Which sampled quadrants become foreground tile mass.", min: 0.05, max: 0.95, step: 0.01, default: 0.48 },
      { id: "imagePull", label: "Image Pull", description: "From one shared ink color to the nearest C64-inspired color in each cell.", min: 0, max: 1, step: 0.01, default: 0.78 },
      { id: "reverseMass", label: "Mass Direction", description: "Choose whether dark or light source mass becomes the foreground tile.", min: 0, max: 1, step: 1, default: 0, choices: ["Dark becomes tile", "Light becomes tile"] },
      { id: "rulePressure", label: "Rule Pressure", description: "How strongly neighboring infection or gravity overrides direct image reconstruction.", min: 0, max: 1, step: 0.01, default: 0.42 },
    ],
  },
];

export const definitionFor = (type: EffectType) => effectDefinitions.find((item) => item.type === type)!;

let instanceCounter = 0;
export function defaultWhere(seed = 0): EffectWhere {
  return {
    mode: "whole", threshold: 0.5, softness: 0.12, hue: 0, hueWidth: 36, scale: 48,
    invert: false, seed: Math.max(0, Math.round(seed)), sampleColor: 0xc83d58,
    sampleX: 0.5, sampleY: 0.5, colorReach: 0.16, shadeLoyalty: 0.68,
    edgeLoyalty: 0.58, bodyExpansion: 0, recognition: 0.72, targetMemory: "current",
  };
}

export function createEffect(type: EffectType, seed = Date.now()): EffectInstance {
  const definition = definitionFor(type);
  const random = randomSource(seed + instanceCounter++ * 997);
  const effect: EffectInstance = {
    id: `${type}-${Math.floor(random() * 0xffffff).toString(16).padStart(6, "0")}`,
    type,
    enabled: true,
    where: defaultWhere(seed + instanceCounter * 7919),
    parameters: Object.fromEntries(definition.parameters.map((parameter) => [parameter.id, parameter.default])),
  };
  if (type === "ascii-field") effect.characterField = defaultCharacterField();
  if (type === "surface-motion") effect.characterField = {...defaultCharacterField(),bank:"custom",glyphs:Array.from(".:/|+")};
  if (type === "language-body") effect.languageBody = defaultLanguageBody();
  if (type === "zhuyin-weave") effect.zhuyinField = defaultZhuyinField();
  if (type === "petscii-study") effect.tileField = defaultTileField();
  if (type === "ultimate-sort") effect.ultimateSort = defaultUltimateSortStack();
  if (type === "wizprocess") effect.wizprocess = defaultWizprocess();
  if (type === "dither-field") effect.parameters.ditherVersion = 2;
  return effect;
}

export const defaultPaletteSettings = (): PaletteSettings => ({
  structure: "analogous",
  hue: 22,
  hueSpread: 34,
  saturation: 28,
  saturationRange: 18,
  lightnessFloor: 8,
  lightnessCeiling: 94,
});

export const defaultRecipe = (): StudioRecipe => {
  const paletteSettings = defaultPaletteSettings();
  return {
  schemaVersion: 1,
  revision: 1,
  seed: 886,
  colorSeed: 886042,
  iteration: 0,
  renderSize: 1600,
  renderWidth: 1600,
  renderHeight: 1600,
  processingOrientation: "recompose",
  gifWidth: 960,
  gifHeight: 960,
  loopFrames: 36,
  loopFps: 12,
  aspectLocked: true,
  gifAspectLocked: true,
  outputFamily: newPassFamilyId(),
  baseMode: "field",
  processStage: "chain",
  koneForm: defaultKoneForm(),
  sourceFit: "contain",
  sourceBackground: "cutout",
  colorMode: "palette",
  sourcePresence: 0,
  paletteSettings,
  palette: paletteFromSettings(paletteSettings),
  layers: [],
  effects: [createEffect("band-rupture", 886), createEffect("signal-echo", 887)],
  };
};

export function newPassFamilyId(now = new Date()): string {
  const part = (value: number, width = 2) => String(value).padStart(width, "0");
  return `pass-${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}-${part(now.getMilliseconds(), 3)}`;
}

export function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextStructure(recipe: StudioRecipe): StudioRecipe {
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const random = randomSource(seed);
  return {
    ...recipe,
    revision: recipe.revision + 1,
    seed,
    iteration: 0,
    effects: recipe.effects.map((effect) => {
      const wizprocess = effect.type === "wizprocess" ? effect.wizprocess : undefined;
      const mutateWhere = !wizprocess || wizprocess.newStructureWhere;
      const randomizedParameters = Object.fromEntries(definitionFor(effect.type).parameters.map((parameter) => {
        if (parameter.choices) return [parameter.id, Math.floor(random() * parameter.choices.length)];
        const raw = parameter.min + random() * (parameter.max - parameter.min);
        const stepped = Math.round(raw / parameter.step) * parameter.step;
        return [parameter.id, Number(stepped.toFixed(parameter.step < 0.1 ? 2 : parameter.step < 1 ? 1 : 0))];
      }));
      if (effect.type === "wavelet-cartography") {
        for (const id of ["colorBody", "channelBond", "colorIgnition"]) randomizedParameters[id] = effect.parameters[id];
      }
      if (effect.type === "lz77-memory") {
        for (const id of ["colorMemory", "byteWeave"]) randomizedParameters[id] = effect.parameters[id];
      }
      if (effect.type === "tectonic-lens") {
        for (const id of ["boundarySignal", "lensSignal"]) randomizedParameters[id] = effect.parameters[id];
      }
      if (audioEffectTypes.has(effect.type)) {
        for (const id of ["byteOrder", "trackBody", "trackReunion", "channelBond"]) if (effect.parameters[id] !== undefined) randomizedParameters[id] = effect.parameters[id];
      }
      if (effect.type === "dither-field") randomizedParameters.ditherVersion = 2;
      const automaticWhereModes = whereModes.filter((mode) => !["color-kin", "found-body", "shape-relatives"].includes(mode.value));
      return {
      ...effect,
      where: mutateWhere ? {
          ...effect.where,
          mode: ["color-kin", "found-body", "shape-relatives"].includes(effect.where.mode)
            ? effect.where.mode
            : automaticWhereModes[Math.floor(random() * automaticWhereModes.length)].value,
          threshold: Number(random().toFixed(2)),
          softness: Number((random() * 0.32).toFixed(2)),
          hue: Math.round(random() * 359),
          hueWidth: Math.round(8 + random() * 112),
          scale: Math.round(8 + random() * 152),
          colorReach: Number((0.04 + random() * 0.42).toFixed(2)),
          shadeLoyalty: Number(random().toFixed(2)),
          edgeLoyalty: Number(random().toFixed(2)),
          bodyExpansion: Number((-0.035 + random() * 0.105).toFixed(3)),
          recognition: Number((0.35 + random() * 0.64).toFixed(2)),
          invert: random() > 0.72,
          seed: Math.floor(random() * 2_000_000_000),
        } : effect.where,
        parameters: randomizedParameters,
        wizprocess: wizprocess ? {
          ...wizprocess,
          ...(wizprocess.newStructureScale ? {
            mass: Number((0.05 + random() * 0.95).toFixed(2)),
            structure: Number((0.05 + random() * 0.95).toFixed(2)),
            grain: Number((0.05 + random() * 0.95).toFixed(2)),
          } : {}),
          compression: Math.round(4 + random() * 276),
          expansion: Math.round(4 + random() * 276),
          path: (["rows", "columns", "snake", "clustered"] as Wizprocess["path"][])[Math.floor(random() * 4)],
          tide: Number(random().toFixed(2)),
        } : undefined,
      };
    }),
  };
}

function mutateMixedForm(recipe:StudioRecipe,mutate:(recipe:StudioRecipe)=>StudioRecipe):StudioRecipe {
  const p=recipe.koneForm.parameters,key=`formMix${selectedFormKind(p)}Seed`,seed=(p[key]??-1)>=0?p[key]:recipe.koneForm.seed;
  const next=mutate({...recipe,koneForm:{...recipe.koneForm,seed,parameters:{...p,formMix:0}}});
  return {...next,koneForm:{...next.koneForm,seed:recipe.koneForm.seed,parameters:{...next.koneForm.parameters,formMix:1,[key]:next.koneForm.seed}}};
}
export function nextKoneForm(recipe: StudioRecipe): StudioRecipe {
  if((recipe.koneForm.parameters.formMix??0)>=.5)return mutateMixedForm(recipe,nextKoneForm);
  if((recipe.koneForm.parameters.structureMode??0)>0)return {...recipe,revision:recipe.revision+1,iteration:0,koneForm:{...recipe.koneForm,seed:Math.floor(Math.random()*2_000_000_000)}};
  if ((recipe.koneForm.parameters.figureActive ?? 0) >= .5) {
    const seed=Math.floor(Math.random()*2_000_000_000), random=randomSource(seed);
    if((recipe.koneForm.parameters.symbolField??0)>=2||((recipe.koneForm.parameters.figureSource??0)===1&&(recipe.koneForm.parameters.emojiCount??0)>0))return {...recipe,revision:recipe.revision+1,iteration:0,koneForm:{...recipe.koneForm,seed}};
    return {...recipe,revision:recipe.revision+1,iteration:0,koneForm:{...recipe.koneForm,seed,parameters:{...recipe.koneForm.parameters,figureGestureSeed:seed,...((recipe.koneForm.parameters.figureSource??0)===0?{figureGesture:recipe.koneForm.parameters.figureGesture||.4}:{}),window1X:.25+random()*.5,window1Y:.2+random()*.6,window2X:.25+random()*.5,window2Y:.2+random()*.6,window1Turn:Math.round(random()*80-40),window2Turn:Math.round(random()*80-40)}}};
  }
  if ((recipe.koneForm.parameters.knotActive ?? 0) >= .5) {
    const seed = Math.floor(Math.random()*2_000_000_000), random = randomSource(seed);
    return {...recipe,revision:recipe.revision+1,iteration:0,koneForm:{...recipe.koneForm,seed,parameters:{...recipe.koneForm.parameters,
      knotTurns:2+Math.floor(random()*6),knotWidth:Number((.018+random()*.065).toFixed(3)),
      knotLife:Number(random().toFixed(2)),knotSpacing:Number((.035+random()*.06).toFixed(3))}}};
  }

  const seed = Math.floor(Math.random() * 2_000_000_000);
  const random = randomSource(seed);
  const flowers = (recipe.koneForm.parameters.budding ?? 0) > 0.01;
  const twoKones = (recipe.koneForm.parameters.molt ?? 0) > 0.01;
  const orchidPresence = recipe.koneForm.parameters.orchidPresence ?? 0;
  return {
    ...recipe,
    revision: recipe.revision + 1,
    iteration: 0,
    baseMode: "kone",
    processStage: "form",
    koneForm: {
      knotText: recipe.koneForm.knotText,
      emojiSelection: recipe.koneForm.emojiSelection,
      kind: "kone-form",
      family: "kone",
      seed,
      parameters: Object.fromEntries(koneFormParameters.map((parameter) => {
        if (figureControls.some(control => control.id === parameter.id)) return [parameter.id, recipe.koneForm.parameters[parameter.id] ?? parameter.default];
        if (parameter.id.startsWith("formPart")||parameter.id.startsWith("formMix")||parameter.id.startsWith("knot")||parameter.id.startsWith("structure")||parameter.id.startsWith("print")) return [parameter.id, recipe.koneForm.parameters[parameter.id] ?? parameter.default];
        if (formElementParameterIds.has(parameter.id)) {
          return [parameter.id, recipe.koneForm.parameters[parameter.id] ?? parameter.default];
        }
        if (parameter.id === "seam") return [parameter.id, 0];
        if (parameter.id === "ritual" || parameter.id === "mouths") return [parameter.id, 0];
        if (parameter.id === "orchidPresence") return [parameter.id, orchidPresence];
        if (orchidAnatomyParameterIds.has(parameter.id) || orchidIdentityParameterIds.has(parameter.id)) {
          return [parameter.id, recipe.koneForm.parameters[parameter.id] ?? parameter.default];
        }
        if (parameter.id === "molt") return [parameter.id, twoKones ? Number((0.05 + random() * 0.95).toFixed(2)) : 0];
        if (parameter.id === "budding") {
          return [parameter.id, flowers ? Number((0.35 + random() * 2.65).toFixed(2)) : 0];
        }
        const anatomyAmount = random();
        const raw = parameter.min + anatomyAmount * (parameter.max - parameter.min);
        const stepped = Math.round(raw / parameter.step) * parameter.step;
        return [parameter.id, Number(stepped.toFixed(parameter.step < 0.1 ? 2 : parameter.step < 1 ? 1 : 0))];
      })),
    },
  };
}

export function nextKoneIteration(recipe: StudioRecipe): StudioRecipe {
  if((recipe.koneForm.parameters.formMix??0)>=.5)return mutateMixedForm(recipe,nextKoneIteration);
  if((recipe.koneForm.parameters.figureActive??0)>=.5||(recipe.koneForm.parameters.structureMode??0)>0)return nextKoneForm(recipe);
  return {
    ...recipe,
    revision: recipe.revision + 1,
    iteration: recipe.iteration + 1,
    baseMode: "kone",
    processStage: "form",
    koneForm: {
      ...recipe.koneForm,
      seed: Math.floor(Math.random() * 2_000_000_000),
      parameters: { ...recipe.koneForm.parameters, seam: 0, shellPresence: 1 },
    },
  };
}

export function nextIteration(recipe: StudioRecipe): StudioRecipe {
  return { ...recipe, revision: recipe.revision + 1, iteration: recipe.iteration + 1 };
}

export function mutateZhuyinSequence(
  glyphs: string[],
  seed: number,
  iteration: number,
  mode: ZhuyinField["mutationMode"],
) {
  const mutated = glyphs.length ? [...glyphs] : ["ㄅ"];
  if (mode === "held") return mutated;
  const original = [...mutated];
  const random = randomSource(seed + iteration * 104729 + mutated.length * 8191);
  const edits = mode === "drift" ? 1 : Math.min(8, Math.max(3, Math.ceil(mutated.length * 0.12)));

  for (let edit = 0; edit < edits; edit += 1) {
    const operation = Math.floor(random() * 4);
    const index = Math.floor(random() * mutated.length);
    if ((operation === 0 || (operation === 1 && mutated.length >= 64)) && mutated.length > 1) {
      const other = (index + 1 + Math.floor(random() * (mutated.length - 1))) % mutated.length;
      [mutated[index], mutated[other]] = [mutated[other], mutated[index]];
    } else if (operation === 1 && mutated.length < 64) {
      mutated.splice(index + 1, 0, mutated[index]);
    } else if (operation === 2 && mutated.length > 1) {
      mutated.splice(index, 1);
    } else if (mutated.length >= 64) {
      mutated.splice(index, 1);
    } else if (mutated.length < 64) {
      const clusterSize = Math.min(64 - mutated.length, mode === "fracture" ? 2 + Math.floor(random() * 3) : 1);
      mutated.splice(index, 0, ...Array.from({ length: clusterSize }, () => mutated[index]));
    }
  }

  const result = mutated.slice(0, 64);
  if (result.length === original.length && result.every((glyph, index) => glyph === original[index])) {
    if (result.length < 64) result.splice(1, 0, result[0]);
    else result.splice(Math.floor(random() * result.length), 1);
  }
  return result;
}

export function nextZhuyinIteration(recipe: StudioRecipe): StudioRecipe {
  const iteration = recipe.iteration + 1;
  return {
    ...recipe,
    revision: recipe.revision + 1,
    iteration,
    effects: recipe.effects.map((effect) => {
      const field = effect.type === "zhuyin-weave" ? effect.zhuyinField : undefined;
      if (!field || field.mutationMode === "held") return effect;
      return {
        ...effect,
        zhuyinField: {
          ...field,
          bank: "custom",
          glyphs: mutateZhuyinSequence(field.glyphs, recipe.seed + effect.where.seed, iteration, field.mutationMode),
        },
      };
    }),
  };
}

export function cleanPassRecipe(recipe: StudioRecipe, sourceImage: string): StudioRecipe {
  return {
    ...recipe,
    revision: recipe.revision + 1,
    seed: Math.floor(Math.random() * 2_000_000_000),
    iteration: 0,
    baseMode: "field",
    processStage: "chain",
    sourceImage,
    colorMode: "source",
    sourcePresence: 0.18,
    layers: [],
    effects: [createEffect("resolution-quilt", recipe.seed + recipe.revision)],
  };
}

export function parameterPrecision(step: number) {
  if (step >= 1) return 0;
  return Math.min(6, Math.max(1, Math.ceil(-Math.log10(step))));
}

export function parameterSuggestions(parameter: EffectParameter): ParameterSuggestion[] {
  if (parameter.suggestions) return parameter.suggestions;
  if (parameter.choices) return parameter.choices.map((label, value) => ({ value, label }));
  const labels = ["minimum", "trace", "low", "turn", "strong", "break", "maximum"];
  const positions = [0, 0.08, 0.2, 0.4, 0.62, 0.82, 1];
  const precision = parameterPrecision(parameter.step);
  const values = positions.map((position) => {
    const raw = parameter.min + (parameter.max - parameter.min) * position;
    const stepped = Math.round((raw - parameter.min) / parameter.step) * parameter.step + parameter.min;
    return Number(stepped.toFixed(precision));
  });
  return values.filter((value, index) => values.indexOf(value) === index).map((value, index, unique) => ({
    value,
    label: labels[Math.round(index * (labels.length - 1) / Math.max(1, unique.length - 1))],
  }));
}

function hslToPacked(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrapHue = (value: number) => ((value % 360) + 360) % 360;

export function paletteFromSettings(settings: PaletteSettings): [number, number, number, number] {
  const hue = wrapHue(settings.hue);
  const spread = clamp(settings.hueSpread, 0, 180);
  const hueOffsets: Record<Exclude<PaletteStructure, "source" | "custom">, number[]> = {
    monochrome: [0, 0, 0, 0],
    duotone: [0, spread, spread, 0],
    analogous: [-spread, -spread / 3, spread / 3, spread],
    complementary: [0, 180, 180, 0],
    "split-complementary": [0, 180 - spread / 2, 180 + spread / 2, 0],
    triadic: [0, 120, 240, 0],
  };
  const offsets = hueOffsets[settings.structure as keyof typeof hueOffsets] ?? [0, 0, 0, 0];
  const saturation = clamp(settings.saturation, 0, 100);
  const saturationRange = clamp(settings.saturationRange, 0, 100);
  const floor = clamp(Math.min(settings.lightnessFloor, settings.lightnessCeiling), 0, 100);
  const ceiling = clamp(Math.max(settings.lightnessFloor, settings.lightnessCeiling), 0, 100);
  const lightSpan = ceiling - floor;
  const lightness = [floor + lightSpan * 0.24, floor + lightSpan * 0.5, floor + lightSpan * 0.74, ceiling];
  const saturationOffsets = [-saturationRange * 0.28, saturationRange * 0.18, saturationRange * 0.5, -saturationRange * 0.72];
  return offsets.map((offset, index) => hslToPacked(
    wrapHue(hue + offset) / 360,
    clamp(saturation + saturationOffsets[index], 0, 100) / 100,
    lightness[index] / 100,
  )) as [number, number, number, number];
}

export function applyPaletteSettings(recipe: StudioRecipe, patch: Partial<PaletteSettings>): StudioRecipe {
  const paletteSettings = { ...recipe.paletteSettings, ...patch };
  if (paletteSettings.lightnessFloor > paletteSettings.lightnessCeiling) {
    if (patch.lightnessFloor !== undefined) paletteSettings.lightnessCeiling = paletteSettings.lightnessFloor;
    else paletteSettings.lightnessFloor = paletteSettings.lightnessCeiling;
  }
  const preserveSwatches = paletteSettings.structure === "custom" || paletteSettings.structure === "source";
  return {
    ...recipe,
    revision: recipe.revision + 1,
    paletteSettings,
    palette: preserveSwatches ? recipe.palette : paletteFromSettings(paletteSettings),
  };
}

export function nextColors(recipe: StudioRecipe): StudioRecipe {
  const colorSeed = Math.floor(Math.random() * 2_000_000_000);
  const random = randomSource(colorSeed);
  const effects: EffectInstance[] = recipe.effects.map((effect): EffectInstance => {
    if (effect.type === "wavelet-cartography") return {
      ...effect,
      parameters: {
        ...effect.parameters,
        colorBody: Math.floor(random() * 2),
        channelBond: Math.floor(random() * 2),
        colorIgnition: Number(random().toFixed(2)),
      },
    };
    if (effect.type === "lz77-memory") return {
      ...effect,
      parameters: {
        ...effect.parameters,
        colorMemory: Math.floor(random() * 2),
        byteWeave: Math.floor(random() * 3),
      },
    };
    if (effect.type === "tectonic-lens") return {
      ...effect,
      parameters: {
        ...effect.parameters,
        boundarySignal: Math.floor(random() * 5),
        lensSignal: Math.floor(random() * 7),
      },
    };
    if (audioEffectTypes.has(effect.type)) return {
      ...effect,
      parameters: {
        ...effect.parameters,
        ...(effect.parameters.byteOrder !== undefined ? { byteOrder: Math.floor(random() * 6) } : {}),
        ...(effect.parameters.trackBody !== undefined ? { trackBody: Math.floor(random() * 4) } : {}),
        ...(effect.parameters.trackReunion !== undefined ? { trackReunion: Math.floor(random() * 6) } : {}),
        ...(effect.parameters.channelBond !== undefined ? { channelBond: Math.floor(random() * 2) } : {}),
      },
    };
    const wizprocess = effect.type === "wizprocess" ? effect.wizprocess : undefined;
    if (!wizprocess?.newColors) return effect;
    const channels = random() > 0.5 ? "together" : "separate";
    return {
      ...effect,
      wizprocess: {
        ...wizprocess,
        colorSpace: wizColorSpaceOptions[Math.floor(random() * wizColorSpaceOptions.length)].value,
        channels: channels as Wizprocess["channels"],
        channelPhase: channels === "together" ? Math.round(random() * 24 - 12) : 0,
        reconstruction: (["fold", "wrap", "clip", "reflect"] as Wizprocess["reconstruction"][])[Math.floor(random() * 4)],
      },
    };
  });
  if (recipe.paletteSettings.structure !== "custom" && recipe.paletteSettings.structure !== "source") {
    const paletteSettings = { ...recipe.paletteSettings, hue: Math.round(random() * 359) };
    return {
      ...recipe,
      revision: recipe.revision + 1,
      colorSeed,
      paletteSettings,
      palette: paletteFromSettings(paletteSettings),
      effects,
    };
  }
  const base = random();
  const relation = [0.08 + random() * 0.1, 0.38 + random() * 0.18, 0.62 + random() * 0.24];
  return {
    ...recipe,
    revision: recipe.revision + 1,
    colorSeed,
    effects,
    paletteSettings: { ...recipe.paletteSettings, structure: "custom" },
    palette: [
      hslToPacked(base, 0.2 + random() * 0.48, 0.24 + random() * 0.34),
      hslToPacked((base + relation[0]) % 1, 0.16 + random() * 0.46, 0.28 + random() * 0.38),
      hslToPacked((base + relation[1]) % 1, 0.12 + random() * 0.42, 0.42 + random() * 0.38),
      hslToPacked((base + relation[2]) % 1, 0.03 + random() * 0.18, 0.02 + random() * 0.14),
    ],
  };
}

function normalizeUltimateSortStack(stack: UltimateSortStack | undefined): UltimateSortStack {
  const fallback = defaultUltimateSortStack();
  const incoming = Array.isArray(stack?.recipes) && stack.recipes.length ? [...stack.recipes] : fallback.recipes;
  if (stack?.glimmerEnabled === true && !incoming.some((recipe) => recipe.method === "glimmer")) {
    incoming.push({
      ...defaultUltimateGlimmerRecipe(282),
      amount: Number(stack.glimmerAmount ?? 0.34),
      glimmerSize: Number(stack.glimmerSize ?? 4),
      glimmerSpeed: Number(stack.glimmerSpeed ?? 0.18),
    });
  }
  const methods = ["bubble", "insertion", "selection", "merge", "permute", "scatter", "roll", "heap", "shell", "quick", "smooth", "one-color", "color-bands", "glimmer"];
  const actions = ["sort", "sort-outline", "wand"];
  const directions = ["left", "right", "up", "down"];
  const signals = ["red", "green", "blue", "hue", "saturation", "brightness", "white", "black", "gray", "luma", "chroma"];
  const territories = ["whole", "light", "dark", "edges", "red", "orange", "yellow", "green", "cyan", "blue", "pink", "body", "white", "black", "gray", "colorful", "midtones"];
  const resolutions = ["pixel", "fixed", "wake"];
  return {
    kind: "ultimate-sort",
    recipes: incoming.slice(0, 12).map((recipe, index) => {
      const base = fallback.recipes[index] ?? defaultUltimateSortRecipe(index);
      const minBlock = Math.max(1, Math.min(32, Math.round(Number(recipe.minBlock ?? base.minBlock))));
      return {
        ...base,
        ...recipe,
        id: String(recipe.id ?? `sort-recipe-${index + 1}`),
        enabled: recipe.enabled !== false,
        method: (methods.includes(recipe.method) ? recipe.method : base.method) as UltimateSortRecipe["method"],
        amount: Math.max(0, Math.min(1, Number(recipe.amount ?? base.amount))),
        action: (actions.includes(recipe.action) ? recipe.action : base.action) as UltimateSortRecipe["action"],
        direction: (directions.includes(recipe.direction) ? recipe.direction : base.direction) as UltimateSortRecipe["direction"],
        signal: (signals.includes(recipe.signal) ? recipe.signal : base.signal) as UltimateSortRecipe["signal"],
        territory: (territories.includes(recipe.territory) ? recipe.territory : base.territory) as UltimateSortRecipe["territory"],
        toneTolerance: Number.isFinite(Number(recipe.toneTolerance)) ? Math.max(0, Math.min(1, Number(recipe.toneTolerance))) : base.toneTolerance,
        gate: Math.max(0, Math.min(1200, Number(recipe.gate ?? base.gate))),
        bodySampleColor: Math.max(0, Math.min(0xffffff, Math.round(Number(recipe.bodySampleColor ?? base.bodySampleColor)))),
        bodySampleX: Math.max(0, Math.min(1, Number(recipe.bodySampleX ?? base.bodySampleX))),
        bodySampleY: Math.max(0, Math.min(1, Number(recipe.bodySampleY ?? base.bodySampleY))),
        bodyColorReach: Math.max(0.01, Math.min(1, Number(recipe.bodyColorReach ?? base.bodyColorReach))),
        bodyShadeLoyalty: Math.max(0, Math.min(1, Number(recipe.bodyShadeLoyalty ?? base.bodyShadeLoyalty))),
        bodyEdgeLoyalty: Math.max(0, Math.min(1, Number(recipe.bodyEdgeLoyalty ?? base.bodyEdgeLoyalty))),
        bodyExpansion: Math.max(-0.08, Math.min(0.18, Number(recipe.bodyExpansion ?? base.bodyExpansion))),
        bodyInvert: recipe.bodyInvert === true,
        bodyTargetMemory: (["source", "current", "held"].includes(String(recipe.bodyTargetMemory)) ? recipe.bodyTargetMemory : base.bodyTargetMemory) as UltimateSortRecipe["bodyTargetMemory"],
        resolution: (resolutions.includes(recipe.resolution) ? recipe.resolution : base.resolution) as UltimateSortRecipe["resolution"],
        minBlock,
        maxBlock: Math.max(minBlock, Math.min(32, Math.round(Number(recipe.maxBlock ?? base.maxBlock)))),
        selectionSpeed: Math.max(0, Math.min(12, Math.round(Number(recipe.selectionSpeed ?? base.selectionSpeed)))),
        scatterRefresh: Math.max(0, Math.min(120, Math.round(Number(recipe.scatterRefresh ?? base.scatterRefresh)))),
        glimmerSize: Math.max(0.5, Math.min(12, Number(recipe.glimmerSize ?? base.glimmerSize))),
        glimmerSpeed: Math.max(0, Math.min(1, Number(recipe.glimmerSpeed ?? base.glimmerSpeed))),
      };
    }),
  };
}

function normalizeWizprocess(chamber: Wizprocess | undefined): Wizprocess {
  const fallback = defaultWizprocess();
  const colorSpaces: readonly string[] = wizColorSpaceOptions.map(({ value }) => value);
  const channels = ["together", "separate"];
  const paths = ["rows", "columns", "snake", "clustered"];
  const reconstructions = ["fold", "wrap", "clip", "reflect"];
  return {
    ...fallback,
    ...(chamber ?? {}),
    kind: "wizprocess",
    mass: Math.max(0, Math.min(1, Number(chamber?.mass ?? fallback.mass))),
    structure: Math.max(0, Math.min(1, Number(chamber?.structure ?? fallback.structure))),
    grain: Math.max(0, Math.min(1, Number(chamber?.grain ?? fallback.grain))),
    compression: Math.max(1, Math.min(1200, Number(chamber?.compression ?? fallback.compression))),
    expansion: Math.max(0, Math.min(1200, Number(chamber?.expansion ?? fallback.expansion))),
    colorSpace: (colorSpaces.includes(chamber?.colorSpace ?? "") ? chamber!.colorSpace : fallback.colorSpace) as Wizprocess["colorSpace"],
    channels: (channels.includes(chamber?.channels ?? "") ? chamber!.channels : fallback.channels) as Wizprocess["channels"],
    channelPhase: Math.max(-48, Math.min(48, Math.round(Number(chamber?.channelPhase ?? fallback.channelPhase)))),
    path: (paths.includes(chamber?.path ?? "") ? chamber!.path : fallback.path) as Wizprocess["path"],
    reconstruction: (reconstructions.includes(chamber?.reconstruction ?? "") ? chamber!.reconstruction : fallback.reconstruction) as Wizprocess["reconstruction"],
    tide: Math.max(0, Math.min(1, Number(chamber?.tide ?? fallback.tide))),
    newStructureScale: chamber?.newStructureScale !== false,
    newStructureWhere: chamber?.newStructureWhere !== false,
    newColors: chamber?.newColors !== false,
  };
}

function normalizeLanguagePhrase(value: unknown, fallback: string) {
  const phrase = Array.from(String(value ?? "").replace(/\s/gu, " "))
    .filter((glyph) => { const code = glyph.codePointAt(0) ?? 0; return code >= 32 && (code < 127 || code > 159); })
    .slice(0, 280)
    .join("")
    .trim();
  return phrase || fallback;
}

export function normalizeRecipe(value: Partial<StudioRecipe> | null | undefined): StudioRecipe {
  const fallback = defaultRecipe();
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.effects)) return fallback;
  const { previewFinishStrength: _removedPreviewFinishStrength, ...compatibleValue } = value as Partial<StudioRecipe> & { previewFinishStrength?: number };
  const legacySize = Math.max(320, Math.min(6000, Math.round(value.renderSize ?? fallback.renderSize)));
  const renderWidth = Math.max(320, Math.min(6000, Math.round(value.renderWidth ?? legacySize)));
  const renderHeight = Math.max(320, Math.min(6000, Math.round(value.renderHeight ?? legacySize)));
  const legacyGifScale = Math.min(1, 960 / Math.max(renderWidth, renderHeight));
  const gifWidth = Math.max(64, Math.min(3840, Math.round(value.gifWidth ?? renderWidth * legacyGifScale)));
  const gifHeight = Math.max(64, Math.min(3840, Math.round(value.gifHeight ?? renderHeight * legacyGifScale)));
  const incomingEffects = value.effects as unknown as Array<EffectInstance & { type: string }>;
  const legacyKone = incomingEffects.find((effect) => (effect as unknown as { type: string }).type === "kone-form");
  const incomingKone = value.koneForm ?? (legacyKone ? {
    knotText: undefined as string | undefined,
    kind: "kone-form" as const,
    seed: ((Number(value.seed ?? fallback.seed) + Number(legacyKone.where?.seed ?? 0)) % 100000 + 100000) % 100000,
    parameters: legacyKone.parameters ?? {},
  } : undefined);
  const koneFallback = defaultKoneForm(Number(incomingKone?.seed ?? fallback.koneForm.seed));
  const incomingFamily = (incomingKone as Partial<KoneFormState> | undefined)?.family;
  const koneForm: KoneFormState = {
    ...koneFallback,
    ...(incomingKone ?? {}),
    knotText: typeof incomingKone?.knotText === "string" ? normalizeLanguagePhrase(incomingKone.knotText, "") : "JOY",
    kind: "kone-form",
    family: formFamilies.some((family) => family.id === incomingFamily) ? incomingFamily! : "kone",
    seed: Math.max(0, Math.min(2_000_000_000, Math.round(Number(incomingKone?.seed ?? koneFallback.seed)))),
    parameters: Object.fromEntries(koneFormParameters.map((parameter) => {
      const value = Number(incomingKone?.parameters?.[parameter.id] ?? parameter.default);
      return [parameter.id, Math.max(parameter.min, Math.min(parameter.max, value))];
    })),
  };
  return {
    ...fallback,
    ...compatibleValue,
    formStack: Array.isArray(value.formStack)?value.formStack.filter(part=>part&&typeof part.id==='string'&&part.form&&typeof part.form==='object').map(part=>({...part,label:typeof part.label==='string'?part.label:'Form',enabled:part.enabled!==false,form:normalizeRecipe({...value,formStack:undefined,formSelected:undefined,koneForm:part.form}).koneForm})):undefined,
    formSelected: typeof value.formSelected==='string'?value.formSelected:undefined,
    timeScore: normalizeScore(value.timeScore),
    scorePosition: Number.isFinite(value.scorePosition) ? Math.max(0, Math.min(.999999, value.scorePosition!)) : undefined,
    iteration: Math.max(0, Math.round(value.iteration ?? fallback.iteration)),
    renderSize: Math.max(renderWidth, renderHeight),
    renderWidth,
    renderHeight,
    processingOrientation: "recompose",
    gifWidth,
    gifHeight,
    outputFamily: typeof value.outputFamily === "string" && /^pass-\d{8}-\d{6}-\d{3}$/.test(value.outputFamily) ? value.outputFamily : newPassFamilyId(),
    baseMode: value.baseMode === "kone" || legacyKone ? "kone" : "field",
    processStage: value.processStage === "form" || (value.processStage === undefined && (Boolean(legacyKone) || value.baseMode === "kone")) ? "form" : "chain",
    koneForm,
    loopFrames: Math.max(2, Math.min(240, Math.round(Number(value.loopFrames ?? fallback.loopFrames)))),
    loopFps: Math.max(1, Math.min(30, Math.round(Number(value.loopFps ?? fallback.loopFps)))),
    aspectLocked: value.aspectLocked !== false,
    gifAspectLocked: value.gifAspectLocked !== false,
    sourceFit: "contain",
    sourceBackground: value.sourceBackground === "cutout" ? "cutout" : "keep",
    colorMode: value.colorMode === "source" ? "source" : "palette",
    sourcePresence: Math.max(0, Math.min(1, Number(value.sourcePresence ?? fallback.sourcePresence))),
    paletteSettings: value.paletteSettings ? {
      ...fallback.paletteSettings,
      ...value.paletteSettings,
      structure: paletteStructures.some((item) => item.value === value.paletteSettings?.structure)
        ? value.paletteSettings.structure
        : fallback.paletteSettings.structure,
    } : { ...fallback.paletteSettings, structure: "custom" },
    palette: Array.isArray(value.palette) && value.palette.length === 4 ? value.palette.map((color) => Math.max(0, Math.min(0xffffff, Math.round(color)))) as StudioRecipe["palette"] : fallback.palette,
    layers: Array.isArray(value.layers) ? value.layers.filter((layer) => layer && typeof layer.filePath === "string").map((layer) => ({
      id: String(layer.id ?? `layer-${Date.now()}`),
      label: String(layer.label ?? "Layer"),
      filePath: layer.filePath,
      joinAfter: typeof layer.joinAfter === "string" ? layer.joinAfter : undefined,
      enabled: layer.enabled !== false,
      opacity: Math.max(0, Math.min(1, Number(layer.opacity ?? 1))),
      blendMode: (["normal", "difference", "overlay", "hard-mix", "screen", "multiply", "lighten", "darken"].includes(layer.blendMode) ? layer.blendMode : "normal") as LayerBlendMode,
      maskMode: (["whole", "checker", "stripes", "blocks", "light", "dark", "edges"].includes(layer.maskMode) ? layer.maskMode : "whole") as LayerMaskMode,
      maskScale: Math.max(2, Math.min(240, Number(layer.maskScale ?? 48))),
      seed: Math.max(0, Math.round(Number(layer.seed ?? value.seed ?? fallback.seed))),
    })) : [],
    effects: incomingEffects.filter((effect) => (effect as unknown as { type: string }).type !== "kone-form").map((effect) => {
      if ((effect as unknown as { type: string }).type !== "wavelet-chamber") return effect;
      const legacy = effect as unknown as Omit<EffectInstance, "type"> & { type: string; waveletChamber?: Wizprocess };
      const { waveletChamber, ...rest } = legacy;
      return { ...rest, type: "wizprocess" as const, wizprocess: legacy.wizprocess ?? waveletChamber };
    }).filter((effect) => effectDefinitions.some((definition) => definition.type === effect.type)).map((effect) => {
      const base = createEffect(effect.type, value.seed);
      const incomingWhere = effect.where;
      return {
        ...base,
        ...effect,
        where: {
          ...base.where,
          ...(incomingWhere ?? {}),
          mode: (whereModes.some((item) => item.value === incomingWhere?.mode) ? incomingWhere?.mode : "whole") as EffectWhereMode,
          threshold: Math.max(0, Math.min(1, Number(incomingWhere?.threshold ?? base.where.threshold))),
          softness: Math.max(0, Math.min(0.5, Number(incomingWhere?.softness ?? base.where.softness))),
          hue: Math.max(0, Math.min(359, Math.round(Number(incomingWhere?.hue ?? base.where.hue)))),
          hueWidth: Math.max(1, Math.min(180, Math.round(Number(incomingWhere?.hueWidth ?? base.where.hueWidth)))),
          scale: Math.max(2, Math.min(240, Math.round(Number(incomingWhere?.scale ?? base.where.scale)))),
          invert: incomingWhere?.invert === true,
          seed: Math.max(0, Math.round(Number(incomingWhere?.seed ?? base.where.seed))),
          sampleColor: Math.max(0, Math.min(0xffffff, Math.round(Number(incomingWhere?.sampleColor ?? base.where.sampleColor)))),
          sampleX: Math.max(0, Math.min(1, Number(incomingWhere?.sampleX ?? base.where.sampleX))),
          sampleY: Math.max(0, Math.min(1, Number(incomingWhere?.sampleY ?? base.where.sampleY))),
          colorReach: Math.max(0.01, Math.min(1, Number(incomingWhere?.colorReach ?? base.where.colorReach))),
          shadeLoyalty: Math.max(0, Math.min(1, Number(incomingWhere?.shadeLoyalty ?? base.where.shadeLoyalty))),
          edgeLoyalty: Math.max(0, Math.min(1, Number(incomingWhere?.edgeLoyalty ?? base.where.edgeLoyalty))),
          bodyExpansion: Math.max(-0.08, Math.min(0.18, Number(incomingWhere?.bodyExpansion ?? base.where.bodyExpansion))),
          recognition: Math.max(0, Math.min(1, Number(incomingWhere?.recognition ?? base.where.recognition))),
          targetMemory: (["source", "current", "held"].includes(String(incomingWhere?.targetMemory)) ? incomingWhere?.targetMemory : base.where.targetMemory) as EffectTargetMemory,
        },
        parameters: {
          ...base.parameters,
          ...effect.parameters,
          ...(effect.type === "dither-field" && effect.parameters?.ditherVersion === undefined
            ? { travel: 0, paletteLogic: 0, body: 0, sourceReturn: 0, ditherVersion: 0 }
            : {}),
          ...(effect.type === "dither-field" && effect.parameters?.ditherVersion !== undefined && Number(effect.parameters.ditherVersion) < 2
            ? { habitat: 0, reach: 1, habitatScale: 72, diversity: 0, ditherVersion: effect.parameters.ditherVersion }
            : {}),
          ...(effect.type === "wavelet-cartography" && effect.parameters?.mapContinuity === undefined
            ? { transformScale: 1, mapContinuity: 0 }
            : {}),
          ...(effect.type === "petscii-study" && effect.tileField?.tileLogic === undefined
            ? { rulePressure: 0 }
            : {}),
        },
        characterField: effect.type === "surface-motion" ? {...defaultCharacterField(),bank:"custom",...effect.characterField,glyphs:(effect.characterField?.glyphs??Array.from(".:/|+")).flatMap(g=>Array.from(String(g))).filter(g=>g.charCodeAt(0)>=32&&g.charCodeAt(0)<=126).slice(0,64)} : effect.type === "ascii-field" ? {
          ...defaultCharacterField(),
          ...(effect.characterField ?? {}),
          kind: "ascii",
          asciiVersion: Number(effect.characterField?.asciiVersion) === 2 ? 2 : 1,
          composition: (["field", "inlay"].includes(effect.characterField?.composition ?? "") ? effect.characterField!.composition : "field") as CharacterField["composition"],
          glyphLogic: (["mass", "repeat", "bones", "hybrid"].includes(effect.characterField?.glyphLogic ?? "") ? effect.characterField!.glyphLogic : "mass") as CharacterField["glyphLogic"],
          alphabetOrder: effect.characterField?.alphabetOrder === "entered" ? "entered" : "measured",
          placement: (["whole", "body", "outline", "outside"].includes(effect.characterField?.placement ?? "") ? effect.characterField!.placement : "whole") as CharacterField["placement"],
          fontAsset: typeof effect.characterField?.fontAsset === "string" && effect.characterField.fontAsset.length ? effect.characterField.fontAsset : "source-code-pro-semibold-2.042",
          atlasVersion: Math.max(1, Math.round(Number(effect.characterField?.atlasVersion ?? 1))),
          bank: asciiBanks.some((bank) => bank.id === effect.characterField?.bank) ? effect.characterField!.bank : "density",
          glyphs: Array.isArray(effect.characterField?.glyphs) && effect.characterField!.glyphs.length
            ? effect.characterField!.glyphs.map((glyph) => String(glyph)).filter((glyph) => glyph.length > 0).slice(0, 64)
            : [...asciiBanks[0].glyphs],
          inkMode: (["source", "palette", "chosen"].includes(effect.characterField?.inkMode ?? "") ? effect.characterField!.inkMode : "source") as CharacterField["inkMode"],
          inkColor: Math.max(0, Math.min(0xffffff, Math.round(Number(effect.characterField?.inkColor ?? 0xf2eee7)))),
          groundColor: Math.max(0, Math.min(0xffffff, Math.round(Number(effect.characterField?.groundColor ?? 0x151319)))),
        } : undefined,
        languageBody: effect.type === "language-body" ? {
          ...defaultLanguageBody(),
          ...(effect.languageBody ?? {}),
          kind: "language-body",
          phrases: (Array.isArray(effect.languageBody?.phrases) && effect.languageBody!.phrases.length
            ? effect.languageBody!.phrases
            : [effect.languageBody?.phraseA ?? "Almost", effect.languageBody?.phraseB ?? "Human"])
            .map((phrase, index) => normalizeLanguagePhrase(phrase, index === 0 ? "Almost" : ""))
            .filter((phrase) => phrase.length > 0)
            .slice(0, 64),
          phraseA: normalizeLanguagePhrase(effect.languageBody?.phrases?.[0] ?? effect.languageBody?.phraseA, "Almost"),
          phraseB: normalizeLanguagePhrase(effect.languageBody?.phrases?.[1] ?? effect.languageBody?.phraseB ?? effect.languageBody?.phrases?.[0], "Human"),
          flow: (["organic", "rings", "rays", "grid"].includes(effect.languageBody?.flow ?? "") ? effect.languageBody!.flow : "organic") as LanguageBody["flow"],
          body: (["figure", "infantry-dove", "image", "where", "knot"].includes(effect.languageBody?.body ?? "") ? effect.languageBody!.body : "figure") as LanguageBody["body"],
          knot: effect.languageBody?.knot ? Object.fromEntries(knotControls.map(p => [p.id, Number.isFinite(effect.languageBody?.knot?.[p.id]) ? Math.max(p.min, Math.min(p.max, effect.languageBody!.knot![p.id])) : knotDefaults[p.id]])) : undefined,
          phraseLogic: (["alternate", "noise", "near-far", "image"].includes(effect.languageBody?.phraseLogic ?? "") ? effect.languageBody!.phraseLogic : "noise") as LanguageBody["phraseLogic"],
          composition: (["field", "inlay"].includes(effect.languageBody?.composition ?? "") ? effect.languageBody!.composition : "field") as LanguageBody["composition"],
          inkMode: (["source", "palette", "chosen"].includes(effect.languageBody?.inkMode ?? "") ? effect.languageBody!.inkMode : "chosen") as LanguageBody["inkMode"],
          inkColor: Math.max(0, Math.min(0xffffff, Math.round(Number(effect.languageBody?.inkColor ?? 0xf2eee7)))),
          groundColor: Math.max(0, Math.min(0xffffff, Math.round(Number(effect.languageBody?.groundColor ?? 0x050505)))),
          loopMode: (["held", "orbit", "breathe", "collapse", "metamorphose"].includes(effect.languageBody?.loopMode ?? "") ? effect.languageBody!.loopMode : "held") as LanguageBody["loopMode"],
        } : undefined,
        zhuyinField: effect.type === "zhuyin-weave" ? {
          ...defaultZhuyinField(),
          ...(effect.zhuyinField ?? {}),
          kind: "zhuyin",
          composition: (["field", "inlay"].includes(effect.zhuyinField?.composition ?? "") ? effect.zhuyinField!.composition : "inlay") as ZhuyinField["composition"],
          bank: zhuyinBanks.some((bank) => bank.id === effect.zhuyinField?.bank) ? effect.zhuyinField!.bank : "full",
          glyphs: Array.isArray(effect.zhuyinField?.glyphs) && effect.zhuyinField!.glyphs.length
            ? effect.zhuyinField!.glyphs.map((glyph) => String(glyph)).filter((glyph) => glyph.length > 0).slice(0, 64)
            : [...zhuyinBanks[0].glyphs],
          mutationMode: (["held", "drift", "fracture"].includes(effect.zhuyinField?.mutationMode ?? "")
            ? effect.zhuyinField!.mutationMode
            : "held") as ZhuyinField["mutationMode"],
          spatialLogic: (["weave", "syllable", "call-response"].includes(effect.zhuyinField?.spatialLogic ?? "")
            ? effect.zhuyinField!.spatialLogic
            : "weave") as ZhuyinField["spatialLogic"],
          placement: (["whole", "body", "outline", "outside"].includes(effect.zhuyinField?.placement ?? "")
            ? effect.zhuyinField!.placement
            : "whole") as ZhuyinField["placement"],
          inkMode: (["source", "palette", "chosen"].includes(effect.zhuyinField?.inkMode ?? "") ? effect.zhuyinField!.inkMode : "palette") as ZhuyinField["inkMode"],
          inkColor: Math.max(0, Math.min(0xffffff, Math.round(Number(effect.zhuyinField?.inkColor ?? 0xf2eee7)))),
          groundColor: Math.max(0, Math.min(0xffffff, Math.round(Number(effect.zhuyinField?.groundColor ?? 0x151319)))),
        } : undefined,
        tileField: effect.type === "petscii-study" ? {
          ...defaultTileField(),
          ...(effect.tileField ?? {}),
          kind: "petscii-study",
          tileLogic: (["image", "infection", "gravity"].includes(effect.tileField?.tileLogic ?? "")
            ? effect.tileField!.tileLogic
            : "image") as TileField["tileLogic"],
          foregroundColor: Math.max(0, Math.min(0xffffff, Math.round(Number(effect.tileField?.foregroundColor ?? petsciiPalette[14])))),
          backgroundColor: Math.max(0, Math.min(0xffffff, Math.round(Number(effect.tileField?.backgroundColor ?? petsciiPalette[0])))),
        } : undefined,
        ultimateSort: effect.type === "ultimate-sort" ? normalizeUltimateSortStack(effect.ultimateSort) : undefined,
        wizprocess: effect.type === "wizprocess" ? normalizeWizprocess(effect.wizprocess) : undefined,
      };
    }),
  };
}
