// Boot carries only the strings each page.ts names (vite.config.mts pageBootStrings). Vitest runs the
// same plugin as dev and the build, so the manifests read here hold the projection that ships.
//   P1 the plugin is registered and runs in every mode (no `apply`, no mode branch)
//   P2 a manifest's strings are the table's keys its page.ts names, with every plural form, values unchanged; a key
//      page.ts builds at run time is not kept, and definePage refuses that manifest
//   P3 every other importer of a strings.en.json (a page's own modules, its parts) gets the whole table
//   P4 definePage refuses a manifest naming a key its strings lack; only navCount may name a plural base
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { makeT } from '@kit/strings';
import type * as KitStrings from '@kit/strings';
import { bootStrings } from '../../scripts/page-boot-strings';
import { discoverPages } from './pages';

// Every table any module hands to makeT, from the first import on (vi.mock is hoisted above the imports).
const handed = vi.hoisted(() => [] as Record<string, string>[]);
vi.mock('@kit/strings', async (importOriginal) => {
  const real = await importOriginal<typeof KitStrings>();
  return { ...real, makeT: ((table: Record<string, string>) => (handed.push(table), real.makeT(table))) as typeof real.makeT };
});

const SRC = join(__dirname, '..');
const CONFIG = join(SRC, '..', 'vite.config.mts');
const disk = (rel: string) => JSON.parse(readFileSync(join(SRC, rel), 'utf8')) as Record<string, string>;
const { pages } = discoverPages();
const page = (id: string) => pages.find((p) => p.id === id) as PageManifest;

describe('page boot strings', () => {
  it('pageBootStrings is in the plugin list, with no apply and no mode branch', () => {
    const src = readFileSync(CONFIG, 'utf8');
    expect(src).toMatch(/plugins:\s*\[[^\]]*\bpageBootStrings\(\)/);
    const body = /function pageBootStrings\(\): Plugin \{([\s\S]*?)\n\}\n/.exec(src)?.[1];
    expect(body, 'pageBootStrings is defined').toBeDefined();
    expect(body).not.toMatch(/\b(apply|command|mode|isProduction|configResolved|NODE_ENV|environment)\b/);
  });

  describe('the boot projection', () => {
    const table = {
      title: 'Probe',
      nav: 'Probe nav',
      'n.count_one': '{{count}} probe',
      'n.count_other': '{{count}} probes',
      'n.tip_other': '{{count}} waiting',
      'cmd.go': 'Go',
      'guide.t': 'About',
      'guide.b': 'How it works',
      'view.only': 'Shown by the view',
    };
    const src = [
      "definePage({ id: 'probe', title: 'title', nav: { group: 'main', label: 'nav' },",
      "  navCount: { label: 'n.count', tip: \"n.tip\" },",
      "  guide: [{ id: 'g', title: 'guide.t', body: 'guide.b' }],",
      "  commands: [{ id: 'go', label: `cmd.${'go'}` }], strings });",
    ].join('\n');

    it('keeps the named literals and their plural families, values unchanged, and nothing else', () => {
      expect(bootStrings(src, table)).toEqual({
        title: 'Probe',
        nav: 'Probe nav',
        'n.count_one': '{{count}} probe',
        'n.count_other': '{{count}} probes',
        'n.tip_other': '{{count}} waiting',
        'guide.t': 'About',
        'guide.b': 'How it works',
      });
    });
    it('drops a key page.ts builds at run time, and definePage refuses that manifest', () => {
      const strings = bootStrings(src, table);
      expect(strings).not.toHaveProperty('cmd.go');
      const m = { id: 'probe', path: '/probe', title: 'title', layout: 'detail', status: 'ready', sensitive: false, strings, load: () => Promise.resolve({ default: () => null }), commands: [{ id: 'go', label: 'cmd.go' }] };
      expect(() => definePage(m as unknown as PageManifest)).toThrow('string key "cmd.go" missing');
    });
    it('board carries its title, nav, plural navCount family and command, not its view strings', () => {
      expect(Object.keys(page('board').strings).sort()).toEqual(['cmd.open', 'nav', 'nav.countTip_one', 'nav.countTip_other', 'nav.count_one', 'nav.count_other', 'title']);
    });
    it('ai carries its title, nav and the ten command labels', () => {
      expect(Object.keys(page('ai').strings).sort()).toEqual(
        ['cmd.anthropic', 'cmd.claude', 'cmd.connect', 'cmd.google', 'cmd.mimo', 'cmd.model', 'cmd.models', 'cmd.open', 'cmd.openai', 'cmd.spending', 'nav', 'title'],
      );
    });
    it.each(pages.filter((p) => p.id !== 'demo').map((p) => [p.id, p] as const))('%s: what the pipeline loaded is that projection of the disk table', (id, p) => {
      const whole = disk(`pages/${id}/strings.en.json`);
      expect(p.strings).toEqual(bootStrings(readFileSync(join(SRC, 'pages', id, 'page.ts'), 'utf8'), whole));
      for (const [k, v] of Object.entries(p.strings)) expect(whole[k], k).toBe(v);
      expect(Object.keys(p.strings).length).toBeLessThan(Object.keys(whole).length);
    });
  });

  describe('any importer but a page.ts gets the whole table', () => {
    const isPart = (t: Record<string, string>, whole: Record<string, string>) =>
      Object.keys(t).length < Object.keys(whole).length && Object.entries(t).every(([k, v]) => whole[k] === v);
    it.each([
      // ai/page.ts imports the same './strings.en.json' from the same folder.
      ['pages/ai/logic.ts', () => import('../pages/ai/logic'), 'pages/ai/strings.en.json'],
      ['pages/apps/launch/openWith/facts.ts', () => import('../pages/apps/launch/openWith/facts'), 'pages/apps/launch/openWith/strings.en.json'],
      ['pages/programs/sandbox/SandboxChip.tsx', () => import('../pages/programs/sandbox/SandboxChip'), 'pages/programs/sandbox/strings.en.json'],
    ] as const)('%s hands makeT the whole table', async (_mod, load, rel) => {
      await load();
      const whole = disk(rel);
      expect(handed.some((t) => JSON.stringify(t) === JSON.stringify(whole)), `${rel} whole`).toBe(true);
      expect(handed.some((t) => isPart(t, whole)), `${rel} projected`).toBe(false);
    });
    it('pages/files/links.ts re-exports the whole storage table', async () => {
      const { storageStrings } = await import('../pages/files/links');
      expect(storageStrings).toEqual(disk('pages/files/storage/strings.en.json'));
    });
  });

  describe('definePage refuses a missing key', () => {
    const strings = { title: 'T', nav: 'N', cmd: 'C', w: 'W', gt: 'GT', gb: 'GB', count_one: '{{count}} item', count_other: '{{count}} items' } as const;
    const base = { id: 'probe', path: '/probe', title: 'title', layout: 'detail', load: () => Promise.resolve({ default: () => null }), status: 'ready', sensitive: false } as const;
    const ok = {
      ...base,
      strings,
      nav: { group: 'main', order: 1, icon: 'apps', label: 'nav' },
      commands: [{ id: 'c', label: 'cmd' }],
      widgets: [{ id: 'w', title: 'w', load: () => Promise.resolve({ default: () => null }) }],
      guide: [{ id: 'g', title: 'gt', body: 'gb' }],
    } as const;
    const drop = (key: keyof typeof strings) => Object.fromEntries(Object.entries(strings).filter(([k]) => k !== key));
    const define = (m: object) => () => definePage(m as unknown as PageManifest);

    it('accepts the complete manifest', () => {
      expect(define(ok)).not.toThrow();
    });
    it.each([
      ['nav label', 'nav'],
      ['command label', 'cmd'],
      ['widget title', 'w'],
      ['Guide title', 'gt'],
      ['Guide body', 'gb'],
    ] as const)('%s', (_name, key) => {
      expect(define({ ...ok, strings: drop(key) })).toThrow(`string key "${key}" missing`);
    });
    it.each([
      ['nav label', { nav: { ...ok.nav, label: 'count' } }],
      ['command label', { commands: [{ id: 'c', label: 'count' }] }],
      ['widget title', { widgets: [{ ...ok.widgets[0], title: 'count' }] }],
      ['Guide title', { guide: [{ id: 'g', title: 'count', body: 'gb' }] }],
    ] as const)('refuses a plural base for a %s (read without a count)', (_name, part) => {
      expect(define({ ...ok, ...part })).toThrow('string key "count" missing');
    });
    it('navCount may name a plural base, and it reads with its count', () => {
      const m = definePage({ ...ok, navCount: { load: () => Promise.resolve({ default: () => 0 }), label: 'count', tip: 'count' } } as unknown as PageManifest);
      const t = makeT(m.strings) as (k: string, v?: { count: number }) => string;
      expect(t(m.navCount?.label as string, { count: 1 })).toBe('1 item');
      expect(t(m.navCount?.label as string, { count: 3 })).toBe('3 items');
    });
  });
});
