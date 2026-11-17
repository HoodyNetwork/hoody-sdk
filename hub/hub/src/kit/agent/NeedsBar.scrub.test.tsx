// needsbar-scrub: the "Waiting for you" bar and the Details panel name a waiting gate. They hide a key
// or token the way the card does, so neither one shows a key that the card shows as [hidden].
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConvHeader } from './ConvHeader';
import { DetailsPanel } from './DetailsPanel';
import { NeedsBar, needsWhat } from './NeedsBar';
import type { ConvMeta, ConvSnapshot, GateEntry } from './source';
import type { GateView } from './GateCard';
import type strings from './NeedsBar.strings.en.json';

const KEY = 'sk-live0123456789abcdefghij';
const t = ((k: keyof typeof strings, v?: Record<string, string>) => (v?.what !== undefined ? `${k}:${v.what}` : k)) as unknown as Parameters<typeof needsWhat>[1];
const entry = (gate: GateView, more: Partial<GateEntry> = {}): GateEntry => ({
  key: 'g1', ref: { id: 'g1' } as unknown as GateEntry['ref'], gate, helper: false, addressing: false, held: null, decision: null, ...more,
});
const bash = (command: string): GateView => ({ kind: 'confirm', risk: '', tool: 'bash', params: { command } });

describe('needsWhat hides keys, as the card does', () => {
  it('a bash command with a bearer key names the command with the key hidden', () => {
    const w = needsWhat(entry(bash(`curl -H "Authorization: Bearer ${KEY}" https://e.example`)), t);
    expect(w).not.toContain(KEY);
    expect(w).toContain('[hidden]');
  });
  it('a path and a question with a key are hidden too', () => {
    const p = needsWhat(entry({ kind: 'confirm', risk: '', tool: 'write_file', params: { path: `/tmp/${KEY}`, content: 'x' } }), t);
    expect(p).not.toContain(KEY);
    const q = needsWhat(entry({ kind: 'question', question: `paste ${KEY} here?` } as GateView), t);
    expect(q).not.toContain(KEY);
    expect(q).toContain('[hidden]');
  });
  it('plain text is named as it was', () => {
    expect(needsWhat(entry(bash('ls -la')), t)).toBe('needs.approve:ls -la');
  });
});

describe('the bar and the Details panel', () => {
  it('the bar never shows the key', () => {
    const { container } = render(<NeedsBar gates={[entry(bash(`curl -H "Authorization: Bearer ${KEY}" https://e.example`))]} onShow={() => {}} />);
    expect(container.textContent).not.toContain(KEY);
  });
  it('Details hides a key in the command and in a helper name', () => {
    const g = entry(bash(`echo ${KEY}`), { helper: true, helperName: `helper-${KEY}` });
    const snapshot = { facts: {}, title: 't', blocks: [], gates: [g], meta: { computer: 'atlas', realm: 'Work', status: 'idle' }, edits: [] } as unknown as ConvSnapshot;
    const { container } = render(<DetailsPanel snapshot={snapshot} tab="activity" onTab={() => {}} onClose={() => {}} />);
    expect(container.textContent).toContain('helper-');
    expect(container.textContent).not.toContain(KEY);
  });
});

// The order matters. The key below starts so near the bound that a cut made first would leave its first 11
// characters, too few for the key pattern; and a control right before a key is taken out by cleaning, gluing the key to the word
// before it, where no key can start. Scrubbing first hides both. FRAG is any piece of the key's body.
const FRAG = /sk-li|live0|0123456/;
// Padded with 'a ' to end with a space at bound - 11, so the key starts a word there.
const nearBound = (bound: number, lead: string) => {
  const n = bound - 11 - lead.length;
  return lead + (n % 2 ? ' ' : '') + 'a '.repeat(Math.floor(n / 2));
};
describe('the scrub runs before the cut and before cleaning', () => {
  it('a key crossing the 140 bound of a command shows no piece of it, the text before it and [hidden] stay', () => {
    const lead = nearBound(140, 'echo a');
    expect(lead.length).toBe(129);
    const w = needsWhat(entry(bash(`${lead}${KEY} done`)), t);
    expect(w).not.toMatch(FRAG);
    expect(w).toContain(`needs.approve:${lead}[hidden]`);
  });
  it('a key crossing the 140 bound of a question shows no piece of it', () => {
    const lead = nearBound(140, 'paste a');
    expect(lead.length).toBe(129);
    const q = needsWhat(entry({ kind: 'question', question: `${lead}${KEY} here?` } as GateView), t);
    expect(q).not.toMatch(FRAG);
    expect(q).toContain(`${lead}[hidden]`);
  });
  it('a key glued to the word before it by a control, in a command and a question, is hidden', () => {
    const w = needsWhat(entry(bash(`echo note\u0007${KEY}`)), t);
    expect(w).not.toMatch(FRAG);
    expect(w).toContain('[hidden]');
    const q = needsWhat(entry({ kind: 'question', question: `note\u0007${KEY}?` } as GateView), t);
    expect(q).not.toMatch(FRAG);
    expect(q).toContain('[hidden]');
  });
  it('the bar shows a key crossing the bound as [hidden], no piece of it', () => {
    const lead = nearBound(140, 'echo a');
    const { container } = render(<NeedsBar gates={[entry(bash(`${lead}${KEY}`))]} onShow={() => {}} />);
    expect(container.textContent).not.toMatch(FRAG);
    expect(container.textContent).toContain(`${lead}[hidden]`);
  });
  it('Details shows a helper name with a key crossing the 80 bound, and a glued key in the command, as [hidden]', () => {
    const lead = nearBound(80, 'helper-b');
    expect(lead.length).toBe(69);
    const g = entry(bash(`echo note\u0007${KEY}`), { helper: true, helperName: `${lead}${KEY}` });
    const snapshot = { facts: {}, title: 't', blocks: [], gates: [g], meta: { computer: 'atlas', realm: 'Work', status: 'idle' }, edits: [] } as unknown as ConvSnapshot;
    const { container } = render(<DetailsPanel snapshot={snapshot} tab="activity" onTab={() => {}} onClose={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(FRAG);
    expect(text).toContain(`${lead}[hidden]`);
    expect(text).toContain('note[hidden]');
  });
});

// Both hazards on every input needsWhat reads (command, path, file_path, question), in the function, the rendered
// bar and the rendered Details row; and the glued key in a helper name.
const GLUED = `note\u0007${KEY}`;
const kinds: [string, (text: string) => GateView][] = [
  ['command', (x) => bash(x)],
  ['path', (x) => ({ kind: 'confirm', risk: '', tool: 'write_file', params: { path: x, content: 'c' } })],
  ['file_path', (x) => ({ kind: 'confirm', risk: '', tool: 'edit_file', params: { file_path: x } })],
  ['question', (x) => ({ kind: 'question', question: x }) as GateView],
];
const detailsText = (g: GateEntry): string => {
  const snapshot = { facts: {}, title: 't', blocks: [], gates: [g], meta: { computer: 'atlas', realm: 'Work', status: 'idle' }, edits: [] } as unknown as ConvSnapshot;
  return render(<DetailsPanel snapshot={snapshot} tab="activity" onTab={() => {}} onClose={() => {}} />).container.textContent ?? '';
};
describe.each(kinds)('every input needsWhat reads: %s', (_name, make) => {
  const lead = nearBound(140, 'see a');
  const cases: [string, string, string][] = [['crossing the 140 bound', `${lead}${KEY} end`, `${lead}[hidden]`], ['glued by a control', GLUED, 'note[hidden]']];
  it.each(cases)('a key %s is hidden in needsWhat, the bar and Details', (_c, input, shown) => {
    const g = entry(make(input));
    const w = needsWhat(g, t);
    expect(w).not.toMatch(FRAG);
    expect(w).toContain(shown);
    const bar = render(<NeedsBar gates={[g]} onShow={() => {}} />).container.textContent ?? '';
    expect(bar).not.toMatch(FRAG);
    expect(bar).toContain(shown);
    const det = detailsText(g);
    expect(det).not.toMatch(FRAG);
    expect(det).toContain(shown);
  });
});
it('Details hides a key glued to the word before it by a control in a helper name', () => {
  const det = detailsText(entry(bash('ls'), { helper: true, helperName: `helper ${GLUED}` }));
  expect(det).not.toMatch(FRAG);
  expect(det).toContain('helper note[hidden]');
});

// L1, a key glued by ESC, CSI (U+009B) or NEL (U+0085) shows as [hidden], never
// as the marker's tail a reader leaves after eating `ESC [ h`; the first of a batch of questions is hidden too; and L4,
// "Where it runs" in Details and the conversation header hide a key in every field, title included.
describe('escape glue, a batch question, and where it runs', () => {
  it.each([['ESC', '\u001b'], ['CSI', '\u009b'], ['NEL', '\u0085']])('a key glued by %s shows as note[hidden], in the bar and Details', (_n, glue) => {
    for (const make of [(x: string) => bash(`echo note${x}`), (x: string) => ({ kind: 'question', question: `note${x}` }) as GateView]) {
      const g = entry(make(`${glue}${KEY} end`), { helper: true, helperName: `helper note${glue}${KEY}` });
      const w = needsWhat(g, t);
      expect(w).not.toMatch(FRAG);
      expect(w).toContain('note[hidden] end');
      const bar = render(<NeedsBar gates={[g]} onShow={() => {}} />).container.textContent ?? '';
      expect(bar).toContain('note[hidden] end');
      const det = detailsText(g);
      expect(det).not.toMatch(FRAG);
      for (const x of [w, bar, det]) expect(x.split('[hidden]').join(''), 'no tail of the marker').not.toContain('idden]');
      expect(det).toContain('helper note[hidden]');
    }
  });
  it('the first of a batch of questions is named with its key hidden', () => {
    const lead = nearBound(140, 'pick a');
    const g = entry({ kind: 'question', question: '', questions: [{ id: 'q', question: `${lead}${KEY} x`, options: [] }, { id: 'r', question: 'later', options: [] }] } as unknown as GateView);
    const w = needsWhat(g, t);
    expect(w).not.toMatch(FRAG);
    expect(w).toContain(`${lead}[hidden]`);
  });
  const meta: ConvMeta = { computer: `box ${KEY}`, realm: `realm ${KEY}`, folder: `/srv/a\u0007${KEY}/x`, agent: `agent ${KEY}`, model: `model ${KEY}`, status: 'idle' };
  it('Details "Where it runs" hides a key in the computer, realm, folder, agent and model', () => {
    const snapshot = { facts: {}, title: 't', blocks: [], gates: [], meta, edits: [] } as unknown as ConvSnapshot;
    const det = render(<DetailsPanel snapshot={snapshot} tab="activity" onTab={() => {}} onClose={() => {}} />).container.textContent ?? '';
    expect(det).not.toMatch(FRAG);
    for (const x of ['box [hidden]', 'realm [hidden]', '/srv/a[hidden]/x', 'agent [hidden]', 'model [hidden]']) expect(det).toContain(x);
  });
  it('the conversation header hides a key in its title and where it runs', () => {
    const head = render(<ConvHeader size="l" title={`fix ${KEY} now`} meta={meta} detailsOpen={false} onDetails={() => {}} />).container.textContent ?? '';
    expect(head).not.toMatch(FRAG);
    for (const x of ['fix [hidden] now', 'box [hidden]', 'realm [hidden]', '/srv/a[hidden]/x', 'agent [hidden]', 'model [hidden]']) expect(head).toContain(x);
  });
});
