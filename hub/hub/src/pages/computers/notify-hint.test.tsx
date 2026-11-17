// Vitest: notifications as discovery. A first computer being prepared carries the "computer"
// hint under its "being prepared" line. The hint's own rules are shell/notify/NotifyHint.test.tsx's: here it is a
// marker that records its kind.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const mock = vi.hoisted(() => ({ creating: false }));
// creating: this browser's computer create is out (zero.preparing.test.tsx's positive evidence).
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const sending = core.sendingChanges as (lock: string, o?: unknown) => unknown[];
  return {
    ...core,
    sendingChanges: (lock: string, o?: unknown) => (mock.creating && lock === 'computer.create' ? [{ identity: null, target: null, realm: R1, by: undefined, from: null, here: true, attributed: true }] : sending(lock, o)),
  };
});
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, NotifyHint: ({ kind }: { kind: string }) => <i data-testid="notify-hint" data-kind={kind} /> };
});

const hints = () => screen.queryAllByTestId('notify-hint').map((e) => e.getAttribute('data-kind'));

describe('notification hints', () => {
  it('a first computer being prepared shows the computer hint', async () => {
    mock.creating = true;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByText(strings['zero.provisioning.title'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(hints()).toEqual(['computer']);
    mock.creating = false;
  });

  it('a realm offering Create shows no hint', async () => {
    mock.creating = false;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByRole('button', { name: strings['zero.empty.create'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(hints()).toEqual([]);
  });
});
