// The ONE hand-off list is derived from the code (graph/handoffs.ts): a kit name is a hand-off
// when its terminal sibling's own declaration draws <Handoff>; a page when its page.ts sets `handoff`. No hand list:
// scripts/term/graph/handoff.json and the manifest "handoff" marks are gone and must not come back.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../graph';
import { scanFile } from './scan';

const HUB = path.resolve(import.meta.dir, '../../..');
const ROOT = process.env.GRAPH_FIXTURES_DIR ?? path.join(HUB, '.term-cache', 'graph-fixtures');

function tree(files: Record<string, string>): string {
  fs.mkdirSync(ROOT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, 'handoff-'));
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  fs.writeFileSync(path.join(dir, 'seams.json'), JSON.stringify({ files: [] }));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, resolveJsonModule: true, allowJs: true, noEmit: true, verbatimModuleSyntax: true, paths: { '@kit': ['./src/kit/index.ts'], '@kit/*': ['./src/kit/*'] } }, include: ['src'] }));
  return dir;
}
const analyse = (hub: string) => run({ hub, quiet: true, seams: path.join(hub, 'seams.json'), baseline: path.join(hub, 'baseline.json'), shellEntries: [], termEntries: [], check: true, rules: ['R1', 'R6'] });

const HANDOFF = {
  'src/kit/states/Handoff.tsx': "export function Handoff(p: { reason: string; what?: string; children?: unknown }) { return p.children ?? null; }\n",
  'src/kit/states/Handoff.term.tsx': "export function Handoff(p: { reason: string; what?: string }) { return p.reason; }\n",
};

describe('derived hand-offs', () => {
  test('a name is a hand-off only when its sibling declaration draws <Handoff>, helpers included', () => {
    const hub = tree({
      ...HANDOFF,
      'src/kit/index.ts': "export { Mic, useMic } from './Mic';\nexport { Spark } from './Spark';\nexport { Path } from './Path';\nexport { Thumb } from './Thumb';\nexport { Handoff } from './states/Handoff';\n",
      'src/kit/Mic.tsx': "export function Mic() { return navigator.mediaDevices; }\nexport function useMic() { return navigator.mediaDevices; }\n",
      'src/kit/Mic.term.tsx': "import { Handoff } from './states/Handoff';\nfunction Inner() { return <Handoff reason=\"Needs a microphone.\" />; }\nexport function Mic() { return <Inner />; }\nexport function useMic() { return null; }\n",
      'src/kit/Spark.tsx': "export function Spark() { return document.createElement('canvas'); }\n",
      'src/kit/Spark.term.tsx': "export function Spark() { return '▁▂▃'; }\n",
      'src/kit/Path.tsx': "export function Path() { return window.showDirectoryPicker; }\n",
      'src/kit/Path.term.tsx': "import { Handoff } from './states/Handoff';\nexport function Path(p: { browse?: boolean }) { return p.browse ? <Handoff reason=\"Browsing needs the web.\" /> : 'path'; }\n",
      'src/kit/Thumb.tsx': "export function Thumb() { return URL.createObjectURL(new Blob()); }\n",
    });
    const r = analyse(hub);
    expect(r.analysis.handoffs.names).toEqual(['Mic', 'Path']);
    expect(r.analysis.handoffs.sites).toEqual(['src/kit/Mic.term.tsx', 'src/kit/Path.term.tsx']);
    const status = Object.fromEntries(r.analysis.kit.map((k) => [k.name, k.status]));
    expect(status.Mic).toBe('handoff');
    expect(status.useMic).not.toBe('handoff');
    expect(status.Spark).not.toBe('handoff');
    expect(status.Thumb).not.toBe('handoff');
  });

  test('an empty, missing or empty-text reason fails (R6); a sibling drawing Handoff is not told to go (R1)', () => {
    const hub = tree({
      ...HANDOFF,
      'src/kit/index.ts': "export { A } from './A';\nexport { Handoff } from './states/Handoff';\n",
      'src/kit/A.tsx': "export function A() { return 'web'; }\n",
      'src/kit/A.term.tsx': "import { Handoff } from './states/Handoff';\nimport { tt } from './t';\nexport function A() {\n  return [\n    <Handoff reason=\"\" />,\n    <Handoff reason=\"  \" />,\n    <Handoff what=\"x\" />,\n    <Handoff reason={tt('a.empty')} />,\n    <Handoff reason={tt('a.ok')} />,\n    <Handoff reason={tt('a.unknown')} />,\n  ];\n}\n",
      'src/kit/t.ts': "export const tt = (k: string) => k;\n",
      'src/kit/A.strings.en.json': JSON.stringify({ 'a.empty': ' ', 'a.ok': 'Needs a browser.' }),
      'src/pages/p/page.ts': "export default { id: 'p', handoff: { reason: 'p.why', what: 'p.what' } };\n",
      'src/pages/p/strings.en.json': JSON.stringify({ 'p.why': '', 'p.what': 'the board' }),
    });
    const r = analyse(hub);
    const f = r.findings!.filter((x) => x.rule === 'R6' && x.message.startsWith('hand-off:')).map((x) => x.message);
    expect(f.filter((m) => m.includes('draws <Handoff> with an empty reason')).map((m) => m.split(' ')[1])).toEqual(['src/kit/A.term.tsx:5', 'src/kit/A.term.tsx:6']);
    expect(f.some((m) => m.includes('src/kit/A.term.tsx:7 draws <Handoff> with no reason'))).toBe(true);
    expect(f.some((m) => m.includes('with no reason'))).toBe(true);
    expect(f.some((m) => m.includes("reason key 'a.empty'"))).toBe(true);
    expect(f.some((m) => m.includes("'a.ok'") || m.includes("'a.unknown'"))).toBe(false);
    expect(f.some((m) => m.includes('src/pages/p/page.ts: handoff.reason'))).toBe(true);
    expect(r.analysis.handoffs.pages).toEqual(['p']);
    expect(r.findings!.filter((x) => x.rule === 'R1' && x.file === 'src/kit/A.term.tsx')).toEqual([]);
  });
});

describe('the real tree', () => {
  test('no hand list is back: graph/handoff.json and the manifest "handoff" marks are gone', () => {
    expect(fs.existsSync(path.join(HUB, 'scripts/term/graph/handoff.json'))).toBe(false);
    const gaps = (JSON.parse(fs.readFileSync(path.join(HUB, 'src/term/manifest.json'), 'utf8')) as { gaps?: Record<string, string> }).gaps ?? {};
    expect(Object.entries(gaps).filter(([, v]) => v === 'handoff').map(([k]) => k)).toEqual([]);
  });

  test('every <Handoff> in the hub states a reason that is not an empty literal', () => {
    const SRC = path.join(HUB, 'src');
    const bad: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
        if (!/\.tsx$/.test(e.name) || /\.(test|spec)\.tsx$/.test(e.name)) continue;
        const text = fs.readFileSync(p, 'utf8');
        if (!text.includes('<Handoff')) continue;
        for (const r of scanFile(p, text, { globals: new Set() }).handoffReasons ?? []) {
          if (r.missing || (r.literal !== undefined && r.literal.trim() === '')) bad.push(`${path.relative(SRC, p)}:${r.line}`);
        }
      }
    };
    walk(SRC);
    expect(bad).toEqual([]);
  });
});
