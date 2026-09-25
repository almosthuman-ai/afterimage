import type { EffectInstance, EffectType } from "./studio";
import { applySpectralSurgery } from "./spectralSurgery";

export const audioBendingTypes: EffectType[] = ["pcm-possession", "tape-transport", "phase-choir", "spectral-surgery", "echo-architecture", "clip-furnace", "silence-knife"];
export const isAudioBendingType = (type: EffectType) => audioBendingTypes.includes(type);

const clamp = (v: number, low = 0, high = 1) => Math.max(low, Math.min(high, v));
const wrap = (v: number, n: number) => ((Math.round(v) % n) + n) % n;
const param = (effect: EffectInstance, id: string, fallback = 0) => Number(effect.parameters[id] ?? fallback);
const hash = (seed: number, identity: number, salt = 0) => {
  let value = (seed ^ Math.imul(identity + 1, 374761393) ^ Math.imul(salt + 3, 668265263)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};

function pixelAt(time: number, width: number, height: number, path: number, seed: number) {
  const total = width * height, held = wrap(time, total);
  if (path === 1) return (held % height) * width + Math.floor(held / height);
  if (path === 2) { const row = Math.floor(held / width), x = held % width; return row * width + (row % 2 ? width - 1 - x : x); }
  if (path === 3) return total - 1 - held;
  if (path === 4) {
    const size = Math.max(8, Math.min(96, Math.round(Math.sqrt(total) / 9)));
    const block = Math.floor(held / size), within = held % size, count = Math.ceil(total / size);
    const shifted = wrap(block + Math.floor(hash(seed, Math.floor(block / 7), 41) * count), count);
    return Math.min(total - 1, shifted * size + (block % 2 ? size - 1 - within : within));
  }
  return held;
}

const rgba = (data: Uint8ClampedArray, pixel: number) => [data[pixel * 4], data[pixel * 4 + 1], data[pixel * 4 + 2], data[pixel * 4 + 3]];
const hue = (c: number[]) => {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, high = Math.max(r, g, b), low = Math.min(r, g, b), span = high - low;
  if (span === 0) return 0;
  const sector = high === r ? ((g - b) / span) % 6 : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return ((sector / 6) + 1) % 1;
};
const pcmByte = (data: Uint8ClampedArray, time: number, lane: number, order: number, width: number, height: number, path: number, seed: number) => {
  if (order === 5) {
    const c = rgba(data, pixelAt(time, width, height, path, seed)), opponent = [clamp((c[0] - c[1]) / 510 + .5) * 255, clamp((c[2] - (c[0] + c[1]) * .5) / 510 + .5) * 255, (c[0] + c[1] + c[2]) / 3];
    return opponent[lane];
  }
  const sequence = order === 1 ? [2, 1, 0] : order === 2 ? [0, 1, 2, 3] : order === 3 ? [3, 0, 1, 2] : order === 4 ? [2, 1, 0, 3] : [0, 1, 2];
  const byte = Math.floor(time * sequence.length) + lane, pixel = pixelAt(Math.floor(byte / sequence.length), width, height, path, seed);
  return data[pixel * 4 + sequence[wrap(byte, sequence.length)]];
};
const tracks = (c: number[], body: number, identity: number) => {
  let r = c[0] / 127.5 - 1, g = c[1] / 127.5 - 1, b = c[2] / 127.5 - 1;
  if (body === 1) return identity % 3 === 0 ? [g, b, r] : identity % 3 === 1 ? [b, r, g] : [r, g, b];
  if (body === 2) return [(r - g) * .5, b - (r + g) * .5, (r + g + b) / 3];
  if (body === 3) { const y = r * .2126 + g * .7152 + b * .0722; return [y, r - y, b - y]; }
  return [r, g, b];
};
const rgb = (t: number[], body: number, identity: number) => {
  let r = t[0], g = t[1], b = t[2];
  if (body === 1) { const held = identity % 3 === 0 ? [b, r, g] : identity % 3 === 1 ? [g, b, r] : [r, g, b]; [r, g, b] = held; }
  else if (body === 2) { const y = t[2]; r = y + t[0] - t[1] / 3; g = y - t[0] - t[1] / 3; b = y + t[1] * 2 / 3; }
  else if (body === 3) { r = t[0] + t[1]; b = t[0] + t[2]; g = (t[0] - .2126 * r - .0722 * b) / .7152; }
  return [r, g, b];
};
const reunite = (value: number, original: number, mode: number) => mode === 1 ? clamp(original + value * .65, -1, 1) : mode === 2 ? clamp(original - value, -1, 1) : mode === 3 ? Math.abs(original - value) * 2 - 1 : mode === 4 ? Math.max(original, value) : mode === 5 ? Math.min(original, value) : value;

export function audioBending(input: HTMLCanvasElement, effect: EffectInstance, phase: number) {
  const canvas = document.createElement("canvas"); canvas.width = input.width; canvas.height = input.height;
  const context = canvas.getContext("2d")!, sourceContext = input.getContext("2d", { willReadFrequently: true })!;
  const image = sourceContext.getImageData(0, 0, input.width, input.height), source = image.data, output = new Uint8ClampedArray(source), total = input.width * input.height;
  const seed = effect.where.seed, path = Math.round(param(effect, "readingPath")), body = Math.round(param(effect, "trackBody")), reunion = Math.round(param(effect, "trackReunion"));
  if (effect.type === "spectral-surgery") output.set(applySpectralSurgery(source, input.width, input.height, effect, seed, phase));
  else for (let i = 0; i < total; i++) {
    const target = pixelAt(i, input.width, input.height, path, seed), original = rgba(source, target), originalTracks = tracks(original, body, i), result = [...originalTracks];
    const motion = param(effect, "motion") * Math.sin(phase), memory = param(effect, "sourceMemory", .2);
    if (effect.type === "pcm-possession") {
      const rate = param(effect, "sampleRate", 1), flesh = Math.round(param(effect, "sampleFlesh", 1)), order = Math.round(param(effect, "byteOrder")), depth = Math.round(param(effect, "bitDepth", 7)), independence = param(effect, "channelIndependence", .35), dc = param(effect, "dcDisplacement", .08);
      for (let c = 0; c < 3; c++) { const at = i * rate + (c - 1) * independence * 97 + motion * 83, one = Math.round(pcmByte(source, at, c, order, input.width, input.height, path, seed)), two = Math.round(pcmByte(source, at + 1, c, order, input.width, input.height, path, seed)); let v = one / 127.5 - 1; if (flesh === 1) v = ((one + 128) % 256) / 127.5 - 1; else if (flesh === 2 || flesh === 3) { const word = flesh === 2 ? one | (two << 8) : (one << 8) | two; v = ((word > 32767 ? word - 65536 : word) / 32768); } else if (flesh === 4) v = Math.sin(((one << 8) | two) * .013 + c * 2.1); const steps = (1 << depth) - 1; result[c] = Math.round(clamp((v + dc + 1) * .5) * steps) / steps * 2 - 1; }
    } else if (effect.type === "tape-transport") {
      const zones = Math.round(param(effect, "speedZones", 12)), zone = Math.floor(i / Math.max(1, total / zones)), stretch = param(effect, "stretch", .26), speed = param(effect, "speed", 1), splice = Math.round(param(effect, "spliceSize", 42)), frequency = param(effect, "spliceFrequency", .24); let at = i * speed * (1 + (hash(seed, zone, 1) - .5) * stretch * 1.8); at += Math.sin(i / total * Math.PI * 2 * zones + phase) * param(effect, "wow", .18) * splice * 3 + Math.sin(i * .21 + phase * 3) * param(effect, "flutter", .12) * splice; if (hash(seed, Math.floor(i / splice), 2) < frequency) at += (hash(seed, Math.floor(i / splice), 3) - .5) * splice * 14; if (hash(seed, zone, 4) < param(effect, "reverseSpan", .18)) at = Math.floor(at / splice) * splice + splice - (at % splice); const sampled = rgba(source, pixelAt(at, input.width, input.height, path, seed)); if (hash(seed, Math.floor(i / splice), 5) < param(effect, "dropout", .05)) result.fill(-1); else for (let c = 0; c < 3; c++) result[c] = sampled[c] / 127.5 - 1;
    } else if (effect.type === "phase-choir") {
      const delays = [param(effect, "redDelay"), param(effect, "greenDelay"), param(effect, "blueDelay")], polarity = [param(effect, "redPolarity"), param(effect, "greenPolarity"), param(effect, "bluePolarity")], drift = param(effect, "phaseDrift", .28), cross = param(effect, "crossfeed", .18), cancel = param(effect, "cancellation", .42); for (let c = 0; c < 3; c++) { const sampled = tracks(rgba(source, pixelAt(i + delays[c] + Math.sin(phase + c * 2.1) * drift * 120, input.width, input.height, path, seed)), body, i)[c]; const opposed = polarity[c] ? -sampled : sampled; result[c] = opposed * (1 - cross) + originalTracks[(c + 2) % 3] * cross - originalTracks[(c + 1) % 3] * cancel * .5; }
    } else if (effect.type === "echo-architecture") {
      const distance = param(effect, "delayDistance", 38), taps = Math.round(param(effect, "taps", 3)), feedback = param(effect, "feedback", .46), decay = param(effect, "decay", .7), cross = param(effect, "crossFeedback", .24), reverse = param(effect, "reverseFeedback", .14), comb = param(effect, "combResonance", .22), mutation = param(effect, "delayMutation", .18); result.fill(0); let weight = 0; for (let tap = 0; tap <= taps; tap++) { const gain = tap === 0 ? 1 : feedback * Math.pow(decay, tap - 1), changed = distance * tap * (1 + (hash(seed, tap, 7) - .5) * mutation * 2 + motion * .2), at = i + (hash(seed, tap, 8) < reverse ? changed : -changed), delayed = tracks(rgba(source, pixelAt(at, input.width, input.height, path, seed)), body, i); for (let c = 0; c < 3; c++) result[c] += (delayed[c] * (1 - cross) + delayed[(c + 2) % 3] * cross) * gain * (1 + Math.sin(i / Math.max(1, distance) * Math.PI) * comb); weight += gain; } for (let c = 0; c < 3; c++) result[c] /= Math.max(1, weight);
    } else if (effect.type === "clip-furnace") {
      const furnace = Math.round(param(effect, "furnaceBody", 2)), gain = param(effect, "inputGain", 1.8) * (1 + motion * .18), pos = param(effect, "positiveThreshold", .72), neg = param(effect, "negativeThreshold", .65), bias = param(effect, "dcBias", .08), depth = Math.round(param(effect, "bitDepth", 6)), spread = param(effect, "channelSpread", .24); for (let c = 0; c < 3; c++) { const threshold = (c === 0 ? pos : neg) * (1 + (c - 1) * spread * .35); let v = originalTracks[c] * gain + bias; if (furnace === 0) v = clamp(v, -threshold, threshold) / threshold; else if (furnace === 1) v = Math.tanh(v / threshold); else if (furnace === 2) { const span = threshold * 2; v = Math.abs(((v + threshold) % span + span) % span - threshold) / threshold * 2 - 1; } else if (furnace === 3) v = ((v + 1) % 2 + 2) % 2 - 1; const steps = (1 << depth) - 1; result[c] = Math.round(clamp((v + 1) * .5) * steps) / steps * 2 - 1; }
    } else if (effect.type === "silence-knife") {
      const signal = Math.round(param(effect, "gateSignal")), threshold = param(effect, "gateThreshold", .48), attack = Math.max(.001, param(effect, "attack", .08)), release = Math.max(.001, param(effect, "release", .18)), span = Math.round(param(effect, "silenceSpan", 32)), repetition = Math.round(param(effect, "repetition", 6)), hold = param(effect, "hold", .36), fill = Math.round(param(effect, "fillBody")); const light = (original[0] * .2126 + original[1] * .7152 + original[2] * .0722) / 255, max = Math.max(original[0], original[1], original[2]) / 255, min = Math.min(original[0], original[1], original[2]) / 255, evidence = signal === 0 ? light : signal === 1 ? hue(original) : signal === 2 ? max - min : signal >= 3 && signal <= 5 ? original[signal - 3] / 255 : Math.max(...originalTracks.map(Math.abs)); const rhythm = ((Math.floor((i + motion * span * repetition) / span) % repetition) / Math.max(1, repetition - 1)), cut = Math.max(clamp((threshold - evidence) / attack), clamp((hold - rhythm) / release)); if (cut > 0) { const previous = rgba(source, pixelAt(i - span, input.width, input.height, path, seed)); const fillRgb = fill === 1 ? [255,255,255] : fill === 2 ? [0,0,0] : fill === 3 ? previous : fill === 4 ? [original[1],original[2],original[0]] : [0,0,0]; for (let c=0;c<3;c++) result[c]=result[c]*(1-cut)+(fillRgb[c]/127.5-1)*cut; output[target*4+3]=Math.round(original[3]*(fill===2?1-cut:1)); } }
    const rebuilt = rgb(result.map((v, c) => reunite(v, originalTracks[c], reunion)), body, i);
    for (let c = 0; c < 3; c++) output[target * 4 + c] = Math.round(clamp((rebuilt[c] + 1) * 127.5) * (1 - memory) + original[c] * memory);
  }
  image.data.set(output); context.putImageData(image, 0, 0); return canvas;
}
