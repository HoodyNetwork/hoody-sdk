// usesOf (New script "What the code uses"): a static reading of the code for the review screen, never a gate.
// Built-in modules are named exactly (node: and bun: forms folded to the name); files count when fs, fs/promises or Bun's
// file calls appear, and "writes" follows the widened file-write reading; calls to other addresses name each literal host
// once; AI follows the risk reading.
import { describe, expect, it } from 'vitest';
import { usesOf } from './logic';

describe('usesOf', () => {
  it('names the built-in modules a script imports, once each, and no package', () => {
    const u = usesOf("import fs from 'node:fs';\nimport { join } from 'path';\nimport z from 'zod';\nconst c = require('crypto');\nimport x from 'fs';");
    expect(u.builtins).toEqual(['fs', 'path', 'crypto']);
  });

  it('files: read only, written, or none', () => {
    expect(usesOf("import { readFileSync } from 'fs';\nreadFileSync('a');")).toMatchObject({ files: true, writes: false });
    expect(usesOf("import fs from 'fs';\nfs.appendFileSync('log.json', x);")).toMatchObject({ files: true, writes: true });
    expect(usesOf('await Bun.file(p).write("x");')).toMatchObject({ files: true, writes: true });
    expect(usesOf('export default () => new Response("hi");')).toMatchObject({ files: false, writes: false });
  });

  it('calls to other addresses name each literal host once', () => {
    const u = usesOf('await fetch("https://api.example.com/v1/x"); await fetch(`https://api.example.com/y`); new WebSocket("wss://feed.test/s");');
    expect(u.hosts).toEqual(['api.example.com', 'feed.test']);
    expect(u.calls).toBe(true);
    expect(usesOf('const r = await fetch(url);')).toMatchObject({ calls: true, hosts: [] });
    expect(usesOf('export default () => 1;')).toMatchObject({ calls: false, hosts: [] });
  });

  it('AI follows the risk reading', () => {
    expect(usesOf('const r = await hoodyAi.chat("x");').ai).toBe(true);
    expect(usesOf('1').ai).toBe(false);
  });
});
