// Every Check path tells core what it proved about the held press (C9): a proof that it applied completes
// the change (lock and key go: the next press is a new request), a failed receipt discards it (the next press
// gets a fresh key), and no proof keeps it held, each naming the send the row showed (its hold token). A Check
// that told core nothing would wedge the row.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import * as data from './data';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof data>();
  return { ...real, completePress: vi.fn(real.completePress), discardPress: vi.fn(real.discardPress), dismissPress: vi.fn(real.dismissPress), readOverview: vi.fn(real.readOverview) };
});

function webOp() {
  for (const [k, op] of opsStore.snapshot()) if (k.endsWith('|prog:1')) return op;
  return undefined;
}

async function pressPending(state: string, name: string) {
  await renderPage(page, { state, path: '/programs?sel=prog%3A1' });
  await userEvent.click((await screen.findAllByRole('button', { name }))[0] as HTMLElement);
  await waitFor(() => expect(webOp()?.status).toBe('unknown'));
  return webOp()?.key;
}

// The inspector's Check again (the row shows one too).
const check = async () => userEvent.click(await within(await screen.findByRole('region', { name: kitStrings['listDetail.detail'] })).findByRole('button', { name: /Check again/ }));

describe('programs: Check tells core what it proved', () => {
  beforeEach(() => {
    opsStore.reset();
    vi.mocked(data.completePress).mockClear();
    vi.mocked(data.discardPress).mockClear();
    vi.mocked(data.dismissPress).mockClear();
  });

  it('a failed receipt discards the restart: the next one is sent with a fresh key', async () => {
    const first = await pressPending('receipt-failed', 'Restart web');
    // The send the row showed (its token in core): the Check names exactly that one.
    const hold = webOp()?.hold;
    expect(hold).toBeTruthy();
    expect(first).toBeTruthy();
    await check();
    await waitFor(() => expect(webOp()?.status).toBe('failed'));
    expect(data.discardPress).toHaveBeenCalledWith(expect.objectContaining({ id: '1', kind: 'prog', action: 'restart' }), hold);
    await userEvent.click((await screen.findAllByRole('button', { name: strings['op.dismiss'] }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()).toBeUndefined());
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    expect(webOp()?.key).toBeTruthy();
    expect(webOp()?.key).not.toBe(first);
  });

  it('a completed receipt completes the restart: the next one is a NEW request with a new key', async () => {
    const first = await pressPending('receipt-done', 'Restart web');
    // The send the row showed (its token in core): the Check names exactly that one.
    const hold = webOp()?.hold;
    expect(hold).toBeTruthy();
    await check();
    await waitFor(() => expect(webOp()).toBeUndefined());
    expect(data.completePress).toHaveBeenCalledWith(expect.objectContaining({ id: '1', kind: 'prog', action: 'restart' }), hold);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    // complete() drops the spent key: replaying it would show done and restart nothing.
    expect(webOp()?.key).toBeTruthy();
    expect(webOp()?.key).not.toBe(first);
  });

  it('a fresh read of the list that shows the effect completes the stop', async () => {
    await pressPending('press-proved', 'Stop web');
    // The send the row showed (its token in core): the Check names exactly that one.
    const hold = webOp()?.hold;
    expect(hold).toBeTruthy();
    await check();
    await waitFor(() => expect(webOp()).toBeUndefined());
    expect(data.completePress).toHaveBeenCalledWith(expect.objectContaining({ id: '1', kind: 'prog', action: 'stop' }), hold);
  });

  it('a read that proves nothing keeps the press held and tells core nothing', async () => {
    await pressPending('press-pending', 'Restart web');
    await check();
    await waitFor(() => expect(webOp()?.stuck).toBe(true));
    expect(webOp()?.status).toBe('unknown');
    expect(data.completePress).not.toHaveBeenCalled();
    expect(data.discardPress).not.toHaveBeenCalled();
  });

  it('a temporary stop is not proved by a read that lacks the temporary list', async () => {
    const real = (await vi.importActual<typeof data>('./data')).readOverview;
    vi.mocked(data.readOverview).mockImplementationOnce(async (target) => {
      const { temporary: _gone, ...noList } = await real(target);
      return noList;
    });
    const tempOp = () => {
      for (const [k, op] of opsStore.snapshot()) if (k.endsWith('|temp:quick_1760000000_1')) return op;
      return undefined;
    };
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=temp%3Aquick_1760000000_1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Stop http-server' }))[0] as HTMLElement);
    await waitFor(() => expect(tempOp()?.status).toBe('unknown'));
    await check();
    await waitFor(() => expect(tempOp()?.stuck).toBe(true));
    expect(tempOp()?.status).toBe('unknown');
    expect(data.completePress).not.toHaveBeenCalled();
  });
  // The page acts on core's answer only: a proof or a Dismiss that freed nothing leaves the
  // row showing the change core still holds, never a row cleared while core keeps the change.
  it('a proof that core answers freed nothing keeps the row held, stuck, never cleared', async () => {
    await pressPending('press-proved', 'Stop web');
    vi.mocked(data.completePress).mockResolvedValueOnce(false);
    await check();
    await waitFor(() => expect(webOp()?.stuck).toBe(true));
    expect(webOp()?.status).toBe('unknown');
    expect(data.completePress).toHaveBeenCalledTimes(1);
  });

  it('a failed receipt that core answers freed nothing ends the Check: the row stays held, stuck, never checking for good', async () => {
    await pressPending('receipt-failed', 'Restart web');
    vi.mocked(data.discardPress).mockResolvedValueOnce(false);
    await check();
    await waitFor(() => expect(webOp()?.stuck).toBe(true));
    expect(webOp()?.status).toBe('unknown');
    expect(webOp()?.checking).toBe(false);
    expect(data.discardPress).toHaveBeenCalledTimes(1);
  });

  it('a Dismiss that core answers freed nothing keeps the row showing the held change (guard: core still holds it)', async () => {
    await pressPending('press-pending', 'Restart web');
    vi.mocked(data.dismissPress).mockResolvedValueOnce(false);
    const det = await screen.findByRole('region', { name: kitStrings['listDetail.detail'] });
    await userEvent.click(within(det).getByRole('button', { name: 'Stop tracking' }));
    const ask = await screen.findByRole('alertdialog', { name: strings['op.dismissTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['op.dismissGo'] }));
    await waitFor(() => expect(data.dismissPress).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(webOp()?.status).toBe('unknown');
  });
});
