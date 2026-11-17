// Vitest: Check it's spec sheet shows the script's facts as written. The AI's summary,
// an idea's field values, the route and the computer's name are never turned into links or masked (Facts autolinks strings
// only), and the ask's More/Less, which sits under the sheet, is tied to the ask it expands.
import { render, screen, userEvent, within } from '@app/testing';
import { describe, expect, it } from 'vitest';
import strings from '../strings.en.json';
import { StepCheck, type StepCheckProps } from './StepCheck';

const ID = 'c0a7150000000000000000a1';
const URL = 'https://example.com/hook';
const LONG = Array.from({ length: 6 }, (_, i) => `Line ${i + 1} of what I asked for.`).join('\n');

function props(over: Partial<StepCheckProps>): StepCheckProps {
  return {
    way: 'ai', computer: 'atlas', description: 'Send me a note', summary: '', route: '/notes', schedule: null, link: false, taken: false,
    snap: null, check: { check: { k: 'checking' }, holds: false, again: () => undefined } as never, changed: [], code: '', onCode: () => undefined,
    onFix: () => undefined, onBuildAgain: () => undefined, onKeep: () => undefined, codeEdited: false, ...over,
  };
}
const factOf = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('Check it: the facts as written', () => {
  it('a summary and an idea field with an address and an id-shaped value stay text: no link, nothing masked', () => {
    render(<StepCheck {...props({ summary: `Posts to ${URL} for ${ID}`, idea: { title: 'Web form', fields: [{ label: 'Send to', value: URL }, { label: 'Box', value: ID }] } })} />);
    const summary = factOf(strings['flow.check.whatItDoes']);
    expect(summary.textContent).toBe(`Posts to ${URL} for ${ID}`);
    expect(within(summary).queryByRole('link')).toBeNull();
    expect(factOf('Send to').textContent).toBe(URL);
    expect(within(factOf('Send to')).queryByRole('link')).toBeNull();
    expect(factOf('Box').textContent).toBe(ID);
    expect(factOf(strings['flow.rail.at']).textContent).toBe('/notes');
    expect(factOf(strings['flow.rail.on']).textContent).toBe('atlas');
  });

  it('More and Less are tied to the ask they expand, with their state', async () => {
    render(<StepCheck {...props({ description: LONG })} />);
    const ask = factOf(strings['flow.check.youAsked']).firstElementChild as HTMLElement;
    expect(ask.textContent).toBe(LONG);
    const more = screen.getByRole('button', { name: strings['flow.check.more'] });
    expect(more.getAttribute('aria-controls')).toBe(ask.id);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(more);
    const less = screen.getByRole('button', { name: strings['flow.check.less'] });
    expect(less.getAttribute('aria-controls')).toBe(ask.id);
    expect(less.getAttribute('aria-expanded')).toBe('true');
  });

  it('a short ask has no More; a write-way draft shows no ask and no summary', () => {
    const a = render(<StepCheck {...props({})} />);
    expect(screen.queryByRole('button', { name: strings['flow.check.more'] })).toBeNull();
    a.unmount();
    render(<StepCheck {...props({ way: 'write', summary: 'x' })} />);
    expect(screen.queryByText(strings['flow.check.youAsked'], { selector: 'dt' })).toBeNull();
    expect(screen.queryByText(strings['flow.check.whatItDoes'], { selector: 'dt' })).toBeNull();
  });

  it('what the code uses is what the Hub found in it: a capability it did not find is never said to be unused', () => {
    // A package that writes files and calls another address, with no literal address: the Hub's reading finds neither.
    const code = "import axios from 'axios';\nimport { outputFile } from 'fs-extra';\nexport default async () => { const r = await axios.get(process.env.TARGET ?? ''); await outputFile('/tmp/x', String(r.data)); return Response.json({ ok: true }); };\n";
    render(<StepCheck {...props({ way: 'write', code, snap: { bytes: code, hash: 'h', project: 'p', compId: 'c', exec: 1 } })} />);
    for (const label of ['flow.uses.files', 'flow.uses.builtins', 'flow.uses.calls', 'flow.uses.ai'] as const) {
      expect(factOf(strings[label]).textContent).toBe(strings['flow.uses.noneSeen']);
    }
    for (const claim of ['No files', 'No calls to other addresses', 'No AI']) expect(screen.queryByText(claim)).toBeNull();
  });
});
