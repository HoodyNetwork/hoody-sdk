// The Node build's output (build.ts --runtime node), as build.ts writes it and node-runtime.ts reads it: the launcher's
// file, one library file per platform, and the manifest of those libraries written into the launcher.

/** The launcher, beside hub-term.js. */
export const NODE_LAUNCHER_FILE = 'hub-node.js';
/** The platforms a Node build can carry a library for: the npm package's `hoody hub` (Linux with glibc). */
export const NODE_PLATFORMS = ['linux-x64', 'linux-arm64'] as const;
/** The library file of `platform`, beside hub-term.js. */
export const nodeLibraryFile = (platform: string): string => `libopentui-${platform}.so`;

/** One platform's library: its file beside the bundle and the sha256 of its bytes. */
export interface NativeEntry { file: string; sha256: string }
/** platform (`linux-x64`) -> its library. */
export type NativeManifest = Readonly<Record<string, NativeEntry>>;
