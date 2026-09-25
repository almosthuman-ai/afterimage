import type { EffectInstance } from "./studio";

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const wrap = (value: number, length: number) => ((Math.round(value) % length) + length) % length;
const parameter = (effect: EffectInstance, id: string, fallback = 0) => Number(effect.parameters[id] ?? fallback);

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

type DftTables = { cosine: Float64Array; sine: Float64Array };
const dftTables = new Map<number, DftTables>();

function tablesFor(size: number) {
  const cached = dftTables.get(size);
  if (cached) return cached;
  const cosine = new Float64Array(size * size), sine = new Float64Array(size * size);
  for (let frequency = 0; frequency < size; frequency += 1) {
    for (let sample = 0; sample < size; sample += 1) {
      const offset = frequency * size + sample;
      const angle = Math.PI * 2 * frequency * sample / size;
      cosine[offset] = Math.cos(angle);
      sine[offset] = Math.sin(angle);
    }
  }
  const tables = { cosine, sine };
  dftTables.set(size, tables);
  return tables;
}

export function applySpectralSurgery(source: Uint8ClampedArray, width: number, height: number, effect: EffectInstance, seed: number, phase: number) {
  const output = new Uint8ClampedArray(source);
  const path = Math.round(parameter(effect, "readingPath")), size = [8, 16, 32, 64][Math.round(parameter(effect, "windowScale", 2))], overlap = Math.round(parameter(effect, "windowOverlap", 1));
  const hop = Math.max(1, Math.round(size / (overlap + 1))), evidence = Math.round(parameter(effect, "spectralEvidence")), territory = Math.round(parameter(effect, "frequencyTerritory", 2));
  const operation = Math.round(parameter(effect, "operation", 4)), pressure = parameter(effect, "pressure", .46), center = parameter(effect, "bandCenter", .5), bandWidth = parameter(effect, "bandWidth", .28);
  const memory = parameter(effect, "sourceMemory", .32), motion = parameter(effect, "motion", .24), bond = Math.round(parameter(effect, "channelBond")), total = width * height;
  const sums = [new Float32Array(total), new Float32Array(total), new Float32Array(total)], weights = new Float32Array(total);
  const real = new Float64Array(size), imaginary = new Float64Array(size), heldReal = new Float64Array(size), heldImaginary = new Float64Array(size), samples = new Float64Array(size);
  const order = new Int32Array(total + size);
  for (let index = 0; index < order.length; index += 1) order[index] = pixelAt(index, width, height, path, seed);
  const { cosine, sine } = tablesFor(size);

  for (let start = 0; start < total; start += hop) {
    for (let channel = 0; channel < 3; channel += 1) {
      for (let sample = 0; sample < size; sample += 1) samples[sample] = source[order[start + sample] * 4 + channel] / 127.5 - 1;
      let average = 0;
      for (let frequency = 0; frequency < size; frequency += 1) {
        let rr = 0, ii = 0;
        const tableOffset = frequency * size;
        for (let sample = 0; sample < size; sample += 1) {
          rr += samples[sample] * cosine[tableOffset + sample];
          ii -= samples[sample] * sine[tableOffset + sample];
        }
        real[frequency] = heldReal[frequency] = rr;
        imaginary[frequency] = heldImaginary[frequency] = ii;
        average += Math.hypot(rr, ii);
      }
      average /= size;
      for (let frequency = 0; frequency < size; frequency += 1) {
        const normalizedFrequency = Math.min(frequency, size - frequency) / (size / 2), magnitude = Math.hypot(heldReal[frequency], heldImaginary[frequency]);
        const selected = territory === 0 ? normalizedFrequency < .28 : territory === 1 ? normalizedFrequency >= .2 && normalizedFrequency < .68 : territory === 2 ? normalizedFrequency >= .58 : territory === 3 ? magnitude > average * 1.25 : territory === 4 ? magnitude < average * .55 : Math.abs(normalizedFrequency - center) <= bandWidth * .5;
        if (!selected) continue;
        const decisionChannel = bond === 0 ? 0 : channel;
        const drift = Math.round((pressure * .22 + motion * .12 * Math.sin(phase + decisionChannel)) * size);
        const from = wrap(operation === 5 ? size - frequency : operation === 2 ? frequency / (1 + pressure) : frequency - drift, size);
        let rr = heldReal[from], ii = heldImaginary[from];
        if (operation === 0) { rr *= 1 - pressure; ii *= 1 - pressure; }
        else if (operation === 3) { rr = average * Math.cos(hash(seed, frequency, decisionChannel) * Math.PI * 2); ii = average * Math.sin(hash(seed, frequency, decisionChannel) * Math.PI * 2); }
        else if (operation === 4) { rr = (heldReal[wrap(frequency - 1, size)] + heldReal[frequency] + heldReal[wrap(frequency + 1, size)]) / 3; ii = (heldImaginary[wrap(frequency - 1, size)] + heldImaginary[frequency] + heldImaginary[wrap(frequency + 1, size)]) / 3; }
        else if (operation === 6) { rr = Math.sin(rr * pressure) * average; ii = Math.sin(ii * pressure) * average; }
        if (evidence === 0) { const angle = Math.atan2(heldImaginary[frequency], heldReal[frequency]), magnitudeAfter = Math.hypot(rr, ii); rr = Math.cos(angle) * magnitudeAfter; ii = Math.sin(angle) * magnitudeAfter; }
        else if (evidence === 1) { const angle = Math.atan2(ii, rr); rr = Math.cos(angle) * magnitude; ii = Math.sin(angle) * magnitude; }
        real[frequency] = real[frequency] * (1 - pressure) + rr * pressure;
        imaginary[frequency] = imaginary[frequency] * (1 - pressure) + ii * pressure;
      }
      for (let sample = 0; sample < size && start + sample < total; sample += 1) {
        let value = 0;
        for (let frequency = 0; frequency < size; frequency += 1) {
          const tableOffset = frequency * size + sample;
          value += real[frequency] * cosine[tableOffset] - imaginary[frequency] * sine[tableOffset];
        }
        const pixel = order[start + sample];
        sums[channel][pixel] += value / size;
        if (channel === 0) weights[pixel] += 1;
      }
    }
  }
  for (let pixel = 0; pixel < total; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const transformed = clamp((sums[channel][pixel] / Math.max(1, weights[pixel]) + 1) * 127.5, 0, 255);
      output[pixel * 4 + channel] = Math.round(transformed * (1 - memory) + source[pixel * 4 + channel] * memory);
    }
  }
  return output;
}
