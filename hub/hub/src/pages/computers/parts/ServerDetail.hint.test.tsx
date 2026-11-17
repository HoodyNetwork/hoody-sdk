// Vitest: notifications as discovery. A rented server's billing facts carry the "rental" hint
// (a notice comes before the rental ends); a free server, with nothing to renew, has none. The hint's own rules are
// shell/notify/NotifyHint.test.tsx's: here it is a marker that records its kind.
// eslint-disable-next-line no-restricted-imports -- a test harness for the component, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@core/query';
import { boot, onFetch, settle } from '@core/test/env';
import type { Computer, Server } from '../types';
import { ServerDetailBody } from './ServerDetail';
import detail from './ServerDetail.strings.en.json';
import strings from '../strings.en.json';

vi.mock('./useOut', () => ({
  useOut: () => ({ billing: () => undefined, plans: () => undefined, has: { billing: true, buy: true }, market: () => undefined, guide: () => undefined, sshKeys: () => undefined, logsOf: () => undefined }),
}));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, NotifyHint: ({ kind }: { kind: string }) => <i data-testid="notify-hint" data-kind={kind} /> };
});

const SID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const row = (o: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  status: 'active',
  rental_end: '2026-12-01T00:00:00.000Z',
  amount: '70.00',
  remaining_days: 38,
  server_id: SID,
  is_free_tier: false,
  server: { id: SID, name: 'node-7', country: 'SG', city: 'Singapore', datacenter: 'SIN-DC1', kvm_supported: false, specs: {} },
  ...o,
});
const server: Server = { id: SID, name: 'node-7', place: 'Singapore', cc: 'SG', cpu: null, ram: null, disk: null, free: false, days: 38, status: 'active', cap: null };
const computers: Computer[] = [];
const hints = () => screen.queryAllByTestId('notify-hint').map((e) => e.getAttribute('data-kind'));
const mount = async (el: React.ReactElement) => {
  render(<QueryClientProvider client={queryClient}>{el}</QueryClientProvider>);
  await act(async () => {
    for (let i = 0; i < 20; i++) await settle();
  });
};

beforeEach(() => {
  boot();
  queryClient.clear();
});

describe('notification hints', () => {
  it('a rented server shows the rental hint with its billing facts', async () => {
    onFetch(() => ({ status: 200, body: { data: [row()] } }));
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    await screen.findByText(strings['srv.paid']);
    expect(hints()).toEqual(['rental']);
  });

  it('a free server has nothing to renew and shows no hint', async () => {
    onFetch(() => ({ status: 200, body: { data: [row({ is_free_tier: true, rental_end: '2099-01-01T00:00:00.000Z', remaining_days: 99999 })] } }));
    await mount(<ServerDetailBody server={{ ...server, free: true, days: null }} computers={computers} subs={[]} />);
    expect(await screen.findByText(detail['sd.freeNoRenew'])).toBeInTheDocument();
    expect(hints()).toEqual([]);
  });
});
