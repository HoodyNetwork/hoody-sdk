// A stop is proven only by a stopped (or absent)
// program, and a confirmed per-port action on a system range program keeps its port.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { pressChange } from './data';
import { many } from './fixtures';
import { programModel as model, programProof as proves } from '@core';
import type { Row } from './logic';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

function rowOf(key: string): Row {
  const row = model(many)?.rows.find((r) => r.key === key);
  if (!row) throw new Error(`no fixture row ${key}`);
  return row;
}

describe('programs: a stop is proven only by a stopped program', () => {
  it('restarting, unknown or unreadable never prove a stop', () => {
    const web = rowOf('prog:1');
    expect(proves('stop', { ...web, state: 'restarting', partsUp: 0 }, null)).toBe(false);
    expect(proves('stop', { ...web, state: 'unknown', partsUp: 0 }, null)).toBe(false);
    expect(proves('stop', { ...web, state: 'stopped', partsUp: 0, known: false }, null)).toBe(false);
    expect(proves('stop', { ...web, state: 'stopped', partsUp: 0 }, null)).toBe(true);
  });

  it('a range stop needs every part stopped; a port stop needs that part stopped', () => {
    const api = rowOf('prog:2');
    const parts = api.parts.map((p) => ({ ...p, state: 'stopped' as const }));
    expect(proves('stop', { ...api, state: 'stopped', partsUp: 0, parts }, null)).toBe(true);
    const oneRestarting = parts.map((p, i) => (i === 0 ? { ...p, state: 'restarting' as const } : p));
    expect(proves('stop', { ...api, state: 'stopped', partsUp: 0, parts: oneRestarting }, null)).toBe(false);
    const port = api.parts[0]?.port ?? 0;
    expect(proves('stop', { ...api, parts: oneRestarting }, port)).toBe(false);
    expect(proves('stop', { ...api, parts }, port)).toBe(true);
  });
});

describe('programs: a confirmed per-port action keeps its port', () => {
  beforeEach(() => opsStore.reset());

  it('Stop port 16000 of a system range program sends port 16000 after the confirm', async () => {
    await renderPage(page, { state: 'system-range', path: '/programs?sel=prog%3A130' });
    // Stop is in the port's row menu of the inspector's Ports table.
    const row = await waitFor(() => {
      const r = screen.getAllByRole('row').find((x) => x.querySelector('td')?.textContent?.trim() === '16000');
      if (!r) throw new Error('no Ports row for 16000');
      return r;
    });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /^Stop port 16000 of hoody-pool/ }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['ask.stopGo'] }));
    await waitFor(() => {
      const op = [...opsStore.snapshot()].find(([k]) => k.endsWith('|prog:130'))?.[1];
      expect(op?.status).toBe('unknown');
      expect(op?.port).toBe(16000);
      expect(op?.press.port).toBe(16000);
      // One part of a range program: never the whole-program stop.
      expect(op && pressChange(op.press).identity).toEqual({ id: '130', port: 16000, all: false });
    });
  });
});
