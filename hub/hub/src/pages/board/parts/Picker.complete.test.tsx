// Vitest: Board > Add a program says "No program named" (everything was searched) only when every place of the
// computer answered in full. A failed Bots read, or a ports or scripts list longer than what is shown, scopes the
// sentence to the places that answered.
import { answers, botsListRoute, bootFixtureCore, CoreQueryProvider, reply } from '@core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Kit from '@kit';
import type { BoardComputer } from '../computers';
import type * as Extras from '../extras';
import { Picker } from './Picker';
import strings from '../strings.en.json';

// The Picker, about its own lists: the apps launcher is a stand-in whose search found nothing for the words, in full.
vi.mock('../../apps/links', async (orig) => {
  const { useEffect } = await import('react');
  type Counts = { apps: number; recent: number; ready: number | null; outcome: string; q: string };
  const AppLauncher = ({ q = '', cards }: { q?: string; cards?: { onCounts: (c: Counts) => void } }) => {
    const report = cards?.onCounts;
    useEffect(() => report?.({ apps: 0, recent: 0, ready: null, outcome: 'none', q }), [report, q]);
    return null;
  };
  return { ...(await orig<object>()), loadLauncher: () => Promise.resolve({ AppLauncher }) };
});
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  const View = () => null;
  return { ...kit, useContributions: () => ({ widgets: [], guideTopics: [], tileViews: [{ pageId: 'bots', id: 'bot', title: 'Bot', Component: View, href: '/bots' }] }) };
});
// How the computer's ports and scripts read: answered in full, or with more entries than are shown.
const X = vi.hoisted(() => ({ read: 'done' as string }));
vi.mock('../extras', async (orig) => {
  const real = await orig<typeof Extras>();
  return { ...real, useComputerExtras: (c: BoardComputer | null) => {
      const r = real.useComputerExtras(c);
      return c ? { ports: [], scripts: [], read: X.read } : r;
    },
  };
});

const S = strings as Record<string, string>;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const pc = (id: string, name: string) => ({ id, name, project_id: 'p1', server_name: 'n12', status: 'running' }) as BoardComputer;
const boot = (status: number) =>
  bootFixtureCore({ rules: [reply(botsListRoute, () => (status === 200 ? answers.ok({ items: [] }) : { status, body: {} }))] });

async function search(words: string) {
  const user = userEvent.setup();
  render(
    <CoreQueryProvider>
      <Picker computers={[pc('c1', 'atlas')]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} />
    </CoreQueryProvider>,
  );
  await user.click(screen.getByRole('row', { name: /atlas/ }));
  await user.type(await screen.findByRole('searchbox'), words);
}
const none = (q: string) => fill(S['browse.none']!, { q });
const incomplete = (q: string) => fill(S['browse.noneIncomplete']!, { q });

afterEach(() => { cleanup(); X.read = 'done'; });

describe('Add a program: "No program named" only after every place answered in full', () => {
  it('a failed Bots read scopes the sentence to the places that answered', async () => {
    boot(500);
    await search('zzqx');
    expect(await screen.findByText(incomplete('zzqx'), {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(none('zzqx'))).toBeNull();
  });

  it('a ports or scripts list longer than what is shown scopes the sentence too', async () => {
    boot(200);
    X.read = 'partial';
    await search('zzqx');
    expect(await screen.findByText(incomplete('zzqx'), {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(none('zzqx'))).toBeNull();
  });

  it('every place answered in full: "No program named"', async () => {
    boot(200);
    await search('zzqx');
    expect(await screen.findByText(none('zzqx'), {}, { timeout: 4000 })).toBeInTheDocument();
  });
});
