// Vitest: notifications as discovery. A Bot waiting for the person carries the "bot" hint with
// its pinned card (a browser alert can tell when a Bot needs you); a Bot with nothing waiting has none. The hint's own
// rules are shell/notify/NotifyHint.test.tsx's: here it is a marker that records its kind.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import K from '@kit/agent/Conversation.strings.en.json';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, NotifyHint: ({ kind }: { kind: string }) => <i data-testid="notify-hint" data-kind={kind} /> };
});

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state: string) => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
const hints = () => screen.queryAllByTestId('notify-hint').map((e) => e.getAttribute('data-kind'));

describe('notification hints', () => {
  it('a Bot waiting for an approval shows the bot hint with its pinned card', async () => {
    await open('waitingApprove');
    expect(await screen.findByRole('region', { name: K['agent.needsApproval'] })).toBeInTheDocument();
    expect(hints()).toEqual(['bot']);
  });

  it('a Bot with nothing waiting shows no hint', async () => {
    await open('idle');
    await screen.findByRole('tab', { name: strings['tab.activity'] });
    expect(hints()).toEqual([]);
  });
});
