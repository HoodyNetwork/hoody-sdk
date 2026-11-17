// The Verdict `state` tone. The ink plate is a CutFrame (the kit's cut corner, its edge in --hx-verdict-edge),
// still one group named by its label; calm stays the plain light plate; a state plate takes no slot or facts.
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Link } from '../controls/Link';
import { Verdict, VerdictMark } from './Verdict';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));

describe('Verdict tone="state"', () => {
  it('is a CutFrame named by its label, the plate inside it; the mark, count, next line and segments are the same as calm', () => {
    render(
      <Verdict tone="state" label="Is it online" count="1 of 5" segments={['blocking', 'done', 'todo', 'todo', 'optional']} next="Next: paste a new token.">
        It is offline: Telegram <VerdictMark tone="danger">refused the token</VerdictMark>.
      </Verdict>,
    );
    const g = screen.getByRole('group', { name: 'Is it online' });
    expect(g.className).toMatch(/stateFrame/);
    expect(g.className).not.toMatch(/tone_calm/);
    const plate = g.firstElementChild as HTMLElement;
    expect(plate.className).toMatch(/tone_state/);
    expect(plate.className).toMatch(/verdict/);
    expect(within(g).getByText('refused the token').tagName).toBe('STRONG');
    expect(within(g).getByText('1 of 5')).toBeTruthy();
    expect(within(g).getByText('Next: paste a new token.')).toBeTruthy();
    expect([...g.querySelectorAll('[data-segment]')].map((x) => x.getAttribute('data-segment'))).toEqual(['blocking', 'done', 'todo', 'todo', 'optional']);
  });

  it('calm (the default) is still the plain light plate: no CutFrame', () => {
    render(<Verdict label="What you get">A link to port 8080.</Verdict>);
    const g = screen.getByRole('group', { name: 'What you get' });
    expect(g.className).toMatch(/tone_calm/);
    expect(g.className).not.toMatch(/stateFrame/);
  });

  it('a state plate takes no slot or facts (the type refuses them)', () => {
    // @ts-expect-error a state plate holds no kit parts: they read the page's text tokens, which a dark plate cannot carry
    const bad = <Verdict tone="state" label="x" facts={<span />}>y</Verdict>;
    expect(bad).toBeTruthy();
  });

  it('a link in the sentence or the next line is drawn in the plate ink and underlined, never the page link blue', () => {
    render(
      <Verdict tone="state" label="Is it online" next={<Link href="https://t.me/BotFather">Open @BotFather</Link>}>
        Offline: <a href="#token">the token</a> was refused.
      </Verdict>,
    );
    const g = screen.getByRole('group', { name: 'Is it online' });
    expect(within(g).getByRole('link', { name: 'Open @BotFather' }).tagName).toBe('A');
    expect(within(g).getByRole('link', { name: 'the token' }).tagName).toBe('A');
    const c = readFileSync(join(here, 'Verdict.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const m = /\.tone_state \.sentence a,\s*\.tone_state \.next a\s*\{([^}]*)\}/.exec(c);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/color:\s*var\(--hx-verdict-ink\);/);
    expect(m![1]).toMatch(/text-decoration:\s*underline;/);
    // (0,2,1) beats every Link variant's colour rule, (0,1,0) or (0,2,0) with a state attribute.
    const link = readFileSync(join(here, '../controls/Link.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const r of link.matchAll(/([^{}]+)\{[^}]*\bcolor:/g)) for (const sel of r[1]!.split(',')) expect(sel.trim().split(/[\s>+~]+/).length, sel).toBeLessThanOrEqual(1);
  });

  it('every colour on the state plate is a --hx-verdict-* tint or a fill swatch; its CutFrame edge names --hx-verdict-edge', () => {
    const c = readFileSync(join(here, 'Verdict.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const state = c.slice(c.indexOf('.stateFrame'));
    expect(state).toMatch(/\.stateFrame\s*\{\s*--cut-edge:\s*var\(--hx-verdict-edge\);/);
    const used = [...state.matchAll(/var\((--hx-[\w-]+)\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(0);
    for (const t of used) expect(t, t).toMatch(/^--hx-(verdict-|warn-fill$|danger-fill$)/);
    const frame = readFileSync(join(here, '../layouts/CutFrame.module.css'), 'utf8');
    expect(frame).toMatch(/color:\s*var\(--cut-edge,\s*var\(--hx-panel-line\)\)/);
  });
});
