// Vitest: a bound counts what a reader sees. clean() drops
// what it drops before it bounds, and a run of characters that never show cannot use up the bound and hide the text after it, on any
// agent gate card: the question, the confirm detail and every bounded field.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { clean, gateInput, MAX_SHOW } from './code';
import { GateCard, type CardProps, type GateView } from './GateCard';

const props = (gate: GateView): CardProps => ({
  gate, pending: false, unknown: false, agentUrl: '', typing: true, onDecide: vi.fn(), onAnswer: vi.fn(), onCheck: vi.fn(),
});

describe('a bound counts what shows', () => {
  it('a question padded with word joiners still shows its question', () => {
    const q = '\u2060'.repeat(4000) + 'Which database?';
    expect(clean(q, 4000).text).toContain('Which database?');
    const { container } = render(<GateCard {...props({ kind: 'question', risk: '', question: q, options: ['a'] })} />);
    expect(container.textContent).toContain('Which database?');
  });
  it('a confirm detail padded with zero-width spaces still shows its warning', () => {
    // A run of RUN_MAX characters with no space is hidden whole by the scrub (the warning glyph glued to it with it): the words still show.
    const glued = '\u200b'.repeat(MAX_SHOW) + '\u26a0 Deletes production data';
    expect(gateInput({ tool: 'mcp_tool', params: {}, detail: glued })[0]).toEqual({ k: 'rich', text: '[hidden] Deletes production data' });
    // Padding the scrub keeps (lines of zero-width spaces) is dropped by the clean before MAX_SHOW is counted, so it cannot cut the warning off.
    const detail = ('\u200b'.repeat(30000) + '\n').repeat(7) + '\u26a0 Deletes production data';
    expect(gateInput({ tool: 'mcp_tool', params: {}, detail }).map((k) => ('text' in k ? k.text : ''))).toContain('\u26a0 Deletes production data');
    for (const d of [glued, detail]) {
      const { container, unmount } = render(<GateCard {...props({ kind: 'confirm', risk: '', tool: 'mcp_tool', params: {}, detail: d })} />);
      expect(container.textContent).toContain('Deletes production data');
      unmount();
    }
  });
  for (const [why, pad] of [['zero-width joiners', '\u200d'], ['variation selectors', '\ufe0f'], ['tag characters', '\u{e0041}'], ['soft hyphens', '\u00ad']] as const) {
    it(`padding of ${why} cannot hide a bounded field's text`, () => {
      expect(clean(pad.repeat(5000) + 'tail', 300).text).toContain('tail');
      expect(clean(pad.repeat(5000) + 'tail', 300, { code: true }).text).toContain('tail');
      const { container } = render(<GateCard {...props({ kind: 'confirm', risk: pad.repeat(5000) + 'risky', tool: 'bash', params: { command: 'ls' } })} />);
      expect(container.textContent).toContain('risky');
    });
  }
  it('the cut is counted on what shows, and never splits a pair', () => {
    expect(clean('a'.repeat(5000), 4000)).toEqual({ text: 'a'.repeat(4000), cut: 1000 });
    expect(clean('\u0007'.repeat(50) + 'a'.repeat(100), 100)).toEqual({ text: 'a'.repeat(100), cut: 0 });
    expect(clean('a'.repeat(99) + '\u{1f600}x', 100)).toEqual({ text: 'a'.repeat(99), cut: 3 });
    const shown = clean(('x' + '\u2060'.repeat(20)).repeat(400) + 'end', 300).text;
    expect(shown.replace(/\u2060/g, '')).toBe('x'.repeat(300));
    expect(shown.length).toBeLessThanOrEqual(300 * 9);
  });
  it("the cut counts every unit of the cleaned text left out, a run's limit included", () => {
    const r = clean('a'.repeat(200000) + '\ufe0f'.repeat(1000) + 'b', 200000, { code: true });
    expect(r).toEqual({ text: 'a'.repeat(200000) + '\ufe0f'.repeat(8), cut: 993 });
    expect(clean('x' + '\u200d'.repeat(1000), 300)).toEqual({ text: 'x' + '\u200d'.repeat(8), cut: 992 });
  });
  it('a selector or joiner right after the last character shown stays with it', () => {
    expect(clean('\u2764' + '\ufe0f' + 'X', 1)).toEqual({ text: '\u2764' + '\ufe0f', cut: 1 });
  });
  it('what a bounded text keeps of characters that never show is within its bound: at most twice the bound in all', () => {
    const r = clean(('x' + '\u{e0041}'.repeat(8)).repeat(1000), 300);
    expect(r.text.length).toBeLessThanOrEqual(600);
    expect(r.text.replace(/\u{e0041}/gu, '')).toBe('x'.repeat(300));
  });
  it("a key behind padding longer than a field's bound is still hidden: the bound counts shown characters", () => {
    const key = '\u2060'.repeat(60) + 'sk-abcdefghijklmnop';
    const { container } = render(<GateCard {...props({ kind: 'confirm', risk: key, dirs: [key], tool: 'bash', params: { command: 'ls' } })} />);
    expect(container.textContent).not.toContain('abcdefghijklmnop');
    expect(container.textContent).toContain('[hidden]');
    const q = render(<GateCard {...props({ kind: 'question', risk: '', question: 'Which?', options: [key] })} />);
    expect(q.container.textContent).not.toContain('abcdefghijklmnop');
  });
  it('a text within its bound keeps every character it kept before', () => {
    const fam = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467} \u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f} \u2764\ufe0f\u200d\u{1f525}';
    expect(clean(fam, 300).text).toBe(fam);
    expect(clean(fam + 'a'.repeat(400), 300).text.startsWith(fam)).toBe(true);
    expect(clean('\u2060'.repeat(20), 300).text).toBe('\u2060'.repeat(20));
  });
});
