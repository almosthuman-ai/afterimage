import type { EffectInstance } from "./studio";

type SpectralWorkerResponse = { output: ArrayBuffer };

function abortedError() {
  return new DOMException("The obsolete spectral preview was cancelled.", "AbortError");
}

export function spectralPreview(input: HTMLCanvasElement, effect: EffectInstance, phase: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject<HTMLCanvasElement>(abortedError());
  const sourceContext = input.getContext("2d", { willReadFrequently: true })!;
  const source = sourceContext.getImageData(0, 0, input.width, input.height).data.slice();
  const worker = new Worker(new URL("./spectralSurgery.worker.ts", import.meta.url), { type: "module" });
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      finish();
      reject(abortedError());
    };
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Spectral Surgery's preview worker failed."));
    };
    worker.onmessage = (event: MessageEvent<SpectralWorkerResponse>) => {
      if (signal.aborted) return;
      const output = document.createElement("canvas");
      output.width = input.width; output.height = input.height;
      const context = output.getContext("2d")!;
      context.putImageData(new ImageData(new Uint8ClampedArray(event.data.output), input.width, input.height), 0, 0);
      finish();
      resolve(output);
    };
    worker.postMessage({ source: source.buffer, width: input.width, height: input.height, effect, seed: effect.where.seed, phase }, [source.buffer]);
  });
}
