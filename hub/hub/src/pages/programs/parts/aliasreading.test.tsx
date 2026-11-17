// The Ports panel's "Reading this computer's aliases" line belongs to Create alias: it shows only while the alias read
// is out AND Create alias is offered (the person's own program, and the page can open the alias drawer). A Hub with no
// alias drawer (no Computers link, or no computer handle yet) says nothing about aliases.
import { describe, expect, it, vi } from 'vitest';
import { bootFixtureCore, queryClient } from '@core';
import { render, screen } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness (fixture core render, query provider), not page code
import { QueryClientProvider } from '@tanstack/react-query';
import type * as Nav from '@kit/nav';
import type { Row as ProgramRow } from '../logic';
import { Detail, type DetailProps } from './Detail';
import strings from '../strings.en.json';

// The table's URL state needs a router this harness does not mount; the parts table reads none of it.
vi.mock('@kit/nav', async (orig) => ({ ...(await orig<typeof Nav>()), useSearchParam: () => [undefined, () => undefined], useGo: () => () => undefined }));

const can = { start: true, stop: true, restart: true, boot: false, portStart: false };
const row: ProgramRow = {
  key: 'prog:3', id: '3', scope: 'yours', name: 'web', kit: null, state: 'running', exitCode: null, enabled: true, lazy: false, boot: true, policy: null,
  up: 60, port: 3000, range: null, partsUp: 1, stop: null, ends: null, known: true, attention: false, bucket: 0, can, parts: [],
};

function show(over: Partial<DetailProps>) {
  bootFixtureCore();
  queryClient.clear();
  const p: DetailProps = { row, op: undefined, confirm: null, onAct: vi.fn(), onConfirm: () => {}, onCancelConfirm: () => {}, onCheck: () => {}, onDismiss: async () => false, onLogs: vi.fn(), aliasesLoading: true, ...over };
  render(
    <QueryClientProvider client={queryClient}>
      <Detail {...p} />
    </QueryClientProvider>,
  );
}

describe('the alias read line follows Create alias', () => {
  it('shows while the read is out and Create alias is offered', async () => {
    show({ onAlias: vi.fn() });
    expect(await screen.findByText(strings['address.aliasesReading'])).toBeInTheDocument();
  });

  it('says nothing while the page cannot open the alias drawer (no onAlias)', async () => {
    show({});
    await screen.findByRole('table', { name: 'Ports of web' });
    expect(screen.queryByText(strings['address.aliasesReading'])).toBeNull();
  });

  it('says nothing on a system program (no offer), even with the drawer', async () => {
    show({ row: { ...row, scope: 'system' }, onAlias: vi.fn() });
    await screen.findByRole('table', { name: 'Ports of web' });
    expect(screen.queryByText(strings['address.aliasesReading'])).toBeNull();
  });
});
