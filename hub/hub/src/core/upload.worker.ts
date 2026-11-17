// upload.worker.ts: the transfer worker, a same-origin module worker started by upload.ts.
// It hashes and sends the files the page posts; everything it does is upload-core.ts workerHandler.
import { workerHandler, WORKER_REVISION, type FromWorker } from './upload-core';

const scope = self as unknown as { postMessage(m: FromWorker | { readonly revision: number }): void; onmessage: ((ev: MessageEvent) => void) | null };
scope.onmessage = workerHandler((m) => scope.postMessage(m), (url, init) => fetch(url, init));
// Its revision, once (upload-core.ts WORKER_REVISION): part of the worker's bytes, so raising it renames the built file.
scope.postMessage({ revision: WORKER_REVISION });
