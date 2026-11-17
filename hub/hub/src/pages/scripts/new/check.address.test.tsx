// Vitest: Check it shows where the script will answer in full. The whole address (the computer's script
// program and the route, ids' middles hidden on screen) is text with Copy under "Its address, once it is live": nothing answers
// there before Make it live, so no link opens it here. The computer's name is a link to its page in the Hub, and the Link
// row says what the public link will be. The facts are label and value rows that read from the start (not the spec
// sheet's end-aligned values), each value whole.
import { act, fireEvent, render, screen, within } from '@app/testing';
import { computerHandle, computerHref } from '@core';
import { describe, expect, it, vi } from 'vitest';
import strings from '../strings.en.json';
import { StepCheck, type StepCheckProps } from './StepCheck';

vi.mock('../../../shell/pageLinks', async (orig) => ({ ...(await orig<object>()), usePageLink: () => ({}) }));

const PROJECT = 'be0000000000000000000b01', COMPUTER = 'ce0000000000000000000c01';
const ORIGIN = `https://${PROJECT}-${COMPUTER}-exec-1.live-node-1.computers.example`;

function props(over: Partial<StepCheckProps>): StepCheckProps {
  return {
    way: 'ai', computer: 'atlas', compId: COMPUTER, origin: ORIGIN, description: 'Send me a note', summary: 'Sends a note.', route: '/notes', schedule: null, link: false, taken: false,
    snap: null, check: { check: { k: 'checking' }, holds: false, again: () => undefined } as never, changed: [], code: '', onCode: () => undefined,
    onFix: () => undefined, onBuildAgain: () => undefined, onKeep: () => undefined, codeEdited: false, ...over,
  };
}
const factOf = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('Check it: where it answers, in full', () => {
  it('the whole address is copyable text marked not live yet, and nothing opens it before it is live', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
    const { container } = render(<StepCheck {...props({})} />);
    const text = (container.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('-exec-1.live-node-1.computers.example/notes');
    expect(screen.getByRole('heading', { name: strings['flow.check.address'] })).toBeTruthy();
    expect(container.innerHTML).not.toContain(PROJECT);
    expect(container.innerHTML).not.toContain(COMPUTER);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['address.copyWhat'].replace('{{what}}', strings['new.address']) })); await Promise.resolve(); });
    expect(written).toEqual([`${ORIGIN}/notes`]);
    expect(screen.queryByRole('button', { name: new RegExp(`^${strings['address.open']} \\(`) })).toBeNull();
    expect(container.querySelector('[data-secret-link]')).toBeNull();
    expect(container.querySelector('a[target="_blank"]')).toBeNull();
  });

  it('without the computer\'s origin there is no address block (the route alone is in the At row)', () => {
    const { container } = render(<StepCheck {...props({ origin: '' })} />);
    expect(container.textContent).not.toContain(strings['flow.check.address']);
    expect(factOf(strings['flow.rail.at']).textContent).toBe('/notes');
  });

  it('the computer\'s name is a link to its page in the Hub, by its handle (never the id)', () => {
    render(<StepCheck {...props({})} />);
    const a = within(factOf(strings['flow.rail.on'])).getByRole('link', { name: 'atlas' });
    const href = a.getAttribute('href') ?? '';
    expect(href.endsWith(computerHref(computerHandle({ id: COMPUTER, name: 'atlas' })))).toBe(true);
    expect(href).not.toContain(COMPUTER);
  });

  it('the Link row says what the link will be: its name, and that its address comes once it is made', () => {
    const a = render(<StepCheck {...props({ link: true, linkName: 'quiet-river-k3x9' })} />);
    expect(factOf(strings['flow.rail.link']).textContent).toBe(strings['flow.check.linkWill'].replace('{{name}}', 'quiet-river-k3x9'));
    a.unmount();
    render(<StepCheck {...props({ link: false, linkName: null })} />);
    expect(factOf(strings['flow.rail.link']).textContent).toBe(strings['flow.rail.linkOff']);
  });
});

describe('Check it: the written facts read as rows', () => {
  it('What it does and You asked are label and value rows that read from the start, each value whole', () => {
    const summary = 'Creates a script that accepts an email or free text and returns JSON with exactly the fields name, company, email, phone and request.';
    render(<StepCheck {...props({ summary, description: 'Take an email or any text I send and answer with JSON.' })} />);
    const what = factOf(strings['flow.check.whatItDoes']);
    expect(what.textContent).toBe(summary);
    // The kit's label-and-value grid, not its spec sheet (whose values sit at the row's end).
    expect(what.closest('[class*="spec"]')).toBeNull();
    expect(factOf(strings['flow.check.youAsked']).closest('[class*="spec"]')).toBeNull();
    // A short ask is whole, with no button under it.
    expect(screen.queryByRole('button', { name: strings['flow.check.more'] })).toBeNull();
  });

  it('what the code uses and where it answers are the same rows, and a value that found nothing says so in two words', () => {
    const code = 'export default () => new Response("ok");\n';
    render(<StepCheck {...props({ way: 'write', code, snap: { bytes: code, hash: 'h', project: 'p', compId: 'c', exec: 1 } })} />);
    const files = factOf(strings['flow.uses.files']);
    expect(files.textContent).toBe('None found');
    expect(files.closest('[class*="spec"]')).toBeNull();
    expect(factOf(strings['flow.rail.at']).closest('[class*="spec"]')).toBeNull();
  });
});
