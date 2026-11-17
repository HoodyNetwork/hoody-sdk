// Vitest: Get computer's untouched project. When the list holds the account's default project, the
// form starts on it and the create goes under it, wherever it sits in the list (the API lists newest first); with no
// default in the list, the first project is used as before; a project the person picks wins.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';

const sent = vi.hoisted(() => ({ calls: [] as { project: string; body: Record<string, unknown> }[], order: 'defaultLast' as 'defaultLast' | 'noDefault' }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const m = { mutateAsync: (v: { project: string; body: Record<string, unknown> }) => (sent.calls.push(v), Promise.resolve({ outcome: 'done' as const })) };
  const useProjects: typeof real.useProjects = () => {
    const q = real.useProjects();
    if (!q.data) return q;
    const rows = [...q.data].sort((a, b) => Number(a.is_default === true) - Number(b.is_default === true));
    return { ...q, data: sent.order === 'noDefault' ? rows.map((p) => ({ ...p, is_default: false })) : rows } as typeof q;
  };
  return { ...real, useCreate: () => m, useProjects };
});

const home = fixtureWorld.projects.find((p) => p.is_default)!;

async function open() {
  await renderPage(page, { path: '/computers', realm: 'all' });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
}
async function send(d: HTMLElement) {
  await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
  await vi.waitFor(() => expect(sent.calls).toHaveLength(1));
  return sent.calls[0]!.project;
}

describe('Get a computer: the project it starts on', () => {
  beforeEach(() => {
    sent.calls = [];
    sent.order = 'defaultLast';
  });

  it('starts on the account default project even when it is listed last, and sends under it', async () => {
    const d = await open();
    expect(home).toBeDefined();
    expect(within(d).getByRole('button', { name: new RegExp(strings['field.project']) })).toHaveTextContent(home.name);
    expect(await send(d)).toBe(home.id);
  }, 40000);

  it('with no default project in the list, starts on the first one', async () => {
    sent.order = 'noDefault';
    const d = await open();
    const first = fixtureWorld.projects.filter((p) => !p.is_default)[0]!;
    expect(await send(d)).toBe(first.id);
  }, 40000);
});
