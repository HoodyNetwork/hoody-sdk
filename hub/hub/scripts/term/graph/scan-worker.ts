// Worker half of scanAll (build.ts): reads and scans a slice of the files, posts the facts back.
import fs from 'node:fs';
import { scanFile } from './scan';

declare const self: Worker;

self.onmessage = (ev: MessageEvent<{ files: string[]; globals: string[]; webPackages?: string[] }>) => {
  const globals = new Set(ev.data.globals);
  const webPackages = ev.data.webPackages;
  const out: [string, ReturnType<typeof scanFile>][] = [];
  for (const f of ev.data.files) out.push([f, scanFile(f, fs.readFileSync(f, 'utf8'), { globals, ...(webPackages ? { webPackages } : {}) })]);
  self.postMessage(out);
};
