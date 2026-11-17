// The Bots fallback rows and the words around the chooser. The rows are built in one pass
// over the page's models (a computer may list thousands; this runs while the drawer renders), and every name shown is a
// public name: a Hoody AI model shows a name only in Hoody's own form, and one with no name to show reads "A model",
// never the raw spec.
import { describe, expect, it } from 'vitest';
import type { ModelRow } from './data';
import strings from './strings.en.json';
import { fallbackOf, labelOf, whyText } from './model-adapters';

const NAMES = { free: 'Hoody Free', any: 'A model' };
const row = (spec: string, label: string): ModelRow => ({ spec, label, provider: spec.split('/')[0] ?? '', providerLabel: '', source: 'provider', ready: 'unknown', computerDefault: false });

/** The page's rows behind a proxy that counts each row read. */
function counted(rows: ModelRow[]): { models: readonly ModelRow[]; reads: () => number } {
  let n = 0;
  const models = new Proxy(rows, {
    get(t, k, r) {
      if (typeof k === 'string' && /^\d+$/.test(k)) n++;
      return Reflect.get(t, k, r) as unknown;
    },
  });
  return { models, reads: () => n };
}

describe('Bots fallback rows', () => {
  it('are built in one pass: 7,078 rows read a bounded number of times each, whatever is held', () => {
    const rows = Array.from({ length: 7078 }, (_, i) => row(`p${i % 40}/m-${i}`, `Model ${i}`));
    for (const value of ['', 'p0/m-7000', 'zz/not-listed']) {
      const c = counted(rows);
      const fb = fallbackOf(c.models, value, NAMES);
      expect(c.reads(), `reads with value '${value}'`).toBeLessThanOrEqual(3 * rows.length);
      expect(fb.rows.length).toBe(rows.length + 1 + (value === 'zz/not-listed' ? 1 : 0));
    }
  });

  it('keep the first row for a spec, Hoody Free first, the held value last, each once', () => {
    const fb = fallbackOf([row('acme/a', 'First'), row('acme/a', 'Second'), row('hoody-ai/hoody-free', '')], 'acme/held', NAMES);
    expect(fb.rows).toEqual([
      { spec: 'hoody-ai/hoody-free', label: 'Hoody Free' },
      { spec: 'acme/a', label: 'First' },
      { spec: 'acme/held', label: 'acme/held' },
    ]);
    expect(fb.specs).toEqual(['hoody-ai/hoody-free', 'acme/a', 'acme/held']);
  });

  it('use public names: a Hoody AI model not in Hoody\'s own form reads "A model", another provider\'s name is kept', () => {
    const models = [row('hoody-ai/up-widget', 'Upstream: Widget'), row('hoody-ai/upstream', 'Upstream'), row('hoody-ai/hoody-fast', 'Hoody Fast'), row('acme/gizmo', 'Upstream: Gizmo')];
    const fb = fallbackOf(models, 'hoody-ai/upstream', NAMES);
    const label = (spec: string) => fb.rows.find((r) => r.spec === spec)?.label;
    expect(label('hoody-ai/up-widget')).toBe('A model');
    expect(label('hoody-ai/upstream')).toBe('A model');
    expect(label('hoody-ai/hoody-fast')).toBe('Hoody Fast');
    expect(label('acme/gizmo')).toBe('Upstream: Gizmo');
    expect(fb.rows.map((r) => r.label).join(' ')).not.toMatch(/hoody-ai\//);
  });
});

describe('labelOf (the words around the chooser)', () => {
  it('names a model by its public name, never by a raw Hoody AI spec', () => {
    const models = [row('hoody-ai/up-widget', 'Upstream: Widget'), row('hoody-ai/upstream', 'Upstream'), row('acme/gizmo', 'Upstream: Gizmo')];
    expect(labelOf('hoody-ai/up-widget', models, NAMES)).toBe('A model');
    expect(labelOf('hoody-ai/upstream', models, NAMES)).toBe('A model');
    expect(labelOf('acme/gizmo', models, NAMES)).toBe('Upstream: Gizmo');
    expect(labelOf('hoody-ai/hoody-free', [], NAMES)).toBe('Hoody Free');
    expect(labelOf('acme/unlisted', [], NAMES)).toBe('acme/unlisted');
    expect(labelOf('hoody-ai/upstream', [], NAMES)).toBe('A model');
    expect(labelOf('hoody-ai/hoody-fast', [], NAMES)).toBe('hoody-fast');
  });
});

describe('whyText: a hidden name in a sentence', () => {
  const t = (k: string, v?: Record<string, string>) => (strings as Record<string, string>)[k]!.replace(/\{\{(\w+)\}\}/g, (_, n: string) => v?.[n] ?? '');
  it('reads "this model" inside and "This model" at the start, a real name unchanged', () => {
    expect(whyText(t, 'needs_consent', 'A model', 'atlas')).toBe("We can't tell yet if this model runs on atlas. Use it anyway, or choose another model.");
    expect(whyText(t, 'needs_setup', 'A model', 'atlas')).toBe('This model needs setup on atlas. Choose it in the list above to set it up.');
    expect(whyText(t, 'needs_setup', 'GPT-5', 'atlas')).toBe('GPT-5 needs setup on atlas. Choose it in the list above to set it up.');
  });
});
