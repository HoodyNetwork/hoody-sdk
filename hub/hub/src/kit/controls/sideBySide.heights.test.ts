// Controls that sit side by side share one height, by the kit's own rules: a small worded button among a page header's
// actions is drawn at the header height, and a folder-tab switch in a toolbar is as tall as the toolbar's controls.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const KIT = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(KIT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The declarations of the first rule whose selector list is exactly `sel`. */
function rule(css: string, sel: string): Record<string, string> {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule ${sel}`);
  return Object.fromEntries(m[1]!.split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d.length === 2 && d[0]));
}

describe('a page header\'s actions', () => {
  const head = read('layouts/PageHeader.module.css');

  it('a worded button among them takes the header height and cut, whatever size it asked for', () => {
    expect(rule(head, '.actions > :is(button, a)[data-variant][data-words]')).toEqual({ '--plate-h': 'var(--btn-h)', '--plate-cut': 'var(--btn-cut)' });
    expect(rule(read('tokens.css'), ':root')['--btn-h']).toBe('32px');
  });

  it('sets the plate\'s own properties only: the Button keeps its touch floor and draws the height itself', () => {
    const body = /\.actions > :is\(button, a\)\[data-variant\]\[data-words\]\s*\{([^}]*)\}/.exec(head)![1]!;
    expect(body).not.toMatch(/(^|[\s;])(min-)?(height|block-size)\s*:/);
  });
});

describe('a folder-tab switch in a toolbar', () => {
  const seg = read('controls/SegmentedControl.module.css');

  it('is as tall as the toolbar\'s controls, never shorter than a tab strip', () => {
    expect(rule(seg, '[data-tb-size] .folder')).toEqual({ height: 'max(var(--tb-ctl-h), var(--tabs-h))' });
    // After the variant's own height, and heavier than it.
    expect(seg.indexOf('[data-tb-size] .folder')).toBeGreaterThan(seg.indexOf('.folder {'));
    expect(rule(seg, '.folder').height).toBe('var(--tabs-h)');
  });

  it('every option fills the strip, so the taller strip needs no option rule', () => {
    expect(rule(seg, '.folder')['align-items']).toBe('stretch');
    expect(rule(seg, '.folder .segment').height).toBe('auto');
  });
});
