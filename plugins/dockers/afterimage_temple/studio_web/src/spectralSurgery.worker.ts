import type { EffectInstance } from "./studio";
import { applySpectralSurgery } from "./spectralSurgery";

type SpectralWorkerRequest = { source: ArrayBuffer; width: number; height: number; effect: EffectInstance; seed: number; phase: number };
type SpectralWorkerResponse = { output: ArrayBuffer };
type WorkerScope = { onmessage: ((event: MessageEvent<SpectralWorkerRequest>) => void) | null; postMessage: (message: SpectralWorkerResponse, transfer: Transferable[]) => void };

const workerScope = self as unknown as WorkerScope;
workerScope.onmessage = (event) => {
  const { source, width, height, effect, seed, phase } = event.data;
  const output = applySpectralSurgery(new Uint8ClampedArray(source), width, height, effect, seed, phase);
  workerScope.postMessage({ output: output.buffer as ArrayBuffer }, [output.buffer]);
};
