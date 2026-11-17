// The standalone Hub build (hub:build-single → hub/scripts/build-single.ts): the whole Hub as ONE self-contained HTML
// file that runs from any origin, file:// included, and drives a Hoody over HTTP (hoody-sdk ships it).
//
// It is the production config (vite.config.mts, build mode: same plugins, aliases, CSS module names, defines) with:
//   - entry src/standalone/hub.html → src/standalone/entry.tsx (first-run screen or the Hub's own app/main.tsx);
//   - one JS chunk (codeSplitting false: every lazy import is inlined) and one CSS file, base './';
//   - the upload worker built inline (a blob URL at run time): a file:// page may not start a worker from a URL.
// The voice worklets keep Vite's `?worker&url`: build-single.ts turns each emitted worklet file into a blob URL in the
// page, and fails when the bundle names any other file. Everything outside the bundle (shared.js and the other auth
// scripts, fonts, icon, CSP) is added by build-single.ts, which also checks the result.
// The served build (vite.config.mts, hub:build) is not changed by anything here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import baseConfig from './vite.config.mts';

const HUB = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HUB, '..');
/** Where vite writes; build-single.ts reads it and writes the one file beside it. HUB_SINGLE_STAGE overrides it. */
export const SINGLE_STAGE_DIR = process.env.HUB_SINGLE_STAGE ?? path.join(API_ROOT, 'dist', 'hub-single', '.stage');
export const SINGLE_ENTRY_HTML = path.join(HUB, 'src', 'standalone', 'hub.html');

const UPLOAD = /[\\/]src[\\/]core[\\/]upload\.ts$/;
const UPLOAD_WORKER_NEW = "new Worker(new URL('./upload.worker.ts', import.meta.url), { type: 'module', name: 'hub-upload' })";

/** core/upload.ts's worker, built inline. A changed construction line fails the build instead of shipping a worker
 *  the file cannot start. */
function inlineUploadWorker(): Plugin {
  return {
    name: 'hub-single-upload-worker',
    enforce: 'pre',
    transform(code, id) {
      if (!UPLOAD.test(id.split('?')[0] ?? '')) return null;
      if (!code.includes(UPLOAD_WORKER_NEW)) this.error(`hub-single: core/upload.ts no longer starts its worker as \`${UPLOAD_WORKER_NEW}\`; update vite.single.config.mts`);
      return {
        code: "import HubUploadWorker from './upload.worker.ts?worker&inline';\n" + code.replace(UPLOAD_WORKER_NEW, "new HubUploadWorker({ name: 'hub-upload' })"),
        map: null,
      };
    },
  };
}

export default defineConfig(async (env): Promise<UserConfig> => {
  const made = typeof baseConfig === 'function' ? await baseConfig({ ...env, command: 'build', mode: 'production' }) : baseConfig;
  const base = made as UserConfig;
  if (!fs.existsSync(SINGLE_ENTRY_HTML)) throw new Error(`hub-single: missing ${SINGLE_ENTRY_HTML}`);
  const output = base.build?.rolldownOptions?.output;
  const baseOutput = Array.isArray(output) ? output[0] : output;
  return {
    ...base,
    base: './',
    plugins: [...(base.plugins ?? []), inlineUploadWorker()],
    build: {
      ...base.build,
      outDir: SINGLE_STAGE_DIR,
      emptyOutDir: true,
      cssCodeSplit: false,
      modulePreload: false,
      assetsInlineLimit: () => true,
      rolldownOptions: {
        ...base.build?.rolldownOptions,
        input: SINGLE_ENTRY_HTML,
        output: { ...baseOutput, codeSplitting: false },
      },
    },
    worker: { ...base.worker, format: 'iife' },
  };
});
