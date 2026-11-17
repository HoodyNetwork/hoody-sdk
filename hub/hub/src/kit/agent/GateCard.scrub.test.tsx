// Vitest: an approval card holding a key, for every tool kind, draws it hidden and every copy button
// copies it hidden, whether the key is written whole or split by what can't be seen. The card sends only its decision: the params are
// never part of what it sends, so the call the daemon runs is the one it asked about.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GateCard, type CardProps, type GateView } from './GateCard';

const KEY = 'sk-live0123456789abcdef';
const read = (t: string): string => t.replace(/[\p{Default_Ignorable_Code_Point}\p{Cc}]/gu, '');
const props = (gate: GateView): CardProps => ({
  gate, pending: false, unknown: false, agentUrl: '', typing: true, onDecide: vi.fn(), onAnswer: vi.fn(), onCheck: vi.fn(),
});
const gates = (k: string): ReadonlyArray<readonly [string, Omit<GateView, 'kind' | 'risk'>]> => [
  ['bash', { tool: 'bash', params: { command: `curl -H "x: ${k}" https://example.com`, cwd: `/tmp/${k}` } }],
  ['bash with a daemon preview', { tool: 'bash', params: { command: `echo ${k}` }, detail: `echo ${k}` }],
  ['write_file', { tool: 'write_file', params: { path: `/home/u/${k}.txt`, content: `token=${k}\n` } }],
  ['edit_file', { tool: 'edit_file', params: { path: '/srv/a.env', old_string: 'TOKEN=', new_string: `TOKEN=${k}` } }],
  ['a tool shown as JSON', { tool: 'read_file', params: { path: '/x', token: k, nested: { [k]: [k] } } }],
  ['a tagged diff detail', { tool: 'mcp_tool', params: {}, detail: `H +1 -0 lines\nA 1 ${k}` }],
  ['a workflow save', { tool: 'upsert_workflow', params: { name: `w ${k}`, definition: { summary: k, entry_point: { id: 's1' }, steps: [
    { id: 's1', type: 'bash', command: `echo ${k}`, input: k, next_steps: [{ id: 's2', execute_if: `[ "$X" = "${k}" ]` }, { id: 'stop' }] },
    { id: 's2', type: 'agent', agent: `a ${k}`, prompt: `use ${k}`, next_steps: [{ id: 'stop' }] },
  ] } } }],
];

afterEach(() => vi.unstubAllGlobals());

describe('a gate card holding a key', () => {
  for (const [why, sep] of [['written whole', ''], ['split by a zero-width space', '\u200b'], ['split by a variation selector', '\ufe0f'], ['split by a control', '\u0007']] as const) {
    const k = `sk-${sep}live0123456789abcdef`;
    for (const [tool, g] of gates(k)) {
      it(`${tool}, a key ${why}: drawn and copied hidden`, async () => {
        const writeText = vi.fn(async () => undefined);
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        const { container, unmount } = render(<GateCard {...props({ kind: 'confirm', risk: '', ...g } as GateView)} />);
        expect(read(container.textContent ?? '')).not.toContain(KEY);
        expect(container.textContent).toContain('[hidden]');
        const copies = screen.queryAllByRole('button', { name: /copy/i });
        for (const b of copies) fireEvent.click(b);
        if (copies.length) await waitFor(() => expect(writeText).toHaveBeenCalledTimes(copies.length));
        for (const [t] of writeText.mock.calls as unknown as [string][]) expect(read(t)).not.toContain(KEY);
        unmount();
      });
    }
  }
  it('a workflow save is drawn step by step, not as its JSON alone', () => {
    const { container } = render(<GateCard {...props({ kind: 'confirm', risk: '', ...(gates(KEY).find(([t]) => t === 'a workflow save')![1]) } as GateView)} />);
    expect(container.textContent).toContain('use');
    expect(read(container.textContent ?? '')).not.toContain(KEY);
  });
  it('an edit replacing one key with another draws a removed and an added row, both hidden', () => {
    const { container } = render(<GateCard {...props({ kind: 'confirm', risk: '', tool: 'edit_file', params: { path: '/a.env', old_string: `TOKEN=${KEY}`, new_string: `TOKEN=${KEY.slice(0, -1)}g` } })} />);
    expect((container.textContent ?? '').split('TOKEN=[hidden]')).toHaveLength(3);
    // The lines as written only decide which rows changed: neither key reaches the text, an attribute (aria label, title) or a copy.
    for (const raw of [KEY.slice(3), `${KEY.slice(3, -1)}g`]) {
      expect(read(container.textContent ?? '')).not.toContain(raw);
      expect(read(container.innerHTML)).not.toContain(raw);
    }
  });
  it('allowing it sends only the decision, never the shown text', () => {
    const p = props({ kind: 'confirm', risk: '', tool: 'bash', params: { command: `echo ${KEY}` } });
    render(<GateCard {...p} />);
    fireEvent.click(screen.getAllByRole('button', { name: /allow/i })[0] as HTMLElement);
    expect(p.onDecide).toHaveBeenCalledTimes(1);
    expect((p.onDecide as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['once']);
  });
});
