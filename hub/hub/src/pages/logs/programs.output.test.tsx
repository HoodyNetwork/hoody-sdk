// Vitest: the Programs source's bar. A port is an identifier, never a grouped number; the program
// picker is the kit ProgramPicker, the user's programs under one heading and the system programs
// under another (105), with the kit's search.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, userEvent, within } from '@app/testing';
import { ProgramOutput } from './parts/ProgramOutput';
import type { ProgramsState } from './controller';
import strings from './strings.en.json';
import type { T } from './parts/words';

const t = ((k: string, v?: Record<string, unknown>) => (strings as Record<string, string>)[k]?.replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v?.[n] ?? '')) ?? k) as unknown as T;

const list: ProgramsState['list'] = [
  { id: '7', name: 'hoody-terminal', range: null, system: true },
  { id: '2', name: 'web', range: { start: 8080, end: 8083 } },
  { id: '9', name: 'hoody-exec', range: null, system: true },
  { id: '1', name: 'api', range: null },
];
const state = (cur: number): ProgramsState => ({ list, current: list[cur]!, snap: { text: 'a\nb\n', at: 0 } });
const props = { t, channel: 'stdout' as const, find: '', onProgram: () => {}, onChannel: () => {}, onPort: () => {}, onRefresh: () => {}, onExplain: () => {} };

describe('Programs bar', () => {
  afterEach(cleanup);
  it('shows the instance port as plain digits, never grouped', () => {
    render(<ProgramOutput {...props} state={state(1)} port={8081} />);
    const box = screen.getByRole('textbox', { name: strings['prog.port'] }) as HTMLInputElement;
    expect(box.value).toBe('8081');
  });
  it('offers the kit picker: your programs under one heading, then the system programs under theirs', async () => {
    render(<ProgramOutput {...props} state={state(1)} port={8080} />);
    expect(screen.queryByRole('combobox', { name: strings['prog.pick'] })).toBeNull();
    const trigger = screen.getByRole('button', { name: new RegExp(` ${strings['prog.pick']}$`) });
    expect(trigger).toHaveTextContent('web');
    await userEvent.click(trigger);
    const panel = await screen.findByRole('dialog', { name: strings['prog.pick'] });
    const groups = within(panel).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([strings['prog.groupYours'], strings['prog.groupSystem']]);
    // The kit panel lists the picked program first in its group, then the rest in the page's order.
    expect(groups.map((g) => within(g).getAllByRole('radio').map((o) => o.textContent))).toEqual([
      ['web' + t('prog.ports' as never, { start: '8080', end: '8083' } as never), 'api'],
      ['hoody-exec', 'hoody-terminal'],
    ]);
  });
});

describe('Program output: Explain says why it is off', () => {
  afterEach(cleanup);
  const explain = () => screen.getByRole('button', { name: strings['act.explain'] });
  it('no output: Explain is off and says this view has no lines to explain', () => {
    render(<ProgramOutput {...props} state={{ list, current: list[3]!, snap: { text: '', at: 0 } }} port={null} />);
    expect(explain().getAttribute('aria-disabled')).toBe('true');
    expect(explain()).toHaveAccessibleDescription(strings['act.explainEmpty']);
  });
  it('output still loading: Explain says the lines are still loading', () => {
    render(<ProgramOutput {...props} state={{ list, current: list[3]!, snap: null }} port={null} />);
    expect(explain()).toHaveAccessibleDescription(strings['act.explainWait']);
  });
  it('with lines: Explain is on, with no reason', () => {
    render(<ProgramOutput {...props} state={state(3)} port={null} />);
    expect(explain()).toBeEnabled();
    expect(explain()).not.toHaveAccessibleDescription();
  });
});

describe('Program output surface', () => {
  const css = readFileSync(join(import.meta.dirname, 'parts/Logs.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel: string) => { const m = css.match(new RegExp(`(^|\\n)${sel.replace(/[.*]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m ? m[2]! : null; };
  // The two themes' tokens, read from kit/tokens.css (light :root first, then the dark block).
  const tokens = readFileSync(join(import.meta.dirname, '../../kit/tokens.css'), 'utf8');
  const dark = tokens.indexOf(':root[data-hx-theme="dark"]');
  const tok = (name: string, from: number) => { const r = new RegExp(`--hx-${name}:\\s*(#[0-9a-f]{3,6});`, 'i').exec(tokens.slice(from)); return r![1]!; };
  const rgb = (h: string) => { const x = h.length === 4 ? h.slice(1).split('').map((c) => c + c).join('') : h.slice(1); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
  const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  const accents = [tok('acc', 0), ...[...tokens.matchAll(/data-hx-hl="[a-z]+"\]\s*\{[^}]*--hx-acc:\s*(#[0-9a-f]{3,6});/gi)].map((x) => x[1]!)];
  const accInk = rgb(tok('acc-ink', 0));
  it('follows the theme like the kit code block, not the always-dark app window', () => {
    const out = rule('.out');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/--hx-app/);
    expect(out).toMatch(/background:\s*var\(--hx-fill\)/);
    expect(out).toMatch(/color:\s*var\(--hx-ink\)/);
    expect(out).toMatch(/border:\s*var\(--bw\) solid var\(--hx-line-2\)/);
  });
  it('shows a selection clearly and keeps its text readable, in both themes', () => {
    const sel = rule('.out ::selection') ?? '';
    const m = sel.match(/background:\s*color-mix\(in srgb, var\(--hx-ink\) (\d+)%, transparent\)/);
    expect(m).not.toBeNull();
    expect(sel).toMatch(/color:\s*var\(--hx-ink\)/);
    const share = Number(m![1]) / 100;
    for (const from of [0, dark]) {
      const ink = rgb(tok('ink', from)), fill = rgb(tok('fill', from));
      const bg = ink.map((v, i) => v * share + fill[i]! * (1 - share));
      expect(ratio(ink, bg)).toBeGreaterThanOrEqual(4.5); // the selected text stays readable
      expect(ratio(bg, fill)).toBeGreaterThanOrEqual(1.4); // the selection stands out from the output
    }
  });
  // The accent alone is nearly the light output fill (chalk is white, yellow close), and the
  // page's selection tint over it changes nothing in dark. A ring of the accent ink and a selected fill of its own.
  it('shows a find match with every highlight colour in both themes, and a selected one differs from the rest', () => {
    const mark = rule('.mark') ?? '';
    expect(mark).toMatch(/background:\s*var\(--hx-acc\);/);
    expect(mark).toMatch(/color:\s*var\(--hx-acc-ink\);/);
    const ring = mark.match(/box-shadow:\s*inset 0 0 0 1px color-mix\(in srgb, var\(--hx-acc-ink\) (\d+)%, var\(--hx-acc\)\);/);
    const selected = rule('.out .mark::selection') ?? '';
    expect(selected).toMatch(/color:\s*var\(--hx-acc-ink\);/);
    const pick = selected.match(/background:\s*color-mix\(in srgb, var\(--hx-acc-ink\) (\d+)%, var\(--hx-acc\)\);/);
    expect(ring).not.toBeNull();
    expect(pick).not.toBeNull();
    expect(accents.length).toBeGreaterThanOrEqual(6);
    for (const from of [0, dark]) {
      const fill = rgb(tok('fill', from));
      for (const a of accents) {
        const acc = rgb(a);
        const mix = (share: number) => accInk.map((v, i) => v * share + acc[i]! * (1 - share));
        const [ringRgb, pickRgb] = [mix(Number(ring![1]) / 100), mix(Number(pick![1]) / 100)];
        // The match's edge against the output: its ring, or its fill where that is the stronger (3:1, non-text).
        expect(Math.max(ratio(ringRgb, fill), ratio(acc, fill)), `${a} edge`).toBeGreaterThanOrEqual(3);
        // Selected, it looks different from an unselected match, and both keep their text readable.
        expect(ratio(pickRgb, acc), `${a} selected`).toBeGreaterThanOrEqual(1.4);
        expect(ratio(accInk, pickRgb), `${a} selected text`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(accInk, acc), `${a} text`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
