// Every kit Drawer remembers its own width under its `resizeKey`, a required prop, so the compiler
// lists a drawer that forgot it. This reads the sources for what the compiler cannot see: no two panels share a key
// anywhere in the Hub, and only a component that wraps a Drawer may pass a key on from its own prop.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../..');
/** Components that take `resizeKey` from their caller and hand it to the Drawer they render (their own file may forward it). */
const WRAPPERS: Record<string, string> = {
  RailDrawer: 'pages/bots/parts/RailDrawer.tsx',
  CodeSheet: 'pages/account/parts/CodeSheet.tsx',
  // The model field's Change drawer: each field's caller names it.
  ModelPickField: 'kit/pickers/ModelPick.tsx',
};
const FORWARDERS = new Set(Object.values(WRAPPERS));
/** The kit's own test hosts pass the key through a prop or a shared props object on purpose. */
const SKIP = new Set(['kit/overlays/Drawer.resize.test.tsx', 'kit/pickers/ModelPick.test.tsx']);

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules') yield* sources(p);
    } else if (name.endsWith('.tsx') && !/\.term\./.test(name)) {
      // A terminal twin (X.term.tsx) and its tests draw the web file's own panels: each key counts once, at the web file.
      yield p;
    }
  }
}

/** The attribute text of every `<name ...>` tag in a source (braces and strings kept whole, so `=>` does not end it). */
function tags(src: string, name: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const re = new RegExp(`(?<![A-Za-z0-9_$])<${name}(?=[\\s>])`, 'g');
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = '';
    for (; i < src.length; i += 1) {
      const c = src[i] as string;
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = '';
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    out.push({ text: src.slice(m.index + m[0].length, i), line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

interface Site {
  where: string;
  file: string;
  key: string | null;
  dynamic: boolean;
}

const sites: Site[] = [];
for (const file of sources(SRC)) {
  const rel = relative(SRC, file).split(sep).join('/');
  if (SKIP.has(rel)) continue;
  const src = readFileSync(file, 'utf8');
  // A test may define its own local `Drawer`; only the kit's counts.
  const kitDrawer = /import\s*(?:type\s*)?\{[^}]*\bDrawer\b[^}]*\}\s*from\s*['"](?:@kit[^'"]*|\.[^'"]*overlays[^'"]*|\.\/Drawer)['"]/i.test(src);
  for (const name of [...(kitDrawer ? ['Drawer'] : []), ...Object.keys(WRAPPERS)]) {
    for (const t of tags(src, name)) {
      const lit = /\bresizeKey=(?:"([^"]+)"|\{\s*'([^']+)'\s*\})/.exec(t.text);
      sites.push({ where: `${rel}:${t.line}`, file: rel, key: lit?.[1] ?? lit?.[2] ?? null, dynamic: /\bresizeKey=\{(?!\s*')/.test(t.text) });
    }
  }
}

describe('Drawer panel names for the remembered width', () => {
  it('finds the drawers and the wrappers\' callers (the scan itself works)', () => {
    expect(sites.length).toBeGreaterThan(90);
    expect(sites.filter((x) => x.file === 'pages/bots/parts/ChatAppsTab.tsx')).toHaveLength(1);
    expect(sites.filter((x) => x.file === 'pages/account/view.tsx')).toHaveLength(3);
    expect(sites.some((x) => x.file === 'shell/ShortcutsSheet.tsx')).toBe(true);
  });

  it('every drawer names itself with a literal key; only a wrapper\'s own file forwards one', () => {
    const bad = sites.filter((x) => (x.key === null || x.dynamic) && !FORWARDERS.has(x.file)).map((x) => x.where);
    expect(bad).toEqual([]);
    for (const f of FORWARDERS) {
      expect(sites.filter((x) => x.file === f).length, `${f} holds the wrapper's Drawer`).toBeGreaterThan(0);
    }
  });

  it('keys are unique across the whole Hub and use plain lowercase letters, digits and dashes', () => {
    const seen = new Map<string, string>();
    for (const x of sites) {
      if (x.key === null) continue;
      expect(x.key, x.where).toMatch(/^[a-z][a-z0-9-]{2,48}$/);
      expect(seen.get(x.key), `${x.key} is used twice`).toBeUndefined();
      seen.set(x.key, x.where);
    }
    expect(seen.size).toBeGreaterThan(80);
  });
});
