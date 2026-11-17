// "May have gone through" can be dismissed: the inspector's Close on an unknown outcome
// asks first (it may have gone through, and the next press would send a second
// one); only the person's confirmed "forget it" makes core free the held change (key kept) and the row.
import { beforeEach, describe, expect, it } from 'vitest';
import { heldChanges, programLock } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

function webOp() {
  for (const [k, op] of opsStore.snapshot()) if (k.endsWith('|prog:1')) return op;
  return undefined;
}

describe('programs: dismissing an unknown outcome', () => {
  beforeEach(() => opsStore.reset());

  it('Close on "may have gone through" frees the held restart in core and the row', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    expect(heldChanges(programLock.restart)).toHaveLength(1);
    const inspector = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    await userEvent.click(within(inspector).getByRole('button', { name: 'Stop tracking' }));
    const ask = await screen.findByRole('alertdialog', { name: strings['op.dismissTitle'] });
    expect(ask).toHaveTextContent(strings['op.dismissBody']);
    await userEvent.click(within(ask).getByRole('button', { name: strings['op.dismissGo'] }));
    await waitFor(() => expect(webOp()).toBeUndefined());
    expect(heldChanges(programLock.restart)).toHaveLength(0);
  });

  it('Cancel on the warning keeps the held restart and the row (nothing freed without the confirm)', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    const inspector = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    await userEvent.click(within(inspector).getByRole('button', { name: 'Stop tracking' }));
    const ask = await screen.findByRole('alertdialog', { name: strings['op.dismissTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: kitStrings['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(webOp()?.status).toBe('unknown');
    expect(heldChanges(programLock.restart)).toHaveLength(1);
  });
});
