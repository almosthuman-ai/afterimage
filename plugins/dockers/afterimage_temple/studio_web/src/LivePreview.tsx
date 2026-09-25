import {renderFormStack} from "./formStack";
import {renderMixedForm,selectFormKind} from "./formComposition";
import {renderStructuredForm} from './structuredForm';
import {groupPick} from './figureGroups';
import { renderFigure, figureDefaults } from "./figureComposition";
import {renderSurfaceMotion} from "./surfaceMotion";
import { applyPaletteCycle, publishCyclePalette, paletteLoopRepeats, paletteLoopFrames } from "./paletteCycle";
import { ultimateToneKey, ultimateToneSelected } from "./ultimateTone";
import { drawKnot, knotDefaults } from "./knot";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { petsciiPalette, randomSource, type EffectInstance, type KoneFormState, type LanguageBody, type StudioLayer, type StudioRecipe, type UltimateSortRecipe, type Wizprocess } from "./studio";
import { rgbToWizColorSpace, wizColorSpaceToRgb } from "./colorSpaces";
import { audioBending, isAudioBendingType } from "./audioBending";
import { spectralPreview } from "./spectralPreview";
import { scoreRecipe } from "./timeScore";
import { ASCII_ATLAS_VERSION, ASCII_FONT_ASSET, ASCII_FONT_FAMILY, asciiBitRot, asciiLoopWave, chooseStructuralGlyph, measuredAsciiGlyphs, printableAsciiGlyphs, type AsciiSourceFeature } from "./asciiTransmission";

export type TargetSample = { color: number; x: number; y: number };
type LivePreviewProps = {
  recipe: StudioRecipe;
  sourceDataUrl?: string;
  layerDataUrls?: Record<string, string>;
  showOriginal?: boolean;
  targetPreviewEffectId?: string;
  pickTargetEffectId?: string;
  pickTargetRecipeId?: string;
  onTargetPick?: (sample: TargetSample) => void;
  animate?: boolean;
  figureDragTarget?: string;
  onFigureMove?: (target:string,x:number,y:number)=>void;
};
export type AsciiTextCapture = { text: string; columns: number; rows: number; fontAsset: string; atlasVersion: number };
export type LivePreviewHandle = {
  position: () => number;
  capture: () => { dataUrl: string; width: number; height: number } | null;
  captureAsciiText: () => AsciiTextCapture | null;
};
type HeldTargetField = { signature: string; weights: Float32Array };
let latestAsciiTextCapture: AsciiTextCapture | null = null;

const packedCss = (packed: number, alpha = 1) => `rgba(${(packed >> 16) & 255},${(packed >> 8) & 255},${packed & 255},${alpha})`;
const param = (effect: EffectInstance, id: string, fallback: number) => effect.parameters[id] ?? fallback;

function sourceWithBackgroundCutOut(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const patch = Math.max(1, Math.min(10, Math.round(Math.min(canvas.width, canvas.height) * 0.015)));
  const samples: number[][] = [];
  for (const [originX, originY] of [[0, 0], [canvas.width - patch, 0], [0, canvas.height - patch], [canvas.width - patch, canvas.height - patch]]) {
    for (let y = originY; y < originY + patch; y += 1) for (let x = originX; x < originX + patch; x += 1) {
      const at = (y * canvas.width + x) * 4;
      samples.push([pixels.data[at], pixels.data[at + 1], pixels.data[at + 2]]);
    }
  }
  const background = [0, 1, 2].map((channel) => samples.reduce((sum, sample) => sum + sample[channel], 0) / samples.length);
  const coherent = samples.every((sample) => Math.max(...sample.map((value, channel) => Math.abs(value - background[channel]))) <= 24);
  if (!coherent) return canvas;
  for (let at = 0; at < pixels.data.length; at += 4) {
    const distance = Math.max(Math.abs(pixels.data[at] - background[0]), Math.abs(pixels.data[at + 1] - background[1]), Math.abs(pixels.data[at + 2] - background[2]));
    const visibility = Math.max(0, Math.min(1, (distance - 8) / 40));
    pixels.data[at + 3] = Math.round(pixels.data[at + 3] * visibility);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function fittedSource(image: HTMLImageElement | null, width: number, height: number, recipe: StudioRecipe, phase = 0,formImages:Record<string,HTMLImageElement>={}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false })!;
  context.fillStyle = packedCss(recipe.palette[3]);
  context.fillRect(0, 0, width, height);
  if(recipe.baseMode==="kone"&&recipe.formStack)return renderFormStack(width,height,recipe,(part,ground)=>fittedSource(part.id===recipe.formSelected?image:formImages[`form:${part.id}`]??null,width,height,{...recipe,formStack:undefined,formSelected:undefined,palette:[recipe.palette[0],recipe.palette[1],recipe.palette[2],ground],koneForm:{...part.form,parameters:{...part.form.parameters,formMix:0}}},phase));
  if(recipe.baseMode==="kone"&&(recipe.koneForm.parameters.formMix??0)>=.5)return renderMixedForm(width,height,recipe.koneForm.parameters,recipe.palette[3],(kind,ground)=>fittedSource(image,width,height,{...recipe,palette:[recipe.palette[0],recipe.palette[1],recipe.palette[2],ground],koneForm:{...recipe.koneForm,seed:(recipe.koneForm.parameters[`formMix${kind}Seed`]??-1)>=0?recipe.koneForm.parameters[`formMix${kind}Seed`]:recipe.koneForm.seed,parameters:{...selectFormKind(recipe.koneForm.parameters,kind),formMix:0}}},phase));
  if(recipe.baseMode==="kone"&&(recipe.koneForm.parameters.structureMode??0)>0)return renderStructuredForm(width,height,recipe.koneForm.parameters,recipe.palette,recipe.koneForm.seed,image,phase,size=>koneForm(size,size,{...recipe.koneForm,parameters:{...recipe.koneForm.parameters,structureMode:0,_structureIsolated:1}},recipe,phase));
  if (recipe.baseMode === "kone" && (recipe.koneForm.parameters.figureActive ?? 0) >= .5) return renderFigure(width,height,recipe.koneForm.parameters,recipe.palette,recipe.koneForm.seed,image,phase);
  if (recipe.baseMode === "kone") return koneForm(width, height, recipe.koneForm, recipe, phase);
  if (image) {
    const scale = recipe.sourceFit === "contain"
      ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
      : Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const prepared = recipe.sourceFit === "contain" && recipe.sourceBackground === "cutout"
      ? sourceWithBackgroundCutOut(image, drawWidth, drawHeight)
      : image;
    context.drawImage(prepared, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  } else {
    const random = randomSource(recipe.seed);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, packedCss(recipe.palette[3]));
    gradient.addColorStop(0.36, packedCss(recipe.palette[0]));
    gradient.addColorStop(0.7, packedCss(recipe.palette[1]));
    gradient.addColorStop(1, packedCss(recipe.palette[2]));
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "difference";
    for (let i = 0; i < 52; i += 1) {
      context.fillStyle = packedCss(recipe.palette[i % 3], 0.06 + random() * 0.24);
      context.fillRect((random() - 0.12) * width, random() * height, width * (0.03 + random() * 0.75), 1 + random() * height * 0.035);
    }
    context.globalCompositeOperation = "source-over";
  }
  return canvas;
}

function newSurface(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function cloneSurface(input: HTMLCanvasElement) {
  const output = newSurface(input.width, input.height);
  output.getContext("2d")!.drawImage(input, 0, 0);
  return output;
}

type KoneVector = { x: number; y: number; z: number };
type KonePoint = { x: number; y: number };

const koneCross = (a: KoneVector, b: KoneVector): KoneVector => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const koneNormalize = (vector: KoneVector): KoneVector => {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
};

function koneProject(point: KoneVector, width: number, height: number, turn: number): KonePoint {
  const mi = turn * Math.PI / 180;
  const rotationX = Math.PI * 2 * Math.cos(mi);
  const rotationZ = 2 * Math.cos(mi);
  const cosX = Math.cos(rotationX), sinX = Math.sin(rotationX);
  const cosZ = Math.cos(rotationZ), sinZ = Math.sin(rotationZ);
  const afterX = {
    x: point.x,
    y: point.y * cosX - point.z * sinX,
    z: point.y * sinX + point.z * cosX,
  };
  const afterZ = {
    x: afterX.x * cosZ - afterX.y * sinZ,
    y: afterX.x * sinZ + afterX.y * cosZ,
    z: afterX.z,
  };
  const camera = Math.max(width, height) * 0.9;
  const perspective = Math.max(0.2, Math.min(5, camera / Math.max(camera * 0.2, camera - afterZ.z)));
  return { x: width / 2 + afterZ.x * perspective, y: height / 2 + afterZ.y * perspective };
}

function koneCurvePatch(context: CanvasRenderingContext2D, anchor: KonePoint, first: KonePoint, middle: KonePoint, last: KonePoint) {
  context.beginPath();
  context.moveTo(first.x, first.y);
  context.bezierCurveTo(
    first.x + (middle.x - anchor.x) / 6,
    first.y + (middle.y - anchor.y) / 6,
    middle.x - (last.x - first.x) / 6,
    middle.y - (last.y - first.y) / 6,
    middle.x,
    middle.y,
  );
  context.bezierCurveTo(
    middle.x + (last.x - first.x) / 6,
    middle.y + (last.y - first.y) / 6,
    last.x - (anchor.x - middle.x) / 6,
    last.y - (anchor.y - middle.y) / 6,
    last.x,
    last.y,
  );
  context.closePath();
  context.fill();
  context.stroke();
}

export function koneForm(width: number, height: number, form: KoneFormState, recipe: StudioRecipe, phase = 0) {
  const output = newSurface(width, height);
  const context = output.getContext("2d")!;
  const shortEdge = Math.min(width, height);
  const unit = shortEdge / 600;
  const formParam = (id: string, fallback: number) => form.parameters[id] ?? fallback;
  if ((form.parameters.knotActive ?? 0) >= .5) {
    if(!form.parameters._structureIsolated){context.fillStyle = packedCss(recipe.palette[3]); context.fillRect(0,0,width,height);}
    drawKnot(context,width,height,form.parameters,form.seed,phase,recipe.palette,[form.knotText ?? "JOY"]);
    return output;
  }
  const bodyRadius = formParam("bodyRadius", 0.26) * shortEdge;
  const axisStretch = formParam("axisStretch", 1);
  const lobes = Math.max(1, Math.round(formParam("lobes", 5)));
  const breathDepth = formParam("breathDepth", 0.32);
  const opening = formParam("opening", 0.78);
  const ribCount = Math.max(2, Math.round(formParam("ribCount", 170)));
  const twist = formParam("twist", 1.3);
  const turn = formParam("turn", 238);
  const wound = formParam("wound", 0.18);
  const foldDepth = formParam("foldDepth", 0.08) * shortEdge;
  const asymmetry = formParam("asymmetry", 0);
  const amputation = formParam("amputation", 0);
  const innerBody = formParam("innerBody", 0);
  const mouths = formParam("mouths", 0);
  const budding = formParam("budding", 0);
  const flowerSize = formParam("flowerSize", 1);
  const orchidPresence = formParam("orchidPresence", 0);
  const orchidSpecies = formParam("orchidSpecies", 0);
  const koneElement = formParam("koneElement", 1) >= 0.5;
  const flowerActive = formParam("flowerElement", 1) >= 0.5 && formParam("flowerPresence", 1) >= 0.5;
  const growthActive = formParam("growthElement", 1) >= 0.5 && formParam("growthPresence", 1) >= 0.5;
  const flowerPositionScatter = formParam("flowerPositionScatter", 0) * (growthActive ? 1 : 0);
  const flowerClustering = formParam("flowerClustering", 0) * (growthActive ? 1 : 0);
  const surfaceAttraction = formParam("surfaceAttraction", 0) * (growthActive ? 1 : 0);
  const bridgeGrowth = formParam("bridgeGrowth", 0) * (growthActive ? 1 : 0);
  const growthReach = formParam("growthReach", 0.72);
  const bloomSites = Math.round(formParam("bloomSites", 0));
  const graftDepth = formParam("graftDepth", 0) * (growthActive ? 1 : 0);
  const mouthsActive = formParam("mouthsElement", 1) >= 0.5 && formParam("mouthsPresence", 1) >= 0.5;
  const orchidBackPetals = formParam("orchidBackPetals", 1) >= 0.5;
  const orchidSepals = formParam("orchidSepals", 1) >= 0.5;
  const orchidWidePetals = formParam("orchidWidePetals", 1) >= 0.5;
  const orchidLip = formParam("orchidLip", 1) >= 0.5;
  const orchidThroat = formParam("orchidThroat", 1) >= 0.5;
  const orchidColumn = formParam("orchidColumn", 1) >= 0.5;
  const orchidVeins = formParam("orchidVeins", 0) >= 0.5;
  const pouchLeaves = formParam("pouchLeaves", 1) >= 0.5;
  const pouchBody = formParam("pouchBody", 1) >= 0.5;
  const pouchVeins = formParam("pouchVeins", 1) >= 0.5;
  const pouchScale = formParam("pouchScale", 0.65);
  const pouchInflation = formParam("pouchInflation", 0.72);
  const pouchOpening = formParam("pouchOpening", 0.28);
  const pouchSplit = formParam("pouchSplit", 0);
  const pouchInversion = formParam("pouchInversion", 0);
  const spiralLeaves = formParam("spiralLeaves", 1) >= 0.5;
  const spiralStalk = formParam("spiralStalk", 1) >= 0.5;
  const spiralBlooms = formParam("spiralBlooms", 1) >= 0.5;
  const spiralHeight = formParam("spiralHeight", 1);
  const spiralBloomSize = formParam("spiralBloomSize", 0.55);
  const spiralTurns = formParam("spiralTurns", 3.2);
  const spiralBloomCount = Math.max(3, Math.round(formParam("spiralBloomCount", 18)));
  const spiralMissingBeats = formParam("spiralMissingBeats", 0);
  const spiralDrift = formParam("spiralDrift", 0.16);
  const spineBreak = formParam("spineBreak", 0);
  const ribEscape = formParam("ribEscape", 0) * (growthActive ? 1 : 0);
  const molt = formParam("molt", 0);
  const koneSizeDifference = formParam("koneSizeDifference", 0);
  const koneSeparation = formParam("koneSeparation", 0);
  const konePositionScatter = formParam("konePositionScatter", 0);
  const seam = formParam("seam", 0);
  const gravity = formParam("gravity", 0);
  const possession = formParam("possession", 0);
  const ritual = formParam("ritual", 0) * (growthActive ? 1 : 0);
  const shellPresence = formParam("shellPresence", 1);
  const mi = turn * Math.PI / 180;
  const psi = Math.cos(mi) * twist;
  const position: KoneVector = { x: psi * unit, y: (100 - 2 * psi) * unit, z: 0 };
  const tangent = koneNormalize({
    x: -Math.sin(psi) * 10 + 60 * Math.sin(2 * psi),
    y: Math.cos(psi) * 10 + 60 * Math.cos(2 * psi),
    z: 60 * Math.cos(3 * psi),
  });
  const ringY = koneNormalize(koneCross({ x: 0, y: 250 * unit, z: 250 * unit }, position));
  const ringZ = koneNormalize(koneCross(tangent, ringY));
  const seedPhase = (form.seed % 100000) / 100000 * Math.PI * 2;
  const signedNoise = (value: number) => ((((Math.sin(value) * 43758.5453) % 1) + 1) % 1) * 2 - 1;
  const primaryOffsetX = signedNoise(seedPhase * 17.17 + 2.1) * shortEdge * 0.28 * konePositionScatter;
  const primaryOffsetY = signedNoise(seedPhase * 29.31 + 5.7) * shortEdge * 0.28 * konePositionScatter;
  const legacyGhostOffset = molt * shortEdge * 0.16;
  const separationAngle = seedPhase * 1.73 + molt * Math.PI;
  const separationDistance = shortEdge * 0.32 * koneSeparation;
  const secondOffsetX = primaryOffsetX - legacyGhostOffset * 0.55 + Math.cos(separationAngle) * separationDistance;
  const secondOffsetY = primaryOffsetY + legacyGhostOffset + Math.sin(separationAngle) * separationDistance;
  const secondScale = Math.max(0.2, 1 + molt * 0.08 + koneSizeDifference * 0.75);

  const koneGraftPoint = (phi: number) => {
    const breath = 1 + breathDepth * Math.sin(lobes * phi);
    const woundWave = (
      Math.sin(phi * 2.17 + seedPhase)
      + 0.55 * Math.sin(phi * 5.31 + seedPhase * 1.7)
      + 0.25 * Math.sin(phi * 11.73 - seedPhase * 0.6)
    ) / 1.8;
    const mutant = 1 + asymmetry * 0.62 * Math.sin(phi + seedPhase * 0.7);
    const possessed = 1 + possession * 1.3 * Math.pow(Math.max(0, Math.sin(phi * 3 + seedPhase)), 3);
    let pressure = breath * (1 + wound * woundWave) * mutant * possessed;
    const escapeSignal = (Math.sin(phi * 7.13 + seedPhase * 2.2) + 1) * 0.5;
    if (escapeSignal > 1 - ribEscape * 0.55) pressure *= 1 + ribEscape * 1.8;
    const alongZ = bodyRadius * axisStretch * pressure * Math.sin(phi);
    const alongY = bodyRadius * pressure * Math.cos(phi);
    const kink = spineBreak * shortEdge * 0.2 * Math.sin(phi * 0.5 + seedPhase);
    const sag = gravity * shortEdge * 0.28 * Math.pow(Math.max(0, Math.sin(phi + seedPhase)), 2);
    const vertex = {
      x: position.x + ringZ.x * alongZ + ringY.x * alongY + kink,
      y: position.y + ringZ.y * alongZ + ringY.y * alongY + sag,
      z: position.z + ringZ.z * alongZ + ringY.z * alongY,
    };
    const projected = koneProject({ x: 12 * unit + vertex.x, y: foldDepth - vertex.z, z: -vertex.y }, width, height, turn);
    return { x: projected.x + primaryOffsetX, y: projected.y + primaryOffsetY };
  };

  const woundAt = (phi: number) => amputation > 0
    && (Math.sin(phi * 1.31 + seedPhase * 1.9) + 1) * 0.5 > 1 - amputation * 0.52;

  context.fillStyle = packedCss(recipe.palette[3]);
  if(!form.parameters._structureIsolated)context.fillRect(0, 0, width, height);
  context.lineJoin = "round";
  context.lineCap = "round";

  const drawKoneBody = (scale: number, offsetX: number, offsetY: number, fill: string, stroke: string, ghost = false) => {
    const anchorProjected = koneProject({ x: 0, y: 0, z: 0 }, width, height, turn);
    const anchor = { x: anchorProjected.x + offsetX, y: anchorProjected.y + offsetY };
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = Math.max(0.65, unit * (ghost ? 0.8 : 1));
    for (let rib = 0; rib < ribCount; rib += 1) {
      const phi = rib / Math.max(1, ribCount - 1) * Math.PI * 2 * opening;
      const cutSignal = (Math.sin(phi * 1.31 + seedPhase * 1.9) + 1) * 0.5;
      if (!ghost && amputation > 0 && cutSignal > 1 - amputation * 0.52) continue;
      const breath = 1 + breathDepth * Math.sin(lobes * phi);
      const woundWave = (
        Math.sin(phi * 2.17 + seedPhase)
        + 0.55 * Math.sin(phi * 5.31 + seedPhase * 1.7)
        + 0.25 * Math.sin(phi * 11.73 - seedPhase * 0.6)
      ) / 1.8;
      const mutant = 1 + asymmetry * 0.62 * Math.sin(phi + seedPhase * 0.7);
      const possessed = 1 + possession * 1.3 * Math.pow(Math.max(0, Math.sin(phi * 3 + seedPhase)), 3);
      let pressure = breath * (1 + wound * woundWave) * mutant * possessed * scale;
      const escapeSignal = (Math.sin(phi * 7.13 + seedPhase * 2.2) + 1) * 0.5;
      if (!ghost && escapeSignal > 1 - ribEscape * 0.55) pressure *= 1 + ribEscape * 1.8;
      const alongZ = bodyRadius * axisStretch * pressure * Math.sin(phi);
      const alongY = bodyRadius * pressure * Math.cos(phi);
      const kink = spineBreak * shortEdge * 0.2 * Math.sin(phi * 0.5 + seedPhase);
      const sag = gravity * shortEdge * 0.28 * Math.pow(Math.max(0, Math.sin(phi + seedPhase)), 2);
      const vertex = {
        x: position.x + ringZ.x * alongZ + ringY.x * alongY + kink,
        y: position.y + ringZ.y * alongZ + ringY.y * alongY + sag,
        z: position.z + ringZ.z * alongZ + ringY.z * alongY,
      };
      const projected = (point: KoneVector) => {
        const result = koneProject(point, width, height, turn);
        return { x: result.x + offsetX, y: result.y + offsetY };
      };
      const first = projected({ x: vertex.x, y: 15 * unit + vertex.y, z: 12 * unit + vertex.z });
      const middle = projected({ x: -vertex.x, y: -vertex.z, z: 15 * unit + vertex.y });
      const last = projected({ x: 12 * unit + vertex.x, y: foldDepth - vertex.z, z: -vertex.y });
      if (formParam("printedFolds", 0) >= .5) {
        const facing = (first.x - anchor.x) * (last.y - anchor.y) - (first.y - anchor.y) * (last.x - anchor.x);
        context.fillStyle = packedCss(recipe.palette[facing < 0 ? 1 : 0]);
        context.strokeStyle = rib % Math.max(1, Math.round(formParam("printSpacing", 3))) === 0 || rib === ribCount - 1 ? packedCss(recipe.palette[2]) : context.fillStyle;
        context.lineWidth = Math.max(.15, unit * formParam("printWeight", .7));
      }
      koneCurvePatch(context, anchor, first, middle, last);
    }
  };

  const drawLimb = (x1: number, y1: number, x2: number, y2: number, thickness: number, scale: number, phase: number, fill: string, stroke: string) => {
    context.strokeStyle = fill;
    context.lineWidth = Math.max(2, thickness * scale);
    context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / length, ny = (x2 - x1) / length;
    const ribTotal = Math.max(4, Math.min(36, Math.round(ribCount / 14)));
    context.strokeStyle = stroke;
    context.lineWidth = Math.max(0.55, unit * 0.8);
    for (let index = 0; index <= ribTotal; index += 1) {
      const t = index / ribTotal;
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      const escape = (Math.sin(index * 2.37 + phase) + 1) * 0.5 > 1 - ribEscape * 0.55 ? 1 + ribEscape * 3 : 1;
      const half = thickness * scale * 0.58 * Math.sin(Math.PI * (0.08 + t * 0.84)) * escape;
      context.beginPath(); context.moveTo(x - nx * half, y - ny * half); context.lineTo(x + nx * half, y + ny * half); context.stroke();
    }
  };

  const drawPetal = (cx: number, cy: number, angle: number, length: number, breadth: number, fill: string, stroke: string) => {
    const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
    context.fillStyle = fill; context.strokeStyle = stroke; context.lineWidth = Math.max(0.6, unit);
    context.beginPath(); context.moveTo(cx, cy);
    context.bezierCurveTo(cx + dx * length * 0.38 + nx * breadth, cy + dy * length * 0.38 + ny * breadth, cx + dx * length * 0.8 + nx * breadth * 0.45, cy + dy * length * 0.8 + ny * breadth * 0.45, cx + dx * length, cy + dy * length);
    context.bezierCurveTo(cx + dx * length * 0.8 - nx * breadth * 0.45, cy + dy * length * 0.8 - ny * breadth * 0.45, cx + dx * length * 0.38 - nx * breadth, cy + dy * length * 0.38 - ny * breadth, cx, cy);
    context.closePath(); context.fill(); context.stroke();
    context.beginPath(); context.moveTo(cx, cy); context.lineTo(cx + dx * length * (1 + ribEscape * 0.55), cy + dy * length * (1 + ribEscape * 0.55)); context.stroke();
  };

  const drawCattleya = (cx: number, cy: number, angle: number, size: number) => {
    context.save();
    context.translate(cx, cy);
    context.rotate(angle + Math.PI / 2);
    const pale = packedCss(recipe.palette[2]);
    const violet = packedCss(recipe.palette[1]);
    const deep = packedCss(recipe.palette[0]);
    if (orchidBackPetals) {
      context.globalAlpha = 0.82;
      drawPetal(0, size * 0.08, Math.PI * 0.7, size * 1.28, size * 0.24, pale, deep);
      drawPetal(0, size * 0.08, Math.PI * 0.3, size * 1.28, size * 0.24, pale, deep);
    }
    context.globalAlpha = 1;
    if (orchidSepals) {
      drawPetal(0, 0, -Math.PI / 2, size * 1.34, size * 0.2, pale, violet);
      drawPetal(0, 0, Math.PI * 0.92, size * 1.18, size * 0.18, pale, violet);
      drawPetal(0, 0, Math.PI * 0.08, size * 1.18, size * 0.18, pale, violet);
    }
    if (orchidWidePetals) {
      drawPetal(0, 0, Math.PI * 1.2, size * 1.16, size * 0.48, pale, violet);
      drawPetal(0, 0, -Math.PI * 0.2, size * 1.16, size * 0.48, pale, violet);
    }
    if (orchidLip) {
      context.fillStyle = violet; context.strokeStyle = deep; context.lineWidth = Math.max(0.7, size * 0.045);
      context.beginPath(); context.moveTo(-size * 0.13, size * 0.05);
      context.bezierCurveTo(-size * 0.2, size * 0.28, -size * 0.55, size * 0.34, -size * 0.5, size * 0.7);
      context.bezierCurveTo(-size * 0.48, size * 0.9, -size * 0.3, size * 1.05, -size * 0.12, size * 0.98);
      context.quadraticCurveTo(0, size * 1.12, size * 0.12, size * 0.98);
      context.bezierCurveTo(size * 0.3, size * 1.05, size * 0.48, size * 0.9, size * 0.5, size * 0.7);
      context.bezierCurveTo(size * 0.55, size * 0.34, size * 0.2, size * 0.28, size * 0.13, size * 0.05);
      context.closePath(); context.fill(); context.stroke();
    }
    if (orchidThroat) { context.fillStyle = pale; context.beginPath(); context.ellipse(0, size * 0.5, size * 0.16, size * 0.38, 0, 0, Math.PI * 2); context.fill(); }
    if (orchidVeins) {
      context.strokeStyle = deep; context.lineWidth = Math.max(0.55, size * 0.025);
      for (const vein of [-0.11, 0, 0.11]) { context.beginPath(); context.moveTo(0, size * 0.2); context.quadraticCurveTo(vein * size, size * 0.5, vein * size * 1.8, size * 0.78); context.stroke(); }
    }
    if (orchidColumn) { context.fillStyle = pale; context.strokeStyle = deep; context.beginPath(); context.ellipse(0, size * 0.08, size * 0.12, size * 0.2, 0, 0, Math.PI * 2); context.fill(); context.stroke(); }
    context.restore();
  };

  const drawPouch = (cx: number, cy: number, angle: number, size: number) => {
    const pale = packedCss(recipe.palette[2]);
    const living = packedCss(recipe.palette[1]);
    const deep = packedCss(recipe.palette[0]);
    const voidColor = packedCss(recipe.palette[3]);
    context.save();
    context.translate(cx, cy);
    context.rotate(angle + Math.PI / 2);
    context.lineJoin = "round";
    if (pouchLeaves) {
      drawPetal(0, size * 0.72, Math.PI * 0.8, size * 1.72, size * 0.48, pale, deep);
      drawPetal(0, size * 0.72, Math.PI * 0.2, size * 1.72, size * 0.48, pale, deep);
      context.strokeStyle = deep; context.lineWidth = Math.max(0.5, size * 0.022);
      for (const side of [-1, 1]) for (let vein = 1; vein <= 3; vein += 1) {
        const leafAngle = side < 0 ? Math.PI * 0.8 : Math.PI * 0.2;
        const reach = size * (0.38 + vein * 0.28);
        context.beginPath(); context.moveTo(0, size * 0.72); context.lineTo(Math.cos(leafAngle) * reach, size * 0.72 + Math.sin(leafAngle) * reach); context.stroke();
      }
    }
    context.strokeStyle = deep; context.lineWidth = Math.max(0.7, size * 0.05);
    context.beginPath(); context.moveTo(0, size * 0.82); context.quadraticCurveTo(size * 0.08, size * 0.34, 0, -size * 0.18); context.stroke();
    drawPetal(0, -size * 0.12, -Math.PI / 2, size * 1.04, size * 0.34, pale, deep);
    if (pouchBody) {
      context.save();
      context.translate(0, size * 0.02);
      context.rotate(Math.PI * pouchInversion);
      const pressure = 0.34 + pouchInflation * 0.42;
      const splitGap = size * pouchSplit * 0.28;
      const drawHalf = (side: number) => {
        const inner = side * splitGap;
        const outer = side * size * pressure;
        context.fillStyle = living; context.strokeStyle = deep; context.lineWidth = Math.max(0.8, size * 0.045);
        context.beginPath(); context.moveTo(inner + side * size * 0.06, 0);
        context.bezierCurveTo(outer * 0.52, size * 0.12, outer, size * 0.48, outer * 0.88, size * 0.92);
        context.bezierCurveTo(outer * 0.7, size * 1.28, inner + side * size * 0.12, size * 1.34, inner, size * (1.04 - pouchSplit * 0.22));
        context.lineTo(inner, size * 0.18); context.closePath(); context.fill(); context.stroke();
      };
      if (pouchSplit > 0.01) { drawHalf(-1); drawHalf(1); }
      else {
        context.fillStyle = living; context.strokeStyle = deep; context.lineWidth = Math.max(0.8, size * 0.045);
        context.beginPath(); context.moveTo(-size * 0.1, 0);
        context.bezierCurveTo(-size * pressure, size * 0.24, -size * pressure, size * 0.92, 0, size * 1.18);
        context.bezierCurveTo(size * pressure, size * 0.92, size * pressure, size * 0.24, size * 0.1, 0);
        context.closePath(); context.fill(); context.stroke();
      }
      const mouthWidth = size * (0.12 + pouchOpening * 0.5);
      context.fillStyle = deep; context.strokeStyle = voidColor;
      context.beginPath(); context.ellipse(0, size * 0.14, mouthWidth, size * (0.025 + pouchOpening * 0.12), 0, 0, Math.PI * 2); context.fill(); context.stroke();
      if (pouchVeins) {
        context.strokeStyle = pale; context.lineWidth = Math.max(0.5, size * 0.022);
        for (const side of [-1, 1]) for (let vein = 1; vein <= 3; vein += 1) {
          context.beginPath(); context.moveTo(side * mouthWidth * 0.42, size * 0.19); context.quadraticCurveTo(side * size * pressure * 0.72, size * (0.3 + vein * 0.15), side * size * (0.08 + vein * 0.035), size * 1.02); context.stroke();
        }
      }
      context.restore();
    }
    context.restore();
  };

  const drawSpiralStem = (cx: number, cy: number, angle: number, size: number) => {
    const pale = packedCss(recipe.palette[2]);
    const living = packedCss(recipe.palette[1]);
    const deep = packedCss(recipe.palette[0]);
    const height = shortEdge * (0.09 + spiralHeight * 0.14);
    const bend = shortEdge * 0.035 * spiralDrift;
    const stemPoint = (t: number) => ({
      x: Math.sin(Math.PI * t) * bend + Math.sin(t * Math.PI * 2 + seedPhase) * bend * 0.18,
      y: -height * t,
    });
    context.save();
    context.translate(cx, cy);
    context.rotate(angle + Math.PI / 2);
    if (spiralLeaves) {
      drawPetal(0, 0, -Math.PI / 2 - 0.6, height * 0.28, Math.max(unit * 1.5, size * 0.13), pale, deep);
      drawPetal(0, 0, -Math.PI / 2 + 0.54, height * 0.34, Math.max(unit * 1.4, size * 0.12), pale, deep);
      drawPetal(0, 0, -Math.PI / 2 - 0.08, height * 0.2, Math.max(unit, size * 0.08), living, deep);
    }
    if (spiralStalk) {
      context.fillStyle = "transparent";
      context.strokeStyle = deep;
      context.lineWidth = Math.max(0.65, unit * 0.9);
      context.beginPath();
      for (let step = 0; step <= 36; step += 1) {
        const point = stemPoint(step / 36);
        if (step === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
    if (spiralBlooms) {
      for (let index = 0; index < spiralBloomCount; index += 1) {
        const missingSignal = ((Math.sin((index + 1) * 12.9898 + seedPhase * 78.233) * 43758.5453) % 1 + 1) % 1;
        if (missingSignal < spiralMissingBeats * 0.88) continue;
        const t = 0.38 + (index + 0.5) / spiralBloomCount * 0.6;
        const point = stemPoint(t);
        const phase = t * spiralTurns * Math.PI * 2 + seedPhase;
        const depth = 0.55 + ((Math.sin(phase) + 1) * 0.5) * 0.45;
        const outward = Math.cos(phase) >= 0 ? 1 : -1;
        const bloom = size * (0.16 + spiralBloomSize * 0.42) * depth;
        const bloomX = point.x + Math.cos(phase) * size * (0.2 + spiralBloomSize * 0.32);
        const bloomY = point.y + Math.sin(phase) * size * 0.1;
        const bloomAngle = outward > 0 ? Math.sin(phase) * 0.18 : Math.PI - Math.sin(phase) * 0.18;
        drawPetal(bloomX, bloomY, bloomAngle, bloom * 1.35, bloom * 0.48, Math.sin(phase) >= 0 ? living : pale, deep);
        context.fillStyle = deep;
        context.beginPath();
        context.arc(bloomX, bloomY, Math.max(unit * 0.35, bloom * 0.13), 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  };

  const drawFamilyBody = (family: KoneFormState["family"], scale: number, offsetX: number, offsetY: number, fill: string, stroke: string, inner = false) => {
    if (family === "kone") { drawKoneBody(scale, offsetX, offsetY, fill, stroke, inner); return; }
    const cx = width * 0.5 + offsetX;
    const cy = height * 0.5 + offsetY + gravity * shortEdge * 0.08;
    const radius = bodyRadius * scale;
    const kink = spineBreak * radius * 0.8;
    context.save();
    context.translate(cx, cy);
    context.rotate((turn - 238) * Math.PI / 180 * 0.32);
    context.translate(-cx, -cy);
    if (family === "human") {
      const h = Math.min(shortEdge * 0.9, radius * 2.75 * axisStretch);
      const shoulder = radius * (0.48 + opening * 0.24 + asymmetry * 0.18);
      const hip = radius * (0.24 + opening * 0.09);
      const pose = (twist - 1.3) * radius * 0.1 + Math.sin(lobes + seedPhase) * wound * radius * 0.12;
      const heartX = cx + kink * 0.24 + foldDepth * 0.35, heartY = cy - h * 0.12;
      context.fillStyle = fill; context.strokeStyle = stroke;
      context.beginPath(); context.ellipse(cx + kink * 0.55 + pose * 0.25, cy - h * 0.42, h * (0.078 + breathDepth * 0.022 + possession * 0.018), h * 0.1, asymmetry * 0.3 + foldDepth / shortEdge, 0, Math.PI * 2); context.fill(); context.stroke();
      drawLimb(heartX, heartY - h * 0.17, cx + kink * 0.6 + pose * 0.25, cy + h * 0.18, radius * (0.42 + breathDepth * 0.2 + possession * 0.22), scale, seedPhase, fill, stroke);
      if (amputation < 0.78) drawLimb(heartX, heartY, cx - shoulder * (1 + asymmetry * 0.75), cy + h * (0.03 + spineBreak * 0.08) + pose, radius * (0.16 + breathDepth * 0.08), scale, seedPhase + 1, fill, stroke);
      if (amputation < 0.48) drawLimb(heartX, heartY, cx + shoulder * (1 - asymmetry * 0.45), cy - h * (0.02 + spineBreak * 0.12) - pose, radius * (0.16 + breathDepth * 0.08), scale, seedPhase + 2, fill, stroke);
      if (amputation < 0.9) drawLimb(cx - hip * 0.45, cy + h * 0.14, cx - radius * (0.42 + asymmetry * 0.25), cy + h * 0.43, radius * 0.24, scale, seedPhase + 3, fill, stroke);
      if (amputation < 0.62) drawLimb(cx + hip * 0.45, cy + h * 0.14, cx + radius * (0.42 - asymmetry * 0.15), cy + h * (0.43 + gravity * 0.16), radius * 0.24, scale, seedPhase + 4, fill, stroke);
    } else if (family === "flower") {
      const bloomY = cy - radius * 0.25;
      drawLimb(cx, cy + radius * 1.35, cx + kink * 0.45, bloomY, radius * 0.16, scale, seedPhase, fill, stroke);
      const petals = Math.max(3, Math.min(20, lobes));
      for (let index = 0; index < petals; index += 1) {
        const t = index / petals;
        if (amputation > 0 && (Math.sin(index * 1.71 + seedPhase) + 1) * 0.5 > 1 - amputation * 0.58) continue;
        const angle = t * Math.PI * 2 * Math.max(0.45, Math.min(1.4, opening)) - Math.PI / 2 + (twist - 1.3) * 0.08 * Math.sin(index + seedPhase);
        const mutant = 1 + asymmetry * 0.7 * Math.sin(angle + seedPhase);
        const possessed = 1 + possession * 0.7 * Math.pow(Math.max(0, Math.sin(angle * 3 + seedPhase)), 2);
        drawPetal(cx + kink * 0.45, bloomY, angle, radius * (0.62 + breathDepth * 0.58) * mutant * possessed, radius * (0.16 + wound * 0.2 + foldDepth / shortEdge * 0.22), fill, stroke);
      }
      context.fillStyle = stroke; context.beginPath(); context.arc(cx + kink * 0.45, bloomY, radius * (0.14 + wound * 0.12), 0, Math.PI * 2); context.fill();
    } else {
      const bottomY = cy + radius * 1.2;
      const topY = cy - radius * 1.15 * axisStretch;
      drawLimb(cx, bottomY, cx + kink, topY, radius * 0.14, scale, seedPhase, fill, stroke);
      const branches = Math.max(3, Math.min(11, lobes));
      for (let index = 0; index < branches; index += 1) {
        if (amputation > 0 && (Math.sin(index * 2.13 + seedPhase) + 1) * 0.5 > 1 - amputation * 0.6) continue;
        const t = (index + 1) / (branches + 1);
        const side = index % 2 === 0 ? -1 : 1;
        const branchY = bottomY + (topY - bottomY) * t;
        const possessed = 1 + possession * 0.52 * Math.pow(Math.max(0, Math.sin(index * 1.7 + seedPhase)), 2);
        const reach = radius * (0.34 + opening * 0.24 + 0.34 * Math.sin(Math.PI * t)) * (1 + asymmetry * side * 0.55) * possessed;
        const tipX = cx + kink * t + side * reach + Math.sin(index * twist + seedPhase) * radius * wound * 0.18;
        const tipY = branchY - radius * (0.12 + breathDepth * 0.22 + spineBreak * 0.2) + gravity * radius * t + foldDepth * (t - 0.5);
        drawLimb(cx + kink * t, branchY, tipX, tipY, radius * 0.09, scale, seedPhase + index, fill, stroke);
        drawPetal(tipX, tipY, (side < 0 ? Math.PI * 1.12 : -0.12) + (twist - 1.3) * 0.12, radius * (0.24 + budding * 0.2 + breathDepth * 0.12), radius * (0.07 + wound * 0.1), fill, stroke);
      }
    }
    context.restore();
  };

  if (koneElement && shellPresence >= 0.5) {
    if (molt > 0.01) drawFamilyBody(form.family, secondScale, secondOffsetX, secondOffsetY, packedCss(recipe.palette[1]), packedCss(recipe.palette[2]), true);
    drawFamilyBody(form.family, 1, primaryOffsetX, primaryOffsetY, packedCss(recipe.palette[0]), packedCss(recipe.palette[1]));
    if (innerBody > 0.01) {
      const innerScale = 0.18 + innerBody * 0.36;
      drawFamilyBody(form.family, innerScale, primaryOffsetX + shortEdge * innerBody * 0.08, primaryOffsetY - shortEdge * innerBody * 0.05, packedCss(recipe.palette[2]), packedCss(recipe.palette[1]), true);
    }
  }

  if (flowerActive && budding > 0.01) {
    const count = growthActive ? 1 + Math.round(budding * (10 - orchidPresence * 5)) : 1;
    for (let index = 0; index < count; index += 1) {
      const angle = seedPhase + index * 2.39996;
      const distance = (orchidSpecies >= 0.5 && count === 1
        ? bodyRadius * 0.12
        : bodyRadius * (0.42 + 1.08 * ((index + 1) / count))) * growthReach;
      let bx = width / 2 + primaryOffsetX + Math.cos(angle) * distance;
      let by = height / 2 + primaryOffsetY + Math.sin(angle) * distance + gravity * distance * 0.35;
      const surfaceDistance = bodyRadius * (0.72 + 0.22 * Math.sin(lobes * angle + seedPhase)) * growthReach;
      const surfaceX = width / 2 + primaryOffsetX + Math.cos(angle) * surfaceDistance;
      const surfaceY = height / 2 + primaryOffsetY + Math.sin(angle) * surfaceDistance;
      bx += (surfaceX - bx) * surfaceAttraction;
      by += (surfaceY - by) * surfaceAttraction;
      const colonyAngle = seedPhase + (index % 3) * Math.PI * 2 / 3;
      const colonyDistance = bodyRadius * (0.34 + 0.2 * (signedNoise(index * 4.17 + seedPhase) + 1) * 0.5) * growthReach;
      const colonyX = width / 2 + primaryOffsetX + Math.cos(colonyAngle) * colonyDistance;
      const colonyY = height / 2 + primaryOffsetY + Math.sin(colonyAngle) * colonyDistance;
      bx += (colonyX - bx) * flowerClustering;
      by += (colonyY - by) * flowerClustering;
      bx += signedNoise(index * 19.19 + seedPhase * 7.7) * shortEdge * 0.24 * flowerPositionScatter * growthReach;
      by += signedNoise(index * 31.73 + seedPhase * 11.3) * shortEdge * 0.24 * flowerPositionScatter * growthReach;
      if (molt > 0.01 && bridgeGrowth > 0) {
        const bridgeT = (index + 1) / (count + 1);
        const bridgeX = width / 2 + primaryOffsetX + (secondOffsetX - primaryOffsetX) * bridgeT;
        const bridgeY = height / 2 + primaryOffsetY + (secondOffsetY - primaryOffsetY) * bridgeT + Math.sin(bridgeT * Math.PI) * signedNoise(index + seedPhase) * bodyRadius * 0.24;
        bx += (bridgeX - bx) * bridgeGrowth;
        by += (bridgeY - by) * bridgeGrowth;
      }
      const size = shortEdge * (0.012 + Math.min(1, budding) * 0.022) * flowerSize * (1 + orchidPresence * 0.48);
      let flowerAngle = angle;
      const canGraft = bloomSites > 0 && graftDepth > 0 && koneElement && shellPresence >= 0.5 && form.family === "kone";
      if (canGraft) {
        const span = Math.PI * 2 * opening;
        let phi = ((index + 0.5) / count * span + seedPhase * 0.37) % span;
        if (bloomSites === 1) {
          const searchStep = span / 29;
          for (let attempt = 0; attempt < 29 && !woundAt(phi); attempt += 1) phi = (phi + searchStep) % span;
        }
        const graft = koneGraftPoint(phi);
        const next = koneGraftPoint(phi + Math.max(0.002, span / Math.max(1200, ribCount * 8)));
        const ribAngle = Math.atan2(next.y - graft.y, next.x - graft.x);
        const awayX = graft.x - (width * 0.5 + primaryOffsetX);
        const awayY = graft.y - (height * 0.5 + primaryOffsetY);
        const awayLength = Math.hypot(awayX, awayY) || 1;
        const stemReach = Math.max(unit * 3, size * (1.2 + orchidPresence * 0.9));
        const targetX = graft.x + awayX / awayLength * stemReach;
        const targetY = graft.y + awayY / awayLength * stemReach;
        bx += (targetX - bx) * graftDepth;
        by += (targetY - by) * graftDepth;
        const angleDelta = Math.atan2(Math.sin(ribAngle - flowerAngle), Math.cos(ribAngle - flowerAngle));
        flowerAngle += angleDelta * graftDepth;
        context.strokeStyle = packedCss(recipe.palette[1]);
        context.lineWidth = Math.max(0.6, unit * (0.7 + graftDepth * 0.8));
        context.beginPath();
        context.moveTo(graft.x, graft.y);
        context.quadraticCurveTo(
          graft.x + awayX / awayLength * stemReach * 0.55,
          graft.y + awayY / awayLength * stemReach * 0.55,
          bx,
          by,
        );
        context.stroke();
      }
      const orchidDecision = ((Math.sin((index + 1) * 12.9898 + seedPhase * 78.233) * 43758.5453) % 1 + 1) % 1;
      if (orchidDecision < orchidPresence) {
        if (orchidSpecies >= 1.5) drawSpiralStem(bx, by, flowerAngle, size);
        else if (orchidSpecies >= 0.5) drawPouch(bx, by, flowerAngle, size * 4.2 * pouchScale);
        else drawCattleya(bx, by, flowerAngle, size * 2.35);
      }
      else for (let petal = 0; petal < 4; petal += 1) drawPetal(bx, by, flowerAngle + petal * Math.PI / 2, size * 2.2, size * 0.7, packedCss(recipe.palette[2]), packedCss(recipe.palette[1]));
    }
  }
  if (mouthsActive && mouths > 0.01) {
    const count = 1 + Math.round(mouths * 5);
    context.fillStyle = packedCss(recipe.palette[3]); context.strokeStyle = packedCss(recipe.palette[2]); context.lineWidth = Math.max(1, unit * 1.4);
    for (let index = 0; index < count; index += 1) {
      const angle = seedPhase + index * 2.17;
      const distance = bodyRadius * (0.08 + 0.58 * ((index + 1) / count));
      const mx = width / 2 + Math.cos(angle) * distance;
      const my = height / 2 + Math.sin(angle) * distance;
      context.beginPath(); context.ellipse(mx, my, shortEdge * (0.018 + mouths * 0.045), shortEdge * (0.004 + mouths * 0.012), angle + seam, 0, Math.PI * 2); context.fill(); context.stroke();
    }
  }
  if (seam > 0.01) {
    context.strokeStyle = packedCss(recipe.palette[3]); context.lineWidth = Math.max(2, shortEdge * seam * 0.018);
    context.beginPath();
    for (let index = 0; index <= 42; index += 1) {
      const t = index / 42, angle = seedPhase + t * Math.PI * (2 + seam * 4);
      const radius = bodyRadius * t * (0.35 + seam * 0.85);
      const x = width / 2 + Math.cos(angle) * radius, y = height / 2 + Math.sin(angle) * radius + gravity * radius * t;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    context.strokeStyle = packedCss(recipe.palette[2]); context.lineWidth = Math.max(0.7, unit);
    context.setLineDash([shortEdge * 0.012, shortEdge * 0.009]); context.stroke(); context.setLineDash([]);
  }
  if (ritual > 0.01) {
    const cx = width / 2, top = height / 2 - bodyRadius * (1.05 + axisStretch * 0.35);
    const horns = 2 + Math.round(ritual * 5);
    context.strokeStyle = packedCss(recipe.palette[2]); context.lineWidth = Math.max(1, unit * 1.2);
    for (let index = 0; index < horns; index += 1) {
      const spread = horns === 1 ? 0 : index / (horns - 1) - 0.5;
      context.beginPath(); context.moveTo(cx, top + bodyRadius * 0.28);
      context.bezierCurveTo(cx + spread * bodyRadius * 0.45, top, cx + spread * bodyRadius * 1.15, top - bodyRadius * ritual * 0.65, cx + spread * bodyRadius * 1.45, top - bodyRadius * ritual * (0.45 + Math.abs(spread)));
      context.stroke();
    }
  }
  return output;
}

function signalReliefHash(seed: number, x: number, y: number, salt: number) {
  let value = Math.imul((x + 1) ^ salt, 374761393) ^ Math.imul((y + 1) + salt, 668265263) ^ Math.imul(seed + salt, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function signalRelief(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const width = input.width, height = input.height, short = Math.min(width, height);
  const output = newSurface(width, height);
  const context = output.getContext("2d")!;
  context.fillStyle = "#020204";
  context.fillRect(0, 0, width, height);
  const source = input.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  const density = Math.max(18, Math.round(param(effect, "density", 72)));
  const spacing = width / density;
  const rows = Math.max(1, Math.round(height / spacing));
  const stepY = height / rows;
  const body = Math.max(0, Math.min(4, Math.round(param(effect, "body", 1))));
  const size = param(effect, "emitterSize", 0.44);
  const lightSignal = Math.max(0, Math.min(4, Math.round(param(effect, "lightSignal", 0))));
  const threshold = param(effect, "threshold", 0.34);
  const curve = param(effect, "signalCurve", 1.35);
  const polarity = Math.round(param(effect, "polarity", 0));
  const reliefSource = Math.max(0, Math.min(3, Math.round(param(effect, "reliefSource", 2))));
  const depth = param(effect, "reliefDepth", 0.42);
  const fieldYield = param(effect, "fieldYield", 0.58);
  const flicker = param(effect, "flicker", 0.18);
  const afterglow = param(effect, "afterglow", 0.34);
  const lightColor = Math.max(0, Math.min(2, Math.round(param(effect, "lightColor", 0))));
  const seed = Math.round(recipe.seed + effect.where.seed * 17 + 47047);
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const pixel = (x: number, y: number) => {
    const px = Math.max(0, Math.min(width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(height - 1, Math.round(y)));
    const at = (py * width + px) * 4;
    return [source[at], source[at + 1], source[at + 2]] as const;
  };
  const evidence = (x: number, y: number, column: number, row: number, signal: number) => {
    const [red, green, blue] = pixel(x, y);
    const brightness = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
    const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
    if (signal === 0) return brightness;
    if (signal === 1) return 1 - brightness;
    if (signal === 2) {
      const [leftR, leftG, leftB] = pixel(x - spacing * 0.5, y);
      const [rightR, rightG, rightB] = pixel(x + spacing * 0.5, y);
      const [upR, upG, upB] = pixel(x, y - stepY * 0.5);
      const [downR, downG, downB] = pixel(x, y + stepY * 0.5);
      const horizontal = Math.abs((rightR * .2126 + rightG * .7152 + rightB * .0722) - (leftR * .2126 + leftG * .7152 + leftB * .0722));
      const vertical = Math.abs((downR * .2126 + downG * .7152 + downB * .0722) - (upR * .2126 + upG * .7152 + upB * .0722));
      return clamp(Math.hypot(horizontal, vertical) / 150);
    }
    if (signal === 3) return maximum <= 0 ? 0 : (maximum - minimum) / maximum;
    return clamp(signalReliefHash(seed, column, row, 59) * .72 + brightness * .28);
  };
  const reliefAt = (x: number, y: number, column: number, row: number) => evidence(x, y, column, row, reliefSource === 3 ? 4 : reliefSource);
  const css = (red: number, green: number, blue: number, alpha: number) => `rgba(${Math.round(red)},${Math.round(green)},${Math.round(blue)},${clamp(alpha)})`;
  const drawBody = (x: number, y: number, radius: number, color: readonly number[], strength: number) => {
    if (afterglow > 0 && strength > 0.005) {
      context.fillStyle = css(color[0], color[1], color[2], strength * afterglow * .2);
      context.beginPath(); context.arc(x, y, radius * (2.4 + afterglow * 2.8), 0, Math.PI * 2); context.fill();
    }
    context.fillStyle = css(color[0], color[1], color[2], strength);
    context.strokeStyle = context.fillStyle;
    context.lineWidth = Math.max(0.7, radius * .42);
    if (body === 0 || body === 1) {
      context.beginPath(); context.arc(x, y, radius * (body === 1 ? 1.08 : .72), 0, Math.PI * 2); context.fill();
    } else if (body === 2) {
      context.fillRect(x - radius * 1.45, y - radius * .28, radius * 2.9, radius * .56);
    } else if (body === 3) {
      context.beginPath(); context.moveTo(x - radius, y); context.lineTo(x + radius, y); context.moveTo(x, y - radius); context.lineTo(x, y + radius); context.stroke();
    } else {
      context.strokeRect(x - radius * .8, y - radius, radius * 1.6, radius * 2);
      context.fillRect(x - radius * .12, y - radius, radius * .24, radius * 2);
    }
  };

  for (let row = 0; row < rows; row += 1) for (let column = 0; column < density; column += 1) {
    const sourceX = (column + .5) * spacing, sourceY = (row + .5) * stepY;
    const relief = reliefAt(sourceX, sourceY, column, row);
    const left = reliefAt(sourceX - spacing, sourceY, column - 1, row), right = reliefAt(sourceX + spacing, sourceY, column + 1, row);
    const up = reliefAt(sourceX, sourceY - stepY, column, row - 1), down = reliefAt(sourceX, sourceY + stepY, column, row + 1);
    const slopeX = right - left, slopeY = down - up;
    const lift = (relief - .5) * depth;
    const perspectiveX = (sourceX - width * .5) / Math.max(1, short);
    const perspectiveY = (sourceY - height * .5) / Math.max(1, short);
    const x = sourceX + (slopeX * 1.8 + perspectiveX * lift) * spacing * fieldYield * 2.4;
    const y = sourceY + (slopeY * 1.8 + perspectiveY * lift) * stepY * fieldYield * 2.4;
    const raw = evidence(sourceX, sourceY, column, row, lightSignal);
    const thresholded = clamp((raw - threshold) / Math.max(.001, 1 - threshold));
    let strength = Math.pow(thresholded, curve);
    if (polarity === 1) strength = 1 - strength;
    const electric = .5 + .5 * Math.sin(phase + signalReliefHash(seed, column, row, 83) * Math.PI * 2);
    strength *= 1 - flicker * (.12 + electric * .58);
    const sampled = pixel(sourceX, sourceY);
    let color: readonly number[] = [255, 250, 238];
    if (lightColor === 1) {
      const packed = recipe.palette[Math.min(3, Math.floor(clamp(relief) * 4))];
      color = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
    } else if (lightColor === 2) color = sampled;
    const radius = Math.max(.45, Math.min(spacing, stepY) * size * (.55 + relief * depth * .75));
    if (depth > 0 && fieldYield > 0) {
      context.fillStyle = "rgba(0,0,0,.38)";
      context.beginPath(); context.arc(x - slopeX * spacing * depth, y - slopeY * stepY * depth, radius * 1.3, 0, Math.PI * 2); context.fill();
    }
    drawBody(x, y, radius, color, strength);
  }
  return output;
}

function almostAlive(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const width = input.width, height = input.height;
  const output = newSurface(width, height), context = output.getContext("2d")!;
  const world = Math.max(0, Math.min(1, Math.round(param(effect, "world", 1))));
  const paper = [242, 239, 232] as const, night = [8, 9, 13] as const;
  const ground = world === 0 ? paper : night;
  context.fillStyle = `rgb(${ground[0]},${ground[1]},${ground[2]})`;
  context.fillRect(0, 0, width, height);

  const source = input.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  const columns = Math.max(16, Math.round(param(effect, "evidenceScale", 48)));
  const spacing = width / columns, rows = Math.max(1, Math.round(height / spacing)), stepY = height / rows;
  const signal = Math.max(0, Math.min(4, Math.round(param(effect, "lifeSignal", 2))));
  const gate = param(effect, "recognition", .34), air = param(effect, "breathingRoom", .46);
  const body = Math.max(0, Math.min(3, Math.round(param(effect, "markBody", 1))));
  const bodySize = param(effect, "bodySize", .72), lifeSigns = param(effect, "lifeSigns", .42);
  const reach = Math.max(1, Math.min(4, Math.round(param(effect, "webReach", 2))));
  const colorLife = Math.max(0, Math.min(3, Math.round(param(effect, "colorLife", 2))));
  const mischief = param(effect, "colorMischief", .32), restlessness = param(effect, "restlessness", .14);
  const seed = Math.round(recipe.seed + effect.where.seed * 23 + 71993);
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const pixel = (x: number, y: number) => {
    const px = Math.max(0, Math.min(width - 1, Math.round(x))), py = Math.max(0, Math.min(height - 1, Math.round(y)));
    const at = (py * width + px) * 4;
    return [source[at], source[at + 1], source[at + 2]] as [number, number, number];
  };
  const evidence = (x: number, y: number, column: number, row: number) => {
    const [red, green, blue] = pixel(x, y), light = (red * .2126 + green * .7152 + blue * .0722) / 255;
    const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
    if (signal === 0) return light;
    if (signal === 1) return 1 - light;
    if (signal === 2) {
      const l = pixel(x - spacing * .55, y), r = pixel(x + spacing * .55, y), u = pixel(x, y - stepY * .55), d = pixel(x, y + stepY * .55);
      const luma = (sample: readonly number[]) => (sample[0] * .2126 + sample[1] * .7152 + sample[2] * .0722) / 255;
      return clamp(Math.hypot(luma(r) - luma(l), luma(d) - luma(u)) * 2.35);
    }
    if (signal === 3) return maximum <= 0 ? 0 : (maximum - minimum) / maximum;
    return clamp(signalReliefHash(seed, column, row, 31) * .68 + light * .32);
  };
  const paletteColor = (index: number) => {
    const packed = recipe.palette[((index % 4) + 4) % 4];
    return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255] as [number, number, number];
  };
  const mixColor = (a: readonly number[], b: readonly number[], amount: number) => a.map((value, index) => value * (1 - amount) + b[index] * amount) as [number, number, number];
  const colorFor = (column: number, row: number, sampled: [number, number, number]) => {
    const family = Math.floor(signalReliefHash(seed, column, row, 71) * 4);
    let color: [number, number, number];
    if (colorLife === 0) color = world === 0 ? [35, 32, 34] : [238, 235, 224];
    else if (colorLife === 1) color = mixColor(paletteColor(family), [246, 239, 230], .48);
    else if (colorLife === 2) color = paletteColor(family);
    else color = sampled;
    const visitor = paletteColor(family + 1 + Math.floor(signalReliefHash(seed, column, row, 73) * 3));
    color = mixColor(color, visitor, mischief * .62);
    if (signalReliefHash(seed, column, row, 79) < mischief * .42) color = [color[1], color[2], color[0]];
    return color;
  };
  type LivingCell = { column: number; row: number; x: number; y: number; strength: number; radius: number; angle: number; color: [number, number, number] };
  const cells: Array<LivingCell | null> = new Array(columns * rows).fill(null);
  const living: LivingCell[] = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const sourceX = (column + .5) * spacing, sourceY = (row + .5) * stepY;
    const raw = evidence(sourceX, sourceY, column, row), strength = clamp((raw - gate) / Math.max(.001, 1 - gate));
    if (strength <= .015 || signalReliefHash(seed, column, row, 41) > strength * (1 - air * .88)) continue;
    const orbit = phase + signalReliefHash(seed, column, row, 43) * Math.PI * 2;
    const travel = Math.min(spacing, stepY) * restlessness * (1.4 + signalReliefHash(seed, column, row, 47) * 2.4);
    const x = sourceX + Math.cos(orbit) * travel, y = sourceY + Math.sin(orbit * (1 + signalReliefHash(seed, column, row, 53) * .35)) * travel;
    const cell: LivingCell = {
      column, row, x, y, strength, radius: Math.max(.55, Math.min(spacing, stepY) * bodySize * (.18 + strength * .34)),
      angle: signalReliefHash(seed, column, row, 61) * Math.PI * 2 + Math.sin(phase + orbit) * restlessness,
      color: colorFor(column, row, pixel(sourceX, sourceY)),
    };
    cells[row * columns + column] = cell; living.push(cell);
  }

  context.lineCap = "round";
  for (const cell of living) {
    for (let dy = -reach; dy <= 0; dy += 1) for (let dx = -reach; dx <= reach; dx += 1) {
      if (dy === 0 && dx >= 0) continue;
      const otherColumn = cell.column + dx, otherRow = cell.row + dy;
      if (otherColumn < 0 || otherColumn >= columns || otherRow < 0 || otherRow >= rows) continue;
      const other = cells[otherRow * columns + otherColumn];
      if (!other) continue;
      const distance = Math.hypot(dx, dy), willingness = lifeSigns * (1 - distance / (reach + 1));
      if (signalReliefHash(seed, cell.column + otherColumn, cell.row + otherRow, 89 + dx * 7 + dy * 13) > willingness) continue;
      const alpha = clamp(Math.min(cell.strength, other.strength) * (.16 + lifeSigns * .48));
      context.strokeStyle = `rgba(${Math.round(cell.color[0])},${Math.round(cell.color[1])},${Math.round(cell.color[2])},${alpha})`;
      context.lineWidth = Math.max(.45, Math.min(cell.radius, other.radius) * .28);
      context.beginPath(); context.moveTo(cell.x, cell.y);
      const bend = Math.sin(cell.angle - other.angle) * spacing * (.08 + restlessness * .4);
      context.quadraticCurveTo((cell.x + other.x) * .5 + bend, (cell.y + other.y) * .5 - bend, other.x, other.y); context.stroke();
    }
  }
  for (const cell of living) {
    const [red, green, blue] = cell.color, alpha = clamp(.28 + cell.strength * .72);
    context.fillStyle = `rgba(${Math.round(red)},${Math.round(green)},${Math.round(blue)},${alpha})`;
    context.strokeStyle = context.fillStyle; context.lineWidth = Math.max(.55, cell.radius * .28);
    if (body === 0) { context.beginPath(); context.arc(cell.x, cell.y, cell.radius * .72, 0, Math.PI * 2); context.fill(); }
    else if (body === 1) { context.beginPath(); context.moveTo(cell.x - Math.cos(cell.angle) * cell.radius * 1.7, cell.y - Math.sin(cell.angle) * cell.radius * 1.7); context.lineTo(cell.x + Math.cos(cell.angle) * cell.radius * 1.7, cell.y + Math.sin(cell.angle) * cell.radius * 1.7); context.stroke(); }
    else if (body === 2) { context.save(); context.translate(cell.x, cell.y); context.rotate(cell.angle * .18); context.fillRect(-cell.radius, -cell.radius * .72, cell.radius * 2, cell.radius * 1.44); context.restore(); }
    else { context.beginPath(); context.moveTo(cell.x - Math.cos(cell.angle) * cell.radius * 1.5, cell.y - Math.sin(cell.angle) * cell.radius * 1.5); context.lineTo(cell.x + Math.cos(cell.angle) * cell.radius * 1.5, cell.y + Math.sin(cell.angle) * cell.radius * 1.5); context.moveTo(cell.x - Math.cos(cell.angle + 1.7) * cell.radius, cell.y - Math.sin(cell.angle + 1.7) * cell.radius); context.lineTo(cell.x + Math.cos(cell.angle + 1.7) * cell.radius, cell.y + Math.sin(cell.angle + 1.7) * cell.radius); context.stroke(); }
  }
  return output;
}

function resolutionQuilt(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe) {
  const output = cloneSurface(input);
  const context = output.getContext("2d")!;
  const minChunk = Math.max(4, param(effect, "minChunk", 18));
  const maxChunk = Math.max(minChunk, param(effect, "maxChunk", 180));
  const drop = param(effect, "resolutionDrop", 0.64);
  const softness = param(effect, "softness", 0.32);
  const displacement = param(effect, "displacement", 0.18);
  const vacancy = param(effect, "vacancy", 0.08);
  const random = randomSource(recipe.seed + 19013);
  for (let y = 0; y < input.height;) {
    const rowHeight = Math.min(input.height - y, minChunk + random() * (maxChunk - minChunk));
    for (let x = 0; x < input.width;) {
      const chunkWidth = Math.min(input.width - x, minChunk + random() * (maxChunk - minChunk));
      if (random() < vacancy) {
        context.fillStyle = recipe.colorMode === "palette" ? packedCss(recipe.palette[3]) : "rgba(0,0,0,.92)";
        context.fillRect(x, y, chunkWidth, rowHeight);
      } else {
        const level = Math.max(1, 2 ** Math.floor(random() * (1 + drop * 5)));
        const tiny = newSurface(Math.max(1, Math.round(chunkWidth / level)), Math.max(1, Math.round(rowHeight / level)));
        tiny.getContext("2d")!.drawImage(input, x, y, chunkWidth, rowHeight, 0, 0, tiny.width, tiny.height);
        context.imageSmoothingEnabled = softness > random();
        const travel = Math.min(input.width, input.height) * displacement;
        const dx = (random() * 2 - 1) * travel;
        const dy = (random() * 2 - 1) * travel;
        context.drawImage(tiny, x + dx, y + dy, chunkWidth, rowHeight);
      }
      x += chunkWidth;
    }
    y += rowHeight;
  }
  context.imageSmoothingEnabled = true;
  return output;
}

function shardField(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe) {
  const output = cloneSurface(input);
  const context = output.getContext("2d")!;
  const pieces = Math.round(param(effect, "pieces", 34));
  const minSpan = param(effect, "minSpan", 0.04);
  const maxSpan = Math.max(minSpan, param(effect, "maxSpan", 0.28));
  const travel = param(effect, "travel", 0.24);
  const rotation = param(effect, "rotation", 0.12);
  const repetition = param(effect, "repetition", 0.22);
  const absence = param(effect, "absence", 0.12);
  const random = randomSource(recipe.seed + 29027);
  for (let index = 0; index < pieces; index += 1) {
    const width = input.width * (minSpan + random() * (maxSpan - minSpan));
    const height = input.height * (minSpan + random() * (maxSpan - minSpan));
    const sx = random() * Math.max(1, input.width - width);
    const sy = random() * Math.max(1, input.height - height);
    if (random() < absence) {
      context.fillStyle = recipe.colorMode === "palette" ? packedCss(recipe.palette[3]) : "rgba(0,0,0,.95)";
      context.fillRect(sx, sy, width, height);
      continue;
    }
    const copies = random() < repetition ? 2 + Math.floor(random() * 3) : 1;
    for (let copy = 0; copy < copies; copy += 1) {
      const dx = (random() * 2 - 1) * input.width * travel;
      const dy = (random() * 2 - 1) * input.height * travel;
      const angle = (random() * 2 - 1) * Math.PI * rotation;
      context.save();
      context.translate(sx + dx + width / 2, sy + dy + height / 2);
      context.rotate(angle);
      context.drawImage(input, sx, sy, width, height, -width / 2, -height / 2, width, height);
      context.restore();
    }
  }
  return output;
}

function cutRepeat(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe) {
  const output = cloneSurface(input);
  const context = output.getContext("2d")!;
  const selector = Math.round(param(effect, "selector", 3));
  const cuts = Math.round(param(effect, "cuts", 26));
  const span = param(effect, "span", 0.12);
  const stretch = param(effect, "stretch", 0.38);
  const repetitions = Math.round(param(effect, "repetition", 4));
  const drift = param(effect, "drift", 0.16);
  const absence = param(effect, "absence", 0.14);
  const random = randomSource(recipe.seed + 39041);
  const sample = input.getContext("2d", { willReadFrequently: true })!;
  for (let cut = 0; cut < cuts; cut += 1) {
    const vertical = random() > 0.5;
    const width = vertical ? Math.max(2, input.width * span * (0.3 + random())) : input.width;
    const height = vertical ? input.height : Math.max(2, input.height * span * (0.3 + random()));
    const sx = random() * Math.max(1, input.width - width);
    const sy = random() * Math.max(1, input.height - height);
    const pixel = sample.getImageData(Math.floor(sx + width / 2), Math.floor(sy + height / 2), 1, 1).data;
    const light = (pixel[0] + pixel[1] + pixel[2]) / 765;
    const eligible = selector === 3 || (selector === 0 && light > 0.58) || (selector === 1 && light < 0.42) || (selector === 2 && Math.abs(pixel[0] - pixel[2]) + Math.abs(pixel[1] - pixel[2]) > 72);
    if (!eligible) continue;
    if (random() < absence) {
      context.fillStyle = recipe.colorMode === "palette" ? packedCss(recipe.palette[3]) : "rgba(0,0,0,.94)";
      context.fillRect(sx, sy, width, height);
      continue;
    }
    const stretchFactor = 1 + (random() * 2 - 0.5) * stretch * 3;
    for (let repeat = 0; repeat < repetitions; repeat += 1) {
      const dx = vertical ? repeat * input.width * drift / Math.max(1, repetitions) : 0;
      const dy = vertical ? 0 : repeat * input.height * drift / Math.max(1, repetitions);
      context.globalAlpha = 0.42 + 0.58 * (1 - repeat / Math.max(1, repetitions));
      context.drawImage(input, sx, sy, width, height, sx + dx, sy + dy, vertical ? width * stretchFactor : width, vertical ? height : height * stretchFactor);
    }
  }
  context.globalAlpha = 1;
  return output;
}

function maskedLayer(image: HTMLImageElement, layer: StudioLayer, width: number, height: number) {
  const canvas = newSurface(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale, drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  if (layer.maskMode === "whole") return canvas;
  const mask = newSurface(width, height);
  const maskContext = mask.getContext("2d")!;
  const size = Math.max(2, layer.maskScale);
  maskContext.fillStyle = "white";
  if (layer.maskMode === "checker") {
    for (let y = 0; y < height; y += size) for (let x = 0; x < width; x += size) if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) maskContext.fillRect(x, y, size, size);
  } else if (layer.maskMode === "stripes") {
    for (let x = 0; x < width; x += size * 2) maskContext.fillRect(x, 0, size, height);
  } else if (layer.maskMode === "blocks") {
    const random = randomSource(layer.seed);
    for (let y = 0; y < height; y += size) for (let x = 0; x < width; x += size) if (random() > 0.48) maskContext.fillRect(x, y, size, size);
  } else {
    const pixels = context.getImageData(0, 0, width, height);
    const alpha = maskContext.createImageData(width, height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const light = (pixels.data[offset] + pixels.data[offset + 1] + pixels.data[offset + 2]) / 765;
      const prior = offset >= 4 ? (pixels.data[offset - 4] + pixels.data[offset - 3] + pixels.data[offset - 2]) / 765 : light;
      const visible = layer.maskMode === "light" ? light > 0.56 : layer.maskMode === "dark" ? light < 0.44 : Math.abs(light - prior) > 0.1;
      alpha.data[offset] = alpha.data[offset + 1] = alpha.data[offset + 2] = 255;
      alpha.data[offset + 3] = visible ? 255 : 0;
    }
    maskContext.putImageData(alpha, 0, 0);
  }
  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = "source-over";
  return canvas;
}

function hardMix(base: HTMLCanvasElement, layer: HTMLCanvasElement, opacity: number) {
  const output = cloneSurface(base);
  const context = output.getContext("2d", { willReadFrequently: true })!;
  const basePixels = context.getImageData(0, 0, output.width, output.height);
  const layerPixels = layer.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, output.width, output.height);
  for (let offset = 0; offset < basePixels.data.length; offset += 4) {
    const alpha = layerPixels.data[offset + 3] / 255 * opacity;
    if (!alpha) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const mixed = basePixels.data[offset + channel] + 2 * layerPixels.data[offset + channel] >= 383 ? 255 : 0;
      basePixels.data[offset + channel] = Math.round(basePixels.data[offset + channel] * (1 - alpha) + mixed * alpha);
    }
  }
  context.putImageData(basePixels, 0, 0);
  return output;
}

function materialChain(input: HTMLCanvasElement, materialId: string, recipe: StudioRecipe, phase: number, animated: boolean, heldTargets?: Map<string, HeldTargetField>, prefix = "", stopAt?: string, showMask = false, pickRecipeId?: string) {
  if (recipe.processStage === "form" || !recipe.effects.some(e => e.materialId === materialId)) return input;
  let result = input;
  const original = cloneSurface(input);
  for (const effect of recipe.effects.filter(e => e.materialId === materialId)) {
    if (effect.id === stopAt) {
      const target = effect.where.targetMemory === "source" ? original : result;
      const row = effect.ultimateSort?.recipes.find(r => r.id === pickRecipeId);
      const selected = showMask ? targetSurface(result, effect, target, heldTargets, prefix + materialId)
        : row?.bodyTargetMemory === "source" ? cloneSurface(original)
        : row ? ultimateSort(result, effect, recipe, phase, original, heldTargets, prefix + materialId, row.id)
        : cloneSurface(target);
      if (result !== input && result !== selected) releaseSurface(result);
      result = selected;
      break;
    }
    const previous = result;
    result = applyEffect(result, effect, recipe, phase, animated, effect.where.targetMemory === "source" ? original : result, heldTargets, prefix + materialId, original);
    if (previous !== input && previous !== result) releaseSurface(previous);
  }
  releaseSurface(original);
  return result;
}

function compositeLayers(base: HTMLCanvasElement, recipe: StudioRecipe, images: Record<string, HTMLImageElement>, phase = 0, animated = false, joinAfter = "", heldTargets?: Map<string, HeldTargetField>, prefix = "") {
  let output = cloneSurface(base);
  for (const layer of recipe.layers) {
    const join = layer.joinAfter && recipe.effects.some(e => e.id === layer.joinAfter && !e.materialId) ? layer.joinAfter : "";
    if (join !== joinAfter) continue;
    const image = images[layer.id];
    if (!layer.enabled || !image) continue;
    const masked = maskedLayer(image, layer, output.width, output.height);
    const prepared = materialChain(masked, layer.id, recipe, phase, animated, heldTargets, prefix);
    if (layer.blendMode === "hard-mix") {
      const previous = output;
      output = hardMix(output, prepared, layer.opacity);
      if (output !== previous) releaseSurface(previous);
      if (prepared !== masked) releaseSurface(prepared);
      releaseSurface(masked);
      continue;
    }
    const context = output.getContext("2d")!;
    context.save();
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = ({
      normal: "source-over", difference: "difference", overlay: "overlay", screen: "screen",
      multiply: "multiply", lighten: "lighten", darken: "darken",
    } as Record<string, GlobalCompositeOperation>)[layer.blendMode] ?? "source-over";
    context.drawImage(prepared, 0, 0);
    context.restore();
    if (prepared !== masked) releaseSurface(prepared);
    releaseSurface(masked);
  }
  return output;
}

function blendSource(processed: HTMLCanvasElement, source: HTMLCanvasElement, presence: number) {
  if (presence <= 0) return processed;
  const output = cloneSurface(processed);
  const context = output.getContext("2d")!;
  context.globalAlpha = Math.max(0, Math.min(1, presence));
  context.drawImage(source, 0, 0);
  context.globalAlpha = 1;
  return output;
}

function bandRupture(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const random = randomSource(recipe.seed + 1103);
  const rupture = param(effect, "rupture", 0.48);
  const count = Math.round(param(effect, "bands", 72));
  const scar = param(effect, "scar", 0.24);
  const memory = param(effect, "memory", 0.72);
  const height = input.height / count;
  context.fillStyle = recipe.colorMode === "palette" ? packedCss(recipe.palette[3]) : "#000";
  context.fillRect(0, 0, input.width, input.height);
  context.globalAlpha = recipe.colorMode === "source" ? 1 : 0.18 + memory * 0.82;
  context.drawImage(input, 0, 0);
  context.globalAlpha = 1;
  for (let band = 0; band < count; band += 1) {
    const y = Math.floor(band * height);
    const h = Math.ceil(height + 1);
    const slip = (random() * 2 - 1) * input.width * rupture + Math.sin(band * 0.31 + phase) * input.width * rupture * 0.07;
    context.globalAlpha = 0.35 + memory * 0.65;
    context.drawImage(input, 0, y, input.width, h, slip, y, input.width, h);
    if (random() < scar) {
      context.globalAlpha = 0.45 + random() * 0.5;
      const scarX = random() * input.width;
      const scarWidth = 2 + random() * input.width * (0.04 + rupture * 0.24);
      const scarHeight = h * (0.4 + random() * 2.6);
      if (recipe.colorMode === "palette") {
        context.fillStyle = packedCss(random() < 0.68 ? recipe.palette[3] : recipe.palette[2]);
        context.fillRect(scarX, y, scarWidth, scarHeight);
      } else {
        const sampleX = random() * Math.max(1, input.width - scarWidth);
        const sampleY = random() * Math.max(1, input.height - scarHeight);
        context.drawImage(input, sampleX, sampleY, scarWidth, scarHeight, scarX, y, scarWidth, scarHeight);
      }
    }
  }
  context.globalAlpha = 1;
  return output;
}

function colorKey(data: Uint8ClampedArray, offset: number, channel: number) {
  const r = data[offset], g = data[offset + 1], b = data[offset + 2];
  if (channel < 3) return data[offset + channel];
  if (channel >= 6) return ultimateToneKey(r, g, b, channel);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (channel === 4) return max === 0 ? 0 : delta / max * 255;
  if (channel === 5) return max;
  if (delta === 0) return 0;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return ((hue * 42.5) + 255) % 255;
}

function wrongSort(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  context.drawImage(input, 0, 0);
  const image = context.getImageData(0, 0, input.width, input.height);
  const source = new Uint8ClampedArray(image.data);
  const random = randomSource(recipe.seed + 2207);
  const amount = param(effect, "amount", 0.42);
  const threshold = param(effect, "threshold", 0.32) * 255;
  const chunk = Math.round(param(effect, "chunk", 54));
  const direction = Math.round(param(effect, "direction", 0));
  const channel = Math.round(param(effect, "channel", 5));
  const vertical = direction >= 2;
  const reverse = direction === 1 || direction === 3;
  const lines = vertical ? input.width : input.height;
  const length = vertical ? input.height : input.width;
  const stride = Math.max(1, Math.round(1 + (1 - amount) * 7));
  for (let line = 0; line < lines; line += stride) {
    if (random() > amount) continue;
    for (let start = 0; start < length; start += chunk) {
      if (random() > amount * 1.3) continue;
      const end = Math.min(length, start + Math.max(4, Math.round(chunk * (0.45 + random()))));
      const pixels: { rgba: number[]; key: number }[] = [];
      for (let axis = start; axis < end; axis += 1) {
        const x = vertical ? line : axis;
        const y = vertical ? axis : line;
        const offset = (y * input.width + x) * 4;
        const key = colorKey(source, offset, channel);
        if (key >= threshold) pixels.push({ rgba: [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]], key });
      }
      pixels.sort((a, b) => reverse ? b.key - a.key : a.key - b.key);
      let cursor = 0;
      for (let axis = start; axis < end && cursor < pixels.length; axis += 1) {
        const x = vertical ? line : axis;
        const y = vertical ? axis : line;
        const offset = (y * input.width + x) * 4;
        if (colorKey(source, offset, channel) < threshold) continue;
        image.data.set(pixels[cursor++].rgba, offset);
      }
    }
  }
  context.putImageData(image, 0, 0);
  return output;
}

function medianFilter(input: HTMLCanvasElement, effect: EffectInstance) {
  const width = input.width, height = input.height;
  if (width < 3 || height < 3) return cloneSurface(input);
  const position = Math.max(0, Math.min(8, Math.round(param(effect, "position", 3))));
  const channel = Math.max(0, Math.min(11, Math.round(param(effect, "channel", 11))));
  const iterations = Math.max(1, Math.min(24, Math.round(param(effect, "iterations", 6))));
  const original = input.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height);
  let source = new Uint8ClampedArray(original.data);
  let target = new Uint8ClampedArray(source);
  const ranked = new Int32Array(9);
  const colors = new Uint32Array(9);

  const packedRank = (offset: number) => {
    const red = source[offset], green = source[offset + 1], blue = source[offset + 2];
    const hsb = channel % 6 >= 3 ? rgbToHsb255(red, green, blue) : null;
    const baseChannel = channel % 6;
    let value = baseChannel === 0 ? red : baseChannel === 1 ? green : baseChannel === 2 ? blue : hsb![baseChannel - 3];
    if (channel >= 6) value = 255 - value;
    const color = (red << 16) | (green << 8) | blue;
    return { packed: (value << 24) | color, color };
  };

  for (let pass = 0; pass < iterations; pass += 1) {
    target.set(source);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let cursor = 0;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const sample = packedRank(((y + oy) * width + x + ox) * 4);
          ranked[cursor] = sample.packed;
          colors[cursor] = sample.color;
          cursor += 1;
        }
        for (let index = 1; index < 9; index += 1) {
          const heldRank = ranked[index], heldColor = colors[index];
          let insert = index - 1;
          while (insert >= 0 && ranked[insert] > heldRank) {
            ranked[insert + 1] = ranked[insert];
            colors[insert + 1] = colors[insert];
            insert -= 1;
          }
          ranked[insert + 1] = heldRank;
          colors[insert + 1] = heldColor;
        }
        const chosen = colors[position], offset = (y * width + x) * 4;
        target[offset] = chosen >> 16 & 255;
        target[offset + 1] = chosen >> 8 & 255;
        target[offset + 2] = chosen & 255;
        target[offset + 3] = source[offset + 3];
      }
    }
    [source, target] = [target, source];
  }

  const output = newSurface(width, height);
  const result = output.getContext("2d")!.createImageData(width, height);
  result.data.set(source);
  output.getContext("2d")!.putImageData(result, 0, 0);
  const blendMode = Math.max(0, Math.min(6, Math.round(param(effect, "blendMode", 0))));
  if (blendMode > 0) {
    const context = output.getContext("2d")!;
    context.globalCompositeOperation = (["source-over", "overlay", "hard-light", "screen", "multiply", "lighter", "difference"] as GlobalCompositeOperation[])[blendMode];
    context.drawImage(input, 0, 0);
    context.globalCompositeOperation = "source-over";
  }
  return output;
}

type MotionPixel = { rgba: [number, number, number, number]; key: number };

function motionHash(seed: number, line: number, start: number, salt: number) {
  let value = (seed ^ Math.imul(line + salt, 374761393) ^ Math.imul(start - salt, 668265263)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) & 0x7fffffff) / 2147483647;
}

function orderMotionFragment(pixels: MotionPixel[], method: number, progress: number, reverse: boolean, seed: number, line: number, start: number) {
  const orderedBefore = (a: MotionPixel, b: MotionPixel) => reverse ? a.key >= b.key : a.key <= b.key;
  const compare = (a: MotionPixel, b: MotionPixel) => reverse ? b.key - a.key : a.key - b.key;
  const count = pixels.length;
  if (count < 2 || progress <= 0) return;
  if (method === 0) {
    const passes = Math.round(progress * Math.min(count - 1, 32));
    for (let pass = 0; pass < passes; pass += 1) {
      for (let index = 1; index < count - pass; index += 1) {
        if (!orderedBefore(pixels[index - 1], pixels[index])) [pixels[index - 1], pixels[index]] = [pixels[index], pixels[index - 1]];
      }
    }
  } else if (method === 1) {
    const frontier = 1 + Math.round(progress * Math.min(count - 1, 72));
    for (let index = 1; index < frontier; index += 1) {
      const held = pixels[index];
      let cursor = index;
      while (cursor > 0 && !orderedBefore(pixels[cursor - 1], held)) { pixels[cursor] = pixels[cursor - 1]; cursor -= 1; }
      pixels[cursor] = held;
    }
  } else if (method === 2) {
    const positions = Math.round(progress * Math.min(count - 1, 40));
    for (let position = 0; position < positions; position += 1) {
      let chosen = position;
      for (let index = position + 1; index < count; index += 1) if (!orderedBefore(pixels[chosen], pixels[index])) chosen = index;
      if (chosen !== position) [pixels[position], pixels[chosen]] = [pixels[chosen], pixels[position]];
    }
  } else if (method === 3) {
    const levels = Math.max(1, Math.ceil(Math.log2(count)));
    const blockSize = Math.min(count, 2 ** Math.ceil(progress * levels));
    for (let block = 0; block < count; block += blockSize) {
      const sorted = pixels.slice(block, Math.min(count, block + blockSize)).sort(compare);
      for (let index = 0; index < sorted.length; index += 1) pixels[block + index] = sorted[index];
    }
  } else if (method === 4) {
    const swaps = Math.round(progress * (count - 1));
    for (let index = 1; index <= swaps; index += 1) {
      const target = Math.min(count - 1, index + Math.floor(motionHash(seed, line, start, index * 17) * (count - index)));
      [pixels[index - 1], pixels[target]] = [pixels[target], pixels[index - 1]];
    }
  } else {
    const offset = Math.round(progress * (count - 1));
    if (offset > 0) pixels.push(...pixels.splice(0, offset));
  }
}

function sortingMotion(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const output = cloneSurface(input);
  const context = output.getContext("2d")!;
  const image = context.getImageData(0, 0, input.width, input.height);
  const source = new Uint8ClampedArray(image.data);
  const method = Math.round(param(effect, "method", 0));
  const motion = 0.5 + 0.5 * Math.cos(phase);
  const progress = Math.max(0, Math.min(1, param(effect, "maximumOrder", 0.72) * motion));
  if (progress <= 0.000001) return output;
  const span = Math.max(8, Math.round(param(effect, "span", 72)));
  const channel = Math.round(param(effect, "channel", 5));
  const direction = Math.round(param(effect, "direction", 0));
  const reverse = param(effect, "reverse", 0) >= 0.5;
  const vertical = direction >= 2;
  const reverseTravel = direction === 1 || direction === 3;
  const lines = vertical ? input.width : input.height;
  const length = vertical ? input.height : input.width;
  const seed = recipe.seed + effect.where.seed + 4201;
  for (let line = 0; line < lines; line += 1) {
    for (let start = 0; start < length; start += span) {
      const end = Math.min(length, start + span);
      const pixels: MotionPixel[] = [];
      for (let axis = start; axis < end; axis += 1) {
        const x = vertical ? line : axis, y = vertical ? axis : line;
        const offset = (y * input.width + x) * 4;
        pixels.push({ rgba: [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]], key: colorKey(source, offset, channel) });
      }
      orderMotionFragment(pixels, method, progress, reverse, seed, line, start);
      for (let axis = start; axis < end; axis += 1) {
        const x = vertical ? line : axis, y = vertical ? axis : line;
        const offset = (y * input.width + x) * 4;
        const index = reverseTravel ? pixels.length - 1 - (axis - start) : axis - start;
        image.data.set(pixels[index].rgba, offset);
      }
    }
  }
  context.putImageData(image, 0, 0);
  return output;
}

const ultimateMethods: UltimateSortRecipe["method"][] = ["bubble", "insertion", "selection", "merge", "permute", "roll", "heap", "shell", "quick", "smooth", "one-color", "color-bands"];
const ultimateSignals: UltimateSortRecipe["signal"][] = ["red", "green", "blue", "hue", "saturation", "brightness", "white", "black", "gray", "luma", "chroma"];

function orderUltimateFragment(pixels: MotionPixel[], method: number, progress: number, seed: number, line: number) {
  if (method < 6) {
    orderMotionFragment(pixels, method, progress, false, seed, line, 0);
    return;
  }
  const count = pixels.length;
  if (count < 2 || progress <= 0) return;
  const after = (a: MotionPixel, b: MotionPixel) => a.key > b.key;
  if (method === 6) {
    const sift = (root: number, end: number) => {
      while (root * 2 + 1 <= end) {
        const child = root * 2 + 1;
        let chosen = root;
        if (after(pixels[child], pixels[chosen])) chosen = child;
        if (child + 1 <= end && after(pixels[child + 1], pixels[chosen])) chosen = child + 1;
        if (chosen === root) return;
        [pixels[root], pixels[chosen]] = [pixels[chosen], pixels[root]];
        root = chosen;
      }
    };
    for (let root = Math.floor((count - 2) / 2); root >= 0; root -= 1) sift(root, count - 1);
    const extractions = Math.max(1, Math.round(progress * (count - 1)));
    for (let step = 0, end = count - 1; step < extractions && end > 0; step += 1, end -= 1) {
      [pixels[0], pixels[end]] = [pixels[end], pixels[0]];
      sift(0, end - 1);
    }
  } else if (method === 7) {
    const gaps = [701, 301, 132, 57, 23, 10, 4, 1].filter((gap) => gap < count);
    const passes = Math.max(1, Math.ceil(progress * gaps.length));
    gaps.slice(0, passes).forEach((gap) => {
      for (let index = gap; index < count; index += 1) {
        const held = pixels[index];
        let cursor = index;
        while (cursor >= gap && after(pixels[cursor - gap], held)) { pixels[cursor] = pixels[cursor - gap]; cursor -= gap; }
        pixels[cursor] = held;
      }
    });
  } else if (method === 8) {
    let partitions = Math.max(1, Math.round(progress * (count - 1)));
    const ranges: [number, number][] = [[0, count - 1]];
    while (ranges.length && partitions > 0) {
      const [low, high] = ranges.pop()!;
      if (low >= high) continue;
      const middle = low + Math.floor((high - low) / 2);
      [pixels[middle], pixels[high]] = [pixels[high], pixels[middle]];
      const pivot = pixels[high];
      let boundary = low;
      for (let index = low; index < high; index += 1) if (!after(pixels[index], pivot)) {
        [pixels[index], pixels[boundary]] = [pixels[boundary], pixels[index]];
        boundary += 1;
      }
      [pixels[boundary], pixels[high]] = [pixels[high], pixels[boundary]];
      ranges.push([boundary + 1, high], [low, boundary - 1]);
      partitions -= 1;
    }
  } else if (method === 9) {
    const leonardo = [1, 3, 5, 9, 15, 25, 41, 67, 109, 177, 287, 465, 753, 1219].filter((gap) => gap < count);
    const passes = Math.max(1, Math.ceil(progress * leonardo.length));
    leonardo.slice(Math.max(0, leonardo.length - passes)).reverse().forEach((gap) => {
      for (let index = gap; index < count; index += 1) {
        const held = pixels[index];
        let cursor = index;
        while (cursor >= gap && after(pixels[cursor - gap], held)) { pixels[cursor] = pixels[cursor - gap]; cursor -= gap; }
        pixels[cursor] = held;
      }
    });
  } else if (method === 10) {
    const sample = pixels[Math.max(0, Math.min(count - 1, Math.round(progress * (count - 1))))];
    for (let index = 0; index < count; index += 1) pixels[index] = { rgba: [...sample.rgba], key: sample.key };
  } else {
    const source = pixels.map((pixel) => ({ rgba: [...pixel.rgba] as MotionPixel["rgba"], key: pixel.key }));
    let cursor = 0;
    while (cursor < count) {
      const longest = Math.max(2, Math.round((1 - progress) * Math.min(96, count) + 2));
      const span = Math.max(1, Math.round(longest * (0.35 + motionHash(seed, line, cursor, 991) * 0.65)));
      const sample = source[cursor];
      for (let index = cursor; index < Math.min(count, cursor + span); index += 1) pixels[index] = { rgba: [...sample.rgba], key: sample.key };
      cursor += span;
    }
  }
}

function ultimateTerritoryMask(data: Uint8ClampedArray, width: number, height: number, recipe: UltimateSortRecipe) {
  const mask = new Uint8Array(width * height);
  const hueCenters: Partial<Record<UltimateSortRecipe["territory"], number>> = {
    red: 0, orange: 28, yellow: 58, green: 120, cyan: 185, blue: 235, pink: 325,
  };
  const brightnessAt = (x: number, y: number) => {
    const at = (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
    return (data[at] + data[at + 1] + data[at + 2]) / 3;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    const offset = index * 4;
    const light = brightnessAt(x, y);
    const tone = ultimateToneSelected(data[offset], data[offset + 1], data[offset + 2], recipe.territory, recipe.toneTolerance ?? .2);
    if (tone !== undefined) mask[index] = tone ? 1 : 0;
    else if (recipe.territory === "whole") mask[index] = 1;
    else if (recipe.territory === "light") mask[index] = light >= Math.min(255, recipe.gate) ? 1 : 0;
    else if (recipe.territory === "dark") mask[index] = light <= Math.min(255, recipe.gate) ? 1 : 0;
    else if (recipe.territory === "edges") {
      const gx = -brightnessAt(x - 1, y - 1) - 2 * brightnessAt(x - 1, y) - brightnessAt(x - 1, y + 1)
        + brightnessAt(x + 1, y - 1) + 2 * brightnessAt(x + 1, y) + brightnessAt(x + 1, y + 1);
      const gy = -brightnessAt(x - 1, y - 1) - 2 * brightnessAt(x, y - 1) - brightnessAt(x + 1, y - 1)
        + brightnessAt(x - 1, y + 1) + 2 * brightnessAt(x, y + 1) + brightnessAt(x + 1, y + 1);
      mask[index] = Math.hypot(gx, gy) >= recipe.gate ? 1 : 0;
    } else {
      const signal = hueAndSaturation(data[offset], data[offset + 1], data[offset + 2]);
      const center = hueCenters[recipe.territory] ?? 0;
      const distance = Math.abs(((signal.hue - center + 540) % 360) - 180);
      mask[index] = signal.saturation >= 0.12 && distance <= 28 ? 1 : 0;
    }
  }
  return mask;
}

function applyUltimateResolution(
  incoming: Uint8ClampedArray,
  sorted: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  recipe: UltimateSortRecipe,
) {
  if (recipe.resolution === "pixel" || recipe.maxBlock <= 1) return sorted;
  const resolved = new Uint8ClampedArray(sorted);
  const grid = Math.max(2, recipe.maxBlock);
  for (let cellY = 0; cellY < height; cellY += grid) for (let cellX = 0; cellX < width; cellX += grid) {
    const x1 = Math.min(width, cellX + grid), y1 = Math.min(height, cellY + grid);
    let difference = 0, selected = 0, sampleX = -1, sampleY = -1;
    for (let y = cellY; y < y1; y += 1) for (let x = cellX; x < x1; x += 1) {
      const pixel = y * width + x;
      if (!mask[pixel]) continue;
      const offset = pixel * 4;
      difference += Math.abs(sorted[offset] - incoming[offset]) + Math.abs(sorted[offset + 1] - incoming[offset + 1]) + Math.abs(sorted[offset + 2] - incoming[offset + 2]);
      selected += 1;
      if (sampleX < 0) { sampleX = x; sampleY = y; }
    }
    if (!selected) continue;
    const change = recipe.resolution === "fixed" ? 1 : Math.min(1, difference / (selected * 255 * 1.4));
    const size = Math.max(1, Math.round(recipe.minBlock + (recipe.maxBlock - recipe.minBlock) * change));
    if (size <= 1) continue;
    const sampleOffset = (sampleY * width + sampleX) * 4;
    const centerX = Math.round((cellX + x1 - 1) / 2), centerY = Math.round((cellY + y1 - 1) / 2);
    const left = centerX - Math.floor(size / 2), top = centerY - Math.floor(size / 2);
    for (let y = top; y < top + size; y += 1) for (let x = left; x < left + size; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height || !mask[y * width + x]) continue;
      resolved.set(sorted.subarray(sampleOffset, sampleOffset + 4), (y * width + x) * 4);
    }
  }
  return resolved;
}

function ultimateGlimmerNoise(seed: number, x: number, y: number) {
  const left = Math.floor(x), top = Math.floor(y);
  const fx = x - left, fy = y - top;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const topMix = motionHash(seed, left, top, 1723) * (1 - sx) + motionHash(seed, left + 1, top, 1723) * sx;
  const bottomMix = motionHash(seed, left, top + 1, 1723) * (1 - sx) + motionHash(seed, left + 1, top + 1, 1723) * sx;
  return topMix * (1 - sy) + bottomMix * sy;
}

function applyUltimateGlimmer(output: HTMLCanvasElement, original: HTMLCanvasElement, mask: Uint8Array, glimmer: UltimateSortRecipe, effect: EffectInstance, recipe: StudioRecipe, recipeIndex: number, phase: number) {
  if (glimmer.amount <= 0) return output;
  const result = cloneSurface(output);
  const context = result.getContext("2d")!;
  const image = context.getImageData(0, 0, result.width, result.height);
  const before = original.getContext("2d")!.getImageData(0, 0, original.width, original.height).data;
  const source = new Uint8ClampedArray(image.data);
  const scale = Math.max(result.width, result.height) / 1000;
  const spacing = Math.max(4, Math.round((30 - glimmer.amount * 20) * scale));
  const radius = Math.max(1, Math.round(glimmer.glimmerSize * scale));
  const threshold = 0.78 - glimmer.amount * 0.38;
  const seed = recipe.seed + effect.where.seed + recipeIndex * 10007 + 14891;
  const drift = glimmer.glimmerSpeed * 7;
  const signalChannel = Math.max(0, ultimateSignals.indexOf(glimmer.signal));
  const driftX = Math.cos(phase) * drift, driftY = Math.sin(phase) * drift;
  const brightness = (data: Uint8ClampedArray, x: number, y: number) => {
    const at = (Math.max(0, Math.min(result.height - 1, y)) * result.width + Math.max(0, Math.min(result.width - 1, x))) * 4;
    return (data[at] + data[at + 1] + data[at + 2]) / 3;
  };
  const shine = (x: number, y: number, strength: number) => {
    if (x < 0 || y < 0 || x >= result.width || y >= result.height) return;
    const at = (y * result.width + x) * 4;
    const alpha = Math.max(0, Math.min(1, strength));
    for (let channel = 0; channel < 3; channel += 1) {
      const target = 232 + source[at + channel] * 0.09;
      image.data[at + channel] = Math.round(source[at + channel] + (target - source[at + channel]) * alpha);
    }
    image.data[at + 3] = 255;
  };
  for (let cellY = 0; cellY < result.height; cellY += spacing) for (let cellX = 0; cellX < result.width; cellX += spacing) {
    const x = Math.min(result.width - 1, cellX + Math.floor(motionHash(seed, cellX, cellY, 31) * spacing));
    const y = Math.min(result.height - 1, cellY + Math.floor(motionHash(seed, cellX, cellY, 47) * spacing));
    if (!mask[y * result.width + x]) continue;
    const center = brightness(source, x, y);
    const contrast = Math.max(Math.abs(center - brightness(source, x - radius, y)), Math.abs(center - brightness(source, x + radius, y)), Math.abs(center - brightness(source, x, y - radius)), Math.abs(center - brightness(source, x, y + radius))) / 105;
    const at = (y * result.width + x) * 4;
    const changed = (Math.abs(source[at] - before[at]) + Math.abs(source[at + 1] - before[at + 1]) + Math.abs(source[at + 2] - before[at + 2])) / 260;
    const chosenSignal = colorKey(source, at, signalChannel) / 255;
    const signal = Math.min(1, contrast * 0.62 + changed * 0.68 + chosenSignal * 0.28);
    const noise = ultimateGlimmerNoise(seed, cellX / spacing * 0.78 + driftX, cellY / spacing * 0.78 + driftY);
    const ignition = noise * 0.58 + signal * 0.62;
    const intensity = Math.max(0, Math.min(1, (ignition - threshold) / Math.max(0.001, 1.2 - threshold)));
    if (intensity <= 0) continue;
    shine(x, y, Math.min(1, intensity * 1.5));
    for (let distance = 1; distance <= radius; distance += 1) {
      const ray = intensity * 0.72 * Math.pow(1 - distance / (radius + 1), 2);
      if (x - distance >= 0 && mask[y * result.width + x - distance]) shine(x - distance, y, ray);
      if (x + distance < result.width && mask[y * result.width + x + distance]) shine(x + distance, y, ray);
      if (y - distance >= 0 && mask[(y - distance) * result.width + x]) shine(x, y - distance, ray);
      if (y + distance < result.height && mask[(y + distance) * result.width + x]) shine(x, y + distance, ray);
    }
  }
  context.putImageData(image, 0, 0);
  return result;
}

function ultimateBodyEffect(effect: EffectInstance, sortRecipe: UltimateSortRecipe): EffectInstance {
  return {
    ...effect,
    id: `${effect.id}::${sortRecipe.id}`,
    where: {
      ...effect.where,
      mode: "found-body",
      sampleColor: sortRecipe.bodySampleColor,
      sampleX: sortRecipe.bodySampleX,
      sampleY: sortRecipe.bodySampleY,
      colorReach: sortRecipe.bodyColorReach,
      shadeLoyalty: sortRecipe.bodyShadeLoyalty,
      edgeLoyalty: sortRecipe.bodyEdgeLoyalty,
      bodyExpansion: sortRecipe.bodyExpansion,
      softness: 0.12,
      invert: sortRecipe.bodyInvert,
      targetMemory: sortRecipe.bodyTargetMemory,
    },
  };
}

function ultimateSort(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number, sourceTarget = input, heldTargets?: Map<string, HeldTargetField>, heldPrefix = "", stopBeforeRecipeId?: string) {
  let output = cloneSurface(input);
  const recipes = effect.ultimateSort?.recipes ?? [];
  const motion = 0.5 + 0.5 * Math.cos(phase);
  let stopped = false;
  recipes.forEach((sortRecipe, recipeIndex) => {
    if (stopped) return;
    if (stopBeforeRecipeId === sortRecipe.id) { stopped = true; return; }
    if (!sortRecipe.enabled) return;
    const context = output.getContext("2d")!;
    const image = context.getImageData(0, 0, output.width, output.height);
    const incoming = new Uint8ClampedArray(image.data);
    let mask: Uint8Array;
    if (sortRecipe.territory === "body") {
      const bodyEffect = ultimateBodyEffect(effect, sortRecipe);
      const recognition = sortRecipe.bodyTargetMemory === "source" ? sourceTarget : output;
      const weights = resolvedWhereWeights(recognition, bodyEffect, heldTargets, heldPrefix);
      mask = new Uint8Array(weights.length);
      for (let index = 0; index < weights.length; index += 1) mask[index] = weights[index] >= 0.5 ? 1 : 0;
    } else mask = ultimateTerritoryMask(incoming, output.width, output.height, sortRecipe);
    if (sortRecipe.method === "glimmer") {
      output = applyUltimateGlimmer(output, input, mask, sortRecipe, effect, recipe, recipeIndex, phase);
      return;
    }
    if (sortRecipe.action !== "wand") {
      const vertical = sortRecipe.direction === "up" || sortRecipe.direction === "down";
      const reverseTravel = sortRecipe.direction === "right" || sortRecipe.direction === "down";
      const lines = vertical ? output.width : output.height;
      const length = vertical ? output.height : output.width;
      const isScatter = sortRecipe.method === "scatter";
      const method = isScatter ? 4 : Math.max(0, ultimateMethods.indexOf(sortRecipe.method));
      const channel = Math.max(0, ultimateSignals.indexOf(sortRecipe.signal));
      const progress = isScatter ? 1 : Math.max(0, Math.min(1, sortRecipe.amount * motion));
      const loopPosition = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
      const scatterChanges = Math.max(0, Math.min(120, Math.round(sortRecipe.scatterRefresh)));
      const scatterState = isScatter && scatterChanges > 0 ? Math.floor(loopPosition * scatterChanges + 0.000001) : 0;
      const seed = recipe.seed + effect.where.seed + recipeIndex * 10007 + 8801 + scatterState * 65537;
      for (let line = 0; line < lines; line += 1) {
        const positions: number[] = [];
        const pixels: MotionPixel[] = [];
        for (let axis = 0; axis < length; axis += 1) {
          const x = vertical ? line : axis, y = vertical ? axis : line;
          const pixel = y * output.width + x;
          if (!mask[pixel]) continue;
          const offset = pixel * 4;
          positions.push(pixel);
          pixels.push({ rgba: [incoming[offset], incoming[offset + 1], incoming[offset + 2], incoming[offset + 3]], key: colorKey(incoming, offset, channel) });
        }
        orderUltimateFragment(pixels, method, progress, seed, line);
        positions.forEach((pixel, index) => image.data.set(pixels[reverseTravel ? pixels.length - 1 - index : index].rgba, pixel * 4));
      }
      image.data.set(applyUltimateResolution(incoming, image.data, mask, output.width, output.height, sortRecipe));
    }
    if (sortRecipe.action !== "sort") {
      const march = Math.floor((phase / (Math.PI * 2)) * 8 * sortRecipe.selectionSpeed);
      for (let y = 0; y < output.height; y += 1) for (let x = 0; x < output.width; x += 1) {
        const pixel = y * output.width + x;
        if (!mask[pixel]) continue;
        const boundary = x === 0 || y === 0 || x === output.width - 1 || y === output.height - 1
          || !mask[pixel - 1] || !mask[pixel + 1] || !mask[pixel - output.width] || !mask[pixel + output.width];
        if (!boundary) continue;
        const value = ((x + y + march) % 8) < 4 ? 245 : 20;
        image.data.set([value, value, value, 255], pixel * 4);
      }
    }
    context.putImageData(image, 0, 0);
  });
  return output;
}

function wizPixelOrder(width: number, height: number, path: Wizprocess["path"]) {
  const order = new Int32Array(width * height);
  let cursor = 0;
  if (path === "columns") {
    for (let x = 0; x < width; x += 1) for (let y = 0; y < height; y += 1) order[cursor++] = y * width + x;
  } else if (path === "snake") {
    for (let y = 0; y < height; y += 1) {
      for (let step = 0; step < width; step += 1) {
        const x = (y & 1) === 0 ? step : width - 1 - step;
        order[cursor++] = y * width + x;
      }
    }
  } else if (path === "clustered") {
    const tile = 32;
    for (let tileY = 0; tileY < height; tileY += tile) for (let tileX = 0; tileX < width; tileX += tile) {
      for (let morton = 0; morton < tile * tile; morton += 1) {
        let localX = 0, localY = 0;
        for (let bit = 0; bit < 5; bit += 1) {
          localX |= ((morton >> (bit * 2)) & 1) << bit;
          localY |= ((morton >> (bit * 2 + 1)) & 1) << bit;
        }
        const x = tileX + localX, y = tileY + localY;
        if (x < width && y < height) order[cursor++] = y * width + x;
      }
    }
  } else {
    for (let index = 0; index < order.length; index += 1) order[index] = index;
  }
  return order;
}

function rgbToHsb255(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255, g = green / 255, b = blue / 255;
  const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
  let hue = 0;
  if (delta > 0) {
    hue = high === r ? ((g - b) / delta) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }
  return [hue / 360 * 255, high <= 0 ? 0 : delta / high * 255, high * 255];
}

function hsbToRgb255(hue: number, saturation: number, brightness: number): [number, number, number] {
  const h = (hue / 255 * 360) % 360, s = saturation / 255, v = brightness / 255;
  const chroma = v * s, section = h / 60, middle = chroma * (1 - Math.abs((section % 2) - 1));
  const [r1, g1, b1] = section < 1 ? [chroma, middle, 0] : section < 2 ? [middle, chroma, 0]
    : section < 3 ? [0, chroma, middle] : section < 4 ? [0, middle, chroma]
      : section < 5 ? [middle, 0, chroma] : [chroma, 0, middle];
  const match = v - chroma;
  return [(r1 + match) * 255, (g1 + match) * 255, (b1 + match) * 255];
}

function wizRecover(value: number, mode: Wizprocess["reconstruction"]) {
  if (mode === "clip") return Math.max(0, Math.min(255, value));
  if (mode === "wrap") return ((value % 256) + 256) % 256;
  if (mode === "reflect") {
    const reflected = ((value % 510) + 510) % 510;
    return reflected <= 255 ? reflected : 510 - reflected;
  }
  return Math.abs(value < 0 ? 256 + value : value) % 256;
}

function wizScaleWeight(span: number, process: Wizprocess, phase: number) {
  const tide = process.tide;
  const mass = process.mass * (1 - tide * 0.9 * Math.sin(phase * 0.5) ** 2);
  const structure = process.structure * (1 - tide * 0.9 * Math.sin(phase) ** 2);
  const grain = process.grain * (1 - tide * 0.9 * Math.sin(phase * 1.5) ** 2);
  return span <= 8 ? grain : span <= 128 ? structure : mass;
}

function transformWizSignal(signal: Float32Array, process: Wizprocess, phase: number) {
  const maximumBlock = 16384;
  const sqrtHalf = Math.SQRT1_2;
  let offset = 0;
  while (offset < signal.length) {
    const remaining = signal.length - offset;
    const length = 2 ** Math.floor(Math.log2(Math.min(maximumBlock, remaining)));
    if (length < 2) {
      const mass = process.mass * (1 - process.tide * 0.9 * Math.sin(phase * 0.5) ** 2);
      signal[offset] = Math.trunc(signal[offset] * mass / process.compression) * process.expansion;
      break;
    }
    const temporary = new Float32Array(length);
    let active = length, span = 2;
    while (active >= 2) {
      const half = active / 2;
      const survival = wizScaleWeight(span, process, phase);
      for (let index = 0; index < half; index += 1) {
        const a = signal[offset + index * 2], b = signal[offset + index * 2 + 1];
        temporary[index] = (a + b) * sqrtHalf;
        temporary[half + index] = (a - b) * sqrtHalf * survival;
      }
      signal.set(temporary.subarray(0, active), offset);
      active = half;
      span *= 2;
    }
    signal[offset] *= wizScaleWeight(length * 2, process, phase);
    for (let index = 0; index < length; index += 1) signal[offset + index] = Math.trunc(signal[offset + index] / process.compression);
    active = 1;
    while (active < length) {
      for (let index = 0; index < active; index += 1) {
        const average = signal[offset + index], detail = signal[offset + active + index];
        temporary[index * 2] = (average + detail) * sqrtHalf;
        temporary[index * 2 + 1] = (average - detail) * sqrtHalf;
      }
      signal.set(temporary.subarray(0, active * 2), offset);
      active *= 2;
    }
    for (let index = 0; index < length; index += 1) signal[offset + index] *= process.expansion;
    offset += length;
  }
  return signal;
}

function wizprocess(input: HTMLCanvasElement, effect: EffectInstance, phase: number) {
  const process = effect.wizprocess;
  if (!process) return cloneSurface(input);
  const output = cloneSurface(input), context = output.getContext("2d")!;
  const image = context.getImageData(0, 0, output.width, output.height);
  const source = new Uint8ClampedArray(image.data);
  const order = wizPixelOrder(output.width, output.height, process.path);
  const evidence = new Float32Array(order.length * 3);
  for (let position = 0; position < order.length; position += 1) {
    const offset = order[position] * 4;
    const values = rgbToWizColorSpace(process.colorSpace, source[offset], source[offset + 1], source[offset + 2]);
    for (let channel = 0; channel < 3; channel += 1) evidence[position * 3 + channel] = values[channel] > 127 ? values[channel] - 256 : values[channel];
  }
  const reconstructed = new Float32Array(evidence.length);
  if (process.channels === "together") {
    transformWizSignal(evidence, process, phase);
    const shift = process.channelPhase;
    let offset = 0;
    while (offset < evidence.length) {
      const length = 2 ** Math.floor(Math.log2(Math.min(16384, evidence.length - offset)));
      for (let local = 0; local < length; local += 1) reconstructed[offset + local] = evidence[offset + ((local + shift + length) % length)];
      offset += length;
    }
  } else {
    for (let channel = 0; channel < 3; channel += 1) {
      const separated = new Float32Array(order.length);
      for (let position = 0; position < order.length; position += 1) separated[position] = evidence[position * 3 + channel];
      transformWizSignal(separated, process, phase);
      for (let position = 0; position < order.length; position += 1) reconstructed[position * 3 + channel] = separated[position];
    }
  }
  for (let position = 0; position < order.length; position += 1) {
    const offset = order[position] * 4;
    const recovered = [0, 1, 2].map((channel) => wizRecover(reconstructed[position * 3 + channel], process.reconstruction)) as [number, number, number];
    const rgb = wizColorSpaceToRgb(process.colorSpace, ...recovered);
    image.data[offset] = rgb[0]; image.data[offset + 1] = rgb[1]; image.data[offset + 2] = rgb[2]; image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return output;
}

function pixelDrift(input: HTMLCanvasElement, effect: EffectInstance) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  context.drawImage(input, 0, 0);
  let image = context.getImageData(0, 0, input.width, input.height);
  const distance = Math.round(param(effect, "distance", 9));
  const iterations = Math.round(param(effect, "iterations", 4));
  const hueMemory = param(effect, "hueMemory", 0.82);
  const lightMemory = param(effect, "lightMemory", 0.38);
  const direction = Math.round(param(effect, "direction", 0));
  const dx = direction === 0 ? -distance : direction === 1 ? distance : 0;
  const dy = direction === 2 ? -distance : direction === 3 ? distance : 0;
  for (let pass = 0; pass < iterations; pass += 1) {
    const prior = new Uint8ClampedArray(image.data);
    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width; x += 1) {
        const sx = Math.max(0, Math.min(input.width - 1, x + dx));
        const sy = Math.max(0, Math.min(input.height - 1, y + dy));
        const offset = (y * input.width + x) * 4;
        const sourceOffset = (sy * input.width + sx) * 4;
        const sourceLight = (prior[sourceOffset] + prior[sourceOffset + 1] + prior[sourceOffset + 2]) / 3;
        const localLight = (prior[offset] + prior[offset + 1] + prior[offset + 2]) / 3;
        const lightMix = sourceLight > localLight ? 1 - lightMemory : (1 - lightMemory) * 0.38;
        for (let c = 0; c < 3; c += 1) {
          const mix = c === 1 ? (1 - hueMemory) * 0.7 + lightMix * 0.3 : lightMix;
          image.data[offset + c] = prior[offset + c] * (1 - mix) + prior[sourceOffset + c] * mix;
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
  return output;
}

function signalEcho(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const separation = param(effect, "separation", 13);
  const bleed = param(effect, "bleed", 0.54);
  const scan = param(effect, "scan", 0.28);
  const ghost = param(effect, "ghost", 0.46);
  context.fillStyle = recipe.colorMode === "palette" ? packedCss(recipe.palette[3]) : "#000";
  context.fillRect(0, 0, input.width, input.height);
  context.globalAlpha = 0.86;
  context.drawImage(input, 0, 0);
  context.globalCompositeOperation = "screen";
  context.globalAlpha = 0.18 + bleed * 0.34;
  context.drawImage(input, separation * (1 + Math.sin(phase) * 0.2), 0);
  if (recipe.colorMode === "palette") {
    context.fillStyle = packedCss(recipe.palette[0], 0.22 + bleed * 0.25);
    context.fillRect(separation, 0, input.width, input.height);
  }
  context.drawImage(input, -separation * 0.72, 0);
  if (recipe.colorMode === "palette") {
    context.fillStyle = packedCss(recipe.palette[1], 0.14 + bleed * 0.22);
    context.fillRect(-separation, 0, input.width, input.height);
  }
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = ghost * 0.42;
  context.drawImage(input, separation * 3.2, Math.sin(phase) * 4);
  context.globalAlpha = 0.12 + scan * 0.6;
  context.fillStyle = recipe.colorMode === "palette" ? packedCss(recipe.palette[3]) : "rgba(0,0,0,.85)";
  const spacing = Math.max(2, Math.round(8 - scan * 6));
  for (let y = 0; y < input.height; y += spacing) context.fillRect(0, y, input.width, Math.max(1, scan * 2));
  context.globalAlpha = 1;
  return output;
}

function ditherHash(seed: number, x: number, y: number, salt = 0) {
  let value = (seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 3, 668265263) ^ Math.imul(salt + 7, -1640531527)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function ditherField(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  context.drawImage(input, 0, 0);
  const image = context.getImageData(0, 0, input.width, input.height);
  const levels = Math.round(param(effect, "levels", 4));
  const grain = Math.round(param(effect, "grain", 2));
  const pressure = param(effect, "pressure", 0.68);
  const offset = Math.round(param(effect, "channelOffset", 2));
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const step = 255 / Math.max(1, levels - 1);
  const prior = new Uint8ClampedArray(image.data);

  // Recipes created before Dither Mode retain the exact original Bayer renderer.
  if (Math.round(param(effect, "ditherVersion", 0)) < 1) {
    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width; x += 1) {
        const target = (y * input.width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const shiftedX = Math.max(0, Math.min(input.width - 1, x + (channel - 1) * offset));
          const source = (y * input.width + shiftedX) * 4 + channel;
          const threshold = (matrix[((Math.floor(y / grain) & 3) * 4) + (Math.floor(x / grain) & 3)] / 15 - 0.5) * step * pressure;
          image.data[target + channel] = Math.max(0, Math.min(255, Math.round((prior[source] + threshold) / step) * step));
        }
      }
    }
    context.putImageData(image, 0, 0);
    return output;
  }

  const travel = Math.max(0, Math.min(4, Math.round(param(effect, "travel", 1))));
  const paletteLogic = Math.max(0, Math.min(3, Math.round(param(effect, "paletteLogic", 2))));
  const body = Math.max(0, Math.min(4, Math.round(param(effect, "body", 0))));
  const sourceReturn = Math.max(0, Math.min(1, param(effect, "sourceReturn", 0.16)));
  const habitat = Math.max(0, Math.min(3, Math.round(param(effect, "habitat", 0))));
  const reach = Math.max(0.05, Math.min(1, param(effect, "reach", 1)));
  const habitatScale = Math.max(8, param(effect, "habitatScale", 72)) * Math.max(1, Math.min(input.width, input.height) / 760);
  const diversity = Math.max(0, Math.min(1, param(effect, "diversity", 0)));
  const cell = Math.max(1, grain);
  const columns = Math.ceil(input.width / cell), rows = Math.ceil(input.height / cell);
  const cellColors = new Uint8ClampedArray(columns * rows * 3);
  const cellTones = new Uint8Array(columns * rows);
  const seed = recipe.seed + effect.where.seed * 31;
  const palette = recipe.palette.map((packed) => [packed >> 16 & 255, packed >> 8 & 255, packed & 255]);
  const brokenOrder = [0, 2, 3, 1];
  let currentError = new Float32Array((columns + 2) * 3);
  let nextError = new Float32Array((columns + 2) * 3);
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const sourceAt = (column: number, row: number, channel: number) => {
    const shift = paletteLogic === 0 ? (channel - 1) * offset : 0;
    const x = Math.max(0, Math.min(input.width - 1, column * cell + Math.floor(cell / 2) + shift));
    const y = Math.max(0, Math.min(input.height - 1, row * cell + Math.floor(cell / 2)));
    return prior[(y * input.width + x) * 4 + channel];
  };
  const paletteChoice = (red: number, green: number, blue: number) => {
    const posterize = (value: number) => Math.round(value / step) * step;
    if (paletteLogic === 0) return [posterize(red), posterize(green), posterize(blue)];
    if (paletteLogic === 1) {
      const pr = posterize(red), pg = posterize(green), pb = posterize(blue);
      let chosen = palette[0], distance = Number.POSITIVE_INFINITY;
      for (const candidate of palette) {
        const next = (pr - candidate[0]) ** 2 + (pg - candidate[1]) ** 2 + (pb - candidate[2]) ** 2;
        if (next < distance) { distance = next; chosen = candidate; }
      }
      return chosen;
    }
    const tone = clamp(red * 0.2126 + green * 0.7152 + blue * 0.0722);
    const steppedTone = posterize(tone);
    const index = Math.max(0, Math.min(3, Math.floor(steppedTone / 256 * 4)));
    return palette[paletteLogic === 3 ? brokenOrder[index] : index];
  };
  const addError = (buffer: Float32Array, column: number, channel: number, value: number, weight: number) => {
    if (column < 0 || column >= columns) return;
    buffer[(column + 1) * 3 + channel] += value * weight * pressure;
  };

  for (let row = 0; row < rows; row += 1) {
    const reverse = travel === 2 && (row & 1) === 1;
    for (let turn = 0; turn < columns; turn += 1) {
      const column = reverse ? columns - 1 - turn : turn;
      const index = row * columns + column;
      const original = [sourceAt(column, row, 0), sourceAt(column, row, 1), sourceAt(column, row, 2)];
      const adjusted = original.map((value, channel) => {
        if (travel === 0) {
          const threshold = (matrix[((row & 3) * 4) + (column & 3)] / 15 - 0.5) * step * pressure;
          return clamp(value + threshold);
        }
        if (travel === 3) return clamp(value + (ditherHash(seed, column, row, channel) - 0.5) * step * pressure * 2);
        return clamp(value + currentError[(column + 1) * 3 + channel]);
      });
      const chosen = paletteChoice(adjusted[0], adjusted[1], adjusted[2]);
      for (let channel = 0; channel < 3; channel += 1) cellColors[index * 3 + channel] = chosen[channel];
      cellTones[index] = clamp(original[0] * 0.2126 + original[1] * 0.7152 + original[2] * 0.0722);

      if (travel === 1 || travel === 2 || travel === 4) for (let channel = 0; channel < 3; channel += 1) {
        const error = adjusted[channel] - chosen[channel];
        const direction = reverse ? -1 : 1;
        if (travel === 4 && ((direction > 0 && column === columns - 1) || (direction < 0 && column === 0))) {
          addError(nextError, direction > 0 ? 0 : columns - 1, channel, error, 7 / 16);
        } else addError(currentError, column + direction, channel, error, 7 / 16);
        addError(nextError, column - direction, channel, error, 3 / 16);
        addError(nextError, column, channel, error, 5 / 16);
        addError(nextError, column + direction, channel, error, 1 / 16);
      }
    }
    currentError = nextError;
    nextError = new Float32Array((columns + 2) * 3);
  }

  if (habitat > 0) {
    context.drawImage(input, 0, 0);
    const sourceToneAt = (x: number, y: number) => {
      const targetX = Math.max(0, Math.min(input.width - 1, Math.round(x)));
      const targetY = Math.max(0, Math.min(input.height - 1, Math.round(y)));
      const source = (targetY * input.width + targetX) * 4;
      return (prior[source] * 0.2126 + prior[source + 1] * 0.7152 + prior[source + 2] * 0.0722) / 255;
    };
    const habitatFor = (column: number, row: number) => {
      const centerX = column * cell + cell / 2, centerY = row * cell + cell / 2;
      const coarseX = Math.floor(centerX / habitatScale), coarseY = Math.floor(centerY / habitatScale);
      const fineScale = Math.max(cell * 2, habitatScale * 0.43);
      const fineX = Math.floor(centerX / fineScale), fineY = Math.floor(centerY / fineScale);
      const climate = ditherHash(seed, coarseX, coarseY, 41) * 0.68 + ditherHash(seed, fineX, fineY, 43) * 0.32;
      const tone = cellTones[row * columns + column] / 255;
      const horizontal = Math.abs(sourceToneAt(centerX + cell, centerY) - sourceToneAt(centerX - cell, centerY));
      const vertical = Math.abs(sourceToneAt(centerX, centerY + cell) - sourceToneAt(centerX, centerY - cell));
      const edge = Math.min(1, (horizontal + vertical) * 2.4);
      const signal = habitat === 1
        ? climate * 0.52 + Math.abs(tone - 0.5) * 0.96
        : habitat === 2 ? climate : climate * 0.42 + edge * 0.58;
      return signal >= 1 - reach;
    };
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      if (!habitatFor(column, row)) continue;
      const index = row * columns + column, darkness = 1 - cellTones[index] / 255;
      const scaleHash = ditherHash(seed, column, row, 53);
      const localSize = cell * (1 + Math.floor(scaleHash * diversity * 3));
      let localBody = body;
      if (ditherHash(seed, column, row, 59) < diversity * 0.55) localBody = (body + 1 + Math.floor(ditherHash(seed, column, row, 61) * 4)) % 5;
      let red = cellColors[index * 3], green = cellColors[index * 3 + 1], blue = cellColors[index * 3 + 2];
      if (paletteLogic > 0 && ditherHash(seed, column, row, 67) < diversity * 0.42) {
        const paletteIndex = Math.max(0, palette.findIndex((candidate) => candidate[0] === red && candidate[1] === green && candidate[2] === blue));
        const rotated = palette[(paletteIndex + 1 + Math.floor(ditherHash(seed, column, row, 71) * 3)) % 4];
        [red, green, blue] = rotated;
      }
      const x = column * cell + cell / 2 - localSize / 2, y = row * cell + cell / 2 - localSize / 2;
      const cx = x + localSize / 2, cy = y + localSize / 2;
      context.fillStyle = `rgb(${red},${green},${blue})`;
      if (localBody === 0) context.fillRect(x, y, localSize, localSize);
      else if (localBody === 1) { context.beginPath(); context.arc(cx, cy, Math.max(0.4, localSize * (0.16 + darkness * 0.56)), 0, Math.PI * 2); context.fill(); }
      else if (localBody === 2) context.fillRect(cx - localSize * 0.62, cy - Math.max(0.5, localSize * (0.05 + darkness * 0.18)), localSize * 1.24, Math.max(1, localSize * (0.1 + darkness * 0.36)));
      else if (localBody === 3) {
        const flip = ditherHash(seed, column, row, 73) > 0.5;
        context.beginPath(); context.moveTo(x + (flip ? localSize : 0), y); context.lineTo(x + (flip ? 0 : localSize), y + localSize * (0.28 + darkness * 0.72)); context.lineTo(x + (flip ? localSize : 0), y + localSize); context.closePath(); context.fill();
      } else {
        const chosenTone = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const level = Math.max(0, Math.min(4, Math.floor((1 - darkness) * 5)));
        context.fillRect(x, y, localSize, localSize);
        context.strokeStyle = paletteLogic === 0 ? (chosenTone > 138 ? "rgba(20,24,28,.82)" : "rgba(245,242,234,.82)") : packedCss(chosenTone > 138 ? recipe.palette[3] : recipe.palette[2]);
        context.fillStyle = context.strokeStyle;
        context.lineWidth = Math.max(1, localSize * 0.075);
        const inset = context.lineWidth * 0.65;
        context.strokeRect(x + inset, y + inset, Math.max(0, localSize - inset * 2), Math.max(0, localSize - inset * 2));
        if (level === 1) context.fillRect(x + localSize * 0.42, y + localSize * 0.42, localSize * 0.16, localSize * 0.16);
        else if (level === 2) context.strokeRect(x + localSize * 0.25, y + localSize * 0.25, localSize * 0.5, localSize * 0.5);
        else if (level === 3) { context.beginPath(); context.moveTo(cx, y + inset); context.lineTo(cx, y + localSize - inset); context.moveTo(x + inset, cy); context.lineTo(x + localSize - inset, cy); context.stroke(); }
        else if (level === 4) { context.fillRect(x + localSize * 0.18, y + localSize * 0.18, localSize * 0.64, localSize * 0.64); context.fillStyle = `rgb(${red},${green},${blue})`; context.fillRect(x + localSize * 0.36, y + localSize * 0.36, localSize * 0.28, localSize * 0.28); }
      }
    }
  } else if (body === 0) {
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column, r = cellColors[index * 3], g = cellColors[index * 3 + 1], b = cellColors[index * 3 + 2];
      for (let y = row * cell; y < Math.min(input.height, (row + 1) * cell); y += 1) for (let x = column * cell; x < Math.min(input.width, (column + 1) * cell); x += 1) {
        const target = (y * input.width + x) * 4;
        image.data[target] = r; image.data[target + 1] = g; image.data[target + 2] = b; image.data[target + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  } else if (body < 4) {
    const ground = paletteLogic === 0 ? 0xf4f1eb : recipe.palette[3];
    context.fillStyle = packedCss(ground); context.fillRect(0, 0, input.width, input.height);
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column, darkness = 1 - cellTones[index] / 255;
      context.fillStyle = `rgb(${cellColors[index * 3]},${cellColors[index * 3 + 1]},${cellColors[index * 3 + 2]})`;
      const x = column * cell, y = row * cell, cx = x + cell / 2, cy = y + cell / 2;
      if (body === 1) { context.beginPath(); context.arc(cx, cy, Math.max(0.4, cell * (0.16 + darkness * 0.56)), 0, Math.PI * 2); context.fill(); }
      else if (body === 2) { context.fillRect(cx - cell * 0.62, cy - Math.max(0.5, cell * (0.05 + darkness * 0.18)), cell * 1.24, Math.max(1, cell * (0.1 + darkness * 0.36))); }
      else { const flip = ditherHash(seed, column, row, 17) > 0.5; context.beginPath(); context.moveTo(x + (flip ? cell : 0), y); context.lineTo(x + (flip ? 0 : cell), y + cell * (0.28 + darkness * 0.72)); context.lineTo(x + (flip ? cell : 0), y + cell); context.closePath(); context.fill(); }
    }
  } else {
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const red = cellColors[index * 3], green = cellColors[index * 3 + 1], blue = cellColors[index * 3 + 2];
      const chosenTone = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const lightness = cellTones[index] / 255;
      const level = Math.max(0, Math.min(4, Math.floor(lightness * 5)));
      const x = column * cell, y = row * cell, width = Math.min(cell, input.width - x), height = Math.min(cell, input.height - y);
      context.fillStyle = `rgb(${red},${green},${blue})`; context.fillRect(x, y, width, height);
      context.strokeStyle = paletteLogic === 0 ? (chosenTone > 138 ? "rgba(20,24,28,.82)" : "rgba(245,242,234,.82)") : packedCss(chosenTone > 138 ? recipe.palette[3] : recipe.palette[2]);
      context.fillStyle = context.strokeStyle;
      context.lineWidth = Math.max(1, cell * 0.075);
      const inset = context.lineWidth * 0.65;
      context.strokeRect(x + inset, y + inset, Math.max(0, width - inset * 2), Math.max(0, height - inset * 2));
      if (level === 1) context.fillRect(x + width * 0.42, y + height * 0.42, width * 0.16, height * 0.16);
      else if (level === 2) context.strokeRect(x + width * 0.25, y + height * 0.25, width * 0.5, height * 0.5);
      else if (level === 3) { context.beginPath(); context.moveTo(x + width * 0.5, y + inset); context.lineTo(x + width * 0.5, y + height - inset); context.moveTo(x + inset, y + height * 0.5); context.lineTo(x + width - inset, y + height * 0.5); context.stroke(); }
      else if (level === 4) { context.fillRect(x + width * 0.18, y + height * 0.18, width * 0.64, height * 0.64); context.fillStyle = `rgb(${red},${green},${blue})`; context.fillRect(x + width * 0.36, y + height * 0.36, width * 0.28, height * 0.28); }
    }
  }
  if (sourceReturn > 0) { context.globalAlpha = sourceReturn; context.drawImage(input, 0, 0); context.globalAlpha = 1; }
  return output;
}

function parliamentHash(seed: number, column: number, row: number, salt: number) {
  let value = (seed ^ Math.imul(column + 1, 374761393) ^ Math.imul(row + 3, 668265263) ^ Math.imul(salt + 7, -1640531527)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function parliamentOfPixels(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const source = input.getContext("2d")!.getImageData(0, 0, input.width, input.height);
  const image = context.createImageData(input.width, input.height);
  const scale = Math.min(input.width, input.height) / 760;
  const district = Math.max(4, Math.round(param(effect, "districtSize", 54) * scale));
  const grain = Math.max(1, Math.round(param(effect, "ballotGrain", 2) * Math.max(1, scale)));
  const parties = Math.max(2, Math.round(param(effect, "parties", 5)));
  const heldDialect = Math.max(0, Math.min(4, Math.round(param(effect, "dialect", 0))));
  const majority = param(effect, "majorityRule", 0.64);
  const minority = param(effect, "minorityPersistence", 0.3);
  const migration = param(effect, "migration", 0.46);
  const coup = param(effect, "coup", 0.18);
  const disagreement = param(effect, "channelDisagreement", 0.48);
  const memory = param(effect, "sourceMemory", 0.2);
  const columns = Math.ceil(input.width / district);
  const rows = Math.ceil(input.height / district);
  const step = 255 / (parties - 1);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const averages = new Float32Array(columns * rows * 3);
  const dialects = new Uint8Array(columns * rows);
  const coups = new Uint8Array(columns * rows);
  const seed = recipe.seed + effect.where.seed * 31;
  const wrap = (value: number, limit: number) => ((value % limit) + limit) % limit;
  const at = (x: number, y: number) => (wrap(y, input.height) * input.width + wrap(x, input.width)) * 4;

  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const districtIndex = row * columns + column;
    const x0 = column * district, y0 = row * district;
    const x1 = Math.min(input.width - 1, x0 + district - 1), y1 = Math.min(input.height - 1, y0 + district - 1);
    const samples = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)]];
    for (const [x, y] of samples) {
      const sourceAt = (y * input.width + x) * 4;
      averages[districtIndex * 3] += source.data[sourceAt] / samples.length;
      averages[districtIndex * 3 + 1] += source.data[sourceAt + 1] / samples.length;
      averages[districtIndex * 3 + 2] += source.data[sourceAt + 2] / samples.length;
    }
    dialects[districtIndex] = heldDialect || 1 + Math.min(3, Math.floor(parliamentHash(seed, column, row, 5) * 4));
    coups[districtIndex] = parliamentHash(seed, column, row, 17) < coup ? 1 : 0;
    if (coups[districtIndex] && heldDialect === 0) dialects[districtIndex] = 1 + (dialects[districtIndex] % 4);
  }

  const nearestPalette = (red: number, green: number, blue: number, rotation: number) => {
    let chosen = recipe.palette[0], distance = Number.POSITIVE_INFINITY, chosenIndex = 0;
    recipe.palette.forEach((packed, index) => {
      const dr = red - ((packed >> 16) & 255), dg = green - ((packed >> 8) & 255), db = blue - (packed & 255);
      const next = dr * dr + dg * dg + db * db;
      if (next < distance) { distance = next; chosen = packed; chosenIndex = index; }
    });
    return recipe.palette[(chosenIndex + rotation) % recipe.palette.length] ?? chosen;
  };

  for (let y = 0; y < input.height; y += 1) for (let x = 0; x < input.width; x += 1) {
    const column = Math.floor(x / district), row = Math.floor(y / district), districtIndex = row * columns + column;
    const dialect = dialects[districtIndex];
    const moveX = Math.round((parliamentHash(seed, column, row, 23) * 2 - 1) * district * migration * 2.5);
    const moveY = Math.round((parliamentHash(seed, column, row, 29) * 2 - 1) * district * migration * 1.5);
    const sampleAt = at(x + moveX, y + moveY);
    const target = (y * input.width + x) * 4;
    const pixelVote = parliamentHash(seed, Math.floor(x / grain), Math.floor(y / grain), 37);
    const pattern = dialect === 1
      ? bayer[((Math.floor(y / grain) & 3) * 4) + (Math.floor(x / grain) & 3)] / 15
      : dialect === 2
        ? ((Math.floor(x / grain) ^ Math.floor(y / grain)) & 3) / 3
        : dialect === 3
          ? ((Math.floor(x / grain) + Math.floor(y / grain) * 2) % 7) / 6
          : parliamentHash(seed, Math.floor(x / grain), Math.floor(y / grain), 43);
    const threshold = (pattern - 0.5) * step;
    const dissent = pixelVote < minority;
    const majorityWeight = majority * (dissent ? 0.12 : 1 - minority * 0.28);
    const coupStep = coups[districtIndex] ? step : 0;
    const partyR = Math.max(0, Math.min(255, Math.round((averages[districtIndex * 3] + threshold + coupStep) / step) * step));
    const partyG = Math.max(0, Math.min(255, Math.round((averages[districtIndex * 3 + 1] + threshold - coupStep) / step) * step));
    const partyB = Math.max(0, Math.min(255, Math.round((averages[districtIndex * 3 + 2] + threshold + coupStep) / step) * step));
    const sampledR = source.data[sampleAt], sampledG = source.data[sampleAt + 1], sampledB = source.data[sampleAt + 2];
    const localR = Math.max(0, Math.min(255, Math.round((sampledR + threshold * (1 - disagreement)) / step) * step));
    const localG = Math.max(0, Math.min(255, Math.round((sampledG + threshold) / step) * step));
    const localB = Math.max(0, Math.min(255, Math.round((sampledB + threshold * (1 + disagreement)) / step) * step));
    let electedR = localR * (1 - majorityWeight) + partyR * majorityWeight;
    let electedG = localG * (1 - majorityWeight) + partyG * majorityWeight;
    let electedB = localB * (1 - majorityWeight) + partyB * majorityWeight;

    if (dialect === 1) {
      const packed = nearestPalette(electedR, electedG, electedB, coups[districtIndex]);
      electedR = (packed >> 16) & 255;
      electedG = (packed >> 8) & 255;
      electedB = packed & 255;
    } else if (dialect === 2) {
      const order = (column + row + coups[districtIndex]) % 3;
      const rawR = order === 0 ? sampledR : order === 1 ? sampledG : sampledB;
      const rawG = order === 0 ? sampledG : order === 1 ? sampledB : sampledR;
      const rawB = order === 0 ? sampledB : order === 1 ? sampledR : sampledG;
      electedR = electedR * (1 - disagreement * 0.72) + rawR * disagreement * 0.72;
      electedG = electedG * (1 - disagreement * 0.72) + rawG * disagreement * 0.72;
      electedB = electedB * (1 - disagreement * 0.72) + rawB * disagreement * 0.72;
    } else if (dialect === 3) {
      const light = electedR * 0.2126 + electedG * 0.7152 + electedB * 0.0722;
      const fax = light + threshold * 1.7 >= 128 ? 255 : 0;
      electedR = fax * (1 - disagreement * 0.52) + partyR * disagreement * 0.52;
      electedG = fax * (1 - disagreement * 0.52) + partyG * disagreement * 0.52;
      electedB = fax * (1 - disagreement * 0.52) + partyB * disagreement * 0.52;
    } else {
      const split = Math.round(district * disagreement * 0.55);
      const redAt = at(x + moveX - split, y + moveY);
      const blueAt = at(x + moveX + split, y + moveY);
      electedR = electedR * (1 - disagreement) + source.data[redAt] * disagreement;
      electedB = electedB * (1 - disagreement) + source.data[blueAt + 2] * disagreement;
      if ((Math.floor(y / grain) + row) % 5 === 0) electedG *= 1 - disagreement * 0.72;
    }

    image.data[target] = Math.round(source.data[target] * memory + electedR * (1 - memory));
    image.data[target + 1] = Math.round(source.data[target + 1] * memory + electedG * (1 - memory));
    image.data[target + 2] = Math.round(source.data[target + 2] * memory + electedB * (1 - memory));
    image.data[target + 3] = source.data[target + 3];
  }
  context.putImageData(image, 0, 0);
  return output;
}

function lensWarp(input: HTMLCanvasElement, effect: EffectInstance, phase: number) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const sourceContext = input.getContext("2d")!;
  const source = sourceContext.getImageData(0, 0, input.width, input.height);
  const image = context.createImageData(input.width, input.height);
  const bendX = param(effect, "bendX", 0.22);
  const bendY = param(effect, "bendY", 0.14);
  const frequency = param(effect, "frequency", 3.4);
  const mode = Math.round(param(effect, "mode", 1));
  for (let y = 0; y < input.height; y += 1) {
    const ny = y / input.height - 0.5;
    for (let x = 0; x < input.width; x += 1) {
      const nx = x / input.width - 0.5;
      const at = (y * input.width + x) * 4;
      const light = (source.data[at] + source.data[at + 1] + source.data[at + 2]) / 765 - 0.5;
      let ox = light * input.width * bendX;
      let oy = light * input.height * bendY;
      if (mode === 1) {
        ox += Math.sin((ny * frequency + phase * 0.1) * Math.PI * 2) * input.width * bendX * 0.34;
        oy += Math.cos((nx * frequency - phase * 0.1) * Math.PI * 2) * input.height * bendY * 0.34;
      } else if (mode === 2) {
        const angle = Math.atan2(ny, nx) + light * bendX * 3;
        const radius = Math.sqrt(nx * nx + ny * ny) * (1 + light * bendY * 2);
        ox += (Math.cos(angle) * radius - nx) * input.width;
        oy += (Math.sin(angle) * radius - ny) * input.height;
      }
      const sx = ((Math.round(x + ox) % input.width) + input.width) % input.width;
      const sy = ((Math.round(y + oy) % input.height) + input.height) % input.height;
      const sourceAt = (sy * input.width + sx) * 4;
      image.data[at] = source.data[sourceAt];
      image.data[at + 1] = source.data[sourceAt + 1];
      image.data[at + 2] = source.data[sourceAt + 2];
      image.data[at + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return output;
}

function tectonicHash(seed: number, identity: number, salt: number) {
  let value = (seed ^ Math.imul(identity + 1, 374761393) ^ Math.imul(3, 668265263) ^ Math.imul(salt + 7, -1640531527)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function tectonicLens(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const sourceContext = input.getContext("2d", { willReadFrequently: true })!;
  const sourceImage = sourceContext.getImageData(0, 0, input.width, input.height);
  const source = sourceImage.data;
  const result = context.createImageData(input.width, input.height);
  const detail = Math.max(24, Math.min(180, Math.round(param(effect, "territoryDetail", 84))));
  const aspect = input.width / Math.max(1, input.height);
  const gridWidth = Math.max(2, Math.min(320, Math.round(aspect >= 1 ? detail * aspect : detail)));
  const gridHeight = Math.max(2, Math.min(320, Math.round(aspect >= 1 ? detail : detail / aspect)));
  const cells = gridWidth * gridHeight;
  const red = new Uint8Array(cells), green = new Uint8Array(cells), blue = new Uint8Array(cells);
  const hue = new Uint8Array(cells), saturation = new Uint8Array(cells), light = new Uint8Array(cells);
  for (let gy = 0; gy < gridHeight; gy += 1) for (let gx = 0; gx < gridWidth; gx += 1) {
    const x = Math.min(input.width - 1, Math.floor((gx + 0.5) * input.width / gridWidth));
    const y = Math.min(input.height - 1, Math.floor((gy + 0.5) * input.height / gridHeight));
    const at = (y * input.width + x) * 4, cell = gy * gridWidth + gx;
    red[cell] = source[at]; green[cell] = source[at + 1]; blue[cell] = source[at + 2];
    const hsb = rgbToHsb255(red[cell], green[cell], blue[cell]);
    hue[cell] = Math.round(hsb[0]); saturation[cell] = Math.round(hsb[1]);
    light[cell] = Math.round((red[cell] + green[cell] + blue[cell]) / 3);
  }

  const edgeCount = (gridWidth - 1) * gridHeight + (gridHeight - 1) * gridWidth;
  const edgeA = new Int32Array(edgeCount), edgeB = new Int32Array(edgeCount), edgeNext = new Int32Array(edgeCount);
  const edgeWeight = new Uint8Array(edgeCount), bucketHead = new Int32Array(256); bucketHead.fill(-1);
  const signal = Math.round(param(effect, "boundarySignal", 0));
  const distance = (a: number, b: number) => {
    if (signal === 1) return Math.min(255, Math.round(Math.min(Math.abs(hue[a] - hue[b]), 255 - Math.abs(hue[a] - hue[b])) * (0.35 + 0.65 * Math.max(saturation[a], saturation[b]) / 255)));
    if (signal === 2) return Math.abs(light[a] - light[b]);
    if (signal === 3) return Math.abs(saturation[a] - saturation[b]);
    const dr = Math.abs(red[a] - red[b]), dg = Math.abs(green[a] - green[b]), db = Math.abs(blue[a] - blue[b]);
    return signal === 4 ? Math.max(dr, dg, db) : Math.round((dr + dg + db) / 3);
  };
  let edge = 0;
  const addEdge = (a: number, b: number) => {
    const weight = distance(a, b); edgeA[edge] = a; edgeB[edge] = b; edgeWeight[edge] = weight;
    edgeNext[edge] = bucketHead[weight]; bucketHead[weight] = edge; edge += 1;
  };
  for (let gy = 0; gy < gridHeight; gy += 1) for (let gx = 0; gx < gridWidth; gx += 1) {
    const cell = gy * gridWidth + gx;
    if (gx + 1 < gridWidth) addEdge(cell, cell + 1);
    if (gy + 1 < gridHeight) addEdge(cell, cell + gridWidth);
  }
  const parent = new Int32Array(cells), componentSize = new Int32Array(cells), internal = new Float32Array(cells);
  for (let cell = 0; cell < cells; cell += 1) { parent[cell] = cell; componentSize[cell] = 1; }
  const find = (start: number) => {
    let root = start;
    while (parent[root] !== root) root = parent[root];
    let cursor = start;
    while (parent[cursor] !== cursor) { const next = parent[cursor]; parent[cursor] = root; cursor = next; }
    return root;
  };
  const merge = (left: number, right: number, weight: number) => {
    let a = find(left), b = find(right); if (a === b) return a;
    if (componentSize[a] < componentSize[b]) { const swap = a; a = b; b = swap; }
    parent[b] = a; componentSize[a] += componentSize[b]; internal[a] = Math.max(weight, internal[a], internal[b]); return a;
  };
  const sensitivity = Math.max(0.05, Math.min(1, param(effect, "boundarySensitivity", 0.46)));
  const mergePressure = 12 + sensitivity * sensitivity * 620;
  for (let weight = 0; weight < 256; weight += 1) for (let current = bucketHead[weight]; current >= 0; current = edgeNext[current]) {
    const a = find(edgeA[current]), b = find(edgeB[current]);
    if (a !== b && weight <= internal[a] + mergePressure / componentSize[a] && weight <= internal[b] + mergePressure / componentSize[b]) merge(a, b, weight);
  }
  const minimum = Math.max(1, Math.round(param(effect, "minimumTerritory", 8)));
  for (let weight = 0; weight < 256; weight += 1) for (let current = bucketHead[weight]; current >= 0; current = edgeNext[current]) {
    const a = find(edgeA[current]), b = find(edgeB[current]);
    if (a !== b && (componentSize[a] < minimum || componentSize[b] < minimum)) merge(a, b, weight);
  }
  const labels = new Int32Array(cells), count = new Int32Array(cells), sumX = new Float64Array(cells), sumY = new Float64Array(cells);
  for (let gy = 0; gy < gridHeight; gy += 1) for (let gx = 0; gx < gridWidth; gx += 1) {
    const cell = gy * gridWidth + gx, root = find(cell); labels[cell] = root; count[root] += 1; sumX[root] += gx + 0.5; sumY[root] += gy + 0.5;
  }

  const seed = (recipe.seed ^ effect.where.seed ^ 0x54ec70c) >>> 0;
  const dominantLaw = Math.max(0, Math.min(3, Math.round(param(effect, "dominantLaw", 2))));
  const lensSignal = Math.max(0, Math.min(6, Math.round(param(effect, "lensSignal", 1))));
  const pressure = param(effect, "lensPressure", 0.48), diversity = param(effect, "lawDiversity", 0.72);
  const separation = param(effect, "separation", 0.18), rotation = param(effect, "rotation", 0.14);
  const echo = param(effect, "echo", 0.24), absence = param(effect, "absence", 0.08);
  const infection = param(effect, "boundaryInfection", 0.46), memory = param(effect, "sourceMemory", 0.32), motion = param(effect, "motion", 0.28);
  const minimumDimension = Math.min(input.width, input.height);
  const wrap = (value: number, size: number) => ((Math.round(value) % size) + size) % size;
  const sampleSignal = (at: number) => {
    const r = source[at], g = source[at + 1], b = source[at + 2];
    if (lensSignal === 3) return r / 255 - 0.5; if (lensSignal === 4) return g / 255 - 0.5; if (lensSignal === 5) return b / 255 - 0.5;
    if (lensSignal === 6) return (r - (g + b) * 0.5) / 255;
    const hsb = rgbToHsb255(r, g, b); if (lensSignal === 1) return hsb[0] / 255 - 0.5; if (lensSignal === 2) return hsb[1] / 255 - 0.5;
    return (r + g + b) / 765 - 0.5;
  };
  for (let y = 0; y < input.height; y += 1) for (let x = 0; x < input.width; x += 1) {
    const gx = Math.min(gridWidth - 1, Math.floor(x * gridWidth / input.width)), gy = Math.min(gridHeight - 1, Math.floor(y * gridHeight / input.height));
    const cell = gy * gridWidth + gx, root = labels[cell], target = (y * input.width + x) * 4;
    const identity = root + 1, h0 = tectonicHash(seed, identity, 0), h1 = tectonicHash(seed, identity, 1), h2 = tectonicHash(seed, identity, 2), h3 = tectonicHash(seed, identity, 3);
    if (h0 < absence) {
      const ground = recipe.colorMode === "palette" ? recipe.palette[3] : 0;
      result.data[target] = (ground >> 16) & 255; result.data[target + 1] = (ground >> 8) & 255; result.data[target + 2] = ground & 255; result.data[target + 3] = 255; continue;
    }
    const centerX = sumX[root] / Math.max(1, count[root]) * input.width / gridWidth, centerY = sumY[root] / Math.max(1, count[root]) * input.height / gridHeight;
    const direction = h1 * Math.PI * 2, motionWave = Math.sin(phase + h2 * Math.PI * 2), breath = 1 + motion * motionWave * 0.72;
    let localX = x - centerX - Math.cos(direction) * separation * minimumDimension * (0.25 + h2 * 0.75) * breath;
    let localY = y - centerY - Math.sin(direction) * separation * minimumDimension * (0.25 + h2 * 0.75) * breath;
    const turn = (h3 * 2 - 1) * rotation * Math.PI * breath, cosine = Math.cos(-turn), sine = Math.sin(-turn);
    const rotatedX = localX * cosine - localY * sine, rotatedY = localX * sine + localY * cosine; localX = rotatedX; localY = rotatedY;
    let sx = centerX + localX, sy = centerY + localY;
    const evidenceAt = (wrap(y, input.height) * input.width + wrap(x, input.width)) * 4, evidence = sampleSignal(evidenceAt);
    const law = tectonicHash(seed, identity, 4) < diversity ? Math.floor(tectonicHash(seed, identity, 5) * 4) : dominantLaw;
    if (law === 0) { sx += evidence * pressure * input.width * 0.22 * Math.cos(direction); sy += evidence * pressure * input.height * 0.22 * Math.sin(direction); }
    else if (law === 1) {
      const exponent = 0.32 + tectonicHash(seed, identity, 6) * 2.8, folded = Math.sign(evidence) * Math.abs(evidence * 2) ** exponent * 0.5;
      sx += folded * pressure * input.width * 0.28 * Math.cos(direction); sy += folded * pressure * input.height * 0.28 * Math.sin(direction);
    } else if (law === 2) {
      const wave = Math.sin((evidence * 2 + localX / minimumDimension * (1 + h1 * 4)) * Math.PI * 2 + motionWave * motion * Math.PI);
      sx += wave * pressure * minimumDimension * 0.18 * Math.cos(direction); sy += wave * pressure * minimumDimension * 0.18 * Math.sin(direction);
    } else {
      const angle = Math.atan2(localY, localX) + evidence * pressure * 2.8 * breath, radius = Math.hypot(localX, localY) * (1 + evidence * pressure * 0.65);
      sx = centerX + Math.cos(angle) * radius; sy = centerY + Math.sin(angle) * radius;
    }
    if (tectonicHash(seed, identity, 7) < echo) { sx += (tectonicHash(seed, identity, 8) * 2 - 1) * input.width * 0.3; sy += (tectonicHash(seed, identity, 9) * 2 - 1) * input.height * 0.3; }
    let sourceX = wrap(sx, input.width), sourceY = wrap(sy, input.height), sourceAt = (sourceY * input.width + sourceX) * 4;
    const fractionX = x * gridWidth / input.width - gx, fractionY = y * gridHeight / input.height - gy;
    let fault = false;
    if (fractionX < 0.16 && gx > 0 && labels[cell - 1] !== root) fault = true; else if (fractionX > 0.84 && gx + 1 < gridWidth && labels[cell + 1] !== root) fault = true;
    if (fractionY < 0.16 && gy > 0 && labels[cell - gridWidth] !== root) fault = true; else if (fractionY > 0.84 && gy + 1 < gridHeight && labels[cell + gridWidth] !== root) fault = true;
    const originalAt = target;
    if (fault && infection > 0) {
      const split = Math.max(1, Math.round(infection * minimumDimension * 0.018));
      const redAt = (sourceY * input.width + wrap(sourceX + split, input.width)) * 4, blueAt = (wrap(sourceY - split, input.height) * input.width + sourceX) * 4;
      result.data[target] = source[redAt]; result.data[target + 1] = source[sourceAt + 1]; result.data[target + 2] = source[blueAt + 2];
    } else { result.data[target] = source[sourceAt]; result.data[target + 1] = source[sourceAt + 1]; result.data[target + 2] = source[sourceAt + 2]; }
    result.data[target] = Math.round(result.data[target] * (1 - memory) + source[originalAt] * memory);
    result.data[target + 1] = Math.round(result.data[target + 1] * (1 - memory) + source[originalAt + 1] * memory);
    result.data[target + 2] = Math.round(result.data[target + 2] * (1 - memory) + source[originalAt + 2] * memory);
    result.data[target + 3] = 255;
  }
  context.putImageData(result, 0, 0);
  return output;
}

function mirrorCut(input: HTMLCanvasElement, effect: EffectInstance) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const mode = Math.round(param(effect, "mode", 2));
  const offset = param(effect, "offset", 0.16);
  const mix = param(effect, "mix", 0.74);
  context.drawImage(input, 0, 0);
  context.globalAlpha = mix;
  if (mode === 0 || mode === 1) {
    context.save();
    context.translate(mode === 0 ? input.width : 0, offset * input.height);
    context.scale(-1, 1);
    context.drawImage(input, mode === 0 ? 0 : -input.width, 0);
    context.restore();
  } else if (mode === 2 || mode === 3) {
    context.save();
    context.translate(offset * input.width, mode === 2 ? input.height : 0);
    context.scale(1, -1);
    context.drawImage(input, 0, mode === 2 ? 0 : -input.height);
    context.restore();
  } else if (mode === 4) {
    context.save();
    context.translate(input.width * (0.5 + offset * 0.2), input.height * 0.5);
    context.rotate(Math.PI / 2);
    context.scale(-1, 1);
    context.drawImage(input, -input.width / 2, -input.height / 2);
    context.restore();
  } else {
    context.save();
    context.translate(input.width * offset, input.height * -offset);
    context.scale(-1, 1);
    context.drawImage(input, -input.width, 0);
    context.restore();
  }
  context.globalAlpha = 1;
  return output;
}

function motionLeak(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const block = Math.max(4, Math.round(param(effect, "block", 16)));
  const vector = param(effect, "vector", 28);
  const leak = param(effect, "leak", 0.58);
  const residual = param(effect, "residual", 0.34);
  const coherence = param(effect, "coherence", 0.67);
  const random = randomSource(recipe.seed + 8849 + Math.round(phase * 100));
  context.drawImage(input, 0, 0);
  for (let y = 0; y < input.height; y += block) {
    for (let x = 0; x < input.width; x += block) {
      if (random() > leak) continue;
      const waveX = Math.sin(y * 0.018 * coherence + phase) * vector;
      const waveY = Math.cos(x * 0.014 * coherence - phase * 0.7) * vector * 0.55;
      const chaos = 1 - coherence;
      const dx = waveX + (random() * 2 - 1) * vector * chaos;
      const dy = waveY + (random() * 2 - 1) * vector * chaos;
      const sourceX = Math.max(0, Math.min(input.width - block, x + dx));
      const sourceY = Math.max(0, Math.min(input.height - block, y + dy));
      context.globalAlpha = 0.5 + leak * 0.5;
      context.drawImage(input, sourceX, sourceY, block, block, x, y, block + 1, block + 1);
      if (residual > 0) {
        context.globalCompositeOperation = "screen";
        context.globalAlpha = residual * 0.56;
        context.drawImage(input, x, y, block, block, x + dx * 0.12, y + dy * 0.12, block, block);
        context.globalCompositeOperation = "source-over";
      }
    }
  }
  context.globalAlpha = 1;
  return output;
}

function asciiHash(seed: number, column: number, row: number, salt = 0) {
  let value = (seed ^ Math.imul(column + salt, 374761393) ^ Math.imul(row - salt, 668265263)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

type CharacterPlacement = "whole" | "body" | "outline" | "outside";

function estimateCornerGround(source: ImageData) {
  const { width, height, data } = source;
  const points = [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2]];
  const total = points.reduce((sum, [x, y]) => {
    const at = (Math.max(0, y) * width + Math.max(0, x)) * 4;
    return [sum[0] + data[at], sum[1] + data[at + 1], sum[2] + data[at + 2]];
  }, [0, 0, 0]);
  return total.map((channel) => channel / points.length) as [number, number, number];
}

function characterPlacementMask(source: ImageData, ground: [number, number, number], placement: CharacterPlacement, gate: number, x: number, y: number, reach: number) {
  if (placement === "whole") return 1;
  const difference = (sx: number, sy: number) => {
    const px = Math.max(0, Math.min(source.width - 1, Math.round(sx)));
    const py = Math.max(0, Math.min(source.height - 1, Math.round(sy)));
    const at = (py * source.width + px) * 4;
    return Math.hypot(source.data[at] - ground[0], source.data[at + 1] - ground[1], source.data[at + 2] - ground[2]) / 441.673;
  };
  const body = smoothstep(gate - 0.035, gate + 0.035, difference(x, y));
  if (placement === "body") return body;
  if (placement === "outside") return 1 - body;
  const neighborhood = [difference(x - reach, y), difference(x + reach, y), difference(x, y - reach), difference(x, y + reach)];
  const boundary = Math.max(...neighborhood.map((value) => Math.abs(value - difference(x, y))));
  return Math.max(body * (1 - Math.min(...neighborhood.map((value) => smoothstep(gate - 0.035, gate + 0.035, value)))), smoothstep(0.035, 0.2, boundary));
}

function asciiField(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  if ((effect.characterField?.asciiVersion ?? 1) < 2) {
    latestAsciiTextCapture = null;
    return asciiFieldV1(input, effect, recipe, phase);
  }
  return asciiFieldV2(input, effect, recipe, phase);
}

function asciiFieldV2(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const field = effect.characterField!;
  const composition = field.composition;
  const output = composition === "inlay" ? cloneSurface(input) : newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const source = input.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, input.width, input.height);
  const enteredGlyphs = printableAsciiGlyphs(field.glyphs);
  const glyphs = field.alphabetOrder === "measured" ? measuredAsciiGlyphs(enteredGlyphs) : enteredGlyphs;
  const scale = Math.min(input.width, input.height) / 760;
  const cell = Math.max(5, Math.round(param(effect, "cellSize", 15) * scale));
  const columns = Math.ceil(input.width / cell);
  const rows = Math.ceil(input.height / cell);
  const gridOffsetX = (input.width - columns * cell) * 0.5;
  const gridOffsetY = (input.height - rows * cell) * 0.5;
  const coverage = param(effect, "coverage", 1);
  const loyalty = param(effect, "imageLoyalty", 0.88);
  const edgeVoice = param(effect, "edgeVoice", 0.32);
  const placement = field.placement ?? "whole";
  const bodyGate = param(effect, "bodyGate", 0.16);
  const sourceGround = estimateCornerGround(source);
  const inverted = param(effect, "invertDensity", 0) >= 0.5;
  const signalMemory = param(effect, "signalMemory", 0.82);
  const mutationTide = param(effect, "mutationTide", 0.18);
  const bitRot = param(effect, "bitRot", 0.08);
  const overstrike = param(effect, "overstrike", 0.12);
  const carriageDrift = param(effect, "carriageDrift", 0.1);
  const lineFeedFault = param(effect, "lineFeedFault", 0.04);
  const tabGap = param(effect, "tabGap", 0.04);
  const dropout = param(effect, "dropout", 0.03);
  const seed = recipe.seed + effect.where.seed;
  const territoryScale = Math.max(cell, effect.where.scale * scale);
  const lumaAt = (x: number, y: number) => {
    const sx = Math.max(0, Math.min(input.width - 1, Math.round(x)));
    const sy = Math.max(0, Math.min(input.height - 1, Math.round(y)));
    const at = (sy * input.width + sx) * 4;
    return (source.data[at] * 0.2126 + source.data[at + 1] * 0.7152 + source.data[at + 2] * 0.0722) / 255;
  };
  if (composition === "field") {
    context.fillStyle = packedCss(field.groundColor ?? recipe.palette[3]);
    context.fillRect(0, 0, input.width, input.height);
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `600 ${Math.max(5, cell * 0.9)}px "${ASCII_FONT_FAMILY}", monospace`;
  const capturedRows: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const rowAddress = asciiHash(seed, 0, row, 103);
    const rowWave = asciiLoopWave(phase, rowAddress);
    const faultAddress = asciiHash(seed, 0, row, 107);
    const skipRow = faultAddress < lineFeedFault * (0.32 + rowWave * 0.68) * 0.42;
    const repeatPrevious = !skipRow && faultAddress > 1 - lineFeedFault * (0.32 + rowWave * 0.68) * 0.58;
    const sampleRow = repeatPrevious ? Math.max(0, row - 1) : row;
    const rowSlip = (asciiHash(seed, 0, row, 109) * 2 - 1) * cell * carriageDrift * 5 * (0.25 + rowWave * 0.75);
    const textRow = Array<string>(columns).fill(" ");
    for (let column = 0; column < columns; column += 1) {
      let glyph = " ";
      const baseX = gridOffsetX + column * cell + cell * 0.5;
      const baseY = gridOffsetY + row * cell + cell * 0.5;
      let x = baseX + rowSlip;
      while (x < gridOffsetX) x += columns * cell;
      while (x >= gridOffsetX + columns * cell) x -= columns * cell;
      const y = baseY;
      const sampleY = gridOffsetY + sampleRow * cell + cell * 0.5;
      const light = lumaAt(baseX, sampleY);
      const right = lumaAt(baseX + cell * 0.45, sampleY);
      const left = lumaAt(baseX - cell * 0.45, sampleY);
      const below = lumaAt(baseX, sampleY + cell * 0.45);
      const above = lumaAt(baseX, sampleY - cell * 0.45);
      const edgeX = right - left;
      const edgeY = below - above;
      const edge = Math.min(1, Math.hypot(edgeX, edgeY) * 2.2);
      const orientationTotal = Math.max(0.000001, Math.abs(edgeX) + Math.abs(edgeY) + edge * 0.55);
      const diagonal = Math.min(1, Math.abs(edgeX * edgeY) * 7);
      const sourceFeature: AsciiSourceFeature = {
        mass: inverted ? light : 1 - light,
        horizontal: Math.abs(edgeY) / orientationTotal,
        vertical: Math.abs(edgeX) / orientationTotal,
        rise: edgeX * edgeY >= 0 ? diagonal : 0,
        fall: edgeX * edgeY < 0 ? diagonal : 0,
        edge: Math.min(1, edge * (0.5 + edgeVoice * 1.5)),
      };
      const sampleX = Math.max(0, Math.min(input.width - 1, Math.round(baseX)));
      const samplePixelY = Math.max(0, Math.min(input.height - 1, Math.round(sampleY)));
      const at = (samplePixelY * input.width + sampleX) * 4;
      const signal = hueAndSaturation(source.data[at], source.data[at + 1], source.data[at + 2]);
      const feather = composition === "inlay" ? 0.001 : Math.max(0.001, effect.where.softness);
      const territoryColumn = Math.floor(baseX / territoryScale);
      const territoryRow = Math.floor(baseY / territoryScale);
      let territory = 1;
      if (effect.where.mode === "light") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, light);
      else if (effect.where.mode === "dark") territory = 1 - smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, light);
      else if (effect.where.mode === "edges") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, edge);
      else if (effect.where.mode === "saturated") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, signal.saturation);
      else if (effect.where.mode === "muted") territory = 1 - smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, signal.saturation);
      else if (effect.where.mode === "hue") {
        const distance = Math.abs(((signal.hue - effect.where.hue + 540) % 360) - 180);
        territory = (1 - smoothstep(effect.where.hueWidth, Math.min(180, effect.where.hueWidth + feather * 180), distance)) * smoothstep(0.01, 0.08, signal.saturation);
      } else if (effect.where.mode === "checker") territory = (territoryColumn + territoryRow) % 2 === 0 ? 1 : 0;
      else if (effect.where.mode === "stripes") territory = territoryColumn % 2 === 0 ? 1 : 0;
      else if (effect.where.mode === "blocks") territory = asciiHash(effect.where.seed, territoryColumn, territoryRow, 71) >= effect.where.threshold ? 1 : 0;
      else if (effect.where.mode === "random") territory = asciiHash(effect.where.seed, territoryColumn, territoryRow, 73) < effect.where.threshold ? 1 : 0;
      if (effect.where.invert) territory = 1 - territory;
      territory *= characterPlacementMask(source, sourceGround, placement, bodyGate, baseX, sampleY, cell * 0.62);
      const addressed = !skipRow && asciiHash(seed, column, row, 79) < territory;
      if (addressed && composition === "inlay") {
        context.fillStyle = packedCss(field.groundColor ?? recipe.palette[3]);
        context.fillRect(gridOffsetX + column * cell, gridOffsetY + row * cell, cell + 1, cell + 1);
      }
      const tabBlock = Math.floor(column / 8);
      const tabSilent = asciiHash(seed, tabBlock, row, 113) < tabGap && column % 8 >= 4;
      const deleted = asciiHash(seed, column, row, 127) < dropout * (0.45 + rowWave * 0.55);
      if (addressed && asciiHash(seed, column, row, 83) < coverage && !tabSilent && !deleted) {
        if (field.glyphLogic === "repeat") glyph = glyphs[(column + sampleRow) % glyphs.length] ?? " ";
        else glyph = chooseStructuralGlyph(glyphs, sourceFeature, field.glyphLogic, loyalty, asciiHash(seed, column, sampleRow, 131));
        const cellWave = asciiLoopWave(phase, asciiHash(seed, column, row, 137));
        const mutable = asciiHash(seed, column, row, 139) < mutationTide * (1 - signalMemory * 0.86) * (0.25 + cellWave * 0.75);
        if (mutable) glyph = asciiBitRot(glyph, bitRot, asciiHash(seed, column, row, 149), asciiHash(seed, column, row, 151));
        let density = sourceFeature.mass;
        if (field.inkMode === "source") context.fillStyle = `rgb(${source.data[at]},${source.data[at + 1]},${source.data[at + 2]})`;
        else if (field.inkMode === "chosen") context.fillStyle = packedCss(field.inkColor);
        else context.fillStyle = packedCss(recipe.palette[Math.max(0, Math.min(2, Math.round(density * 2)))]);
        if (overstrike > 0 && asciiHash(seed, column, row, 157) < overstrike) {
          const ghostIndex = Math.max(0, glyphs.indexOf(glyph));
          const ghost = glyphs[(ghostIndex + 1 + Math.floor(asciiHash(seed, column, row, 163) * Math.max(1, glyphs.length - 1))) % glyphs.length] ?? glyph;
          context.save();
          context.globalAlpha = Math.min(0.72, 0.18 + overstrike * 0.5);
          context.fillText(ghost, x - cell * overstrike * 0.13, y + cell * (0.04 + overstrike * 0.1));
          context.restore();
        }
        context.fillText(glyph, x, y + cell * 0.04);
        const captureColumn = Math.max(0, Math.min(columns - 1, Math.floor((x - gridOffsetX) / cell)));
        textRow[captureColumn] = glyph;
      }
    }
    capturedRows.push(textRow.join(""));
  }
  latestAsciiTextCapture = { text: capturedRows.join("\r\n"), columns, rows, fontAsset: ASCII_FONT_ASSET, atlasVersion: ASCII_ATLAS_VERSION };
  return output;
}

function asciiFieldV1(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const field = effect.characterField;
  const composition = field?.composition ?? "field";
  const glyphLogic = field?.glyphLogic ?? "mass";
  const output = composition === "inlay" ? cloneSurface(input) : newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const source = input.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, input.width, input.height);
  const glyphs = field?.glyphs?.length ? field.glyphs : [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"];
  const scale = Math.min(input.width, input.height) / 760;
  const cell = Math.max(5, Math.round(param(effect, "cellSize", 15) * scale));
  const columns = Math.ceil(input.width / cell);
  const rows = Math.ceil(input.height / cell);
  const gridOffsetX = (input.width - columns * cell) * 0.5;
  const gridOffsetY = (input.height - rows * cell) * 0.5;
  const coverage = param(effect, "coverage", 1);
  const loyalty = param(effect, "imageLoyalty", 0.88);
  const edgeVoice = param(effect, "edgeVoice", 0.32);
  const instability = param(effect, "instability", 0.1);
  const vacancy = param(effect, "vacancy", 0.03);
  const damage = param(effect, "gridDamage", 0.04);
  const inverted = param(effect, "invertDensity", 0) >= 0.5;
  const seed = recipe.seed + effect.where.seed + Math.round(phase * 1000);
  const territoryScale = Math.max(cell, effect.where.scale * scale);
  const lumaAt = (x: number, y: number) => {
    const sx = Math.max(0, Math.min(input.width - 1, Math.round(x)));
    const sy = Math.max(0, Math.min(input.height - 1, Math.round(y)));
    const at = (sy * input.width + sx) * 4;
    return (source.data[at] * 0.2126 + source.data[at + 1] * 0.7152 + source.data[at + 2] * 0.0722) / 255;
  };
  if (composition === "field") {
    context.fillStyle = packedCss(field?.groundColor ?? recipe.palette[3]);
    context.fillRect(0, 0, input.width, input.height);
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${Math.max(5, cell * 0.9)}px Consolas, "Segoe UI Symbol", "Segoe UI Emoji", monospace`;
  for (let row = 0; row < rows; row += 1) {
    const rowSlip = (asciiHash(seed, 0, row, 11) * 2 - 1) * cell * damage * 2.4;
    for (let column = 0; column < columns; column += 1) {
      const columnSlip = (asciiHash(seed, column, 0, 23) * 2 - 1) * cell * damage * 1.5;
      const x = gridOffsetX + column * cell + cell * 0.5 + rowSlip;
      const y = gridOffsetY + row * cell + cell * 0.5 + columnSlip;
      const light = lumaAt(x, y);
      const edgeX = lumaAt(x + cell * 0.45, y) - lumaAt(x - cell * 0.45, y);
      const edgeY = lumaAt(x, y + cell * 0.45) - lumaAt(x, y - cell * 0.45);
      const edge = Math.min(1, Math.hypot(edgeX, edgeY) * 2.2);
      const sampleX = Math.max(0, Math.min(input.width - 1, Math.round(x)));
      const sampleY = Math.max(0, Math.min(input.height - 1, Math.round(y)));
      const at = (sampleY * input.width + sampleX) * 4;
      const signal = hueAndSaturation(source.data[at], source.data[at + 1], source.data[at + 2]);
      const feather = composition === "inlay" ? 0.001 : Math.max(0.001, effect.where.softness);
      const territoryColumn = Math.floor(x / territoryScale);
      const territoryRow = Math.floor(y / territoryScale);
      let territory = 1;
      if (effect.where.mode === "light") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, light);
      else if (effect.where.mode === "dark") territory = 1 - smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, light);
      else if (effect.where.mode === "edges") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, edge);
      else if (effect.where.mode === "saturated") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, signal.saturation);
      else if (effect.where.mode === "muted") territory = 1 - smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, signal.saturation);
      else if (effect.where.mode === "hue") {
        const distance = Math.abs(((signal.hue - effect.where.hue + 540) % 360) - 180);
        territory = (1 - smoothstep(effect.where.hueWidth, Math.min(180, effect.where.hueWidth + feather * 180), distance)) * smoothstep(0.01, 0.08, signal.saturation);
      } else if (effect.where.mode === "checker") territory = (territoryColumn + territoryRow) % 2 === 0 ? 1 : 0;
      else if (effect.where.mode === "stripes") territory = territoryColumn % 2 === 0 ? 1 : 0;
      else if (effect.where.mode === "blocks") territory = asciiHash(effect.where.seed, territoryColumn, territoryRow, 71) >= effect.where.threshold ? 1 : 0;
      else if (effect.where.mode === "random") territory = asciiHash(effect.where.seed, territoryColumn, territoryRow, 73) < effect.where.threshold ? 1 : 0;
      if (effect.where.invert) territory = 1 - territory;
      if (asciiHash(seed, column, row, 79) >= territory) continue;
      if (composition === "inlay") {
        context.fillStyle = packedCss(field?.groundColor ?? recipe.palette[3]);
        context.fillRect(gridOffsetX + column * cell, gridOffsetY + row * cell, cell + 1, cell + 1);
      }
      if (asciiHash(seed, column, row, 83) >= coverage) continue;
      if (asciiHash(seed, column, row, 17) < vacancy) continue;
      const noise = asciiHash(seed, column, row, 31);
      let density = inverted ? light : 1 - light;
      density = density * loyalty + noise * (1 - loyalty);
      let index = glyphLogic === "repeat"
        ? (column + row) % glyphs.length
        : Math.max(0, Math.min(glyphs.length - 1, Math.round(density * (glyphs.length - 1))));
      if (asciiHash(seed, column, row, 43) < instability) {
        const reach = Math.max(1, Math.round(instability * glyphs.length * 0.6));
        index = Math.max(0, Math.min(glyphs.length - 1, index + Math.round((asciiHash(seed, column, row, 47) * 2 - 1) * reach)));
      }
      let glyph = glyphs[index] ?? " ";
      if (edge * edgeVoice > asciiHash(seed, column, row, 53) * 0.35) {
        glyph = Math.abs(edgeX) > Math.abs(edgeY) * 2
          ? "|"
          : Math.abs(edgeY) > Math.abs(edgeX) * 2
            ? "-"
            : edgeX * edgeY > 0 ? "/" : "\\";
      }
      if (field?.inkMode === "source") context.fillStyle = `rgb(${source.data[at]},${source.data[at + 1]},${source.data[at + 2]})`;
      else if (field?.inkMode === "chosen") context.fillStyle = packedCss(field.inkColor);
      else context.fillStyle = packedCss(recipe.palette[Math.max(0, Math.min(2, Math.round(density * 2)))]);
      context.fillText(glyph, x, y + cell * 0.04);
    }
  }
  return output;
}

function zhuyinWeave(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const field = effect.zhuyinField;
  const spatialLogic = field?.spatialLogic ?? "weave";
  const placement = field?.placement ?? "whole";
  const composition = field?.composition ?? "inlay";
  const output = composition === "inlay" ? cloneSurface(input) : newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const source = input.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, input.width, input.height);
  const glyphs = field?.glyphs?.length ? field.glyphs : Array.from("ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ");
  const scale = Math.min(input.width, input.height) / 760;
  const cell = Math.max(6, Math.round(param(effect, "cellSize", 22) * scale * (spatialLogic === "syllable" ? 1.55 : 1)));
  const columns = Math.ceil(input.width / cell) + 2;
  const rows = Math.ceil(input.height / cell) + 2;
  const coverage = param(effect, "coverage", 0.82);
  const voices = Math.max(1, Math.min(4, Math.round(param(effect, "voices", 2))));
  const misregistration = param(effect, "misregistration", 0.22);
  const rowDrift = param(effect, "rowDrift", 0.42);
  const imageRhythm = param(effect, "imageRhythm", 0.38);
  const motion = param(effect, "motion", 0.32);
  const bodyGate = param(effect, "bodyGate", 0.16);
  const sourceGround = estimateCornerGround(source);
  const seed = recipe.seed + effect.where.seed;
  const loopAngle = phase * Math.PI * 2;
  const territoryScale = Math.max(cell, effect.where.scale * scale);
  const sampleAt = (x: number, y: number) => {
    const sx = Math.max(0, Math.min(input.width - 1, Math.round(x)));
    const sy = Math.max(0, Math.min(input.height - 1, Math.round(y)));
    const at = (sy * input.width + sx) * 4;
    const light = (source.data[at] * 0.2126 + source.data[at + 1] * 0.7152 + source.data[at + 2] * 0.0722) / 255;
    return { at, light };
  };
  if (composition === "field") {
    context.fillStyle = packedCss(field?.groundColor ?? recipe.palette[3]);
    context.fillRect(0, 0, input.width, input.height);
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `600 ${Math.max(6, cell * (spatialLogic === "syllable" ? 0.42 : 0.86))}px "Microsoft JhengHei", "Noto Sans TC", MingLiU, sans-serif`;
  const initials = new Set(Array.from("ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ"));
  const finals = new Set(Array.from("ㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ"));
  const tones = new Set(Array.from("ˉˊˇˋ˙"));
  const initialGlyphs = glyphs.filter((glyph) => initials.has(glyph));
  const finalGlyphs = glyphs.filter((glyph) => finals.has(glyph));
  const toneGlyphs = glyphs.filter((glyph) => tones.has(glyph));
  const choosePool = (pool: string[], address: number) => (pool.length ? pool : glyphs)[Math.floor(address * (pool.length || glyphs.length)) % Math.max(1, pool.length || glyphs.length)] ?? glyphs[0] ?? "ㄅ";
  for (let row = -1; row < rows; row += 1) {
    const stagger = row * cell * rowDrift * 0.72;
    for (let column = -1; column < columns; column += 1) {
      const baseX = column * cell + cell * 0.5 + stagger;
      const baseY = row * cell + cell * 0.5;
      const { at, light } = sampleAt(baseX, baseY);
      const right = sampleAt(baseX + cell * 0.45, baseY).light;
      const left = sampleAt(baseX - cell * 0.45, baseY).light;
      const below = sampleAt(baseX, baseY + cell * 0.45).light;
      const above = sampleAt(baseX, baseY - cell * 0.45).light;
      const edge = Math.min(1, Math.hypot(right - left, below - above) * 2.2);
      const signal = hueAndSaturation(source.data[at], source.data[at + 1], source.data[at + 2]);
      const feather = composition === "inlay" ? 0.001 : Math.max(0.001, effect.where.softness);
      const territoryColumn = Math.floor(baseX / territoryScale);
      const territoryRow = Math.floor(baseY / territoryScale);
      let territory = 1;
      if (effect.where.mode === "light") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, light);
      else if (effect.where.mode === "dark") territory = 1 - smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, light);
      else if (effect.where.mode === "edges") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, edge);
      else if (effect.where.mode === "saturated") territory = smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, signal.saturation);
      else if (effect.where.mode === "muted") territory = 1 - smoothstep(effect.where.threshold - feather, effect.where.threshold + feather, signal.saturation);
      else if (effect.where.mode === "hue") {
        const distance = Math.abs(((signal.hue - effect.where.hue + 540) % 360) - 180);
        territory = (1 - smoothstep(effect.where.hueWidth, Math.min(180, effect.where.hueWidth + feather * 180), distance)) * smoothstep(0.01, 0.08, signal.saturation);
      } else if (effect.where.mode === "checker") territory = (territoryColumn + territoryRow) % 2 === 0 ? 1 : 0;
      else if (effect.where.mode === "stripes") territory = territoryColumn % 2 === 0 ? 1 : 0;
      else if (effect.where.mode === "blocks") territory = asciiHash(effect.where.seed, territoryColumn, territoryRow, 71) >= effect.where.threshold ? 1 : 0;
      else if (effect.where.mode === "random") territory = asciiHash(effect.where.seed, territoryColumn, territoryRow, 73) < effect.where.threshold ? 1 : 0;
      if (effect.where.invert) territory = 1 - territory;
      territory *= characterPlacementMask(source, sourceGround, placement, bodyGate, baseX, baseY, cell * 0.62);
      if (asciiHash(seed, column, row, 101) >= territory || asciiHash(seed, column, row, 103) >= coverage) continue;
      if (composition === "inlay") {
        context.fillStyle = packedCss(field?.groundColor ?? recipe.palette[3]);
        context.fillRect(baseX - cell * 0.55, baseY - cell * 0.55, cell * 1.1, cell * 1.1);
      }
      const imageOffset = Math.round(light * imageRhythm * Math.max(1, glyphs.length - 1));
      const motionOffset = Math.round(Math.sin(loopAngle + row * 0.19) * motion * glyphs.length * 0.18);
      for (let voice = 0; voice < voices; voice += 1) {
        const voiceAngle = loopAngle + voice * Math.PI * 2 / voices;
        const distance = cell * misregistration * (voice / Math.max(1, voices - 1));
        const x = baseX + Math.cos(voiceAngle) * distance * (0.35 + motion * 0.65);
        const y = baseY + Math.sin(voiceAngle) * distance * (0.35 + motion * 0.65);
        const glyphIndex = ((column + Math.round(row * (1 + rowDrift * 4)) + voice * 7 + imageOffset + motionOffset) % glyphs.length + glyphs.length) % glyphs.length;
        if (field?.inkMode === "source") context.fillStyle = `rgb(${source.data[at]},${source.data[at + 1]},${source.data[at + 2]})`;
        else if (field?.inkMode === "chosen") context.fillStyle = packedCss(field.inkColor);
        else context.fillStyle = packedCss(recipe.palette[voice % 4]);
        context.globalAlpha = voices === 1 ? 1 : Math.max(0.48, 0.86 - voice * 0.1);
        if (spatialLogic === "syllable") {
          const clusterLength = Math.min(3, Math.max(1, glyphs.length));
          for (let member = 0; member < clusterLength; member += 1) {
            const clusterGlyph = glyphs[(glyphIndex + member) % glyphs.length];
            context.fillText(clusterGlyph, x, y + (member - (clusterLength - 1) * 0.5) * cell * 0.3);
          }
        } else if (spatialLogic === "call-response") {
          const address = asciiHash(seed, column, row, 211 + voice * 13);
          const glyph = edge > 0.22 && toneGlyphs.length
            ? choosePool(toneGlyphs, address)
            : light < 0.5
              ? choosePool(initialGlyphs, address)
              : choosePool(finalGlyphs, address);
          context.fillText(glyph, x, y + cell * 0.03);
        } else context.fillText(glyphs[glyphIndex], x, y + cell * 0.03);
      }
    }
  }
  context.globalAlpha = 1;
  return output;
}

function petsciiStudy(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe) {
  const output = newSurface(input.width, input.height);
  const context = output.getContext("2d")!;
  const source = input.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, input.width, input.height);
  const foreground = effect.tileField?.foregroundColor ?? petsciiPalette[14];
  const background = effect.tileField?.backgroundColor ?? petsciiPalette[0];
  const threshold = param(effect, "threshold", 0.48);
  const imagePull = param(effect, "imagePull", 0.78);
  const reverseMass = param(effect, "reverseMass", 0) >= 0.5;
  const tileLogic = effect.tileField?.tileLogic ?? "image";
  const rulePressure = param(effect, "rulePressure", 0);
  const seed = recipe.seed + effect.where.seed + recipe.iteration * 104729;
  const sample = (x: number, y: number) => {
    const sx = Math.max(0, Math.min(input.width - 1, Math.round(x)));
    const sy = Math.max(0, Math.min(input.height - 1, Math.round(y)));
    const at = (sy * input.width + sx) * 4;
    return { r: source.data[at], g: source.data[at + 1], b: source.data[at + 2] };
  };
  const nearestPalette = (r: number, g: number, b: number) => {
    let nearest: number = petsciiPalette[0], distance = Number.POSITIVE_INFINITY;
    for (const packed of petsciiPalette) {
      const pr = (packed >> 16) & 255, pg = (packed >> 8) & 255, pb = packed & 255;
      const next = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (next < distance) { nearest = packed; distance = next; }
    }
    return nearest;
  };
  const mixedInk = (sampled: number) => {
    const red = Math.round(((foreground >> 16) & 255) * (1 - imagePull) + ((sampled >> 16) & 255) * imagePull);
    const green = Math.round(((foreground >> 8) & 255) * (1 - imagePull) + ((sampled >> 8) & 255) * imagePull);
    const blue = Math.round((foreground & 255) * (1 - imagePull) + (sampled & 255) * imagePull);
    return (red << 16) | (green << 8) | blue;
  };
  context.fillStyle = packedCss(background);
  context.fillRect(0, 0, input.width, input.height);
  const masks = new Array<number>(40 * 25).fill(0);
  const colors = new Array<number>(40 * 25).fill(foreground);
  for (let row = 0; row < 25; row += 1) {
    const y0 = Math.round(row * input.height / 25), y1 = Math.round((row + 1) * input.height / 25);
    const middleY = Math.round((y0 + y1) / 2);
    for (let column = 0; column < 40; column += 1) {
      const x0 = Math.round(column * input.width / 40), x1 = Math.round((column + 1) * input.width / 40);
      const middleX = Math.round((x0 + x1) / 2);
      const points = [
        sample((x0 + middleX) / 2, (y0 + middleY) / 2),
        sample((middleX + x1) / 2, (y0 + middleY) / 2),
        sample((x0 + middleX) / 2, (middleY + y1) / 2),
        sample((middleX + x1) / 2, (middleY + y1) / 2),
      ];
      const active = points.map(({ r, g, b }) => {
        const light = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        return reverseMass ? light >= threshold : light <= threshold;
      });
      const colorPoints = points.filter((_, index) => active[index]);
      const evidence = colorPoints.length ? colorPoints : points;
      const average = evidence.reduce((held, color) => ({ r: held.r + color.r, g: held.g + color.g, b: held.b + color.b }), { r: 0, g: 0, b: 0 });
      const quantized = nearestPalette(average.r / evidence.length, average.g / evidence.length, average.b / evidence.length);
      masks[row * 40 + column] = active.reduce((mask, visible, index) => visible ? mask | (1 << index) : mask, 0);
      colors[row * 40 + column] = mixedInk(quantized);
    }
  }
  if (tileLogic === "infection" && rulePressure > 0) {
    const original = [...masks];
    for (let row = 0; row < 25; row += 1) for (let column = 0; column < 40; column += 1) {
      const address = asciiHash(seed, column, row, 307);
      if (address >= rulePressure * 0.86) continue;
      const neighbors = [
        original[row * 40 + Math.max(0, column - 1)],
        original[Math.max(0, row - 1) * 40 + column],
        original[row * 40 + Math.min(39, column + 1)],
        original[Math.min(24, row + 1) * 40 + column],
      ];
      const neighbor = neighbors[Math.floor(asciiHash(seed, column, row, 311) * 4) % 4];
      const rotated = ((neighbor << 1) | (neighbor >> 3)) & 15;
      masks[row * 40 + column] = asciiHash(seed, column, row, 313) < 0.62
        ? original[row * 40 + column] | rotated
        : original[row * 40 + column] ^ rotated;
    }
  } else if (tileLogic === "gravity" && rulePressure > 0) {
    const subcells = new Array<boolean>(80 * 50).fill(false);
    masks.forEach((mask, index) => {
      const column = index % 40, row = Math.floor(index / 40);
      for (let bit = 0; bit < 4; bit += 1) if ((mask & (1 << bit)) !== 0) {
        subcells[(row * 2 + Math.floor(bit / 2)) * 80 + column * 2 + (bit % 2)] = true;
      }
    });
    const settled = new Array<boolean>(80 * 50).fill(false);
    for (let column = 0; column < 80; column += 1) {
      const occupied: number[] = [];
      for (let row = 0; row < 50; row += 1) if (subcells[row * 80 + column]) occupied.push(row);
      occupied.forEach((row, index) => {
        const destination = 50 - occupied.length + index;
        const moved = Math.max(0, Math.min(49, Math.round(row * (1 - rulePressure) + destination * rulePressure)));
        settled[moved * 80 + column] = true;
      });
    }
    masks.fill(0);
    for (let row = 0; row < 50; row += 1) for (let column = 0; column < 80; column += 1) if (settled[row * 80 + column]) {
      const tileRow = Math.floor(row / 2), tileColumn = Math.floor(column / 2);
      const bit = (row % 2) * 2 + (column % 2);
      masks[tileRow * 40 + tileColumn] |= 1 << bit;
    }
  }
  for (let row = 0; row < 25; row += 1) {
    const y0 = Math.round(row * input.height / 25), y1 = Math.round((row + 1) * input.height / 25);
    const middleY = Math.round((y0 + y1) / 2);
    for (let column = 0; column < 40; column += 1) {
      const x0 = Math.round(column * input.width / 40), x1 = Math.round((column + 1) * input.width / 40);
      const middleX = Math.round((x0 + x1) / 2);
      const mask = masks[row * 40 + column];
      context.fillStyle = packedCss(colors[row * 40 + column]);
      const regions = [
        [x0, y0, middleX - x0, middleY - y0],
        [middleX, y0, x1 - middleX, middleY - y0],
        [x0, middleY, middleX - x0, y1 - middleY],
        [middleX, middleY, x1 - middleX, y1 - middleY],
      ];
      regions.forEach((region, index) => { if ((mask & (1 << index)) !== 0) context.fillRect(...region as [number, number, number, number]); });
    }
  }
  return output;
}

function waveletHaarRegion(data: Float32Array, stride: number, x0: number, y0: number, width: number, height: number, inverse: boolean) {
  const temp = new Float32Array(Math.max(width, height));
  const line = (length: number, read: (index: number) => number, write: (index: number, value: number) => void) => {
    const half = length >> 1;
    if (!inverse) {
      for (let index = 0; index < half; index += 1) {
        const a = read(index * 2);
        const b = read(index * 2 + 1);
        temp[index] = (a + b) * 0.5;
        temp[half + index] = (a - b) * 0.5;
      }
    } else {
      for (let index = 0; index < half; index += 1) {
        const a = read(index);
        const d = read(half + index);
        temp[index * 2] = a + d;
        temp[index * 2 + 1] = a - d;
      }
    }
    for (let index = 0; index < length; index += 1) write(index, temp[index]);
  };
  if (!inverse) {
    for (let y = 0; y < height; y += 1) line(width, (x) => data[(y0 + y) * stride + x0 + x], (x, value) => { data[(y0 + y) * stride + x0 + x] = value; });
    for (let x = 0; x < width; x += 1) line(height, (y) => data[(y0 + y) * stride + x0 + x], (y, value) => { data[(y0 + y) * stride + x0 + x] = value; });
  } else {
    for (let x = 0; x < width; x += 1) line(height, (y) => data[(y0 + y) * stride + x0 + x], (y, value) => { data[(y0 + y) * stride + x0 + x] = value; });
    for (let y = 0; y < height; y += 1) line(width, (x) => data[(y0 + y) * stride + x0 + x], (x, value) => { data[(y0 + y) * stride + x0 + x] = value; });
  }
}

function waveletAnalyzeRect(data: Float32Array, stride: number, width: number, height: number, packet: boolean, inverse: boolean, maxLevels: number) {
  if (packet) {
    const halfWidth = width >> 1;
    const halfHeight = height >> 1;
    if (!inverse) {
      waveletHaarRegion(data, stride, 0, 0, width, height, false);
      if (halfWidth % 2 === 0 && halfHeight % 2 === 0) for (let y = 0; y < height; y += halfHeight) for (let x = 0; x < width; x += halfWidth) waveletHaarRegion(data, stride, x, y, halfWidth, halfHeight, false);
    } else {
      if (halfWidth % 2 === 0 && halfHeight % 2 === 0) for (let y = 0; y < height; y += halfHeight) for (let x = 0; x < width; x += halfWidth) waveletHaarRegion(data, stride, x, y, halfWidth, halfHeight, true);
      waveletHaarRegion(data, stride, 0, 0, width, height, true);
    }
    return;
  }
  const levels: Array<[number, number]> = [];
  let levelWidth = width;
  let levelHeight = height;
  while (levels.length < maxLevels && levelWidth >= 4 && levelHeight >= 4 && levelWidth % 2 === 0 && levelHeight % 2 === 0) {
    levels.push([levelWidth, levelHeight]);
    levelWidth >>= 1;
    levelHeight >>= 1;
  }
  if (!inverse) levels.forEach(([extentWidth, extentHeight]) => waveletHaarRegion(data, stride, 0, 0, extentWidth, extentHeight, false));
  else [...levels].reverse().forEach(([extentWidth, extentHeight]) => waveletHaarRegion(data, stride, 0, 0, extentWidth, extentHeight, true));
}

function waveletAnalyze(data: Float32Array, size: number, packet: boolean, inverse: boolean) {
  waveletAnalyzeRect(data, size, size, size, packet, inverse, 3);
}

function waveletTerritory(kind: number, x: number, y: number, drift: number) {
  const nx = (x + drift + 2) % 1;
  const ny = (y + drift * 0.63 + 2) % 1;
  const edge = Math.min(nx, ny, 1 - nx, 1 - ny);
  if (kind === 0) return (nx < 0.28 || nx > 0.72) && (ny < 0.28 || ny > 0.72);
  if (kind === 1) return edge < 0.2;
  if (kind === 2) return Math.abs(nx - 0.5) < 0.14 || Math.abs(ny - 0.5) < 0.14;
  if (kind === 3) return nx > 0.22 && nx < 0.78 && ny > 0.22 && ny < 0.78;
  return (nx > 0.5) !== (ny > 0.5);
}

function igniteWaveletChannel(values: Uint8ClampedArray, channel: number, amount: number) {
  if (amount <= 0) return;
  const histogram = new Uint32Array(256);
  for (let at = channel; at < values.length; at += 4) histogram[values[at]] += 1;
  const lookup = new Uint8Array(256);
  let sum = 0;
  const count = values.length / 4;
  for (let value = 0; value < 256; value += 1) { sum += histogram[value]; lookup[value] = Math.round(sum / count * 255); }
  for (let at = channel; at < values.length; at += 4) values[at] = Math.round(values[at] * (1 - amount) + lookup[values[at]] * amount);
}

function waveletCartography(input: HTMLCanvasElement, effect: EffectInstance, phase: number, animated: boolean) {
  const output = cloneSurface(input);
  const context = output.getContext("2d")!;
  const image = context.getImageData(0, 0, output.width, output.height);
  const source = new Uint8ClampedArray(image.data);
  const personality = Math.round(param(effect, "personality", 0));
  const packet = Math.round(param(effect, "transformBody", 0)) === 1;
  const character = Math.round(param(effect, "waveCharacter", 1));
  const transformScale = Math.round(param(effect, "transformScale", 2));
  const mapContinuity = Math.round(param(effect, "mapContinuity", 2));
  const hsb = Math.round(param(effect, "colorBody", 0)) === 1;
  const separate = Math.round(param(effect, "channelBond", 0)) === 1 || personality === 1;
  const territory = Math.round(param(effect, "territory", 0));
  const erasure = param(effect, "erasure", 0.24);
  const merge = param(effect, "coefficientMerge", 0.1);
  const ignition = param(effect, "colorIgnition", 0.08);
  const sourceGhost = param(effect, "sourceGhost", 0.3);
  const mapDrift = param(effect, "mapDrift", 0.25);
  const tileSize = [32, 64, 128][Math.max(0, Math.min(2, transformScale))];
  const stride = mapContinuity === 3 ? Math.max(16, Math.round(tileSize * 0.75)) : tileSize;
  const channels = [new Float32Array(output.width * output.height), new Float32Array(output.width * output.height), new Float32Array(output.width * output.height)];
  for (let pixel = 0; pixel < output.width * output.height; pixel += 1) {
    const at = pixel * 4;
    const triplet = hsb ? rgbToHsb255(source[at], source[at + 1], source[at + 2]) : [source[at], source[at + 1], source[at + 2]] as [number, number, number];
    for (let channel = 0; channel < 3; channel += 1) channels[channel][pixel] = triplet[channel];
  }
  if (mapContinuity === 2) for (let channel = 0; channel < 3; channel += 1) {
    const field = channels[channel];
    const activeWidth = output.width - output.width % 2;
    const activeHeight = output.height - output.height % 2;
    waveletAnalyzeRect(field, output.width, activeWidth, activeHeight, packet, false, 6);
    const channelDrift = separate ? channel * 0.173 : 0;
    const motion = personality === 2 && animated ? Math.sin(phase) * mapDrift * 0.42 : 0;
    for (let y = 0; y < activeHeight; y += 1) for (let x = 0; x < activeWidth; x += 1) {
      const index = y * output.width + x;
      if (!waveletTerritory(territory, x / activeWidth, y / activeHeight, motion + channelDrift)) continue;
      const held = field[index];
      const neighbor = field[y * output.width + ((x + activeWidth - 1) % activeWidth)];
      const vertical = field[((y + activeHeight - 1) % activeHeight) * output.width + x];
      if (character === 0) field[index] = held * (1 - erasure);
      else if (character === 1) field[index] = (held * (1 - merge) + (neighbor + vertical) * 0.5 * merge) * (1 - erasure * 0.7);
      else if (character === 2) field[index] = -held * (0.35 + erasure * 1.35);
      else if (character === 3) {
        const reach = 3 + Math.floor(merge * Math.max(activeWidth, activeHeight) * 0.04);
        field[index] = held * (1 - erasure) + field[y * output.width + ((x + activeWidth - reach) % activeWidth)] * merge * 1.8;
      } else if (character === 4) field[index] = held * (1 - erasure * 0.28) + Math.sign(held || 1) * Math.abs(neighbor + vertical) * 0.5 * merge * 1.55;
      else field[index] = held * (0.65 + 0.7 * Math.sin((x / activeWidth * 7.3 + y / activeHeight * 11.7 + channel * 0.7) * Math.PI)) * (1 - erasure * 0.35);
    }
    if (merge > 0) for (let y = 0; y < activeHeight - 1; y += 2) for (let x = 0; x < activeWidth - 1; x += 2) {
      const at = y * output.width + x;
      const combined = (field[at] + field[at + 1] + field[at + output.width] + field[at + output.width + 1]) * 0.25;
      field[at] += (combined - field[at]) * merge;
      field[at + 1] *= 1 - merge * 0.45;
      field[at + output.width] *= 1 - merge * 0.45;
    }
    waveletAnalyzeRect(field, output.width, activeWidth, activeHeight, packet, true, 6);
  } else for (let channel = 0; channel < 3; channel += 1) for (let top = 0; top < output.height; top += stride) for (let left = 0; left < output.width; left += stride) {
    const tile = new Float32Array(tileSize * tileSize);
    for (let y = 0; y < tileSize; y += 1) for (let x = 0; x < tileSize; x += 1) {
      const sx = Math.min(output.width - 1, left + x);
      const sy = Math.min(output.height - 1, top + y);
      tile[y * tileSize + x] = channels[channel][sy * output.width + sx];
    }
    waveletAnalyze(tile, tileSize, packet, false);
    const channelDrift = separate ? channel * 0.173 : 0;
    const motion = personality === 2 && animated ? Math.sin(phase) * mapDrift * 0.42 : 0;
    const tileHash = ((left * 73856093) ^ (top * 19349663) ^ (channel * 83492791)) >>> 0;
    const wanderX = (tileHash % 997) / 997;
    const wanderY = ((tileHash >>> 9) % 991) / 991;
    for (let y = 0; y < tileSize; y += 1) for (let x = 0; x < tileSize; x += 1) {
      const index = y * tileSize + x;
      const mapX = mapContinuity === 2 ? (left + x) / Math.max(1, output.width) : x / tileSize + (mapContinuity === 1 ? wanderX : 0);
      const mapY = mapContinuity === 2 ? (top + y) / Math.max(1, output.height) : y / tileSize + (mapContinuity === 1 ? wanderY : 0);
      if (!waveletTerritory(territory, mapX, mapY, motion + channelDrift)) continue;
      const held = tile[index];
      const neighbor = tile[y * tileSize + ((x + tileSize - 1) % tileSize)];
      const vertical = tile[((y + tileSize - 1) % tileSize) * tileSize + x];
      if (character === 0) tile[index] = held * (1 - erasure);
      else if (character === 1) tile[index] = (held * (1 - merge) + (neighbor + vertical) * 0.5 * merge) * (1 - erasure * 0.7);
      else if (character === 2) tile[index] = -held * (0.35 + erasure * 1.35);
      else if (character === 3) {
        const reach = 3 + Math.floor(merge * 13);
        tile[index] = held * (1 - erasure) + tile[y * tileSize + ((x + tileSize - reach) % tileSize)] * merge * 1.8;
      } else if (character === 4) tile[index] = held * (1 - erasure * 0.28) + Math.sign(held || 1) * Math.abs(neighbor + vertical) * 0.5 * merge * 1.55;
      else tile[index] = held * (0.35 + 1.3 * Math.sin((x * 0.73 + y * 1.17 + channel * 2.1) * Math.PI)) * (1 - erasure * 0.45);
    }
    if (merge > 0) for (let y = 0; y < tileSize - 1; y += 2) for (let x = 0; x < tileSize - 1; x += 2) {
      const at = y * tileSize + x;
      const combined = (tile[at] + tile[at + 1] + tile[at + tileSize] + tile[at + tileSize + 1]) * 0.25;
      tile[at] += (combined - tile[at]) * merge;
      tile[at + 1] *= 1 - merge * 0.72;
      tile[at + tileSize] *= 1 - merge * 0.72;
    }
    waveletAnalyze(tile, tileSize, packet, true);
    for (let y = 0; y < Math.min(tileSize, output.height - top); y += 1) for (let x = 0; x < Math.min(tileSize, output.width - left); x += 1) {
      const at = (top + y) * output.width + left + x;
      const feather = mapContinuity === 3 ? Math.sin(Math.PI * (x + 0.5) / tileSize) * Math.sin(Math.PI * (y + 0.5) / tileSize) : 1;
      channels[channel][at] += (tile[y * tileSize + x] - channels[channel][at]) * feather;
    }
  }
  for (let pixel = 0; pixel < output.width * output.height; pixel += 1) {
    const at = pixel * 4;
    const recovered = channels.map((values) => Math.max(0, Math.min(255, values[pixel]))) as [number, number, number];
    const rgb = hsb ? hsbToRgb255(...recovered) : recovered;
    image.data[at] = Math.round(rgb[0] * (1 - sourceGhost) + source[at] * sourceGhost);
    image.data[at + 1] = Math.round(rgb[1] * (1 - sourceGhost) + source[at + 1] * sourceGhost);
    image.data[at + 2] = Math.round(rgb[2] * (1 - sourceGhost) + source[at + 2] * sourceGhost);
    image.data[at + 3] = source[at + 3];
  }
  for (let channel = 0; channel < 3; channel += 1) igniteWaveletChannel(image.data, channel, ignition);
  context.putImageData(image, 0, 0);
  return output;
}

function lz77Hash(seed: number, phrase: number, channel: number, salt: number) {
  let value = (seed ^ Math.imul(phrase + 1, 0x9e3779b1) ^ Math.imul(channel + 3, 0x85ebca6b) ^ Math.imul(salt + 7, 0xc2b2ae35)) | 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function lz77Attention(source: Uint8ClampedArray, pixel: number, mode: number) {
  if (mode === 0) return 1;
  const at = Math.max(0, Math.min(source.length - 4, pixel * 4));
  const red = source[at] / 255;
  const green = source[at + 1] / 255;
  const blue = source[at + 2] / 255;
  if (mode === 1) return 0.12 + (red * 0.2126 + green * 0.7152 + blue * 0.0722) * 1.76;
  if (mode === 2) {
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    return 0.12 + (maximum === 0 ? 0 : (maximum - minimum) / maximum) * 1.76;
  }
  return 0.12 + red * 1.76;
}

function lz77Stream(bytes: Uint8Array, source: Uint8ClampedArray, pixelDivisor: number, seed: number, channel: number, reach: number, span: number, wound: number, attention: number, amount: number, severity: number, tide: number, phase: number, animated: boolean) {
  const output = new Uint8Array(bytes);
  const recent = new Int32Array(65536);
  recent.fill(-1);
  let sourceAt = 0;
  let outputAt = 0;
  let phrase = 0;
  while (sourceAt < bytes.length && outputAt < output.length) {
    const key = ((bytes[sourceAt] * 251 + (bytes[sourceAt + 1] ?? 0)) * 251 + (bytes[sourceAt + 2] ?? 0)) & 65535;
    const previous = recent[key];
    let distance = 0;
    let length = 0;
    if (previous >= 0) {
      const candidateDistance = sourceAt - previous;
      if (candidateDistance > 0 && candidateDistance <= reach) {
        const limit = Math.min(span, candidateDistance, bytes.length - sourceAt - 1);
        while (length < limit && bytes[previous + length] === bytes[sourceAt + length]) length += 1;
        if (length > 0) distance = candidateDistance;
      }
    }
    const literalAt = Math.min(bytes.length - 1, sourceAt + length);
    let woundedDistance = distance;
    let woundedLength = length;
    let literal = bytes[literalAt];
    const attentionWeight = lz77Attention(source, Math.floor(sourceAt / pixelDivisor), attention);
    if (lz77Hash(seed, phrase, channel, 0) < Math.min(1, amount * attentionWeight)) {
      const motion = animated ? Math.sin(phase + lz77Hash(seed, phrase, channel, 1) * Math.PI * 2) * tide : 0;
      const pressure = Math.max(0, Math.min(1.5, severity * (1 + motion * 0.82)));
      const selectedWound = wound === 4 ? 1 + Math.floor(lz77Hash(seed, phrase, channel, 2) * 3) : wound;
      const signed = lz77Hash(seed, phrase, channel, 3) * 2 - 1;
      if (selectedWound === 0) {
        if (outputAt > 0) woundedDistance = Math.max(1, Math.min(outputAt, Math.round((distance || 1) + signed * Math.max(1, reach * pressure * 0.045))));
        woundedLength = Math.max(0, Math.min(span, Math.round(length + (lz77Hash(seed, phrase, channel, 4) * 2 - 1) * Math.max(1, span * pressure * 0.08))));
      } else if (selectedWound === 1 && outputAt > 0) {
        const target = 1 + Math.floor(lz77Hash(seed, phrase, channel, 5) * Math.min(outputAt, reach));
        woundedDistance = Math.max(1, Math.min(outputAt, Math.round((distance || 1) * (1 - pressure) + target * pressure)));
        if (woundedLength === 0) woundedLength = 1 + Math.floor(pressure * Math.min(span, 12));
      } else if (selectedWound === 2) {
        const target = 1 + Math.floor(lz77Hash(seed, phrase, channel, 6) * span);
        woundedLength = Math.max(0, Math.min(span, Math.round(length * (1 - pressure) + target * pressure)));
        if (woundedLength > 0 && woundedDistance === 0 && outputAt > 0) woundedDistance = 1 + Math.floor(lz77Hash(seed, phrase, channel, 7) * Math.min(outputAt, reach));
      } else if (selectedWound === 3) {
        const mask = 1 + Math.floor(lz77Hash(seed, phrase, channel, 8) * 255 * Math.min(1, pressure));
        literal ^= mask;
      }
    }
    if (woundedLength > 0 && woundedDistance > 0) for (let copied = 0; copied < woundedLength && outputAt < output.length; copied += 1) {
      output[outputAt] = output[Math.max(0, outputAt - woundedDistance)];
      outputAt += 1;
    }
    if (outputAt < output.length) output[outputAt++] = literal;
    const nextSource = Math.min(bytes.length, literalAt + 1);
    for (let indexed = sourceAt; indexed < nextSource; indexed += 1) {
      const indexedKey = ((bytes[indexed] * 251 + (bytes[indexed + 1] ?? 0)) * 251 + (bytes[indexed + 2] ?? 0)) & 65535;
      recent[indexedKey] = indexed;
    }
    sourceAt = nextSource;
    phrase += 1;
  }
  return output;
}

function lz77Memory(input: HTMLCanvasElement, effect: EffectInstance, phase: number, animated: boolean) {
  const output = cloneSurface(input);
  const context = output.getContext("2d")!;
  const image = context.getImageData(0, 0, output.width, output.height);
  const source = new Uint8ClampedArray(image.data);
  const memoryBody = Math.round(param(effect, "memoryBody", 0));
  const hsb = Math.round(param(effect, "colorMemory", 1)) === 1;
  const weave = Math.max(0, Math.min(2, Math.round(param(effect, "byteWeave", 0))));
  const reach = [63, 255, 1023, 4095][Math.max(0, Math.min(3, Math.round(param(effect, "memoryReach", 2))))];
  const span = [7, 19, 63, 191][Math.max(0, Math.min(3, Math.round(param(effect, "phraseSpan", 2))))];
  const wound = Math.max(0, Math.min(4, Math.round(param(effect, "woundCharacter", 0))));
  const attention = Math.max(0, Math.min(3, Math.round(param(effect, "attention", 1))));
  const amount = Math.max(0, Math.min(1, param(effect, "damageAmount", 0.06)));
  const severity = Math.max(0, Math.min(1, param(effect, "damageSeverity", 0.34)));
  const divergence = Math.max(0, Math.min(1, param(effect, "channelDivergence", 0.28)));
  const ghost = Math.max(0, Math.min(1, param(effect, "sourceGhost", 0.3)));
  const tide = Math.max(0, Math.min(1, param(effect, "memoryTide", 0.24)));
  const seed = Math.round(effect.where?.seed ?? 0);
  const pixels = output.width * output.height;
  if (memoryBody === 0) {
    const channels = [new Uint8Array(pixels), new Uint8Array(pixels), new Uint8Array(pixels)];
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const at = pixel * 4;
      const values = hsb ? rgbToHsb255(source[at], source[at + 1], source[at + 2]) : [source[at], source[at + 1], source[at + 2]] as [number, number, number];
      for (let channel = 0; channel < 3; channel += 1) channels[channel][pixel] = Math.round(values[channel]);
    }
    const recovered = channels.map((channelBytes, channel) => lz77Stream(channelBytes, source, 1, seed + Math.round(channel * divergence * 104729), channel, reach, span, wound, attention, amount, severity, tide, phase, animated));
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const at = pixel * 4;
      const values = recovered.map((channel) => channel[pixel]) as [number, number, number];
      const rgb = hsb ? hsbToRgb255(...values) : values;
      for (let channel = 0; channel < 3; channel += 1) image.data[at + channel] = Math.round(rgb[channel] * (1 - ghost) + source[at + channel] * ghost);
      image.data[at + 3] = source[at + 3];
    }
  } else {
    const orders = [[3, 0, 1, 2], [0, 1, 2, 3], [2, 1, 0, 3]];
    const order = orders[weave];
    const bytes = new Uint8Array(pixels * 4);
    for (let pixel = 0; pixel < pixels; pixel += 1) for (let component = 0; component < 4; component += 1) bytes[pixel * 4 + component] = source[pixel * 4 + order[component]];
    const recovered = lz77Stream(bytes, source, 4, seed, 0, reach, span, wound, attention, amount, severity, tide, phase, animated);
    for (let pixel = 0; pixel < pixels; pixel += 1) for (let component = 0; component < 4; component += 1) {
      const target = pixel * 4 + order[component];
      image.data[target] = Math.round(recovered[pixel * 4 + component] * (1 - ghost) + source[target] * ghost);
    }
  }
  context.putImageData(image, 0, 0);
  return output;
}

function languageHash(seed: number, x: number, y: number, salt = 0) {
  let value = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 1274126177)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function languageNoise(seed: number, x: number, y: number, salt = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx0 = x - x0, ty0 = y - y0;
  const tx = tx0 * tx0 * (3 - 2 * tx0), ty = ty0 * ty0 * (3 - 2 * ty0);
  const top = languageHash(seed, x0, y0, salt) * (1 - tx) + languageHash(seed, x0 + 1, y0, salt) * tx;
  const bottom = languageHash(seed, x0, y0 + 1, salt) * (1 - tx) + languageHash(seed, x0 + 1, y0 + 1, salt) * tx;
  return top * (1 - ty) + bottom * ty;
}

function languageBody(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const field: LanguageBody = effect.languageBody ?? {
    kind: "language-body", phrases: ["Almost", "Human"], phraseA: "Almost", phraseB: "Human", flow: "organic", body: "figure",
    phraseLogic: "noise", composition: "field", inkMode: "chosen", inkColor: 0xf2eee7,
    groundColor: 0x050505, loopMode: "held",
  };
  const width = input.width, height = input.height;
  const output = field.composition === "inlay" ? cloneSurface(input) : document.createElement("canvas");
  if (field.composition !== "inlay") { output.width = width; output.height = height; }
  const context = output.getContext("2d")!;
  if (field.composition === "field") {
    context.fillStyle = packedCss(field.groundColor);
    context.fillRect(0, 0, width, height);
  }
  if (field.body === "knot") {
    const colors = field.inkMode === "palette" ? recipe.palette : [field.inkColor,field.inkColor,field.inkColor,field.groundColor];
    drawKnot(context,width,height,field.knot ?? knotDefaults,recipe.seed - recipe.iteration * 104729,phase,colors,field.phrases);
    return output;
  }
  const sourceContext = input.getContext("2d", { willReadFrequently: true })!;
  const source = sourceContext.getImageData(0, 0, width, height).data;
  const territory = field.body === "where" ? whereWeights(input, effect) : null;
  const seed = Math.round(recipe.seed + (effect.where?.seed ?? 1));
  const short = Math.max(1, Math.min(width, height));
  const density = Math.max(.4, Math.min(2, param(effect, "languageDensity", 1)));
  const baseSize = Math.max(5, param(effect, "typeScale", 18) * short / 800);
  const sizeBreath = Math.max(0, Math.min(1, param(effect, "sizeBreath", .45)));
  const bodyGate = Math.max(0, Math.min(1, param(effect, "bodyGate", .5)));
  const motion = Math.max(0, Math.min(1, param(effect, "motion", .35)));
  let centerX = Math.max(0, Math.min(1, param(effect, "flowCenterX", .5))) * width;
  let centerY = Math.max(0, Math.min(1, param(effect, "flowCenterY", .45))) * height;
  let angleOffset = 0, pulse = 1, collapse = 0;
  if (field.loopMode === "orbit") {
    angleOffset = phase * motion;
    centerX += Math.cos(phase) * short * .055 * motion;
    centerY += Math.sin(phase) * short * .055 * motion;
  } else if (field.loopMode === "breathe") {
    pulse = 1 + Math.sin(phase) * .28 * motion;
  } else if (field.loopMode === "collapse") {
    collapse = (.5 + .5 * Math.cos(phase)) * motion;
  }
  const phrases = (field.phrases?.length ? field.phrases : [field.phraseA, field.phraseB]).map((phrase) => phrase.trim()).filter(Boolean);
  if (!phrases.length) phrases.push("Almost");
  const pixelAt = (x: number, y: number) => {
    const px = Math.max(0, Math.min(width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(height - 1, Math.round(y)));
    const at = (py * width + px) * 4;
    return { r: source[at], g: source[at + 1], b: source[at + 2], light: (source[at] * .2126 + source[at + 1] * .7152 + source[at + 2] * .0722) / 255, index: py * width + px };
  };
  const segmentDistance = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay;
    const amount = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(0.000001, dx * dx + dy * dy)));
    return Math.hypot(x - (ax + dx * amount), y - (ay + dy * amount));
  };
  const infantryShape = (x: number, y: number) => {
    const head = (x * x) / (.075 * .075) + ((y + .265) * (y + .265)) / (.09 * .09) <= 1;
    const helmet = y >= -.34 && y <= -.29 && Math.abs(x) <= .095;
    const torso = y >= -.18 && y <= .16 && Math.abs(x) <= .105 - Math.max(0, y) * .12;
    const leftLeg = segmentDistance(x, y, -.045, .13, -.105, .42) <= .042;
    const rightLeg = segmentDistance(x, y, .045, .13, .12, .42) <= .042;
    const arm = segmentDistance(x, y, -.08, -.08, .125, .12) <= .035;
    const rifle = segmentDistance(x, y, .02, -.12, .255, .21) <= .018;
    return head || helmet || torso || leftLeg || rightLeg || arm || rifle;
  };
  const doveShape = (x: number, y: number) => {
    const body = (x * x) / (.11 * .11) + ((y - .04) * (y - .04)) / (.2 * .2) <= 1;
    const head = (x * x) / (.075 * .075) + ((y + .145) * (y + .145)) / (.075 * .075) <= 1;
    const leftWing = segmentDistance(x, y, -.03, -.06, -.38, -.27) <= .055 + Math.max(0, -.18 - x) * .11;
    const rightWing = segmentDistance(x, y, .03, -.06, .38, -.27) <= .055 + Math.max(0, x - .18) * .11;
    const leftTail = segmentDistance(x, y, -.025, .18, -.14, .39) <= .045;
    const centerTail = segmentDistance(x, y, 0, .18, 0, .42) <= .045;
    const rightTail = segmentDistance(x, y, .025, .18, .14, .39) <= .045;
    return body || head || leftWing || rightWing || leftTail || centerTail || rightTail;
  };
  const accepts = (x: number, y: number) => {
    const pixel = pixelAt(x, y);
    if (field.body === "image") return effect.where.invert ? pixel.light < bodyGate : pixel.light >= bodyGate;
    if (field.body === "where") return (territory?.[pixel.index] ?? 0) >= bodyGate;
    const sx = (x - centerX) / short, sy = (y - centerY) / short;
    if (field.body === "infantry-dove") {
      const infantry = infantryShape(sx, sy), dove = doveShape(sx, sy);
      if (field.loopMode !== "metamorphose" || infantry === dove) return field.loopMode === "metamorphose" ? infantry || dove : infantry;
      const metamorphosis = .5 - .5 * Math.cos(phase);
      const address = languageHash(seed, Math.floor((sx + .5) * 997), Math.floor((sy + .5) * 991), 89);
      return dove ? address < metamorphosis : address >= metamorphosis;
    }
    const head = (sx * sx) / (.14 * .14) + (sy * sy) / (.18 * .18) <= 1;
    const neck = Math.abs(sx) <= .1 && sy >= .15 && sy <= .3;
    const shoulderWidth = sy >= .3 && sy <= .4 ? .1 + ((sy - .3) / .1) * .15 : 0;
    return head || neck || (shoulderWidth > 0 && Math.abs(sx) <= shoulderWidth);
  };
  const choosePhrase = (x: number, y: number, slot: number) => {
    if (field.phraseLogic === "alternate") return phrases[Math.abs(slot) % phrases.length];
    if (field.phraseLogic === "near-far") {
      const distance = Math.min(1, Math.hypot(x - centerX, y - centerY) / (short * .42));
      return phrases[Math.min(phrases.length - 1, Math.floor(distance * phrases.length))];
    }
    if (field.phraseLogic === "image") return phrases[Math.min(phrases.length - 1, Math.floor((1 - pixelAt(x, y).light) * phrases.length))];
    const voice = languageNoise(seed, x / Math.max(1, baseSize * 3), y / Math.max(1, baseSize * 3), 41);
    return phrases[Math.min(phrases.length - 1, Math.floor(voice * phrases.length))];
  };
  const ink = (x: number, y: number, slot: number) => {
    if (field.inkMode === "source") {
      const pixel = pixelAt(x, y);
      return `rgb(${pixel.r},${pixel.g},${pixel.b})`;
    }
    if (field.inkMode === "palette") return packedCss(recipe.palette[Math.abs(slot) % recipe.palette.length]);
    return packedCss(field.inkColor);
  };
  const draw = (text: string, x: number, y: number, size: number, rotation: number, slot: number, align: CanvasTextAlign = "center") => {
    if (!accepts(x, y)) return;
    const drawX = x + (centerX - x) * collapse;
    const drawY = y + (centerY - y) * collapse;
    context.save();
    context.translate(drawX, drawY);
    context.rotate(rotation);
    context.font = `700 ${Math.max(3, size * pulse)}px Arial, sans-serif`;
    context.textAlign = align;
    context.textBaseline = align === "left" ? "top" : "middle";
    context.fillStyle = ink(x, y, slot);
    context.fillText(text, 0, 0);
    context.restore();
  };
  context.imageSmoothingEnabled = true;
  if (field.flow === "organic") {
    const rowStep = Math.max(4, baseSize * 1.05 / density);
    let slot = 0;
    for (let y = 0; y < height + rowStep; y += rowStep) {
      let x = 0;
      while (x < width + baseSize * 4) {
        const text = choosePhrase(x, y, slot);
        const noise = languageNoise(seed, x / short * 8, y / short * 8, 7);
        const size = baseSize * (.72 + noise * sizeBreath * 1.35);
        context.font = `700 ${Math.max(3, size * pulse)}px Arial, sans-serif`;
        draw(text, x, y, size, (noise - .5) * .22 + angleOffset * .12, slot, "left");
        x += Math.max(baseSize * .7, (context.measureText(text).width + size * .3) / density);
        slot += 1;
      }
    }
  } else if (field.flow === "rings") {
    let slot = 0;
    const radiusStep = Math.max(5, baseSize * 1.15 / density);
    const maximum = Math.hypot(width, height) * .72;
    for (let radius = radiusStep; radius <= maximum; radius += radiusStep) {
      const size = baseSize * (.72 + (1 - Math.min(1, radius / maximum)) * sizeBreath * .75);
      context.font = `700 ${Math.max(3, size * pulse)}px Arial, sans-serif`;
      const measure = Math.max(size, ...phrases.map((phrase) => context.measureText(phrase).width));
      const count = Math.max(5, Math.round(Math.PI * 2 * radius / Math.max(size, measure * .85) * density));
      for (let index = 0; index < count; index += 1) {
        const angle = index / count * Math.PI * 2 + angleOffset;
        const x = centerX + Math.cos(angle) * radius, y = centerY + Math.sin(angle) * radius;
        draw(choosePhrase(x, y, slot), x, y, size, angle + Math.PI / 2, slot++);
      }
    }
  } else if (field.flow === "rays") {
    let slot = 0;
    const count = Math.max(8, Math.round(36 * density));
    const step = Math.max(5, baseSize * 1.25 / density);
    const maximum = Math.hypot(width, height) * .72;
    for (let ray = 0; ray < count; ray += 1) {
      const angle = ray / count * Math.PI * 2 + angleOffset;
      for (let distance = step; distance <= maximum; distance += step) {
        const x = centerX + Math.cos(angle) * distance, y = centerY + Math.sin(angle) * distance;
        const noise = languageNoise(seed, ray * .19, distance / short * 7, 19);
        const size = baseSize * (.7 + noise * sizeBreath);
        draw(choosePhrase(x, y, slot), x, y, size, angle + Math.PI / 2, slot++);
      }
    }
  } else {
    let slot = 0;
    const step = Math.max(5, baseSize * 1.35 / density);
    for (let y = step / 2; y < height; y += step) for (let x = step / 2; x < width; x += step) {
      const noise = languageNoise(seed, x / short * 9, y / short * 9, 29);
      const size = baseSize * (.65 + noise * sizeBreath * 1.1);
      draw(choosePhrase(x, y, slot), x, y, size, (noise - .5) * Math.PI / 2 + angleOffset, slot++);
    }
  }
  return output;
}

function paletteCycle(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number) {
  const out=newSurface(input.width,input.height),ctx=out.getContext("2d")!;
  const image=input.getContext("2d")!.getImageData(0,0,input.width,input.height);
  const result=applyPaletteCycle(image.data,input.width,input.height,effect.parameters,recipe.palette,effect.parameters.__cyclePhase ?? phase);
  image.data.set(result.data);ctx.putImageData(image,0,0);publishCyclePalette(effect.id,result.palette);return out;
}

function transformEffect(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number, animated = false, sourceTarget = input, heldTargets?: Map<string, HeldTargetField>, heldPrefix = "") {
  if (!effect.enabled) return input;
  if (isAudioBendingType(effect.type)) return audioBending(input, effect, animated ? phase : 0);
  switch (effect.type) {
    case "band-rupture": return bandRupture(input, effect, recipe, phase);
    case "wrong-sort": return wrongSort(input, effect, recipe);
    case "median-filter": return medianFilter(input, effect);
    case "sorting-motion": return sortingMotion(input, effect, recipe, phase);
    case "ultimate-sort": return ultimateSort(input, effect, recipe, phase, sourceTarget, heldTargets, heldPrefix);
    case "wizprocess": return wizprocess(input, effect, animated ? phase : 0);
    case "wavelet-cartography": return waveletCartography(input, effect, phase, animated);
    case "lz77-memory": return lz77Memory(input, effect, phase, animated);
    case "pixel-drift": return pixelDrift(input, effect);
    case "signal-echo": return signalEcho(input, effect, recipe, phase);
    case "dither-field": return ditherField(input, effect, recipe);
    case "parliament-of-pixels": return parliamentOfPixels(input, effect, recipe);
    case "tectonic-lens": return tectonicLens(input, effect, recipe, phase);
    case "lens-warp": return lensWarp(input, effect, phase);
    case "mirror-cut": return mirrorCut(input, effect);
    case "surface-motion": return renderSurfaceMotion(input,effect.parameters,effect.characterField?.glyphs??Array.from(".:/|+"),effect.parameters.__cyclePhase??phase,effect.where.seed);
    case "palette-cycle": return paletteCycle(input, effect, recipe, phase);
    case "motion-leak": return motionLeak(input, effect, recipe, phase);
    case "signal-relief": return signalRelief(input, effect, recipe, phase);
    case "almost-alive": return almostAlive(input, effect, recipe, phase);
    case "resolution-quilt": return resolutionQuilt(input, effect, recipe);
    case "shard-field": return shardField(input, effect, recipe);
    case "cut-repeat": return cutRepeat(input, effect, recipe);
    case "language-body": return languageBody(input, effect, recipe, phase);
    case "ascii-field": return asciiField(input, effect, recipe, phase);
    case "zhuyin-weave": return zhuyinWeave(input, effect, recipe, phase);
    case "petscii-study": return petsciiStudy(input, effect, recipe);
  }
  return input;
}

const smoothstep = (low: number, high: number, value: number) => {
  if (high <= low) return value >= high ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

function hueAndSaturation(r: number, g: number, b: number) {
  const red = r / 255, green = g / 255, blue = b / 255;
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }
  return { hue, saturation: maximum === 0 ? 0 : delta / maximum };
}

function colorKinWeight(pixels: Uint8ClampedArray, offset: number, effect: EffectInstance) {
  const where = effect.where;
  const red = pixels[offset] / 255, green = pixels[offset + 1] / 255, blue = pixels[offset + 2] / 255;
  const sampleRed = ((where.sampleColor >> 16) & 255) / 255;
  const sampleGreen = ((where.sampleColor >> 8) & 255) / 255;
  const sampleBlue = (where.sampleColor & 255) / 255;
  const mean = (red + green + blue) / 3, sampleMean = (sampleRed + sampleGreen + sampleBlue) / 3;
  const chromaDistance = Math.hypot(
    (red - mean) - (sampleRed - sampleMean),
    (green - mean) - (sampleGreen - sampleMean),
    (blue - mean) - (sampleBlue - sampleMean),
  ) / Math.SQRT2;
  const light = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const sampleLight = sampleRed * 0.2126 + sampleGreen * 0.7152 + sampleBlue * 0.0722;
  const distance = Math.hypot(chromaDistance, Math.abs(light - sampleLight) * where.shadeLoyalty);
  const feather = Math.max(0.002, where.softness * 0.45);
  return 1 - smoothstep(where.colorReach, Math.min(1.5, where.colorReach + feather), distance);
}

function distanceTo(mask: Uint8Array, width: number, height: number, target: number) {
  const distances = new Int32Array(mask.length);
  distances.fill(0x3fffffff);
  const queue = new Int32Array(mask.length);
  let head = 0, tail = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === target) { distances[index] = 0; queue[tail++] = index; }
  }
  while (head < tail) {
    const index = queue[head++], nextDistance = distances[index] + 1;
    const x = index % width, y = Math.floor(index / width);
    const visit = (neighbor: number) => {
      if (nextDistance >= distances[neighbor]) return;
      distances[neighbor] = nextDistance;
      queue[tail++] = neighbor;
    };
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  return { distances, hasTarget: tail > 0 };
}

function softenedBody(mask: Uint8Array, width: number, height: number, effect: EffectInstance) {
  const inside = distanceTo(mask, width, height, 1), outside = distanceTo(mask, width, height, 0);
  const weights = new Float32Array(mask.length);
  if (!inside.hasTarget) return weights;
  if (!outside.hasTarget) { weights.fill(1); return weights; }
  const shortEdge = Math.min(width, height);
  const expansion = effect.where.bodyExpansion * shortEdge;
  const feather = Math.max(0.5, effect.where.softness * shortEdge * 0.08);
  for (let index = 0; index < weights.length; index += 1) {
    const signedDistance = mask[index] ? outside.distances[index] : -inside.distances[index];
    weights[index] = smoothstep(-feather, feather, signedDistance + expansion);
  }
  return weights;
}

function foundBodyWeights(pixels: Uint8ClampedArray, luminance: Float32Array, width: number, height: number, effect: EffectInstance) {
  const where = effect.where;
  const length = width * height;
  const kin = new Float32Array(length), candidate = new Uint8Array(length), edge = new Float32Array(length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    kin[index] = colorKinWeight(pixels, index * 4, effect);
    candidate[index] = kin[index] >= 0.5 ? 1 : 0;
    const left = luminance[y * width + Math.max(0, x - 1)], right = luminance[y * width + Math.min(width - 1, x + 1)];
    const above = luminance[Math.max(0, y - 1) * width + x], below = luminance[Math.min(height - 1, y + 1) * width + x];
    edge[index] = Math.min(1, Math.hypot(right - left, below - above) * 2.4);
  }
  const seedX = Math.max(0, Math.min(width - 1, Math.round(where.sampleX * (width - 1))));
  const seedY = Math.max(0, Math.min(height - 1, Math.round(where.sampleY * (height - 1))));
  const seedIndex = seedY * width + seedX;
  candidate[seedIndex] = 1;
  const edgeLimit = 1.01 - where.edgeLoyalty * 0.9;
  type Body = { pixels: number[]; area: number; aspect: number; fill: number; roughness: number };
  const labels = new Int32Array(length); labels.fill(-1);
  const bodies: Body[] = [];
  let seedBody = -1;
  for (let start = 0; start < length; start += 1) {
    if (!candidate[start] || labels[start] >= 0) continue;
    const id = bodies.length, queue: number[] = [start], bodyPixels: number[] = [];
    labels[start] = id;
    let head = 0, minX = width, minY = height, maxX = 0, maxY = 0, perimeter = 0;
    while (head < queue.length) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width);
      bodyPixels.push(index); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (index === seedIndex) seedBody = id;
      const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || !candidate[neighbor]) { perimeter += 1; continue; }
        if (labels[neighbor] >= 0 || Math.max(edge[index], edge[neighbor]) > edgeLimit) continue;
        labels[neighbor] = id; queue.push(neighbor);
      }
    }
    const boxWidth = maxX - minX + 1, boxHeight = maxY - minY + 1, area = bodyPixels.length;
    bodies.push({ pixels: bodyPixels, area, aspect: boxWidth / boxHeight, fill: area / (boxWidth * boxHeight), roughness: perimeter / Math.max(1, Math.sqrt(area)) });
  }
  const mask = new Uint8Array(length);
  const reference = bodies[Math.max(0, seedBody)];
  if (!reference) { mask[seedIndex] = 1; return softenedBody(mask, width, height, effect); }
  const tolerance = 0.08 + (1 - where.recognition) * 1.65;
  for (let id = 0; id < bodies.length; id += 1) {
    const body = bodies[id];
    let include = id === seedBody || where.mode === "found-body" && id === seedBody;
    if (where.mode === "shape-relatives" && id !== seedBody) {
      const areaDifference = Math.abs(Math.log((body.area + 1) / (reference.area + 1)));
      const aspectDifference = Math.abs(Math.log(Math.max(0.001, body.aspect) / Math.max(0.001, reference.aspect)));
      const fillDifference = Math.abs(body.fill - reference.fill) * 2;
      const roughnessDifference = Math.abs(body.roughness - reference.roughness) / Math.max(1, reference.roughness);
      include = areaDifference * 0.42 + aspectDifference * 0.26 + fillDifference * 0.2 + roughnessDifference * 0.12 <= tolerance;
    }
    if (include) for (const index of body.pixels) mask[index] = 1;
  }
  return softenedBody(mask, width, height, effect);
}

function whereWeights(input: HTMLCanvasElement, effect: EffectInstance) {
  const context = input.getContext("2d", { willReadFrequently: true })!;
  const image = context.getImageData(0, 0, input.width, input.height);
  const pixels = image.data;
  const weights = new Float32Array(input.width * input.height);
  const where = effect.where;
  const luminance = new Float32Array(weights.length);
  for (let index = 0; index < weights.length; index += 1) {
    const offset = index * 4;
    luminance[index] = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
  }
  const feather = Math.max(0.001, where.softness);
  const blockValue = (column: number, row: number) => {
    let hash = (where.seed ^ Math.imul(column, 374761393) ^ Math.imul(row, 668265263)) | 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
  };
  if (where.mode === "found-body" || where.mode === "shape-relatives") {
    const bodyWeights = foundBodyWeights(pixels, luminance, input.width, input.height, effect);
    if (where.invert) for (let index = 0; index < bodyWeights.length; index += 1) bodyWeights[index] = 1 - bodyWeights[index];
    return bodyWeights;
  }
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const index = y * input.width + x;
      const offset = index * 4;
      const light = luminance[index];
      let weight = 1;
      if (where.mode === "light") weight = smoothstep(where.threshold - feather, where.threshold + feather, light);
      else if (where.mode === "dark") weight = 1 - smoothstep(where.threshold - feather, where.threshold + feather, light);
      else if (where.mode === "edges") {
        const left = luminance[y * input.width + Math.max(0, x - 1)];
        const right = luminance[y * input.width + Math.min(input.width - 1, x + 1)];
        const above = luminance[Math.max(0, y - 1) * input.width + x];
        const below = luminance[Math.min(input.height - 1, y + 1) * input.width + x];
        const edge = Math.min(1, Math.hypot(right - left, below - above) * 2.4);
        weight = smoothstep(where.threshold - feather, where.threshold + feather, edge);
      } else if (where.mode === "saturated" || where.mode === "muted" || where.mode === "hue") {
        const signal = hueAndSaturation(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        if (where.mode === "saturated") weight = smoothstep(where.threshold - feather, where.threshold + feather, signal.saturation);
        else if (where.mode === "muted") weight = 1 - smoothstep(where.threshold - feather, where.threshold + feather, signal.saturation);
        else {
          const distance = Math.abs(((signal.hue - where.hue + 540) % 360) - 180);
          weight = 1 - smoothstep(where.hueWidth, Math.min(180, where.hueWidth + feather * 180), distance);
          weight *= smoothstep(0.01, 0.08, signal.saturation);
        }
      } else if (where.mode === "color-kin") {
        weight = colorKinWeight(pixels, offset, effect);
      } else if (where.mode === "checker") {
        weight = (Math.floor(x / where.scale) + Math.floor(y / where.scale)) % 2 === 0 ? 1 : 0;
      } else if (where.mode === "stripes") {
        weight = Math.floor(x / where.scale) % 2 === 0 ? 1 : 0;
      } else if (where.mode === "blocks") {
        weight = blockValue(Math.floor(x / where.scale), Math.floor(y / where.scale)) >= where.threshold ? 1 : 0;
      } else if (where.mode === "random") {
        weight = blockValue(Math.floor(x / where.scale), Math.floor(y / where.scale)) >= 0.5 ? 1 : 0;
      }
      weights[index] = where.invert ? 1 - weight : weight;
    }
  }
  return weights;
}

function targetSignature(effect: EffectInstance, target: HTMLCanvasElement, heldPrefix: string) {
  const where = effect.where;
  return [heldPrefix, target.width, target.height, where.mode, where.sampleColor, where.sampleX, where.sampleY,
    where.colorReach, where.shadeLoyalty, where.edgeLoyalty, where.bodyExpansion, where.recognition,
    where.softness, where.invert].join("|");
}

function resolvedWhereWeights(target: HTMLCanvasElement, effect: EffectInstance, heldTargets?: Map<string, HeldTargetField>, heldPrefix = "") {
  if (effect.where.targetMemory !== "held" || !heldTargets) return whereWeights(target, effect);
  const signature = targetSignature(effect, target, heldPrefix);
  const held = heldTargets.get(effect.id);
  if (held?.signature === signature) return held.weights;
  const weights = whereWeights(target, effect);
  heldTargets.set(effect.id, { signature, weights });
  return weights;
}

function blendEffect(input: HTMLCanvasElement, transformed: HTMLCanvasElement, effect: EffectInstance, target = input, heldTargets?: Map<string, HeldTargetField>, heldPrefix = "") {
  if (effect.type === "language-body" || effect.type === "ascii-field" || effect.type === "zhuyin-weave" || effect.type === "petscii-study") return transformed;
  if (effect.where.mode === "whole" && !effect.where.invert) return transformed;
  const output = cloneSurface(input);
  const inputData = input.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, input.width, input.height);
  const transformedData = transformed.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, input.width, input.height);
  const outputContext = output.getContext("2d")!;
  const result = outputContext.createImageData(input.width, input.height);
  const weights = resolvedWhereWeights(target, effect, heldTargets, heldPrefix);
  for (let index = 0; index < weights.length; index += 1) {
    const amount = weights[index];
    const offset = index * 4;
    for (let channel = 0; channel < 4; channel += 1) result.data[offset + channel] = Math.round(inputData.data[offset + channel] * (1 - amount) + transformedData.data[offset + channel] * amount);
  }
  outputContext.putImageData(result, 0, 0);
  return output;
}

function releaseSurface(surface: HTMLCanvasElement) {
  // Canvas backing stores live outside the JavaScript heap. Releasing them
  // explicitly keeps animated previews from slowly exhausting WebView2.
  surface.width = 0;
  surface.height = 0;
}

function applyEffect(input: HTMLCanvasElement, effect: EffectInstance, recipe: StudioRecipe, phase: number, animated = false, target = input, heldTargets?: Map<string, HeldTargetField>, heldPrefix = "", sourceTarget = target) {
  if (!effect.enabled) return input;
  const transformed = transformEffect(input, effect, recipe, phase, animated, sourceTarget, heldTargets, heldPrefix);
  const output = blendEffect(input, transformed, effect, target, heldTargets, heldPrefix);
  if (transformed !== input && transformed !== output) releaseSurface(transformed);
  return output;
}

function targetSurface(input: HTMLCanvasElement, effect: EffectInstance, target = input, heldTargets?: Map<string, HeldTargetField>, heldPrefix = "") {
  const output = document.createElement("canvas");
  output.width = input.width; output.height = input.height;
  const context = output.getContext("2d")!;
  const image = context.createImageData(output.width, output.height);
  const weights = resolvedWhereWeights(target, effect, heldTargets, heldPrefix);
  for (let index = 0; index < weights.length; index += 1) {
    const value = Math.round(weights[index] * 255);
    const offset = index * 4;
    image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value; image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return output;
}

export const LivePreview = forwardRef<LivePreviewHandle, LivePreviewProps>(function LivePreview({ recipe, sourceDataUrl, layerDataUrls = {}, showOriginal = false, targetPreviewEffectId, pickTargetEffectId, pickTargetRecipeId, onTargetPick, animate = false, figureDragTarget, onFigureMove }, ref) {
  const positionRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const layerRefs = useRef<Record<string, HTMLImageElement>>({});
  const heldTargets = useRef(new Map<string, HeldTargetField>());
  const [sourceRevision, setSourceRevision] = useState(0);

  useEffect(() => {
    void document.fonts.load(`600 32px "${ASCII_FONT_FAMILY}"`).then(() => setSourceRevision((current) => current + 1));
  }, []);

  useEffect(() => {
    sourceRef.current = null;
    if (!sourceDataUrl) return;
    const image = new Image();
    image.src = sourceDataUrl;
    image.onload = () => { sourceRef.current = image; setSourceRevision((current) => current + 1); };
  }, [sourceDataUrl]);

  useEffect(() => {
    layerRefs.current = {};
    for (const [id, dataUrl] of Object.entries(layerDataUrls)) {
      const image = new Image();
      image.src = dataUrl;
      image.onload = () => { layerRefs.current[id] = image; setSourceRevision((current) => current + 1); };
    }
  }, [layerDataUrls]);

  useImperativeHandle(ref, () => ({
    position: () => positionRef.current,
    capture: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
    },
    captureAsciiText: () => latestAsciiTextCapture ? { ...latestAsciiTextCapture } : null,
  }), []);

  const figureDrag = useRef<{x:number;y:number;px:number;py:number;target:string}|null>(null);
  const moveFigure = (event:ReactPointerEvent<HTMLCanvasElement>) => {
    const start=figureDrag.current;if(!start||!onFigureMove)return;
    const canvas=event.currentTarget,box=canvas.getBoundingClientRect(),fit=Math.min(box.width/canvas.width,box.height/canvas.height),shownWidth=canvas.width*fit,shownHeight=canvas.height*fit,min=start.target==="contour"||(start.target.startsWith("formMix")||start.target==="formPart")?-.5:0,max=(start.target.startsWith("formMix")||start.target==="formPart")?1.5:start.target==="contour"?.5:1;
    onFigureMove(start.target,Math.max(min,Math.min(max,start.px+(event.clientX-start.x)/shownWidth)),Math.max(min,Math.min(max,start.py+(event.clientY-start.y)/shownHeight)));
  };
  const pickFromCanvas = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if(figureDragTarget && onFigureMove && recipe.baseMode==="kone" && (Boolean(recipe.formStack)|| (recipe.koneForm.parameters.formMix??0)>=.5||(recipe.koneForm.parameters.figureActive??0)>=.5||(recipe.koneForm.parameters.structureMode??0)>0) && !showOriginal && !pickTargetEffectId){
      const canvas=event.currentTarget,box=canvas.getBoundingClientRect(),fit=Math.min(box.width/canvas.width,box.height/canvas.height),left=box.left+(box.width-canvas.width*fit)/2,top=box.top+(box.height-canvas.height*fit)/2;
      if(event.clientX<left||event.clientX>left+canvas.width*fit||event.clientY<top||event.clientY>top+canvas.height*fit)return;
      if(figureDragTarget==='groupPick') {const id=groupPick(canvas.width,canvas.height,recipe.koneForm.parameters,recipe.koneForm.seed,(event.clientX-left)/(canvas.width*fit),(event.clientY-top)/(canvas.height*fit),positionRef.current*Math.PI*2);onFigureMove('groupPick',id,0);return;}
      const p={...figureDefaults,...recipe.koneForm.parameters};figureDrag.current={x:event.clientX,y:event.clientY,px:p[figureDragTarget+"X"]??.5,py:p[figureDragTarget+"Y"]??.5,target:figureDragTarget};event.currentTarget.setPointerCapture(event.pointerId);return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !pickTargetEffectId || !onTargetPick) return;
    const rect = canvas.getBoundingClientRect();
    const canvasAspect = canvas.width / Math.max(1, canvas.height), rectAspect = rect.width / Math.max(1, rect.height);
    const shownWidth = rectAspect > canvasAspect ? rect.height * canvasAspect : rect.width;
    const shownHeight = rectAspect > canvasAspect ? rect.height : rect.width / canvasAspect;
    const left = rect.left + (rect.width - shownWidth) / 2, top = rect.top + (rect.height - shownHeight) / 2;
    const x = (event.clientX - left) / shownWidth, y = (event.clientY - top) / shownHeight;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const pixelX = Math.max(0, Math.min(canvas.width - 1, Math.round(x * (canvas.width - 1))));
    const pixelY = Math.max(0, Math.min(canvas.height - 1, Math.round(y * (canvas.height - 1))));
    const pixel = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(pixelX, pixelY, 1, 1).data;
    onTargetPick({ color: (pixel[0] << 16) | (pixel[1] << 8) | pixel[2], x, y });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !context) return;
    const controller = new AbortController();
    const paint = async (animatedPhase?: number) => {
      latestAsciiTextCapture = null;
      const temporal = Boolean(animate || recipe.scorePosition !== undefined || recipe.timeScore?.length);
      const aspect = Math.max(1 / 12, Math.min(12, recipe.renderWidth / Math.max(1, recipe.renderHeight)));
      const normalDimension = recipe.effects.some((effect) => effect.enabled && (["wrong-sort", "sorting-motion", "ultimate-sort", "wizprocess", "wavelet-cartography", "lz77-memory", "pixel-drift", "tectonic-lens", "lens-warp", "dither-field", "parliament-of-pixels"].includes(effect.type) || isAudioBendingType(effect.type))) ? 560 : 760;
      const maxDimension = temporal ? Math.min(420, normalDimension) : normalDimension;
      const width = aspect >= 1 ? maxDimension : Math.round(maxDimension * aspect);
      const height = aspect >= 1 ? Math.round(maxDimension / aspect) : maxDimension;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const loopPhase = animatedPhase ?? (recipe.scorePosition ?? (recipe.iteration % recipe.loopFrames) / recipe.loopFrames) * Math.PI * 2;
      const repeats=paletteLoopRepeats(recipe),cyclePhase=loopPhase*repeats;
      const phase=repeats===1?loopPhase:animatedPhase!==undefined?(Math.round(loopPhase/(Math.PI*2)*paletteLoopFrames(recipe))%recipe.loopFrames)/recipe.loopFrames*Math.PI*2:cyclePhase%(Math.PI*2);
      const heldRecipe = scoreRecipe({ ...recipe, seed: recipe.seed + recipe.iteration * 104729 }, phase / (Math.PI * 2));
      heldRecipe.effects=heldRecipe.effects.map(e=>(e.type==="palette-cycle"||e.type==="surface-motion")?{...e,parameters:{...e.parameters,__cyclePhase:cyclePhase}}:e);
      const heldPrefix = `${sourceRevision}|${width}x${height}`;
      let surface = fittedSource(sourceRef.current, width, height, heldRecipe, phase,layerRefs.current);
      const materialTarget = heldRecipe.effects.find(e => e.id === (pickTargetEffectId ?? targetPreviewEffectId));
      if (materialTarget?.materialId && !showOriginal) {
        const layer = heldRecipe.layers.find(l => l.id === materialTarget.materialId);
        if (layer && layerRefs.current[layer.id]) {
          releaseSurface(surface);
          surface = maskedLayer(layerRefs.current[layer.id], layer, width, height);
        }
        const selected = materialChain(surface, materialTarget.materialId, heldRecipe, phase, temporal, heldTargets.current, heldPrefix, materialTarget.id, Boolean(targetPreviewEffectId), pickTargetRecipeId);
        context.drawImage(selected, 0, 0, width, height);
        if (selected !== surface) releaseSurface(selected);
        releaseSurface(surface);
        return;
      }
      if (!showOriginal && heldRecipe.processStage !== "form") {
        const base = materialChain(surface, "base", heldRecipe, phase, temporal, heldTargets.current, heldPrefix);
        if (base !== surface) releaseSurface(surface);
        surface = base;
      }
      const composited = compositeLayers(surface, showOriginal ? { ...heldRecipe, effects: [] } : heldRecipe, layerRefs.current, phase, temporal, "", heldTargets.current, heldPrefix);
      if (composited !== surface) releaseSurface(surface);
      surface = composited;
      const original = cloneSurface(surface);
      if (!showOriginal && heldRecipe.processStage !== "form") {
        let sourceBlended = false;
        for (const effect of heldRecipe.effects) {
          if (effect.materialId) continue;
          if (effect.enabled && (effect.type === "language-body" || effect.type === "ascii-field" || effect.type === "zhuyin-weave" || effect.type === "petscii-study") && !sourceBlended && heldRecipe.sourcePresence > 0) {
            const previous = surface;
            surface = blendSource(surface, original, heldRecipe.sourcePresence);
            if (surface !== previous && previous !== original) releaseSurface(previous);
            sourceBlended = true;
          }
          const target = effect.where.targetMemory === "source" ? original : surface;
          if (pickTargetEffectId === effect.id) {
            const previous = surface;
            const pickedRecipe = pickTargetRecipeId && effect.type === "ultimate-sort" ? effect.ultimateSort?.recipes.find((item) => item.id === pickTargetRecipeId) : undefined;
            if (pickedRecipe?.bodyTargetMemory === "source") surface = cloneSurface(original);
            else if (pickedRecipe) surface = ultimateSort(surface, effect, heldRecipe, phase, original, heldTargets.current, heldPrefix, pickedRecipe.id);
            else surface = cloneSurface(target);
            if (surface !== previous && previous !== original) releaseSurface(previous);
            break;
          }
          if (targetPreviewEffectId === effect.id) {
            const previous = surface;
            surface = targetSurface(surface, effect, target, heldTargets.current, heldPrefix);
            if (surface !== previous && previous !== original) releaseSurface(previous);
            break;
          }
          if (effect.enabled && effect.type === "spectral-surgery") {
            try {
              const previous = surface;
              const transformed = await spectralPreview(surface, effect, temporal ? phase : 0, controller.signal);
              if (controller.signal.aborted) {
                if (transformed !== previous) releaseSurface(transformed);
                releaseSurface(previous);
                releaseSurface(original);
                return;
              }
              surface = blendEffect(surface, transformed, effect, target, heldTargets.current, heldPrefix);
              if (transformed !== previous && transformed !== surface) releaseSurface(transformed);
              if (surface !== previous && previous !== original) releaseSurface(previous);
            } catch (cause) {
              if (controller.signal.aborted) {
                releaseSurface(surface);
                releaseSurface(original);
                return;
              }
              console.error("Spectral Surgery preview worker failed; using the synchronous renderer for this frame.", cause);
              const previous = surface;
              surface = applyEffect(surface, effect, heldRecipe, phase, temporal, target, heldTargets.current, heldPrefix, original);
              if (surface !== previous && previous !== original) releaseSurface(previous);
            }
          } else {
            const previous = surface;
            surface = applyEffect(surface, effect, heldRecipe, phase, temporal, target, heldTargets.current, heldPrefix, original);
            if (surface !== previous && previous !== original) releaseSurface(previous);
          }
          if (heldRecipe.layers.some(l => l.joinAfter === effect.id)) {
            const previous = surface;
            surface = compositeLayers(surface, heldRecipe, layerRefs.current, phase, temporal, effect.id, heldTargets.current, heldPrefix);
            if (previous !== original) releaseSurface(previous);
          }
        }
        if (!targetPreviewEffectId && !pickTargetEffectId && !sourceBlended) {
          const previous = surface;
          surface = blendSource(surface, original, heldRecipe.sourcePresence);
          if (surface !== previous && previous !== original) releaseSurface(previous);
        }
      } else {
        if (surface !== original) releaseSurface(surface);
        surface = original;
      }
      context.drawImage(surface, 0, 0, width, height);
      positionRef.current = loopPhase / (Math.PI * 2);
      if (surface !== original) releaseSurface(surface);
      releaseSurface(original);
    };
    if (!animate) {
      void paint();
      return () => controller.abort();
    }
    let animationFrame = 0;
    let lastPaint = -Infinity;
    const startedAt = performance.now();
    const effectiveFrames=paletteLoopFrames(recipe);
    const duration = effectiveFrames / recipe.loopFps * 1000;
    let painting = false;
    const tick = (now: number) => {
      if (!painting && now - lastPaint >= 1000 / recipe.loopFps) {
        const loopTime = ((now - startedAt) / duration + (recipe.scorePosition ?? 0)) % 1;
        const phase = Math.floor(loopTime * effectiveFrames) / effectiveFrames * Math.PI * 2;
        painting = true;
        void paint(phase).finally(() => { painting = false; });
        lastPaint = now;
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => { controller.abort(); cancelAnimationFrame(animationFrame); };
  }, [recipe, sourceDataUrl, sourceRevision, layerDataUrls, showOriginal, targetPreviewEffectId, pickTargetEffectId, pickTargetRecipeId, animate]);

  return <canvas className={`live-preview${pickTargetEffectId ? " target-picker" : ""}`} ref={canvasRef} onPointerDown={pickFromCanvas} onPointerMove={moveFigure} onPointerUp={()=>{figureDrag.current=null;}} onPointerCancel={()=>{figureDrag.current=null;}} style={figureDragTarget?{cursor:"move",touchAction:"none"}:undefined} aria-label={pickTargetEffectId ? "Click the visible image evidence to choose a process target" : animate ? "Animated loop audition of the current Glitch Temple recipe" : "Live preview of the current Glitch Temple recipe"} />;
});
